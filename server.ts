import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { randomBytes } from 'crypto';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { Chess } from 'chess.js';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Hosts like Cloud Run/Render/Railway inject PORT; fall back to 3000 for AI Studio/local.
const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// ---------- Simple in-memory rate limiter for the (public) Gemini coach endpoint ----------
const coachHits = new Map<string, number[]>();
function coachRateLimited(key: string, max = 20, windowMs = 10 * 60 * 1000): boolean {
  const now = Date.now();
  const recent = (coachHits.get(key) || []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    coachHits.set(key, recent);
    return true;
  }
  recent.push(now);
  coachHits.set(key, recent);
  return false;
}

// Finished rooms are kept briefly (for post-game chat/results), then removed.
const finishedSeenAt = new Map<string, number>();
const FINISHED_ROOM_TTL_MS = 15 * 60 * 1000;

// ---------- Gemini AI Coach Client (Server-Side Only) ----------
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// ---------- Authoritative Multiplayer & Tournament State ----------
interface PlayerSlot {
  clientId: string;
  name: string;
  rating: number;
  connected: boolean;
}

interface RoomChatMessage {
  id: string;
  sender: string;
  text: string;
  timestamp: number;
}

interface MultiplayerRoom {
  id: string;
  code: string;
  isPublic: boolean;
  timeControlLabel: string;
  initialMs: number;
  incrementMs: number;
  status: 'waiting' | 'active' | 'finished';
  white: PlayerSlot | null;
  black: PlayerSlot | null;
  spectators: Set<string>;
  chess: Chess;
  whiteTimeMs: number;
  blackTimeMs: number;
  lastTickAt: number;
  drawOfferBy: 'w' | 'b' | null;
  result: '1-0' | '0-1' | '1/2-1/2' | null;
  termination: string | null;
  chat: RoomChatMessage[];
  createdAt: number;
}

interface TournamentEntry {
  id: string;
  name: string;
  timeControlLabel: string;
  initialMs: number;
  incrementMs: number;
  status: 'open' | 'active' | 'finished';
  players: { clientId: string; name: string; rating: number; score: number }[];
  createdAt: number;
}

interface OnlinePlayerInfo {
  clientId: string;
  name: string;
  rating: number;
  skillLevel: string;
}

interface LeaderboardRow {
  name: string;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  games: number;
}

interface PendingChallenge {
  id: string;
  fromClientId: string;
  fromName: string;
  fromRating: number;
  toClientId: string;
  timeControlLabel: string;
  initialMs: number;
  incrementMs: number;
}

interface MatchmakingEntry {
  clientId: string;
  name: string;
  rating: number;
  timeControlLabel: string;
  initialMs: number;
  incrementMs: number;
  joinedAt: number;
}

const rooms = new Map<string, MultiplayerRoom>();
const tournaments = new Map<string, TournamentEntry>();
const clientSockets = new Map<string, WebSocket>();
const socketToClientId = new Map<WebSocket, string>();
const clientRoomMap = new Map<string, string>();
const onlinePlayers = new Map<string, OnlinePlayerInfo>();
const pendingChallenges = new Map<string, PendingChallenge>();
const arenaLeaderboard = new Map<string, LeaderboardRow>();
const matchmakingQueue: MatchmakingEntry[] = [];

function removeFromQueue(clientId: string) {
  for (let i = matchmakingQueue.length - 1; i >= 0; i--) {
    if (matchmakingQueue[i].clientId === clientId) {
      matchmakingQueue.splice(i, 1);
    }
  }
}

function recordLeaderboardMatch(room: MultiplayerRoom) {
  if (!room.white || !room.black || !room.result) return;
  const ensure = (p: PlayerSlot): LeaderboardRow => {
    const key = p.name.toLowerCase();
    const existing = arenaLeaderboard.get(key);
    if (existing) return existing;
    const row: LeaderboardRow = {
      name: p.name,
      rating: Math.max(100, Math.min(3500, p.rating || 100)),
      wins: 0,
      losses: 0,
      draws: 0,
      games: 0,
    };
    arenaLeaderboard.set(key, row);
    return row;
  };

  const w = ensure(room.white);
  const b = ensure(room.black);
  w.games += 1;
  b.games += 1;

  const expectedW = 1 / (1 + Math.pow(10, (b.rating - w.rating) / 400));
  const expectedB = 1 - expectedW;
  const scoreW = room.result === '1-0' ? 1 : room.result === '0-1' ? 0 : 0.5;
  const scoreB = 1 - scoreW;
  const K = 32;

  let wDelta = Math.round(K * (scoreW - expectedW));
  let bDelta = Math.round(K * (scoreB - expectedB));

  if (room.result === '1-0') {
    w.wins += 1;
    b.losses += 1;
    wDelta = Math.max(8, wDelta);
    bDelta = Math.min(-8, bDelta);
  } else if (room.result === '0-1') {
    b.wins += 1;
    w.losses += 1;
    bDelta = Math.max(8, bDelta);
    wDelta = Math.min(-8, wDelta);
  } else {
    w.draws += 1;
    b.draws += 1;
  }

  w.rating = Math.max(100, Math.min(3500, w.rating + wDelta));
  b.rating = Math.max(100, Math.min(3500, b.rating + bDelta));
}

