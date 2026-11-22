import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { ArrowRight, Flame, HelpCircle, RotateCcw, Timer, Trophy } from 'lucide-react';
import { BoardArrow, Chessboard } from '../components/Chessboard';
import { PUZZLES_DATABASE } from '../data/puzzles';
import { PlayerProfileState } from '../store/useAcademyStore';
import { BoardPreferences, PieceType, PuzzleItem } from '../types/chess';
import { soundEngine } from '../utils/soundEngine';

interface PuzzlesViewProps {
  preferences: BoardPreferences;
  puzzleStats: PlayerProfileState['puzzleStats'];
  onRecordPuzzle: (solved: boolean, rating: number, themes: string[]) => void;
}

const CATEGORIES = [
  'All',
  'Daily',
  'Mate in 1',
  'Mate in 2',
  'Mate in 3',
  'Tactics',
  'Defensive',
  'Endgame',
  'Opening Trap',
] as const;

export const PuzzlesView: React.FC<PuzzlesViewProps> = ({
  preferences,
  puzzleStats,
  onRecordPuzzle,
}) => {
  const [category, setCategory] = useState<string>('All');
  const [mode, setMode] = useState<'standard' | 'timed'>('standard');
  const [timedSecondsLeft, setTimedSecondsLeft] = useState(180);
  const [timedRunning, setTimedRunning] = useState(false);
  const [timedScore, setTimedScore] = useState(0);

  const filtered = useMemo(
    () =>
      category === 'All'
        ? PUZZLES_DATABASE
        : PUZZLES_DATABASE.filter((p) => p.category === category),
    [category]
  );

  const [puzzleIdx, setPuzzleIdx] = useState(0);
  const activePuzzle: PuzzleItem = filtered[puzzleIdx % Math.max(1, filtered.length)] || PUZZLES_DATABASE[0];

  const replyTimerRef = useRef<number | null>(null);
  const [isReplying, setIsReplying] = useState(false);

  const [fen, setFen] = useState(activePuzzle.fen);
  const [solutionStep, setSolutionStep] = useState(0);
  const [status, setStatus] = useState<'solving' | 'solved' | 'failed'>('solving');
  const [hintArrow, setHintArrow] = useState<BoardArrow[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const clearTimers = () => {
    if (replyTimerRef.current !== null) {
      window.clearTimeout(replyTimerRef.current);
      replyTimerRef.current = null;
    }
    setIsReplying(false);
  };

  const loadPuzzle = (p: PuzzleItem) => {
    clearTimers();
    setFen(p.fen);
    setSolutionStep(0);
    setStatus('solving');
    setHintArrow([]);
    setMessage(null);
  };

  useEffect(() => {
    loadPuzzle(activePuzzle);
    return () => clearTimers();
  }, [activePuzzle.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Timed Rush countdown
  useEffect(() => {
    if (mode !== 'timed' || !timedRunning) return;
    const id = window.setInterval(() => {
      setTimedSecondsLeft((s) => {
        if (s <= 1) {
          setTimedRunning(false);
          soundEngine.play('victory');
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [mode, timedRunning]);

  const sideToPlay = fen.split(' ')[1] === 'b' ? 'b' : 'w';

  const handleMove = (from: string, to: string, promotion?: PieceType) => {
    if (status !== 'solving' || isReplying) return false;
    if (mode === 'timed' && !timedRunning) return false;

    const c = new Chess();
    try {
      c.load(fen);
      const m = c.move({ from, to, promotion });
      if (!m) return false;

      const uci = `${m.from}${m.to}${m.promotion || ''}`;
      const expected = activePuzzle.solutionUci[solutionStep];

      if (uci === expected) {
        soundEngine.play(m.captured ? 'capture' : 'move');
        const nextIdx = solutionStep + 1;
        setHintArrow([]);

        if (nextIdx >= activePuzzle.solutionUci.length) {
          setFen(c.fen());
          setStatus('solved');
          setMessage(activePuzzle.explanation);
          soundEngine.play('puzzle-success');
          onRecordPuzzle(true, activePuzzle.rating, activePuzzle.themes);
          if (mode === 'timed') {
            setTimedScore((sc) => sc + 1);
            replyTimerRef.current = window.setTimeout(() => setPuzzleIdx((idx) => idx + 1), 650);
          }
          return true;
        }

        // Play opponent reply automatically with lock
        setFen(c.fen());
        setIsReplying(true);
        const oppUci = activePuzzle.solutionUci[nextIdx];
        replyTimerRef.current = window.setTimeout(() => {
          const replyChess = new Chess();
          replyChess.load(c.fen());
          const reply = replyChess.move({
            from: oppUci.slice(0, 2),
            to: oppUci.slice(2, 4),
            promotion: oppUci.length > 4 ? (oppUci[4] as PieceType) : undefined,
          });
          if (reply) {
            setFen(replyChess.fen());
            setSolutionStep(nextIdx + 1);
            soundEngine.play(reply.captured ? 'capture' : 'move');
          }
          setIsReplying(false);
        }, 340);

        return true;
      } else {
        soundEngine.play('puzzle-error');
        setStatus('failed');
        setMessage(`Incorrect move (${m.san}). Retry or inspect the hint.`);
        onRecordPuzzle(false, activePuzzle.rating, activePuzzle.themes);
        return false;
      }
    } catch {
      return false;
    }
  };

  const showHint = () => {
    const expected = activePuzzle.solutionUci[solutionStep];
    if (!expected || expected.length < 4) return;
    setHintArrow([
      {
        from: expected.slice(0, 2),
        to: expected.slice(2, 4),
        color: 'rgba(245, 158, 11, 0.85)',
      },
    ]);
  };

  const accuracy =
    puzzleStats.attempted > 0
      ? Math.round((puzzleStats.solved / puzzleStats.attempted) * 100)
      : 100;

  const weakList = Object.entries(puzzleStats.weakThemes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      {/* Left: Tactical Board */}
      <div className="xl:col-span-7 flex flex-col items-center gap-3">
        <div
          className="w-full flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 rounded-xl"
          style={{ maxWidth: preferences.boardSizePx }}
        >
          <div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400">
              {activePuzzle.category} · {activePuzzle.difficulty} · Rating {activePuzzle.rating}
            </div>
            <h2 className="text-base font-semibold text-neutral-900 dark:text-white">
              {activePuzzle.title} — {sideToPlay === 'w' ? 'White to move' : 'Black to move'}
            </h2>
          </div>

          {mode === 'timed' && (
            <div className="flex items-center gap-2 font-mono tabular-nums text-sm font-bold text-amber-600 dark:text-amber-400">
              <Timer className="w-4 h-4" />
              <span>
                {Math.floor(timedSecondsLeft / 60)}:{String(timedSecondsLeft % 60).padStart(2, '0')}
              </span>
              <span className="text-xs text-neutral-500">({timedScore} solved)</span>
            </div>
          )}
        </div>

        <Chessboard
          fen={fen}
          orientation={sideToPlay}
          preferences={preferences}
          interactive={status === 'solving' && !isReplying && (mode === 'standard' || timedRunning)}
          allowedColor={sideToPlay}
          onMove={handleMove}
          arrows={hintArrow}
        />

        {message && (
          <div
            className={`w-full p-3.5 rounded-xl text-xs border ${
              status === 'solved'
                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
                : 'bg-red-500/10 border-red-500/40 text-red-700 dark:text-red-300'
            }`}
            style={{ maxWidth: preferences.boardSizePx }}
          >
            {message}
          </div>
        )}

        <div
          className="w-full flex flex-wrap items-center justify-between gap-2"
          style={{ maxWidth: preferences.boardSizePx }}
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={showHint}
              disabled={status !== 'solving'}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 text-xs font-medium disabled:opacity-40 cursor-pointer"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              Hint
            </button>
            <button
              type="button"
              onClick={() => loadPuzzle(activePuzzle)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 text-xs font-medium cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Retry
            </button>
          </div>

          <button
            type="button"
            onClick={() => setPuzzleIdx((idx) => idx + 1)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold cursor-pointer"
          >
            Next Puzzle
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Right: Training Modes, Filters & Analytics */}
      <div className="xl:col-span-5 space-y-4">
        <div className="bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-neutral-900 dark:text-white">
              Training Center
            </h3>
            <div className="flex items-center gap-1 p-1 bg-neutral-100 dark:bg-[#11151C] rounded-lg">
              <button
                type="button"
                onClick={() => {
                  setMode('standard');
                  setTimedRunning(false);
                }}
                className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer ${
                  mode === 'standard'
                    ? 'bg-white dark:bg-[#1F2633] text-neutral-900 dark:text-white shadow-sm'
                    : 'text-neutral-500'
                }`}
              >
                Standard
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('timed');
                  setTimedSecondsLeft(180);
                  setTimedScore(0);
                  setTimedRunning(true);
                  loadPuzzle(activePuzzle);
                }}
                className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer ${
                  mode === 'timed'
                    ? 'bg-white dark:bg-[#1F2633] text-neutral-900 dark:text-white shadow-sm'
                    : 'text-neutral-500'
                }`}
              >
                3-Min Rush
              </button>
            </div>
          </div>

          {mode === 'timed' && !timedRunning && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/40 flex items-center justify-between text-xs">
              <span>Time up! Final Rush Score: {timedScore} solved.</span>
              <button
                type="button"
                onClick={() => {
                  setTimedSecondsLeft(180);
                  setTimedScore(0);
                  setTimedRunning(true);
                  setPuzzleIdx((i) => i + 1);
                }}
                className="px-3 py-1 rounded bg-amber-600 text-white font-semibold cursor-pointer"
              >
                Restart Rush
              </button>
            </div>
          )}

          <div>
            <div className="text-xs font-medium text-neutral-500 mb-2">Puzzle Category</div>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    setCategory(cat);
                    setPuzzleIdx(0);
                  }}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer ${
                    category === cat
                      ? 'bg-emerald-700 text-white'
                      : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Performance Metrics */}
        <div className="bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
            Puzzle Performance & Weakness Tracker
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="p-2.5 rounded-lg bg-neutral-50 dark:bg-[#11151C] border border-neutral-200 dark:border-neutral-800">
              <div className="text-[11px] text-neutral-500">Rating</div>
              <div className="text-base font-mono tabular-nums font-bold">
                {puzzleStats.puzzleRating}
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-neutral-50 dark:bg-[#11151C] border border-neutral-200 dark:border-neutral-800">
              <div className="text-[11px] text-neutral-500">Accuracy</div>
              <div className="text-base font-mono tabular-nums font-bold">{accuracy}%</div>
            </div>
            <div className="p-2.5 rounded-lg bg-neutral-50 dark:bg-[#11151C] border border-neutral-200 dark:border-neutral-800">
              <div className="text-[11px] text-neutral-500 flex items-center justify-center gap-1">
                <Flame className="w-3 h-3 text-amber-500" /> Streak
              </div>
              <div className="text-base font-mono tabular-nums font-bold">
                {puzzleStats.currentStreak}
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-neutral-50 dark:bg-[#11151C] border border-neutral-200 dark:border-neutral-800">
              <div className="text-[11px] text-neutral-500 flex items-center justify-center gap-1">
                <Trophy className="w-3 h-3 text-emerald-500" /> Best
              </div>
              <div className="text-base font-mono tabular-nums font-bold">
                {puzzleStats.bestStreak}
              </div>
            </div>
          </div>

          {weakList.length > 0 && (
            <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800">
              <div className="text-xs font-medium text-neutral-500 mb-2">
                Motifs to Reinforce (from missed attempts)
              </div>
              <div className="space-y-1.5">
                {weakList.map(([theme, misses]) => (
                  <div key={theme} className="flex items-center justify-between text-xs">
                    <span className="text-neutral-700 dark:text-neutral-300">{theme}</span>
                    <span className="font-mono tabular-nums text-amber-600 dark:text-amber-400">
                      {misses} {misses === 1 ? 'miss' : 'misses'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
