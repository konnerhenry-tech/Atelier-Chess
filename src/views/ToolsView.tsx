import React, { useEffect, useMemo, useState } from 'react';
import { Chess, Square } from 'chess.js';
import {
  Clock,
  Eye,
  EyeOff,
  Grid,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { Chessboard } from '../components/Chessboard';
import { formatClockMs } from '../components/ChessClock';
import { MASTER_GAMES } from '../data/masterGames';
import { ChessPieceSvg } from '../data/pieceSets';
import { stockfishService } from '../engine/stockfishService';
import { BoardPreferences, PieceCode, PieceColor, PieceType } from '../types/chess';
import { validateFenString } from '../utils/chessHelpers';
import { soundEngine } from '../utils/soundEngine';

interface ToolsViewProps {
  preferences: BoardPreferences;
  onSendFenToAnalysis: (fen: string) => void;
  onSendFenToPlay: (fen: string) => void;
}

const PALETTE_PIECES: PieceCode[] = [
  'wK', 'wQ', 'wR', 'wB', 'wN', 'wP',
  'bK', 'bQ', 'bR', 'bB', 'bN', 'bP',
];

export const ToolsView: React.FC<ToolsViewProps> = ({
  preferences,
  onSendFenToAnalysis,
  onSendFenToPlay,
}) => {
  const [tool, setTool] = useState<'editor' | 'blindfold' | 'guess' | 'clock'>('editor');

  // --- Board Editor State ---
  const [editorChess] = useState(() => new Chess());
  const [editorFen, setEditorFen] = useState(editorChess.fen());
  const [selectedBrush, setSelectedBrush] = useState<PieceCode | 'erase'>('wQ');
  const [editorTurn, setEditorTurn] = useState<PieceColor>('w');
  const [fenInput, setFenInput] = useState(editorChess.fen());
  const [fenStatus, setFenStatus] = useState<string | null>(null);

  const handleEditorSquare = (sq: string) => {
    const placement = editorFen.split(' ')[0];
    const temp = new Chess();
    // Build board array manually from FEN placement
    const ranks = placement.split('/');
    const grid: (PieceCode | null)[][] = ranks.map((row) => {
      const cells: (PieceCode | null)[] = [];
      for (const ch of row) {
        if (/[1-8]/.test(ch)) {
          for (let i = 0; i < parseInt(ch, 10); i++) cells.push(null);
        } else {
          const c = ch === ch.toUpperCase() ? 'w' : 'b';
          cells.push(`${c}${ch.toUpperCase()}` as PieceCode);
        }
      }
      return cells;
    });

    const fileIdx = 'abcdefgh'.indexOf(sq[0]);
    const rankIdx = '87654321'.indexOf(sq[1]);
    if (fileIdx < 0 || rankIdx < 0) return;

    grid[rankIdx][fileIdx] = selectedBrush === 'erase' ? null : selectedBrush;
    const newPlacement = grid
      .map((row) => {
        let s = '';
        let empty = 0;
        for (const cell of row) {
          if (!cell) empty++;
          else {
            if (empty > 0) {
              s += String(empty);
              empty = 0;
            }
            const letter = cell[0] === 'w' ? cell[1].toUpperCase() : cell[1].toLowerCase();
            s += letter;
          }
        }
        if (empty > 0) s += String(empty);
        return s;
      })
      .join('/');

    const nextFen = `${newPlacement} ${editorTurn} - - 0 1`;
    setEditorFen(nextFen);
    setFenInput(nextFen);
    const v = validateFenString(nextFen);
    setFenStatus(v.valid ? 'Valid legal FEN.' : `Note: ${v.error}`);
    void temp;
  };

  // --- Blindfold Chess State ---
  const [bfChess] = useState(() => new Chess());
  const [bfFen, setBfFen] = useState(bfChess.fen());
  const [bfSanInput, setBfSanInput] = useState('');
  const [bfPeek, setBfPeek] = useState(false);
  const [bfMoves, setBfMoves] = useState<string[]>([]);
  const [bfMsg, setBfMsg] = useState<string | null>(null);

  const playBlindfoldMove = async (sanText: string) => {
    setBfMsg(null);
    try {
      const m = bfChess.move(sanText.trim());
      if (!m) {
        setBfMsg('Illegal or unrecognized SAN move.');
        return;
      }
      soundEngine.play(m.captured ? 'capture' : 'move');
      setBfFen(bfChess.fen());
      setBfMoves([...bfMoves, m.san]);
      setBfSanInput('');

      if (!bfChess.isGameOver()) {
        const res = await stockfishService.chooseAIMove(bfChess.fen(), {
          skillLevel: 5,
          depth: 6,
          thinkTimeMs: 400,
          style: 'balanced',
        });
        if (res.moveUci) {
          const reply = bfChess.move({
            from: res.moveUci.slice(0, 2) as Square,
            to: res.moveUci.slice(2, 4) as Square,
            promotion: res.moveUci.length > 4 ? (res.moveUci[4] as PieceType) : undefined,
          });
          if (reply) {
            setBfFen(bfChess.fen());
            setBfMoves((prev) => [...prev, reply.san]);
            soundEngine.play(reply.captured ? 'capture' : 'move');
          }
        }
      }
    } catch {
      setBfMsg('Invalid move notation (try e4, Nf3, O-O).');
    }
  };

  // --- Guess-the-Move Master Trainer ---
  const [guessGameIdx, setGuessGameIdx] = useState(0);
  const masterGame = MASTER_GAMES[guessGameIdx];
  const masterVerbose = useMemo(() => {
    const c = new Chess();
    c.loadPgn(masterGame.pgn);
    return c.history({ verbose: true });
  }, [masterGame]);

  const [guessPly, setGuessPly] = useState(6);
  const [guessScore, setGuessScore] = useState(0);
  const [guessAttempts, setGuessAttempts] = useState(0);
  const [guessFeedback, setGuessFeedback] = useState<string | null>(null);

  const guessFen = useMemo(() => {
    const c = new Chess();
    for (let i = 0; i < guessPly && i < masterVerbose.length; i++) {
      c.move(masterVerbose[i].san);
    }
    return c.fen();
  }, [masterVerbose, guessPly]);

  const handleGuessMove = (from: string, to: string, promotion?: PieceType) => {
    if (guessPly >= masterVerbose.length) return false;
    const expected = masterVerbose[guessPly];
    const c = new Chess();
    c.load(guessFen);
    try {
      const m = c.move({ from, to, promotion });
      if (!m) return false;
      setGuessAttempts((a) => a + 1);
      if (m.san === expected.san) {
        soundEngine.play('puzzle-success');
        setGuessScore((s) => s + 1);
        setGuessFeedback(`Exact match! ${expected.san} was played in ${masterGame.title}.`);
        setGuessPly((p) => Math.min(masterVerbose.length, p + 2));
        return true;
      } else {
        soundEngine.play('puzzle-error');
        setGuessFeedback(`You tried ${m.san} — the master played ${expected.san}.`);
        return false;
      }
    } catch {
      return false;
    }
  };

  // --- Standalone OTB Chess Clock ---
  const [clockInitMs, setClockInitMs] = useState(300000);
  const [clockIncMs, setClockIncMs] = useState(3000);
  const [otbWhiteMs, setOtbWhiteMs] = useState(300000);
  const [otbBlackMs, setOtbBlackMs] = useState(300000);
  const [otbTurn, setOtbTurn] = useState<'w' | 'b' | null>(null);
  const [otbPaused, setOtbPaused] = useState(false);

  useEffect(() => {
    if (!otbTurn || otbPaused) return;
    const id = window.setInterval(() => {
      if (otbTurn === 'w') {
        setOtbWhiteMs((t) => Math.max(0, t - 100));
      } else {
        setOtbBlackMs((t) => Math.max(0, t - 100));
      }
    }, 100);
    return () => clearInterval(id);
  }, [otbTurn, otbPaused]);

  const tapOtbClock = (side: 'w' | 'b') => {
    if (otbPaused) return;
    if (otbTurn === null) {
      setOtbTurn(side === 'w' ? 'b' : 'w');
      soundEngine.play('move');
      return;
    }
    if (otbTurn !== side) return;
    if (side === 'w') setOtbWhiteMs((t) => t + clockIncMs);
    else setOtbBlackMs((t) => t + clockIncMs);
    setOtbTurn(side === 'w' ? 'b' : 'w');
    soundEngine.play('move');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 rounded-2xl p-4">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900 dark:text-white">
            Advanced Training Tools
          </h1>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            FEN Board Editor, Blindfold Chess vs Stockfish, Guess-the-Move Master Trainer, and OTB Chess Clock.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-neutral-100 dark:bg-[#11151C] rounded-xl">
          {[
            { id: 'editor', label: 'Board Editor', icon: Grid },
            { id: 'blindfold', label: 'Blindfold Chess', icon: EyeOff },
            { id: 'guess', label: 'Guess the Move', icon: Sparkles },
            { id: 'clock', label: 'Chess Clock', icon: Clock },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTool(item.id as typeof tool)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                  tool === item.id
                    ? 'bg-white dark:bg-[#1F2633] text-neutral-900 dark:text-white shadow-sm'
                    : 'text-neutral-500'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* BOARD EDITOR */}
      {tool === 'editor' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          <div className="xl:col-span-6 flex justify-center">
            <Chessboard
              fen={editorFen}
              preferences={preferences}
              sizeOverridePx={Math.min(480, preferences.boardSizePx)}
              interactive={false}
              editorSelectedPiece={selectedBrush}
              onEditorSquareAction={handleEditorSquare}
            />
          </div>

          <div className="xl:col-span-6 bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 space-y-4">
            <h2 className="text-base font-semibold">Piece Palette (Click squares to place)</h2>
            <div className="grid grid-cols-6 gap-2">
              {PALETTE_PIECES.map((pc) => (
                <button
                  key={pc}
                  type="button"
                  onClick={() => setSelectedBrush(pc)}
                  className={`p-2 rounded-lg border flex items-center justify-center cursor-pointer ${
                    selectedBrush === pc
                      ? 'border-emerald-600 bg-emerald-500/15'
                      : 'border-neutral-200 dark:border-neutral-800'
                  }`}
                >
                  <ChessPieceSvg piece={pc} setId={preferences.pieceSetId} className="w-8 h-8" />
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedBrush('erase')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border cursor-pointer ${
                  selectedBrush === 'erase'
                    ? 'border-red-500 bg-red-500/15 text-red-500'
                    : 'border-neutral-200 dark:border-neutral-800'
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Erase Square
              </button>
              <button
                type="button"
                onClick={() => {
                  const start = new Chess().fen();
                  setEditorFen(start);
                  setFenInput(start);
                  setFenStatus('Reset to starting position.');
                }}
                className="px-3 py-1.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-xs font-medium cursor-pointer"
              >
                Starting Position
              </button>
              <button
                type="button"
                onClick={() => {
                  const empty = `8/8/8/8/8/8/8/8 ${editorTurn} - - 0 1`;
                  setEditorFen(empty);
                  setFenInput(empty);
                }}
                className="px-3 py-1.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-xs font-medium cursor-pointer"
              >
                Clear Board
              </button>
            </div>

            <div className="flex items-center gap-3 text-xs">
              <span className="font-medium text-neutral-500">Side to Move:</span>
              <button
                type="button"
                onClick={() => {
                  setEditorTurn('w');
                  const parts = editorFen.split(' ');
                  parts[1] = 'w';
                  const next = parts.join(' ');
                  setEditorFen(next);
                  setFenInput(next);
                  const v = validateFenString(next);
                  setFenStatus(v.valid ? 'Side to move set to White.' : `Note: ${v.error}`);
                }}
                className={`px-3 py-1 rounded cursor-pointer ${
                  editorTurn === 'w' ? 'bg-emerald-700 text-white' : 'bg-neutral-100 dark:bg-neutral-800'
                }`}
              >
                White
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditorTurn('b');
                  const parts = editorFen.split(' ');
                  parts[1] = 'b';
                  const next = parts.join(' ');
                  setEditorFen(next);
                  setFenInput(next);
                  const v = validateFenString(next);
                  setFenStatus(v.valid ? 'Side to move set to Black.' : `Note: ${v.error}`);
                }}
                className={`px-3 py-1 rounded cursor-pointer ${
                  editorTurn === 'b' ? 'bg-emerald-700 text-white' : 'bg-neutral-100 dark:bg-neutral-800'
                }`}
              >
                Black
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-500">FEN String</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={fenInput}
                  onChange={(e) => setFenInput(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg text-xs font-mono bg-neutral-50 dark:bg-[#11151C] border border-neutral-200 dark:border-neutral-800"
                />
                <button
                  type="button"
                  onClick={() => {
                    const v = validateFenString(fenInput);
                    if (v.valid) {
                      const clean = fenInput.trim();
                      setEditorFen(clean);
                      setEditorTurn(clean.split(' ')[1] === 'b' ? 'b' : 'w');
                      setFenStatus('FEN loaded.');
                    } else {
                      setFenStatus(v.error || 'Invalid FEN.');
                    }
                  }}
                  className="px-3 py-2 rounded-lg bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-xs font-semibold cursor-pointer"
                >
                  Load FEN
                </button>
              </div>
              {fenStatus && <p className="text-xs text-neutral-500">{fenStatus}</p>}
            </div>

            <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  const target = fenInput.trim() || editorFen;
                  const v = validateFenString(target);
                  if (!v.valid) {
                    setFenStatus(`Cannot launch: ${v.error}`);
                    return;
                  }
                  onSendFenToAnalysis(target);
                }}
                className="flex-1 py-2 px-3 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold cursor-pointer"
              >
                Analyze Position
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = fenInput.trim() || editorFen;
                  const v = validateFenString(target);
                  if (!v.valid) {
                    setFenStatus(`Cannot launch: ${v.error}`);
                    return;
                  }
                  onSendFenToPlay(target);
                }}
                className="flex-1 py-2 px-3 rounded-lg bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-xs font-semibold cursor-pointer"
              >
                Play vs Stockfish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BLINDFOLD CHESS */}
      {tool === 'blindfold' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          <div className="xl:col-span-6 flex flex-col items-center gap-3">
            <Chessboard
              fen={bfFen}
              preferences={preferences}
              sizeOverridePx={Math.min(460, preferences.boardSizePx)}
              blindfold={!bfPeek}
              interactive={!bfChess.isGameOver()}
              allowedColor="w"
              onMove={(from, to, promo) => {
                if (bfChess.isGameOver()) return false;
                const c = new Chess(bfFen);
                const m = c.move({ from, to, promotion: promo });
                if (m) {
                  playBlindfoldMove(m.san);
                  return true;
                }
                return false;
              }}
            />
            <button
              type="button"
              onClick={() => setBfPeek((p) => !p)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 text-xs font-semibold cursor-pointer"
            >
              {bfPeek ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {bfPeek ? 'Hide Pieces (Blindfold)' : 'Peek at Board'}
            </button>
          </div>

          <div className="xl:col-span-6 bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 space-y-4">
            <h2 className="text-base font-semibold">Blindfold Visualization Trainer</h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Enter moves in Standard Algebraic Notation (e.g., e4, Nf3, Bb5) or tap squares blindfolded to play Stockfish.
            </p>
            {bfChess.isGameOver() && (
              <div className="p-3 rounded-xl bg-emerald-700 text-white text-xs font-semibold">
                {bfChess.isCheckmate()
                  ? `Checkmate — ${bfChess.turn() === 'w' ? 'Black' : 'White'} wins!`
                  : 'Game drawn.'}
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!bfChess.isGameOver()) playBlindfoldMove(bfSanInput);
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={bfSanInput}
                disabled={bfChess.isGameOver()}
                onChange={(e) => setBfSanInput(e.target.value)}
                placeholder="Type move (e.g. e4, Nf3, O-O)…"
                className="flex-1 px-3 py-2 rounded-lg text-sm font-mono bg-neutral-50 dark:bg-[#11151C] border border-neutral-200 dark:border-neutral-800 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={bfChess.isGameOver()}
                className="px-4 py-2 rounded-lg bg-emerald-700 text-white text-xs font-semibold disabled:opacity-40 cursor-pointer"
              >
                Play Move
              </button>
            </form>
            {bfMsg && <p className="text-xs text-red-500">{bfMsg}</p>}
            <div className="p-3 rounded-xl bg-neutral-50 dark:bg-[#11151C] border border-neutral-200 dark:border-neutral-800 font-mono text-xs min-h-[120px]">
              {bfMoves.length === 0 ? 'No moves played yet.' : bfMoves.join(' ')}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={bfMoves.length === 0}
                onClick={() => {
                  const plies = bfMoves.length >= 2 && bfChess.turn() === 'w' ? 2 : 1;
                  for (let i = 0; i < plies; i++) bfChess.undo();
                  setBfFen(bfChess.fen());
                  setBfMoves((prev) => prev.slice(0, Math.max(0, prev.length - plies)));
                  setBfMsg(null);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 text-xs font-medium disabled:opacity-40 cursor-pointer"
              >
                Undo Move
              </button>
              <button
                type="button"
                onClick={() => {
                  bfChess.reset();
                  setBfFen(bfChess.fen());
                  setBfMoves([]);
                  setBfMsg(null);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-xs font-medium cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                New Blindfold Game
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GUESS THE MOVE */}
      {tool === 'guess' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          <div className="xl:col-span-6 flex justify-center">
            <Chessboard
              fen={guessFen}
              orientation={guessPly % 2 === 0 ? 'w' : 'b'}
              preferences={preferences}
              sizeOverridePx={Math.min(460, preferences.boardSizePx)}
              interactive={guessPly < masterVerbose.length}
              allowedColor={guessPly % 2 === 0 ? 'w' : 'b'}
              onMove={handleGuessMove}
            />
          </div>

          <div className="xl:col-span-6 bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap gap-1.5">
              {MASTER_GAMES.map((g, i) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => {
                    setGuessGameIdx(i);
                    setGuessPly(6);
                    setGuessScore(0);
                    setGuessAttempts(0);
                    setGuessFeedback(null);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
                    guessGameIdx === i
                      ? 'bg-emerald-700 text-white'
                      : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300'
                  }`}
                >
                  {g.title}
                </button>
              ))}
            </div>

            <div>
              <h2 className="text-lg font-semibold">
                {masterGame.white} vs {masterGame.black} ({masterGame.year})
              </h2>
              <p className="text-xs text-neutral-500 mt-0.5">
                {masterGame.event} · {masterGame.opening} · Find {guessPly % 2 === 0 ? 'White’s' : 'Black’s'} next move!
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-center bg-neutral-50 dark:bg-[#11151C] p-3 rounded-xl border border-neutral-200 dark:border-neutral-800">
              <div>
                <div className="text-[11px] text-neutral-500">Master Matches</div>
                <div className="text-lg font-mono font-bold tabular-nums">
                  {guessScore} / {guessAttempts}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-neutral-500">Move Progress</div>
                <div className="text-lg font-mono font-bold tabular-nums">
                  {Math.min(guessPly, masterVerbose.length)} / {masterVerbose.length}
                </div>
              </div>
            </div>

            {guessFeedback && (
              <div className="p-3 rounded-xl bg-neutral-50 dark:bg-[#11151C] border border-neutral-200 dark:border-neutral-800 text-xs">
                {guessFeedback}
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                if (guessPly < masterVerbose.length) {
                  setGuessFeedback(`Master played: ${masterVerbose[guessPly].san}`);
                  setGuessPly((p) => Math.min(masterVerbose.length, p + 2));
                }
              }}
              className="px-4 py-2 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-xs font-semibold cursor-pointer"
            >
              Reveal Master Move &amp; Advance
            </button>
          </div>
        </div>
      )}

      {/* OTB CHESS CLOCK */}
      {tool === 'clock' && (
        <div className="bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {[
                { label: '3+2 Blitz', init: 180000, inc: 2000 },
                { label: '5+0 Blitz', init: 300000, inc: 0 },
                { label: '10+5 Rapid', init: 600000, inc: 5000 },
                { label: '30+0 Classical', init: 1800000, inc: 0 },
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setClockInitMs(preset.init);
                    setClockIncMs(preset.inc);
                    setOtbWhiteMs(preset.init);
                    setOtbBlackMs(preset.init);
                    setOtbTurn(null);
                    setOtbPaused(false);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-xs font-semibold cursor-pointer"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setOtbPaused((p) => !p)}
                disabled={!otbTurn}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-xs font-semibold disabled:opacity-40 cursor-pointer"
              >
                {otbPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                {otbPaused ? 'Resume' : 'Pause'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setOtbWhiteMs(clockInitMs);
                  setOtbBlackMs(clockInitMs);
                  setOtbTurn(null);
                  setOtbPaused(false);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 text-xs font-medium cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => tapOtbClock('w')}
              className={`h-52 rounded-2xl border-2 flex flex-col items-center justify-center gap-2 transition-colors cursor-pointer ${
                otbTurn === 'w'
                  ? 'bg-emerald-700 text-white border-emerald-500'
                  : 'bg-neutral-50 dark:bg-[#11151C] text-neutral-900 dark:text-white border-neutral-200 dark:border-neutral-800'
              }`}
            >
              <span className="text-xs uppercase tracking-wider opacity-75">White Clock</span>
              <span className="text-5xl font-mono tabular-nums font-bold">
                {formatClockMs(otbWhiteMs)}
              </span>
              <span className="text-xs opacity-80">Tap after moving</span>
            </button>

            <button
              type="button"
              onClick={() => tapOtbClock('b')}
              className={`h-52 rounded-2xl border-2 flex flex-col items-center justify-center gap-2 transition-colors cursor-pointer ${
                otbTurn === 'b'
                  ? 'bg-emerald-700 text-white border-emerald-500'
                  : 'bg-neutral-50 dark:bg-[#11151C] text-neutral-900 dark:text-white border-neutral-200 dark:border-neutral-800'
              }`}
            >
              <span className="text-xs uppercase tracking-wider opacity-75">Black Clock</span>
              <span className="text-5xl font-mono tabular-nums font-bold">
                {formatClockMs(otbBlackMs)}
              </span>
              <span className="text-xs opacity-80">Tap after moving</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