function generateCode(len = 6): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function serializeRoom(room: MultiplayerRoom) {
  return {
    id: room.id,
    code: room.code,
    isPublic: room.isPublic,
    timeControlLabel: room.timeControlLabel,
    initialMs: room.initialMs,
    incrementMs: room.incrementMs,
    status: room.status,
    white: room.white,
    black: room.black,
    spectatorCount: room.spectators.size,
    fen: room.chess.fen(),
    pgn: room.chess.pgn(),
    turn: room.chess.turn(),
    moves: room.chess.history({ verbose: true }).map((m, idx) => ({
      ply: idx + 1,
      moveNumber: Math.floor(idx / 2) + 1,
      color: m.color,
      san: m.san,
      uci: `${m.from}${m.to}${m.promotion || ''}`,
      from: m.from,
      to: m.to,
      fenBefore: m.before,
      fenAfter: m.after,
      isCheck: m.san.includes('+') || m.san.includes('#'),
      isCheckmate: m.san.includes('#'),
      isCastling: m.san === 'O-O' || m.san === 'O-O-O',
      isEnPassant: m.flags.includes('e'),
    })),
    whiteTimeMs: Math.max(0, Math.round(room.whiteTimeMs)),
    blackTimeMs: Math.max(0, Math.round(room.blackTimeMs)),
    drawOfferBy: room.drawOfferBy,
    result: room.result,
    termination: room.termination,
    chat: room.chat.slice(-40),
  };
}

function broadcastRoom(room: MultiplayerRoom) {
  const payload = JSON.stringify({ type: 'room:state', room: serializeRoom(room) });
  const targetIds = new Set<string>();
  if (room.white) targetIds.add(room.white.clientId);
  if (room.black) targetIds.add(room.black.clientId);
  room.spectators.forEach((id) => targetIds.add(id));

  targetIds.forEach((cid) => {
    const ws = clientSockets.get(cid);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  });
}

function getSortedLeaderboard(): LeaderboardRow[] {
  return Array.from(arenaLeaderboard.values())
    .sort((a, b) => b.rating - a.rating || b.wins - a.wins)
    .slice(0, 25);
}

function broadcastLobby() {
  const publicRooms = Array.from(rooms.values())
    .filter((r) => r.isPublic && r.status !== 'finished')
    .map((r) => ({
      id: r.id,
      code: r.code,
      timeControlLabel: r.timeControlLabel,
      status: r.status,
      white: r.white ? { name: r.white.name, rating: r.white.rating } : null,
      black: r.black ? { name: r.black.name, rating: r.black.rating } : null,
      spectatorCount: r.spectators.size,
      moveCount: r.chess.history().length,
    }));

  const tournamentList = Array.from(tournaments.values());
  const playersList = Array.from(onlinePlayers.values());
  const payload = JSON.stringify({
    type: 'lobby:update',
    rooms: publicRooms,
    tournaments: tournamentList,
    players: playersList,
    leaderboard: getSortedLeaderboard(),
    queueCount: matchmakingQueue.length,
  });
  clientSockets.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  });
}

