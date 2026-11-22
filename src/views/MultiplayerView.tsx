import React, { useEffect, useMemo, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import {
  Check,
  Copy,
  Eye,
  Flag,
  Handshake,
  Loader2,
  MessageSquare,
  Plus,
  Send,
  Swords,
  Trophy,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { Chessboard } from '../components/Chessboard';
import { ChessClock } from '../components/ChessClock';
import { MoveHistory } from '../components/MoveHistory';
import {
  FriendshipRecord,
  GameInviteRecord,
  PublicProfileRecord,
} from '../services/firestoreSync';
import {
  BoardPreferences,
  MoveRecord,
  PieceColor,
  PieceType,
  SavedGameRecord,
  TimeControlCategory,
} from '../types/chess';
import { soundEngine } from '../utils/soundEngine';

interface LobbyRoomSummary {
  id: string;
  code: string;
  timeControlLabel: string;
  status: 'waiting' | 'active' | 'finished';
  white: { name: string; rating: number } | null;
  black: { name: string; rating: number } | null;
  spectatorCount: number;
  moveCount: number;
}

interface TournamentSummary {
  id: string;
  name: string;
  timeControlLabel: string;
  status: string;
  players: { clientId: string; name: string; rating: number; score: number }[];
}

interface OnlinePlayerInfo {
  clientId: string;
  name: string;
  rating: number;
  skillLevel: string;
}

interface ArenaLeaderboardRow {
  name: string;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  games: number;
}

interface PendingWsChallenge {
  id: string;
  fromClientId: string;
  fromName: string;
  fromRating: number;
  toClientId: string;
  timeControlLabel: string;
  initialMs: number;
  incrementMs: number;
}

interface RoomStatePayload {
  id: string;
  code: string;
  isPublic: boolean;
  timeControlLabel: string;
  status: 'waiting' | 'active' | 'finished';
  white: { clientId: string; name: string; rating: number; connected: boolean } | null;
  black: { clientId: string; name: string; rating: number; connected: boolean } | null;
  spectatorCount: number;
  fen: string;
  pgn?: string;
  turn: PieceColor;
  moves: MoveRecord[];
  whiteTimeMs: number;
  blackTimeMs: number;
  drawOfferBy: PieceColor | null;
  result: string | null;
  termination: string | null;
  chat: { id: string; sender: string; text: string; timestamp: number }[];
}

interface MultiplayerViewProps {
  preferences: BoardPreferences;
  playerName: string;
  playerRating: number;
  ratings?: {
    bullet: { rating: number };
    blitz: { rating: number };
    rapid: { rating: number };
    classical: { rating: number };
  };
  skillLevel: string;
  authUser: User | null;
  friendships: FriendshipRecord[];
  incomingInvites: GameInviteRecord[];
  publicProfiles: PublicProfileRecord[];
  pendingInviteTarget: { uid: string; name: string } | null;
  quickMatchTrigger?: number;
  /** Called once a Quick Match request has been sent, so the parent can clear the trigger. */
  onQuickMatchConsumed?: () => void;
  lastRatingDelta?: { category: string; delta: number; newRating: number } | null;
  onClearPendingInviteTarget: () => void;
  onSendGameInvite: (
    toUid: string,
    toName: string,
    roomCode: string,
    timeControlLabel: string
  ) => Promise<void>;
  onRespondGameInvite: (invite: GameInviteRecord, accept: boolean) => Promise<void>;
  onGameFinished: (
    game: SavedGameRecord,
    rated: boolean,
    opponentRating: number
  ) => void;
}

function inferCategory(label: string): TimeControlCategory {
  const lower = label.toLowerCase();
  if (lower.includes('bullet')) return 'bullet';
  if (lower.includes('rapid')) return 'rapid';
  if (lower.includes('classical')) return 'classical';
  return 'blitz';
}

export const MultiplayerView: React.FC<MultiplayerViewProps> = ({
  preferences,
  playerName,
  playerRating,
  ratings,
  skillLevel,
  authUser,
  friendships,
  incomingInvites,
  publicProfiles,
  pendingInviteTarget,
  quickMatchTrigger = 0,
  onQuickMatchConsumed,
  lastRatingDelta,
  onClearPendingInviteTarget,
  onSendGameInvite,
  onRespondGameInvite,
  onGameFinished,
}) => {
  const wsRef = useRef<WebSocket | null>(null);
  const recordedRoomsRef = useRef<Set<string>>(new Set());
  const pendingFriendTargetRef = useRef<{ uid: string; name: string } | null>(null);
  const handledTriggerRef = useRef<number>(0);

  const [connected, setConnected] = useState(false);
  const [clientId, setClientId] = useState<string>('');
  const [rooms, setRooms] = useState<LobbyRoomSummary[]>([]);
  const [tournaments, setTournaments] = useState<TournamentSummary[]>([]);
  const [onlinePlayers, setOnlinePlayers] = useState<OnlinePlayerInfo[]>([]);
  const [arenaLeaderboard, setArenaLeaderboard] = useState<ArenaLeaderboardRow[]>([]);
  const [queueCount, setQueueCount] = useState<number>(0);
  const [searchingQueue, setSearchingQueue] = useState(false);
  const [queueWaitSec, setQueueWaitSec] = useState(0);
  const [wsChallenge, setWsChallenge] = useState<PendingWsChallenge | null>(null);
  const [activeRoom, setActiveRoom] = useState<RoomStatePayload | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [roomError, setRoomError] = useState<string | null>(null);
  const [inviteStatus, setInviteStatus] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [viewPly, setViewPly] = useState(0);

  // Create Game / Quick Match options
  const [tcChoice, setTcChoice] = useState({ label: '5+0 Blitz', init: 300000, inc: 0 });
  const [sideChoice, setSideChoice] = useState<'random' | 'w' | 'b'>('random');
  const [isPublic, setIsPublic] = useState(true);
  const [tournamentName, setTournamentName] = useState('');

  const activeCategoryRating = useMemo(() => {
    const cat = inferCategory(tcChoice.label);
    if (!ratings || cat === 'unlimited') return playerRating;
    return ratings[cat]?.rating ?? playerRating;
  }, [ratings, tcChoice.label, playerRating]);

  // Client-side smooth clock display synced from server updates
  const [localWhiteMs, setLocalWhiteMs] = useState(300000);
  const [localBlackMs, setLocalBlackMs] = useState(300000);

  const pendingCloudInvites = useMemo(
    () => incomingInvites.filter((inv) => inv.status === 'pending'),
    [incomingInvites]
  );

  useEffect(() => {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      ws.send(
        JSON.stringify({
          type: 'player:identify',
          playerName,
          rating: playerRating,
          skillLevel,
        })
      );
      ws.send(JSON.stringify({ type: 'lobby:list' }));
    };

    ws.onclose = () => {
      setConnected(false);
      setSearchingQueue(false);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'session:init') {
          setClientId(msg.clientId);
        } else if (msg.type === 'lobby:update') {
          setRooms(msg.rooms || []);
          setTournaments(msg.tournaments || []);
          setOnlinePlayers(msg.players || []);
          setArenaLeaderboard(msg.leaderboard || []);
          if (typeof msg.queueCount === 'number') {
            setQueueCount(msg.queueCount);
          }
        } else if (msg.type === 'quickmatch:queued') {
          setSearchingQueue(true);
          setQueueWaitSec(0);
          setRoomError(null);
        } else if (msg.type === 'quickmatch:left') {
          setSearchingQueue(false);
          setQueueWaitSec(0);
        } else if (msg.type === 'quickmatch:matched') {
          setSearchingQueue(false);
          setQueueWaitSec(0);
          soundEngine.play('game-start');
          if (msg.room) {
            const r = msg.room as RoomStatePayload;
            setActiveRoom(r);
            setViewPly(r.moves.length);
            setLocalWhiteMs(r.whiteTimeMs);
            setLocalBlackMs(r.blackTimeMs);
            setRoomError(null);
          }
        } else if (msg.type === 'challenge:incoming') {
          setWsChallenge(msg.challenge as PendingWsChallenge);
        } else if (msg.type === 'room:state') {
          const r = msg.room as RoomStatePayload;
          setActiveRoom((prev) => {
            if (prev && r.moves.length > prev.moves.length) {
              const last = r.moves[r.moves.length - 1];
              soundEngine.play(last.isCheck ? 'check' : 'move');
            }
            return r;
          });
          setViewPly(r.moves.length);
          setLocalWhiteMs(r.whiteTimeMs);
          setLocalBlackMs(r.blackTimeMs);
          setRoomError(null);

          if (pendingFriendTargetRef.current && r.status === 'waiting') {
            const target = pendingFriendTargetRef.current;
            pendingFriendTargetRef.current = null;
            void onSendGameInvite(target.uid, target.name, r.code, r.timeControlLabel).then(() => {
              setInviteStatus(`Match invite sent to ${target.name} (Room ${r.code}).`);
            });
          }
        } else if (msg.type === 'room:error') {
          setRoomError(msg.message);
        }
      } catch {
        // ignore malformed frame
      }
    };

    return () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'player:identify',
          playerName,
          rating: activeCategoryRating,
          skillLevel,
        })
      );
    }
  }, [playerName, activeCategoryRating, skillLevel]);

  // Queue wait elapsed seconds counter
  useEffect(() => {
    if (!searchingQueue) return;
    const id = window.setInterval(() => {
      setQueueWaitSec((s) => s + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [searchingQueue]);

  // Trigger Quick Online Matchmaking when invoked from Header "Quick Match" or Dashboard CTA
  useEffect(() => {
    if (
      quickMatchTrigger > handledTriggerRef.current &&
      connected &&
      !activeRoom &&
      !searchingQueue &&
      wsRef.current?.readyState === WebSocket.OPEN
    ) {
      handledTriggerRef.current = quickMatchTrigger;
      wsRef.current.send(
        JSON.stringify({
          type: 'quickmatch:join',
          playerName,
          rating: activeCategoryRating,
          timeControlLabel: tcChoice.label,
          initialMs: tcChoice.init,
          incrementMs: tcChoice.inc,
        })
      );
      // Clear the parent's trigger so later visits to this view don't auto-queue again.
      handledTriggerRef.current = 0;
      onQuickMatchConsumed?.();
    }
  }, [quickMatchTrigger, connected, activeRoom, searchingQueue, playerName, activeCategoryRating, tcChoice]);

  // If user clicked "Challenge" on a friend from ProfileView, auto-create private match & send cloud invite
  useEffect(() => {
    if (!pendingInviteTarget || !connected || !authUser) return;
    pendingFriendTargetRef.current = pendingInviteTarget;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'room:create',
          playerName,
          rating: playerRating,
          timeControlLabel: tcChoice.label,
          initialMs: tcChoice.init,
          incrementMs: tcChoice.inc,
          preferredColor: sideChoice,
          isPublic: false,
        })
      );
    }
    onClearPendingInviteTarget();
  }, [pendingInviteTarget, connected, authUser]);

  // Record finished online match into Atelier Glicko-2 + profile history once
  useEffect(() => {
    if (!activeRoom || activeRoom.status !== 'finished' || !activeRoom.result) return;
    const myColor: PieceColor | 'spectator' =
      activeRoom.white?.clientId === clientId
        ? 'w'
        : activeRoom.black?.clientId === clientId
          ? 'b'
          : 'spectator';
    if (myColor === 'spectator') return;
    if (recordedRoomsRef.current.has(activeRoom.id)) return;
    recordedRoomsRef.current.add(activeRoom.id);

    const opp = myColor === 'w' ? activeRoom.black : activeRoom.white;
    const saved: SavedGameRecord = {
      id: `online_${activeRoom.id}`,
      date: new Date().toISOString(),
      mode: 'multiplayer',
      timeControl: activeRoom.timeControlLabel,
      category: inferCategory(activeRoom.timeControlLabel),
      whiteName: activeRoom.white?.name || 'White',
      blackName: activeRoom.black?.name || 'Black',
      playerColor: myColor,
      result: activeRoom.result as '1-0' | '0-1' | '1/2-1/2',
      termination: activeRoom.termination || 'Completed',
      pgn: activeRoom.pgn || activeRoom.moves.map((m) => m.san).join(' '),
      finalFen: activeRoom.fen,
      moveCount: activeRoom.moves.length,
      openingName: 'Online Arena Match',
    };
    onGameFinished(saved, true, opp?.rating || 100);
  }, [activeRoom, clientId, onGameFinished]);

  useEffect(() => {
    if (!activeRoom || activeRoom.status !== 'active' || activeRoom.moves.length === 0) return;
    const turn = activeRoom.turn;
    const id = window.setInterval(() => {
      if (turn === 'w') setLocalWhiteMs((t) => Math.max(0, t - 200));
      else setLocalBlackMs((t) => Math.max(0, t - 200));
    }, 200);
    return () => clearInterval(id);
  }, [activeRoom?.id, activeRoom?.status, activeRoom?.turn, activeRoom?.moves.length]);

  const sendWs = (payload: Record<string, unknown>) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  };

  const startQuickMatchmaking = () => {
    sendWs({
      type: 'quickmatch:join',
      playerName,
      rating: activeCategoryRating,
      timeControlLabel: tcChoice.label,
      initialMs: tcChoice.init,
      incrementMs: tcChoice.inc,
    });
  };

  const cancelQuickMatchmaking = () => {
    sendWs({ type: 'quickmatch:leave' });
    setSearchingQueue(false);
    setQueueWaitSec(0);
  };

  const myColor: PieceColor | 'spectator' =
    activeRoom?.white?.clientId === clientId
      ? 'w'
      : activeRoom?.black?.clientId === clientId
        ? 'b'
        : 'spectator';

  const handleMove = (from: string, to: string, promotion?: PieceType) => {
    if (!activeRoom || activeRoom.status !== 'active' || myColor === 'spectator') return false;
    if (activeRoom.turn !== myColor) return false;
    sendWs({
      type: 'room:move',
      roomId: activeRoom.id,
      from,
      to,
      promotion,
    });
    return true;
  };

  const handleInviteFriend = (friendUid: string, friendName: string) => {
    pendingFriendTargetRef.current = { uid: friendUid, name: friendName };
    sendWs({
      type: 'room:create',
      playerName,
      rating: playerRating,
      timeControlLabel: tcChoice.label,
      initialMs: tcChoice.init,
      incrementMs: tcChoice.inc,
      preferredColor: sideChoice,
      isPublic: false,
    });
  };

  const handleAcceptCloudInvite = async (invite: GameInviteRecord) => {
    await onRespondGameInvite(invite, true);
    sendWs({
      type: 'room:join',
      code: invite.roomCode,
      playerName,
      rating: playerRating,
    });
  };

  if (activeRoom) {
    const displayedFen =
      viewPly === activeRoom.moves.length
        ? activeRoom.fen
        : viewPly === 0
          ? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
          : activeRoom.moves[viewPly - 1]?.fenAfter || activeRoom.fen;

    const orientation: PieceColor = myColor === 'b' ? 'b' : 'w';
    const topIsBlack = orientation === 'w';
    const lastMove =
      viewPly > 0 && activeRoom.moves[viewPly - 1]
        ? { from: activeRoom.moves[viewPly - 1].from, to: activeRoom.moves[viewPly - 1].to }
        : null;

    return (
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className="xl:col-span-7 flex flex-col items-center gap-3">
          <div
            className="w-full flex items-center justify-between px-4 py-2.5 bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 rounded-xl"
            style={{ maxWidth: preferences.boardSizePx }}
          >
            <div className="text-sm font-semibold">
              {topIsBlack
                ? activeRoom.black?.name || 'Waiting for Black…'
                : activeRoom.white?.name || 'Waiting for White…'}
            </div>
            <ChessClock
              timeMs={topIsBlack ? localBlackMs : localWhiteMs}
              active={
                activeRoom.status === 'active' &&
                activeRoom.moves.length > 0 &&
                activeRoom.turn === (topIsBlack ? 'b' : 'w')
              }
            />
          </div>

          <Chessboard
            fen={displayedFen}
            orientation={orientation}
            preferences={preferences}
            interactive={
              activeRoom.status === 'active' &&
              myColor !== 'spectator' &&
              viewPly === activeRoom.moves.length
            }
            allowedColor={myColor === 'spectator' ? 'none' : myColor}
            lastMove={lastMove}
            onMove={handleMove}
          />

          <div
            className="w-full flex items-center justify-between px-4 py-2.5 bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 rounded-xl"
            style={{ maxWidth: preferences.boardSizePx }}
          >
            <div className="text-sm font-semibold">
              {topIsBlack
                ? activeRoom.white?.name || 'Waiting for White…'
                : activeRoom.black?.name || 'Waiting for Black…'}
            </div>
            <ChessClock
              timeMs={topIsBlack ? localWhiteMs : localBlackMs}
              active={
                activeRoom.status === 'active' &&
                activeRoom.moves.length > 0 &&
                activeRoom.turn === (topIsBlack ? 'w' : 'b')
              }
            />
          </div>
        </div>

        <div className="xl:col-span-5 space-y-4">
          {inviteStatus && (
            <div className="p-3 rounded-xl bg-emerald-700/10 border border-emerald-600/30 text-xs text-emerald-700 dark:text-emerald-300 flex items-center justify-between">
              <span>{inviteStatus}</span>
              <button type="button" onClick={() => setInviteStatus(null)} className="cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-neutral-500">
                  {activeRoom.timeControlLabel} · Room Code{' '}
                  <span className="font-mono font-bold text-neutral-900 dark:text-white">
                    {activeRoom.code}
                  </span>
                </div>
                <div className="text-sm font-semibold mt-0.5 capitalize">
                  Status: {activeRoom.status}
                  {myColor === 'spectator' ? ' (Spectating)' : ''}
                </div>
              </div>
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(activeRoom.code)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-xs font-medium cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                Copy Code
              </button>
            </div>

            {activeRoom.status === 'finished' && (
              <div className="p-3 rounded-xl bg-emerald-700 text-white text-xs font-semibold flex flex-wrap items-center justify-between gap-2">
                <span>Result: {activeRoom.result} · {activeRoom.termination}</span>
                {myColor !== 'spectator' && lastRatingDelta && (
                  <span className="px-2 py-0.5 rounded bg-black/25 font-mono">
                    Elo {lastRatingDelta.delta >= 0 ? `+${lastRatingDelta.delta}` : lastRatingDelta.delta} →{' '}
                    {lastRatingDelta.newRating}
                  </span>
                )}
              </div>
            )}

            {activeRoom.drawOfferBy && activeRoom.drawOfferBy !== myColor && myColor !== 'spectator' && (
              <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-between text-xs">
                <span>Opponent offers a draw.</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => sendWs({ type: 'room:draw_accept', roomId: activeRoom.id })}
                    className="px-2.5 py-1 rounded bg-emerald-700 text-white font-semibold cursor-pointer"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    onClick={() => sendWs({ type: 'room:draw_decline', roomId: activeRoom.id })}
                    className="px-2.5 py-1 rounded bg-neutral-200 dark:bg-neutral-700 font-semibold cursor-pointer"
                  >
                    Decline
                  </button>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {myColor !== 'spectator' && activeRoom.status === 'active' && (
                <>
                  <button
                    type="button"
                    onClick={() => sendWs({ type: 'room:draw_offer', roomId: activeRoom.id })}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-xs font-medium cursor-pointer"
                  >
                    <Handshake className="w-3.5 h-3.5" />
                    Offer Draw
                  </button>
                  <button
                    type="button"
                    onClick={() => sendWs({ type: 'room:resign', roomId: activeRoom.id })}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-medium cursor-pointer"
                  >
                    <Flag className="w-3.5 h-3.5" />
                    Resign
                  </button>
                </>
              )}
              {activeRoom.status === 'finished' && myColor !== 'spectator' && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveRoom(null);
                    startQuickMatchmaking();
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
                >
                  <Zap className="w-3.5 h-3.5" />
                  New Quick Match
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setActiveRoom(null);
                  setRoomError(null);
                  sendWs({ type: 'lobby:list' });
                }}
                className="px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 text-xs font-medium cursor-pointer ml-auto"
              >
                Leave Room
              </button>
            </div>
          </div>

          <MoveHistory
            moves={activeRoom.moves}
            currentPly={viewPly}
            onSelectPly={setViewPly}
          />

          <div className="bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5" />
                Match Chat
              </span>
              <span className="text-neutral-500">{activeRoom.spectatorCount} spectators</span>
            </div>
            <div className="max-h-36 overflow-y-auto space-y-1.5 text-xs">
              {activeRoom.chat.length === 0 ? (
                <p className="text-neutral-500">No messages yet.</p>
              ) : (
                activeRoom.chat.map((c) => (
                  <div key={c.id}>
                    <span className="font-semibold mr-1.5">{c.sender}:</span>
                    <span className="text-neutral-600 dark:text-neutral-300">{c.text}</span>
                  </div>
                ))
              )}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!chatInput.trim()) return;
                sendWs({
                  type: 'room:chat',
                  roomId: activeRoom.id,
                  sender: playerName,
                  text: chatInput,
                });
                setChatInput('');
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Say good game…"
                className="flex-1 px-3 py-1.5 rounded-lg text-xs bg-neutral-50 dark:bg-[#11151C] border border-neutral-200 dark:border-neutral-800"
              />
              <button
                type="submit"
                className="px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  const otherOnlinePlayers = onlinePlayers.filter((p) => p.clientId !== clientId);

  return (
    <div className="space-y-6">
      {/* Live Challenge / Friend Match Invites Banners */}
      {wsChallenge && (
        <div className="p-4 rounded-2xl bg-emerald-700 text-white flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs">
            <div className="font-semibold text-sm">
              Direct Challenge from {wsChallenge.fromName} ({wsChallenge.fromRating})
            </div>
            <div className="opacity-90">{wsChallenge.timeControlLabel}</div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                sendWs({ type: 'challenge:accept', challengeId: wsChallenge.id });
                setWsChallenge(null);
              }}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white text-emerald-800 text-xs font-semibold cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              Accept Match
            </button>
            <button
              type="button"
              onClick={() => {
                sendWs({ type: 'challenge:decline', challengeId: wsChallenge.id });
                setWsChallenge(null);
              }}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-800 text-white text-xs font-semibold cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              Decline
            </button>
          </div>
        </div>
      )}

      {pendingCloudInvites.map((inv) => (
        <div
          key={inv.id}
          className="p-4 rounded-2xl bg-amber-500/15 border border-amber-500/40 flex flex-wrap items-center justify-between gap-3"
        >
          <div className="text-xs">
            <div className="font-semibold text-sm">
              Friend Match Invite from {inv.fromName} ({inv.fromRating})
            </div>
            <div className="text-neutral-600 dark:text-neutral-300">
              {inv.timeControlLabel} · Room Code <span className="font-mono font-bold">{inv.roomCode}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void handleAcceptCloudInvite(inv)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              Join Match
            </button>
            <button
              type="button"
              onClick={() => void onRespondGameInvite(inv, false)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-neutral-200 dark:bg-neutral-800 text-xs font-semibold cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              Decline
            </button>
          </div>
        </div>
      ))}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Quick Matchmaking, Create Match, Join by Code & Challenge Friends */}
        <div className="lg:col-span-5 space-y-6">
          {/* Quick Online Play (Matched Around Your Elo) */}
          <div className="bg-white dark:bg-[#151921] border-2 border-emerald-600/40 dark:border-emerald-500/30 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <h1 className="text-lg font-semibold text-neutral-900 dark:text-white">
                  Quick Online Play
                </h1>
              </div>
              <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                Your Elo: {activeCategoryRating}
              </span>
            </div>

            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Automatically pairs you with another online player near your Elo rating (starts at ±150 Elo and widens gently if needed).
            </p>

            <div className="flex flex-wrap gap-1.5">
              {[
                { label: '1+0 Bullet', init: 60000, inc: 0 },
                { label: '3+2 Blitz', init: 180000, inc: 2000 },
                { label: '5+0 Blitz', init: 300000, inc: 0 },
                { label: '10+0 Rapid', init: 600000, inc: 0 },
                { label: '15+10 Rapid', init: 900000, inc: 10000 },
              ].map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  disabled={searchingQueue}
                  onClick={() => setTcChoice(opt)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border cursor-pointer disabled:opacity-50 ${
                    tcChoice.label === opt.label
                      ? 'bg-emerald-700 text-white border-emerald-700'
                      : 'bg-neutral-50 dark:bg-[#11151C] border-neutral-200 dark:border-neutral-800'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {searchingQueue ? (
              <div className="p-3.5 rounded-xl bg-emerald-700/10 border border-emerald-600/30 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="inline-flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-300">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Searching for {tcChoice.label} opponent…
                  </span>
                  <span className="font-mono tabular-nums text-neutral-600 dark:text-neutral-300">
                    {queueWaitSec}s
                  </span>
                </div>
                <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
                  Matching range: ±{150 + Math.floor(queueWaitSec / 5) * 100} Elo · {queueCount} in queue
                </div>
                <button
                  type="button"
                  onClick={cancelQuickMatchmaking}
                  className="w-full py-2 rounded-lg bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-xs font-semibold cursor-pointer"
                >
                  Cancel Search
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={!connected}
                onClick={startQuickMatchmaking}
                className="w-full py-2.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold disabled:opacity-40 inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <Zap className="w-4 h-4" />
                Find Online Match ({tcChoice.label})
              </button>
            )}
          </div>

          <div className="bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-neutral-900 dark:text-white">
                Custom &amp; Private Rooms
              </h2>
              <span className="text-xs font-mono text-neutral-500">
                {connected ? `${onlinePlayers.length} Online` : 'Connecting…'}
              </span>
            </div>

            <div className="space-y-3">
              <label className="block text-xs font-medium text-neutral-500">
                Time Control
                <select
                  value={tcChoice.label}
                  onChange={(e) => {
                    const opts = [
                      { label: '1+0 Bullet', init: 60000, inc: 0 },
                      { label: '3+2 Blitz', init: 180000, inc: 2000 },
                      { label: '5+0 Blitz', init: 300000, inc: 0 },
                      { label: '10+0 Rapid', init: 600000, inc: 0 },
                      { label: '15+10 Rapid', init: 900000, inc: 10000 },
                    ];
                    const f = opts.find((o) => o.label === e.target.value);
                    if (f) setTcChoice(f);
                  }}
                  className="mt-1 w-full px-3 py-2 rounded-lg text-xs bg-neutral-50 dark:bg-[#11151C] border border-neutral-200 dark:border-neutral-800"
                >
                  <option value="1+0 Bullet">1+0 Bullet</option>
                  <option value="3+2 Blitz">3+2 Blitz</option>
                  <option value="5+0 Blitz">5+0 Blitz</option>
                  <option value="10+0 Rapid">10+0 Rapid</option>
                  <option value="15+10 Rapid">15+10 Rapid</option>
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <label className="block font-medium text-neutral-500">
                  Color
                  <select
                    value={sideChoice}
                    onChange={(e) => setSideChoice(e.target.value as 'random' | 'w' | 'b')}
                    className="mt-1 w-full px-3 py-2 rounded-lg bg-neutral-50 dark:bg-[#11151C] border border-neutral-200 dark:border-neutral-800"
                  >
                    <option value="random">Random</option>
                    <option value="w">White</option>
                    <option value="b">Black</option>
                  </select>
                </label>

                <label className="block font-medium text-neutral-500">
                  Visibility
                  <select
                    value={isPublic ? 'public' : 'private'}
                    onChange={(e) => setIsPublic(e.target.value === 'public')}
                    className="mt-1 w-full px-3 py-2 rounded-lg bg-neutral-50 dark:bg-[#11151C] border border-neutral-200 dark:border-neutral-800"
                  >
                    <option value="public">Public Lobby</option>
                    <option value="private">Invite Code Only</option>
                  </select>
                </label>
              </div>

              <button
                type="button"
                disabled={!connected}
                onClick={() =>
                  sendWs({
                    type: 'room:create',
                    playerName,
                    rating: activeCategoryRating,
                    timeControlLabel: tcChoice.label,
                    initialMs: tcChoice.init,
                    incrementMs: tcChoice.inc,
                    preferredColor: sideChoice,
                    isPublic,
                  })
                }
                className="w-full py-2.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-white text-white dark:text-neutral-900 text-xs font-semibold disabled:opacity-40 cursor-pointer"
              >
                Create Live Match Room
              </button>
            </div>

            <div className="pt-4 border-t border-neutral-200 dark:border-neutral-800 space-y-2">
              <label className="text-xs font-medium text-neutral-500 block">
                Join by Invite Code
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => {
                    setJoinCode(e.target.value.toUpperCase());
                    if (roomError) setRoomError(null);
                  }}
                  placeholder="Enter 6-letter code…"
                  className="flex-1 px-3 py-2 rounded-lg text-xs font-mono uppercase bg-neutral-50 dark:bg-[#11151C] border border-neutral-200 dark:border-neutral-800"
                />
                <button
                  type="button"
                  disabled={!joinCode.trim() || !connected}
                  onClick={() =>
                    sendWs({
                      type: 'room:join',
                      code: joinCode,
                      playerName,
                      rating: playerRating,
                    })
                  }
                  className="px-4 py-2 rounded-lg bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-xs font-semibold disabled:opacity-40 cursor-pointer"
                >
                  Join
                </button>
              </div>
              {roomError && <p className="text-xs text-red-500">{roomError}</p>}
            </div>
          </div>

          {/* Friends Quick Challenge */}
          {authUser && friendships.length > 0 && (
            <div className="bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 space-y-3">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Swords className="w-4 h-4 text-emerald-600" />
                Challenge a Friend
              </h2>
              <div className="space-y-2">
                {friendships.map((f) => {
                  const isA = f.userA === authUser.uid;
                  const fUid = isA ? f.userB : f.userA;
                  const fName = isA ? f.nameB : f.nameA;
                  return (
                    <div
                      key={f.id}
                      className="flex items-center justify-between p-2 rounded-lg bg-neutral-50 dark:bg-[#11151C] text-xs"
                    >
                      <span className="font-semibold">{fName}</span>
                      <button
                        type="button"
                        disabled={!connected}
                        onClick={() => handleInviteFriend(fUid, fName)}
                        className="px-2.5 py-1 rounded-lg bg-emerald-700 text-white font-semibold disabled:opacity-40 cursor-pointer"
                      >
                        Send {tcChoice.label} Invite
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Online Players Direct Challenge */}
          <div className="bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 space-y-3">
            <h2 className="text-sm font-semibold">Live Lobby Players ({otherOnlinePlayers.length})</h2>
            {otherOnlinePlayers.length === 0 ? (
              <p className="text-xs text-neutral-500">
                No other players are currently waiting in the WebSocket lobby.
              </p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {otherOnlinePlayers.map((p) => (
                  <div
                    key={p.clientId}
                    className="flex items-center justify-between p-2 rounded-lg bg-neutral-50 dark:bg-[#11151C] text-xs"
                  >
                    <div>
                      <div className="font-semibold">{p.name}</div>
                      <div className="text-neutral-500 font-mono">
                        {p.rating} · {p.skillLevel}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        sendWs({
                          type: 'challenge:send',
                          toClientId: p.clientId,
                          timeControlLabel: tcChoice.label,
                          initialMs: tcChoice.init,
                          incrementMs: tcChoice.inc,
                        })
                      }
                      className="px-2.5 py-1 rounded-lg bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 font-semibold cursor-pointer"
                    >
                      Challenge
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Public Games, Tournaments & Arena Leaderboards */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-600" />
                Live Lobby &amp; Public Games
              </h2>
              <button
                type="button"
                onClick={() => sendWs({ type: 'lobby:list' })}
                className="text-xs font-medium text-emerald-600 hover:underline cursor-pointer"
              >
                Refresh
              </button>
            </div>

            {rooms.length === 0 ? (
              <p className="text-xs text-neutral-500 py-6 text-center">
                No public rooms active right now. Create a live match room or share a private invite code with a friend.
              </p>
            ) : (
              <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {rooms.map((r) => (
                  <div key={r.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">
                        {r.white?.name || 'Open Seat'} vs {r.black?.name || 'Open Seat'}
                      </div>
                      <div className="text-xs text-neutral-500 font-mono">
                        {r.timeControlLabel} · Code {r.code} · {r.moveCount} moves · {r.spectatorCount} watching
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {r.status === 'waiting' && (
                        <button
                          type="button"
                          onClick={() =>
                            sendWs({
                              type: 'room:join',
                              roomId: r.id,
                              playerName,
                              rating: playerRating,
                            })
                          }
                          className="px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
                        >
                          Join Match
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          sendWs({
                            type: 'room:join',
                            roomId: r.id,
                            playerName,
                            rating: playerRating,
                            asSpectator: true,
                          })
                        }
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-xs font-medium cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Spectate
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tournaments Section */}
          <div className="bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 space-y-4">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-500" />
              Live Arena Tournaments
            </h2>

            <div className="flex gap-2">
              <input
                type="text"
                value={tournamentName}
                onChange={(e) => setTournamentName(e.target.value)}
                placeholder="New Arena Tournament Title…"
                className="flex-1 px-3 py-2 rounded-lg text-xs bg-neutral-50 dark:bg-[#11151C] border border-neutral-200 dark:border-neutral-800"
              />
              <button
                type="button"
                disabled={!tournamentName.trim() || !connected}
                onClick={() => {
                  sendWs({
                    type: 'tournament:create',
                    name: tournamentName,
                    timeControlLabel: '3+2 Blitz',
                    playerName,
                    rating: playerRating,
                  });
                  setTournamentName('');
                }}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-xs font-semibold disabled:opacity-40 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Host Arena
              </button>
            </div>

            {tournaments.length === 0 ? (
              <p className="text-xs text-neutral-500">
                No scheduled tournaments yet. Host an open Blitz Arena above.
              </p>
            ) : (
              <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {tournaments.map((t) => (
                  <div key={t.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-semibold text-sm">{t.name}</div>
                      <div className="text-neutral-500">
                        {t.timeControlLabel} · {t.players.length} registered players
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        sendWs({
                          type: 'tournament:join',
                          tournamentId: t.id,
                          playerName,
                          rating: playerRating,
                        })
                      }
                      className="px-3 py-1.5 rounded-lg bg-emerald-700 text-white font-semibold cursor-pointer"
                    >
                      Register
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Arena & Cloud Standings */}
          <div className="bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 space-y-3">
            <h2 className="text-base font-semibold">Arena Standings</h2>
            {arenaLeaderboard.length === 0 && publicProfiles.length === 0 ? (
              <p className="text-xs text-neutral-500">
                Complete live arena matches or sign in with Google to appear on the standings.
              </p>
            ) : (
              <div className="divide-y divide-neutral-200 dark:divide-neutral-800 text-xs">
                {(arenaLeaderboard.length > 0
                  ? arenaLeaderboard.map((r) => ({
                      key: r.name,
                      name: r.name,
                      rating: r.rating,
                      record: `${r.wins}W · ${r.losses}L · ${r.draws}D`,
                    }))
                  : publicProfiles.slice(0, 8).map((p) => ({
                      key: p.uid,
                      name: p.username,
                      rating: p.blitzRating,
                      record: `${p.totalWins}W / ${p.totalGames}G`,
                    }))
                ).map((row, idx) => (
                  <div key={row.key} className="py-2 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono text-neutral-400">#{idx + 1}</span>
                      <span className="font-semibold">{row.name}</span>
                      <span className="text-neutral-500">{row.record}</span>
                    </div>
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {row.rating}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