function tryPairMatchmakingQueue() {
  if (matchmakingQueue.length < 2) return;
  const now = Date.now();
  const matchedIds = new Set<string>();
  const createdRooms: { room: MultiplayerRoom; p1: MatchmakingEntry; p2: MatchmakingEntry }[] = [];

  for (let i = 0; i < matchmakingQueue.length; i++) {
    const a = matchmakingQueue[i];
    if (matchedIds.has(a.clientId)) continue;

    let bestIdx = -1;
    let bestDiff = Infinity;

    for (let j = i + 1; j < matchmakingQueue.length; j++) {
      const b = matchmakingQueue[j];
      if (matchedIds.has(b.clientId) || b.clientId === a.clientId) continue;
      if (b.timeControlLabel !== a.timeControlLabel) continue;

      const maxWaitSec = Math.max(now - a.joinedAt, now - b.joinedAt) / 1000;
      const tolerance = 150 + Math.floor(maxWaitSec / 5) * 100;
      const diff = Math.abs(a.rating - b.rating);

      if (diff <= tolerance && diff < bestDiff) {
        bestDiff = diff;
        bestIdx = j;
      }
    }

    if (bestIdx >= 0) {
      const b = matchmakingQueue[bestIdx];
      matchedIds.add(a.clientId);
      matchedIds.add(b.clientId);

      const roomId = `room_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const code = generateCode(6);
      const aWhite = Math.random() < 0.5;
      const wEntry = aWhite ? a : b;
      const bEntry = aWhite ? b : a;

      const room: MultiplayerRoom = {
        id: roomId,
        code,
        isPublic: true,
        timeControlLabel: a.timeControlLabel,
        initialMs: a.initialMs,
        incrementMs: a.incrementMs,
        status: 'active',
        white: { clientId: wEntry.clientId, name: wEntry.name, rating: wEntry.rating, connected: true },
        black: { clientId: bEntry.clientId, name: bEntry.name, rating: bEntry.rating, connected: true },
        spectators: new Set(),
        chess: new Chess(),
        whiteTimeMs: a.initialMs,
        blackTimeMs: a.initialMs,
        lastTickAt: now,
        drawOfferBy: null,
        result: null,
        termination: null,
        chat: [],
        createdAt: now,
      };
      createdRooms.push({ room, p1: a, p2: b });
    }
  }

  if (matchedIds.size > 0) {
    for (let i = matchmakingQueue.length - 1; i >= 0; i--) {
      if (matchedIds.has(matchmakingQueue[i].clientId)) {
        matchmakingQueue.splice(i, 1);
      }
    }
    createdRooms.forEach(({ room, p1, p2 }) => {
      rooms.set(room.id, room);
      clientRoomMap.set(p1.clientId, room.id);
      clientRoomMap.set(p2.clientId, room.id);

      [p1, p2].forEach((p) => {
        const ws = clientSockets.get(p.clientId);
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: 'quickmatch:matched',
              roomId: room.id,
              opponent:
                p.clientId === p1.clientId
                  ? { name: p2.name, rating: p2.rating }
                  : { name: p1.name, rating: p1.rating },
            })
          );
        }
      });
      broadcastRoom(room);
    });
    broadcastLobby();
  }
}

function finishGameOnBoardEnd(room: MultiplayerRoom): boolean {
  const c = room.chess;
  if (c.isCheckmate()) {
    const winner = c.turn() === 'w' ? '0-1' : '1-0';
    room.status = 'finished';
    room.result = winner;
    room.termination = 'Checkmate';
    recordLeaderboardMatch(room);
    return true;
  } else if (c.isStalemate()) {
    room.status = 'finished';
    room.result = '1/2-1/2';
    room.termination = 'Stalemate';
    recordLeaderboardMatch(room);
    return true;
  } else if (c.isThreefoldRepetition()) {
    room.status = 'finished';
    room.result = '1/2-1/2';
    room.termination = 'Threefold Repetition';
    recordLeaderboardMatch(room);
    return true;
  } else if (c.isInsufficientMaterial()) {
    room.status = 'finished';
    room.result = '1/2-1/2';
    room.termination = 'Insufficient Material';
    recordLeaderboardMatch(room);
    return true;
  } else if (c.isDraw()) {
    room.status = 'finished';
    room.result = '1/2-1/2';
    room.termination = '50-Move Rule Draw';
    recordLeaderboardMatch(room);
    return true;
  }
  return false;
}

async function startServer() {
  const app = express();
  // One reverse-proxy hop (Cloud Run etc.) so req.ip is the real client, not the proxy.
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    const rawAppUrl = process.env.APP_URL?.trim() || process.env.VITE_APP_URL?.trim() || '';
    const appUrl = rawAppUrl && rawAppUrl !== 'MY_APP_URL' ? rawAppUrl : '';
    res.json({
      status: 'ok',
      geminiConfigured: Boolean(getGeminiClient()),
      activeRooms: rooms.size,
      onlinePlayers: onlinePlayers.size,
      queueCount: matchmakingQueue.length,
      appUrl,
    });
  });

  app.get('/api/leaderboard', (_req, res) => {
    res.json({ leaderboard: getSortedLeaderboard() });
  });

  // Connect & import live Chess.com or Lichess Elo ratings (strict SSRF-safe allowlist)
  app.get('/api/external-account', async (req, res) => {
    const platform = String(req.query.platform || '').toLowerCase();
    const rawUsername = String(req.query.username || '').trim();

    if (platform !== 'chesscom' && platform !== 'lichess') {
      return res.status(400).json({ error: 'Platform must be chesscom or lichess.' });
    }
    if (!/^[a-zA-Z0-9_-]{2,32}$/.test(rawUsername)) {
      return res.status(400).json({ error: 'Username must be 2-32 characters (letters, numbers, _ or -).' });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      if (platform === 'chesscom') {
        const lowerUser = rawUsername.toLowerCase();
        const statsResp = await fetch(
          `https://api.chess.com/pub/player/${encodeURIComponent(lowerUser)}/stats`,
          {
            headers: { 'User-Agent': 'AtelierChess/1.0 (+https://chess.com)' },
            signal: controller.signal,
          }
        );

        if (statsResp.status === 404) {
          return res.status(404).json({ error: `Chess.com player "${rawUsername}" was not found.` });
        }
        if (!statsResp.ok) {
          return res.status(502).json({ error: `Chess.com API returned status ${statsResp.status}.` });
        }

        const stats = (await statsResp.json()) as {
          chess_bullet?: { last?: { rating?: number } };
          chess_blitz?: { last?: { rating?: number } };
          chess_rapid?: { last?: { rating?: number } };
          chess_daily?: { last?: { rating?: number } };
        };

        return res.json({
          platform: 'chesscom',
          username: rawUsername,
          profileUrl: `https://www.chess.com/member/${encodeURIComponent(lowerUser)}`,
          ratings: {
            bullet: stats.chess_bullet?.last?.rating,
            blitz: stats.chess_blitz?.last?.rating,
            rapid: stats.chess_rapid?.last?.rating,
            classical: stats.chess_daily?.last?.rating,
          },
          syncedAt: new Date().toISOString(),
        });
      }

      const lichessResp = await fetch(
        `https://lichess.org/api/user/${encodeURIComponent(rawUsername)}`,
        {
          headers: { Accept: 'application/json', 'User-Agent': 'AtelierChess/1.0' },
          signal: controller.signal,
        }
      );

      if (lichessResp.status === 404) {
        return res.status(404).json({ error: `Lichess player "${rawUsername}" was not found.` });
      }
      if (!lichessResp.ok) {
        return res.status(502).json({ error: `Lichess API returned status ${lichessResp.status}.` });
      }

      const data = (await lichessResp.json()) as {
        username?: string;
        url?: string;
        perfs?: {
          bullet?: { rating?: number };
          blitz?: { rating?: number };
          rapid?: { rating?: number };
          classical?: { rating?: number };
        };
      };

      return res.json({
        platform: 'lichess',
        username: data.username || rawUsername,
        profileUrl: data.url || `https://lichess.org/@/${encodeURIComponent(rawUsername)}`,
        ratings: {
          bullet: data.perfs?.bullet?.rating,
          blitz: data.perfs?.blitz?.rating,
          rapid: data.perfs?.rapid?.rating,
          classical: data.perfs?.classical?.rating,
        },
        syncedAt: new Date().toISOString(),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error && err.name === 'AbortError'
        ? 'External rating service timed out.'
        : 'Unable to reach external chess service.';
      return res.status(502).json({ error: msg });
    } finally {
      clearTimeout(timeout);
    }
  });

  // Server-side Gemini AI Chess Coach
  app.post('/api/coach', async (req, res) => {
    if (coachRateLimited(req.ip || 'unknown')) {
      return res.status(429).json({
        error: 'RATE_LIMITED',
        message: 'Too many coaching requests. Please wait a few minutes and try again.',
      });
    }

    const ai = getGeminiClient();
    if (!ai) {
      return res.status(503).json({
        error: 'GEMINI_NOT_CONFIGURED',
        message:
          'Gemini AI Coach requires a GEMINI_API_KEY configured in AI Studio Settings > Secrets. Once set, the coach can analyze your positions and games.',
      });
    }

    const {
      question,
      fen,
      pgn,
      skillLevel = 'Intermediate',
      evalSummary,
      history,
      mode = 'position',
    } = req.body ?? {};

    if (!question || typeof question !== 'string' || question.length > 2000) {
      return res.status(400).json({ error: 'Invalid or missing coaching prompt.' });
    }

    // Never put raw client strings into the system prompt: whitelist skill level and mode.
    const level: string = ['Beginner', 'Intermediate', 'Advanced'].includes(skillLevel)
      ? skillLevel
      : 'Intermediate';
    const coachMode: string =
      typeof mode === 'string' && /^[a-z-]{1,32}$/.test(mode) ? mode : 'position';

    const cleanFen = typeof fen === 'string' && fen.length < 180 ? fen : 'Standard starting position';
    const cleanPgn = typeof pgn === 'string' && pgn.length < 6000 ? pgn : '';
    const cleanEval = typeof evalSummary === 'string' && evalSummary.length < 1500 ? evalSummary : '';

    // Recent chat turns (sanitized) so follow-up questions have context.
    const cleanHistory: string = Array.isArray(history)
      ? history
          .slice(-6)
          .filter(
            (h: unknown): h is { role: string; text: string } =>
              !!h &&
              typeof h === 'object' &&
              ['user', 'coach'].includes((h as { role?: string }).role as string) &&
              typeof (h as { text?: unknown }).text === 'string'
          )
          .map((h) => `${h.role === 'user' ? 'Student' : 'Coach'}: ${h.text.slice(0, 1200)}`)
          .join('\n')
      : '';

    const systemInstruction = [
      'You are an elite Grandmaster Chess Coach at Atelier Chess Academy.',
      `Adjust your explanation depth, vocabulary, and strategic analogies strictly for a ${level} player.`,
      'Ground every comment in the exact chess position (FEN), move list (PGN), and Stockfish evaluation provided. Never invent illegal moves or pretend pieces are on squares they do not occupy.',
      'Be encouraging, concrete, and structured: highlight key candidate moves, tactical motifs, pawn structure plans, and one actionable takeaway.',
      'Format cleanly with short paragraphs and bullet points.',
    ].join(' ');

    const userPrompt = [
      `Coaching Mode: ${coachMode}`,
      `Player Skill Level: ${level}`,
      `Current Position (FEN): ${cleanFen}`,
      cleanPgn ? `Moves / PGN:\n${cleanPgn}` : '',
      cleanEval ? `Stockfish Analysis Summary:\n${cleanEval}` : '',
      cleanHistory ? `Recent conversation (for context only):\n${cleanHistory}` : '',
      `Student Question / Request:\n${question}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    const callCoachModel = async (model: string) =>
      ai.models.generateContent({
        model,
        contents: userPrompt,
        config: { systemInstruction },
      });

    try {
      let response;
      try {
        response = await callCoachModel('gemini-4-hydrogen');
      } catch (primaryErr: unknown) {
        const msg = primaryErr instanceof Error ? primaryErr.message : '';
        // Fall back on any model-side failure (503, 429, model-not-found...). A 403 means the
        // key itself is bad, so a second model would fail the same way.
        if (msg.includes('403') || msg.includes('PERMISSION_DENIED')) {
          throw primaryErr;
        }
        response = await callCoachModel('gemini-3.1-flash-lite');
      }

      const answer = response.text?.trim();
      if (!answer) {
        return res.status(502).json({
          error: 'EMPTY_RESPONSE',
          message: 'Gemini returned an empty coaching response. Please try rephrasing your question.',
        });
      }

      return res.json({ answer });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to contact Gemini API.';
      const status =
        message.includes('403') || message.includes('PERMISSION_DENIED')
          ? 403
          : message.includes('503') || message.includes('UNAVAILABLE')
            ? 503
            : 500;
      return res.status(status).json({
        error: 'GEMINI_UPSTREAM_ERROR',
        message:
          status === 403
            ? 'Gemini API permission denied. Please verify your GEMINI_API_KEY in Settings > Secrets.'
            : status === 503
              ? 'Gemini Coach is temporarily experiencing high demand. Please retry in a few seconds.'
              : `Gemini Coach error: ${message}`,
      });
    }
  });

  // Mount Vite dev middleware OR production static files
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    const distIndexPath = path.join(distPath, 'index.html');
    app.use(express.static(distPath, { index: false }));
    app.get('*', (req, res) => {
      const rawAppUrl = process.env.APP_URL?.trim() || process.env.VITE_APP_URL?.trim() || '';
      const configuredUrl = rawAppUrl && rawAppUrl !== 'MY_APP_URL' ? rawAppUrl.replace(/\/+$/, '') : '';
      const origin = configuredUrl || `${req.protocol}://${req.get('host')}`;
      try {
        let html = fs.readFileSync(distIndexPath, 'utf8');
        html = html
          .replace(
            'content="/src/assets/images/hero_chess_atelier_1795303199561.jpg"',
            `content="${origin}/src/assets/images/hero_chess_atelier_1795303199561.jpg"`
          )
          .replace(
            'content="/src/assets/images/hero_chess_atelier_1795303199561.jpg"',
            `content="${origin}/src/assets/images/hero_chess_atelier_1795303199561.jpg"`
          )
          .replace(
            '<meta property="og:type" content="website" />',
            `<meta property="og:type" content="website" />\n    <meta property="og:url" content="${origin}/" />\n    <link rel="canonical" href="${origin}/" />`
          );
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(html);
      } catch {
        return res.sendFile(distIndexPath);
      }
    });
  }

  const server = http.createServer(app);

  // ---------- WebSocket Server (/ws) ----------
  const wss = new WebSocketServer({ server, path: '/ws' });

  // Resume tokens are private (never broadcast); clientIds are public (shown in lobby lists).
  const resumeTokens = new Map<string, string>(); // token -> clientId

  wss.on('connection', (ws, req) => {
    let clientId = '';
    let resumeToken = '';
    try {
      const tok = new URL(req.url || '', 'http://localhost').searchParams.get('resume') || '';
      if (/^[A-Za-z0-9_-]{16,64}$/.test(tok) && resumeTokens.has(tok)) {
        const prior = resumeTokens.get(tok)!;
        const oldWs = clientSockets.get(prior);
        if (oldWs && oldWs !== ws) {
          socketToClientId.delete(oldWs);
          try { oldWs.close(); } catch { /* ignore */ }
        }
        clientId = prior;
        resumeToken = tok;
      }
    } catch {
      // fall through to a fresh identity
    }
    if (!clientId) {
      clientId = `cli_${Math.random().toString(36).slice(2, 10)}`;
      resumeToken = randomBytes(18).toString('base64url');
      resumeTokens.set(resumeToken, clientId);
    }
    clientSockets.set(clientId, ws);
    socketToClientId.set(ws, clientId);

    ws.send(JSON.stringify({ type: 'session:init', clientId, resumeToken }));
    const resumedRoomId = clientRoomMap.get(clientId);
    const resumedRoom = resumedRoomId ? rooms.get(resumedRoomId) : undefined;
    if (resumedRoom && resumedRoom.status !== 'finished') {
      if (resumedRoom.white?.clientId === clientId) resumedRoom.white.connected = true;
      if (resumedRoom.black?.clientId === clientId) resumedRoom.black.connected = true;
      broadcastRoom(resumedRoom);
    }
    broadcastLobby();

    ws.on('message', (raw) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }

      const type = String(msg.type || '');

      if (type === 'player:identify') {
        const name = String(msg.playerName || 'Player').trim().slice(0, 32) || 'Player';
        const rating = Math.max(100, Math.min(3500, Number(msg.rating) || 100));
        const skillLevel = String(msg.skillLevel || 'Intermediate').slice(0, 20);
        onlinePlayers.set(clientId, { clientId, name, rating, skillLevel });
        const key = name.toLowerCase();
        if (!arenaLeaderboard.has(key)) {
          arenaLeaderboard.set(key, { name, rating, wins: 0, losses: 0, draws: 0, games: 0 });
        }
        broadcastLobby();
        return;
      }

      if (type === 'quickmatch:join') {
        const name = String(msg.playerName || 'Player').trim().slice(0, 32) || 'Player';
        const rating = Math.max(100, Math.min(3500, Number(msg.rating) || 100));
        const timeControlLabel = String(msg.timeControlLabel || '5+0 Blitz').slice(0, 32);
        const initialMs = Math.max(30000, Math.min(3600000, Number(msg.initialMs) || 300000));
        const incrementMs = Math.max(0, Math.min(60000, Number(msg.incrementMs) || 0));

        removeFromQueue(clientId);
        matchmakingQueue.push({
          clientId,
          name,
          rating,
          timeControlLabel,
          initialMs,
          incrementMs,
          joinedAt: Date.now(),
        });
        ws.send(
          JSON.stringify({
            type: 'quickmatch:queued',
            rating,
            timeControlLabel,
            queueCount: matchmakingQueue.length,
          })
        );
        tryPairMatchmakingQueue();
        broadcastLobby();
        return;
      }

      if (type === 'quickmatch:leave') {
        removeFromQueue(clientId);
        ws.send(JSON.stringify({ type: 'quickmatch:left' }));
        broadcastLobby();
        return;
      }

      if (type === 'challenge:send') {
        const toClientId = String(msg.toClientId || '');
        const targetWs = clientSockets.get(toClientId);
        const sender = onlinePlayers.get(clientId);
        if (!targetWs || targetWs.readyState !== WebSocket.OPEN || !sender || toClientId === clientId) {
          ws.send(JSON.stringify({ type: 'room:error', message: 'Player is no longer online.' }));
          return;
        }
        const challengeId = `chal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
        const challenge: PendingChallenge = {
          id: challengeId,
          fromClientId: clientId,
          fromName: sender.name,
          fromRating: sender.rating,
          toClientId,
          timeControlLabel: String(msg.timeControlLabel || '5+0 Blitz').slice(0, 32),
          initialMs: Math.max(30000, Math.min(3600000, Number(msg.initialMs) || 300000)),
          incrementMs: Math.max(0, Math.min(60000, Number(msg.incrementMs) || 0)),
        };
        pendingChallenges.set(challengeId, challenge);
        targetWs.send(JSON.stringify({ type: 'challenge:incoming', challenge }));
        return;
      }

      if (type === 'challenge:accept') {
        const challengeId = String(msg.challengeId || '');
        const chal = pendingChallenges.get(challengeId);
        if (!chal || chal.toClientId !== clientId) return;
        pendingChallenges.delete(challengeId);

        const challenger = onlinePlayers.get(chal.fromClientId);
        const accepter = onlinePlayers.get(clientId);
        if (!challenger || !accepter) return;

        const roomId = `room_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
        const code = generateCode(6);
        const challengerWhite = Math.random() < 0.5;
        const wSlot: PlayerSlot = challengerWhite
          ? { clientId: challenger.clientId, name: challenger.name, rating: challenger.rating, connected: true }
          : { clientId: accepter.clientId, name: accepter.name, rating: accepter.rating, connected: true };
        const bSlot: PlayerSlot = challengerWhite
          ? { clientId: accepter.clientId, name: accepter.name, rating: accepter.rating, connected: true }
          : { clientId: challenger.clientId, name: challenger.name, rating: challenger.rating, connected: true };

        const room: MultiplayerRoom = {
          id: roomId,
          code,
          isPublic: true,
          timeControlLabel: chal.timeControlLabel,
          initialMs: chal.initialMs,
          incrementMs: chal.incrementMs,
          status: 'active',
          white: wSlot,
          black: bSlot,
          spectators: new Set(),
          chess: new Chess(),
          whiteTimeMs: chal.initialMs,
          blackTimeMs: chal.initialMs,
          lastTickAt: Date.now(),
          drawOfferBy: null,
          result: null,
          termination: null,
          chat: [],
          createdAt: Date.now(),
        };

        rooms.set(roomId, room);
        clientRoomMap.set(challenger.clientId, roomId);
        clientRoomMap.set(accepter.clientId, roomId);
        broadcastRoom(room);
        broadcastLobby();
        return;
      }

      if (type === 'challenge:decline') {
        const challengeId = String(msg.challengeId || '');
        const chal = pendingChallenges.get(challengeId);
        if (!chal) return;
        pendingChallenges.delete(challengeId);
        const fromWs = clientSockets.get(chal.fromClientId);
        if (fromWs && fromWs.readyState === WebSocket.OPEN) {
          fromWs.send(JSON.stringify({ type: 'room:error', message: 'Challenge declined.' }));
        }
        return;
      }

      if (type === 'lobby:list') {
        broadcastLobby();
        return;
      }

      if (type === 'room:create') {
        removeFromQueue(clientId);
        const name = String(msg.playerName || 'Player').slice(0, 32);
        const rating = Math.max(100, Math.min(3500, Number(msg.rating) || 100));
        const timeControlLabel = String(msg.timeControlLabel || '5+0 Blitz').slice(0, 32);
        const initialMs = Math.max(30000, Math.min(3600000, Number(msg.initialMs) || 300000));
        const incrementMs = Math.max(0, Math.min(60000, Number(msg.incrementMs) || 0));
        const isPublic = msg.isPublic !== false;
        const preferredColor = msg.preferredColor === 'b' ? 'b' : msg.preferredColor === 'w' ? 'w' : Math.random() < 0.5 ? 'w' : 'b';

        const roomId = `room_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
        const code = generateCode(6);
        const slot: PlayerSlot = { clientId, name, rating, connected: true };

        const room: MultiplayerRoom = {
          id: roomId,
          code,
          isPublic,
          timeControlLabel,
          initialMs,
          incrementMs,
          status: 'waiting',
          white: preferredColor === 'w' ? slot : null,
          black: preferredColor === 'b' ? slot : null,
          spectators: new Set(),
          chess: new Chess(),
          whiteTimeMs: initialMs,
          blackTimeMs: initialMs,
          lastTickAt: Date.now(),
          drawOfferBy: null,
          result: null,
          termination: null,
          chat: [],
          createdAt: Date.now(),
        };

        rooms.set(roomId, room);
        clientRoomMap.set(clientId, roomId);
        broadcastRoom(room);
        broadcastLobby();
        return;
      }

      if (type === 'room:join') {
        removeFromQueue(clientId);
        const codeOrId = String(msg.roomId || msg.code || '').trim();
        const name = String(msg.playerName || 'Player').slice(0, 32);
        const rating = Math.max(100, Math.min(3500, Number(msg.rating) || 100));
        const asSpectator = Boolean(msg.asSpectator);

        const room =
          rooms.get(codeOrId) ||
          Array.from(rooms.values()).find((r) => r.code.toUpperCase() === codeOrId.toUpperCase());

        if (!room) {
          ws.send(JSON.stringify({ type: 'room:error', message: 'Game room not found.' }));
          return;
        }

        clientRoomMap.set(clientId, room.id);

        if (!asSpectator && room.status === 'waiting') {
          if (!room.white && room.black?.clientId !== clientId) {
            room.white = { clientId, name, rating, connected: true };
          } else if (!room.black && room.white?.clientId !== clientId) {
            room.black = { clientId, name, rating, connected: true };
          } else {
            room.spectators.add(clientId);
          }

          if (room.white && room.black) {
            room.status = 'active';
            room.lastTickAt = Date.now();
          }
        } else {
          room.spectators.add(clientId);
        }

        broadcastRoom(room);
        broadcastLobby();
        return;
      }

      if (type === 'room:move') {
        const roomId = String(msg.roomId || clientRoomMap.get(clientId) || '');
        const room = rooms.get(roomId);
        if (!room || room.status !== 'active') return;

        const turn = room.chess.turn();
        const expectedClient = turn === 'w' ? room.white?.clientId : room.black?.clientId;
        if (expectedClient !== clientId) {
          ws.send(JSON.stringify({ type: 'room:error', message: 'Not your turn.' }));
          return;
        }

        const from = String(msg.from || '');
        const to = String(msg.to || '');
        const promotion = msg.promotion ? String(msg.promotion) : undefined;

        const now = Date.now();
        const elapsed = Math.max(0, now - room.lastTickAt);
        if (turn === 'w') {
          room.whiteTimeMs -= elapsed;
          if (room.whiteTimeMs <= 0) {
            room.whiteTimeMs = 0;
            room.status = 'finished';
            room.result = '0-1';
            room.termination = 'Time Out';
            recordLeaderboardMatch(room);
            broadcastRoom(room);
            broadcastLobby();
            return;
          }
        } else {
          room.blackTimeMs -= elapsed;
          if (room.blackTimeMs <= 0) {
            room.blackTimeMs = 0;
            room.status = 'finished';
            room.result = '1-0';
            room.termination = 'Time Out';
            recordLeaderboardMatch(room);
            broadcastRoom(room);
            broadcastLobby();
            return;
          }
        }

        try {
          const move = room.chess.move({ from, to, promotion });
          if (!move) {
            ws.send(JSON.stringify({ type: 'room:error', message: 'Illegal move.' }));
            return;
          }
          if (turn === 'w') room.whiteTimeMs += room.incrementMs;
          else room.blackTimeMs += room.incrementMs;

          room.lastTickAt = now;
          room.drawOfferBy = null;
          const ended = finishGameOnBoardEnd(room);
          broadcastRoom(room);
          if (ended) broadcastLobby();
        } catch {
          ws.send(JSON.stringify({ type: 'room:error', message: 'Invalid move.' }));
        }
        return;
      }

      if (type === 'room:resign') {
        const roomId = String(msg.roomId || clientRoomMap.get(clientId) || '');
        const room = rooms.get(roomId);
        if (!room || room.status !== 'active') return;

        if (room.white?.clientId === clientId) {
          room.status = 'finished';
          room.result = '0-1';
          room.termination = 'White Resigned';
          recordLeaderboardMatch(room);
        } else if (room.black?.clientId === clientId) {
          room.status = 'finished';
          room.result = '1-0';
          room.termination = 'Black Resigned';
          recordLeaderboardMatch(room);
        }
        broadcastRoom(room);
        broadcastLobby();
        return;
      }

      if (type === 'room:draw_offer') {
        const roomId = String(msg.roomId || clientRoomMap.get(clientId) || '');
        const room = rooms.get(roomId);
        if (!room || room.status !== 'active') return;
        if (room.white?.clientId === clientId) room.drawOfferBy = 'w';
        else if (room.black?.clientId === clientId) room.drawOfferBy = 'b';
        broadcastRoom(room);
        return;
      }

      if (type === 'room:draw_accept') {
        const roomId = String(msg.roomId || clientRoomMap.get(clientId) || '');
        const room = rooms.get(roomId);
        if (!room || room.status !== 'active' || !room.drawOfferBy) return;
        const acceptorColor =
          room.white?.clientId === clientId ? 'w' : room.black?.clientId === clientId ? 'b' : null;
        if (!acceptorColor || acceptorColor === room.drawOfferBy) return;

        room.status = 'finished';
        room.result = '1/2-1/2';
        room.termination = 'Mutual Agreement';
        room.drawOfferBy = null;
        recordLeaderboardMatch(room);
        broadcastRoom(room);
        broadcastLobby();
        return;
      }

      if (type === 'room:draw_decline') {
        const roomId = String(msg.roomId || clientRoomMap.get(clientId) || '');
        const room = rooms.get(roomId);
        if (!room) return;
        // Only the two players may decline/withdraw a draw offer.
        if (room.white?.clientId !== clientId && room.black?.clientId !== clientId) return;
        room.drawOfferBy = null;
        broadcastRoom(room);
        return;
      }

      if (type === 'room:chat') {
        const roomId = String(msg.roomId || clientRoomMap.get(clientId) || '');
        const room = rooms.get(roomId);
        if (!room) return;
        // Only people actually in the room may chat, and the display name comes from the
        // server's record of that connection — not from the (spoofable) client payload.
        const isWhite = room.white?.clientId === clientId;
        const isBlack = room.black?.clientId === clientId;
        if (!isWhite && !isBlack && !room.spectators.has(clientId)) return;
        const sender = isWhite
          ? room.white!.name
          : isBlack
            ? room.black!.name
            : onlinePlayers.get(clientId)?.name || 'Spectator';
        const text = String(msg.text || '').trim().slice(0, 240);
        if (!text) return;
        room.chat.push({
          id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          sender,
          text,
          timestamp: Date.now(),
        });
        broadcastRoom(room);
        return;
      }

      if (type === 'tournament:create') {
        const name = String(msg.name || 'Atelier Arena').slice(0, 48);
        const timeControlLabel = String(msg.timeControlLabel || '3+2 Blitz').slice(0, 24);
        const playerName = String(msg.playerName || 'Player').slice(0, 32);
        const rating = Math.max(100, Math.min(3500, Number(msg.rating) || 100));
        const id = `tourn_${Date.now().toString(36)}`;
        tournaments.set(id, {
          id,
          name,
          timeControlLabel,
          initialMs: Number(msg.initialMs) || 180000,
          incrementMs: Number(msg.incrementMs) || 2000,
          status: 'open',
          players: [{ clientId, name: playerName, rating, score: 0 }],
          createdAt: Date.now(),
        });
        broadcastLobby();
        return;
      }

      if (type === 'tournament:join') {
        const id = String(msg.tournamentId || '');
        const t = tournaments.get(id);
        if (!t) return;
        const playerName = String(msg.playerName || 'Player').slice(0, 32);
        const rating = Number(msg.rating) || 1200;
        if (!t.players.some((p) => p.clientId === clientId)) {
          t.players.push({ clientId, name: playerName, rating, score: 0 });
        }
        broadcastLobby();
      }
    });

    ws.on('close', () => {
      const cid = socketToClientId.get(ws);
      socketToClientId.delete(ws);
      if (cid && clientSockets.get(cid) !== ws) return; // superseded by a resumed connection
      if (cid) {
        removeFromQueue(cid);
        clientSockets.delete(cid);
        onlinePlayers.delete(cid);
        const roomId = clientRoomMap.get(cid);
        if (roomId) {
          const room = rooms.get(roomId);
          if (room) {
            if (room.white?.clientId === cid) room.white.connected = false;
            if (room.black?.clientId === cid) room.black.connected = false;
            room.spectators.delete(cid);
            broadcastRoom(room);

            // Don't leave "ghost" rooms in the lobby when the creator disconnects before
            // anyone joined.
            if (room.status === 'waiting' && !room.white?.connected && !room.black?.connected) {
              rooms.delete(roomId);
            }
          }
          // Keep the mapping for live games so a refreshed tab can rejoin; the game clock
          // keeps running and acts as the grace period.
          if (!room || room.status !== 'active') clientRoomMap.delete(cid);
        }
        if (!clientRoomMap.has(cid)) {
          for (const [t, c] of resumeTokens) if (c === cid) resumeTokens.delete(t);
        }
        broadcastLobby();
      }
    });
  });

  // Authoritative server clock monitor + matchmaking expansion tick
  setInterval(() => {
    tryPairMatchmakingQueue();
    const now = Date.now();
    if (coachHits.size > 5000) coachHits.clear();
    rooms.forEach((room) => {
      // Garbage-collect finished rooms after a grace period so memory doesn't grow forever.
      if (room.status === 'finished') {
        const seen = finishedSeenAt.get(room.id);
        if (seen === undefined) {
          finishedSeenAt.set(room.id, now);
        } else if (now - seen > FINISHED_ROOM_TTL_MS) {
          rooms.delete(room.id);
          finishedSeenAt.delete(room.id);
          clientRoomMap.forEach((rid, cid) => {
            if (rid === room.id) clientRoomMap.delete(cid);
          });
        }
        return;
      }
      if (room.status !== 'active') return;
      const elapsed = now - room.lastTickAt;
      const turn = room.chess.turn();
      const remaining = turn === 'w' ? room.whiteTimeMs - elapsed : room.blackTimeMs - elapsed;
      if (remaining <= 0) {
        if (turn === 'w') {
          room.whiteTimeMs = 0;
          room.result = '0-1';
        } else {
          room.blackTimeMs = 0;
          room.result = '1-0';
        }
        room.status = 'finished';
        room.termination = 'Time Out';
        recordLeaderboardMatch(room);
        broadcastRoom(room);
        broadcastLobby();
      }
    });
  }, 500);

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Atelier Chess server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
