import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import {
  Cpu,
  Play,
  RotateCcw,
  ScanSearch,
  Sparkles,
  Upload,
} from 'lucide-react';
import { BoardArrow, Chessboard } from '../components/Chessboard';
import { MoveHistory } from '../components/MoveHistory';
import { MASTER_GAMES } from '../data/masterGames';
import { detectOpeningFromMoves, runStockfishGameReview } from '../engine/gameReview';
import { EngineLine, stockfishService } from '../engine/stockfishService';
import {
  BoardPreferences,
  GameReviewReport,
  MoveClassification,
  MoveRecord,
  PieceType,
} from '../types/chess';
import { evalToWhiteBarPct, formatEvalScore } from '../utils/chessHelpers';
import { soundEngine } from '../utils/soundEngine';

interface AnalyzeReviewViewProps {
  preferences: BoardPreferences;
  initialPgn?: string | null;
  initialFen?: string | null;
  onAskCoach: (fen: string, pgn: string, evalSummary?: string) => void;
}

const CLASS_ORDER: { key: MoveClassification; label: string; color: string }[] = [
  { key: 'brilliant', label: 'Brilliant', color: 'text-cyan-500' },
  { key: 'great', label: 'Great', color: 'text-sky-500' },
  { key: 'best', label: 'Best', color: 'text-emerald-500' },
  { key: 'excellent', label: 'Excellent', color: 'text-emerald-400' },
  { key: 'good', label: 'Good', color: 'text-neutral-400' },
  { key: 'book', label: 'Book', color: 'text-amber-500' },
  { key: 'inaccuracy', label: 'Inaccuracy', color: 'text-amber-400' },
  { key: 'mistake', label: 'Mistake', color: 'text-orange-500' },
  { key: 'blunder', label: 'Blunder', color: 'text-red-500' },
];

export const AnalyzeReviewView: React.FC<AnalyzeReviewViewProps> = ({
  preferences,
  initialPgn,
  initialFen,
  onAskCoach,
}) => {
  const chessRef = useRef(new Chess());
  const [moves, setMoves] = useState<MoveRecord[]>([]);
  const [currentPly, setCurrentPly] = useState(0);
  const [baseFen, setBaseFen] = useState<string>('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  const [orientation, setOrientation] = useState<'w' | 'b'>('w');
  const [pgnInput, setPgnInput] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);

  // Live Stockfish MultiPV Analysis
  const [liveEvalEnabled, setLiveEvalEnabled] = useState(true);
  const [engineLines, setEngineLines] = useState<EngineLine[]>([]);
  const [evaluating, setEvaluating] = useState(false);

  // Full Game Review State
  const [reviewReport, setReviewReport] = useState<GameReviewReport | null>(null);
  const [reviewProgress, setReviewProgress] = useState<{ done: number; total: number } | null>(null);

  const loadFromPgn = useCallback((pgnText: string) => {
    setLoadError(null);
    const c = new Chess();
    try {
      c.loadPgn(pgnText.trim());
    } catch {
      setLoadError('Could not parse PGN. Please verify standard algebraic notation.');
      return;
    }
    const verbose = c.history({ verbose: true });
    const built: MoveRecord[] = verbose.map((m, idx) => ({
      ply: idx + 1,
      moveNumber: Math.floor(idx / 2) + 1,
      color: m.color,
      san: m.san,
      uci: `${m.from}${m.to}${m.promotion || ''}`,
      from: m.from,
      to: m.to,
      fenBefore: m.before,
      fenAfter: m.after,
      captured: m.captured as PieceType | undefined,
      promotion: m.promotion as PieceType | undefined,
      isCheck: m.san.includes('+') || m.san.includes('#'),
      isCheckmate: m.san.includes('#'),
      isCastling: m.san === 'O-O' || m.san === 'O-O-O',
      isEnPassant: m.flags.includes('e'),
    }));

    chessRef.current = c;
    setBaseFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    setMoves(built);
    setCurrentPly(built.length);
    setReviewReport(null);
  }, []);

  const loadFromFen = useCallback((fenText: string) => {
    setLoadError(null);
    const c = new Chess();
    try {
      c.load(fenText.trim());
    } catch {
      setLoadError('Could not parse FEN position.');
      return;
    }
    chessRef.current = c;
    setBaseFen(c.fen());
    setMoves([]);
    setCurrentPly(0);
    setReviewReport(null);
  }, []);

  useEffect(() => {
    if (initialFen) {
      loadFromFen(initialFen);
    } else if (initialPgn) {
      loadFromPgn(initialPgn);
    } else if (moves.length === 0) {
      loadFromPgn(MASTER_GAMES[0].pgn);
    }
  }, [initialPgn, initialFen]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentFen = useMemo(() => {
    if (currentPly === 0) return baseFen;
    return moves[currentPly - 1]?.fenAfter || baseFen;
  }, [moves, currentPly, baseFen]);

  const lastMove = useMemo(() => {
    if (currentPly === 0 || !moves[currentPly - 1]) return null;
    return { from: moves[currentPly - 1].from, to: moves[currentPly - 1].to };
  }, [moves, currentPly]);

  // Run live Stockfish 19 MultiPV evaluation whenever position changes
  useEffect(() => {
    if (!liveEvalEnabled) {
      setEngineLines([]);
      return;
    }
    let cancelled = false;
    setEvaluating(true);

    const timer = window.setTimeout(async () => {
      try {
        const res = await stockfishService.evaluatePosition(currentFen, {
          depth: 13,
          movetimeMs: 900,
          multiPv: 3,
          skillLevel: 20,
          isCancelled: () => cancelled,
        });
        if (!cancelled) {
          setEngineLines(res.lines);
        }
      } catch {
        // ignore transient worker cancel
      } finally {
        if (!cancelled) setEvaluating(false);
      }
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [currentFen, liveEvalEnabled]);

  // Keyboard arrow navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (e.key === 'ArrowLeft') setCurrentPly((p) => Math.max(0, p - 1));
      else if (e.key === 'ArrowRight') setCurrentPly((p) => Math.min(moves.length, p + 1));
      else if (e.key === 'Home') setCurrentPly(0);
      else if (e.key === 'End') setCurrentPly(moves.length);
      else if (e.key.toLowerCase() === 'f') setOrientation((o) => (o === 'w' ? 'b' : 'w'));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [moves.length]);

  // Allow free exploration from any ply (replaces future branch like Lichess/Chess.com analysis)
  const handleBoardMove = (from: string, to: string, promotion?: PieceType) => {
    const branchChess = new Chess();
    try {
      branchChess.load(currentFen);
      const fenBefore = branchChess.fen();
      const movingColor = branchChess.turn();
      const m = branchChess.move({ from, to, promotion });
      if (!m) return false;

      if (m.captured) soundEngine.play('capture');
      else soundEngine.play('move');

      const truncated = moves.slice(0, currentPly);
      const nextMove: MoveRecord = {
        ply: truncated.length + 1,
        moveNumber: Math.floor(truncated.length / 2) + 1,
        color: movingColor,
        san: m.san,
        uci: `${m.from}${m.to}${m.promotion || ''}`,
        from: m.from,
        to: m.to,
        fenBefore,
        fenAfter: branchChess.fen(),
        captured: m.captured as PieceType | undefined,
        promotion: m.promotion as PieceType | undefined,
        isCheck: branchChess.inCheck(),
        isCheckmate: branchChess.isCheckmate(),
        isCastling: m.san === 'O-O' || m.san === 'O-O-O',
        isEnPassant: m.flags.includes('e'),
      };

      const nextList = [...truncated, nextMove];
      setMoves(nextList);
      setCurrentPly(nextList.length);
      setReviewReport(null);
      return true;
    } catch {
      return false;
    }
  };

  const startFullReview = async () => {
    if (moves.length === 0 || reviewProgress) return;
    setReviewProgress({ done: 0, total: moves.length });
    try {
      const report = await runStockfishGameReview(
        moves,
        (done, total) => setReviewProgress({ done, total }),
        10
      );
      setReviewReport(report);
    } finally {
      setReviewProgress(null);
    }
  };

  const topLine = engineLines[0];
  const whitePct = topLine ? evalToWhiteBarPct(topLine.cp, topLine.mate) : 50;

  const boardArrows: BoardArrow[] = useMemo(() => {
    const out: BoardArrow[] = [];
    if (topLine?.bestMoveUci && topLine.bestMoveUci.length >= 4) {
      out.push({
        from: topLine.bestMoveUci.slice(0, 2),
        to: topLine.bestMoveUci.slice(2, 4),
        color: 'rgba(16, 185, 129, 0.8)',
      });
    }
    return out;
  }, [topLine]);

  const currentAnalyzed = reviewReport?.moves.find((m) => m.ply === currentPly);
  const openingInfo = useMemo(() => detectOpeningFromMoves(moves), [moves]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left: Eval Bar + Chessboard */}
        <div className="xl:col-span-7 flex flex-col items-center gap-3">
          <div className="flex items-stretch justify-center gap-2.5 w-full">
            {/* Vertical Stockfish Evaluation Bar */}
            <div
              className="w-6 rounded-lg overflow-hidden border border-neutral-300 dark:border-neutral-700 bg-neutral-900 flex flex-col justify-end relative shrink-0"
              title="White-relative Stockfish 19 evaluation"
            >
              <div
                className="w-full bg-neutral-100 transition-all duration-300"
                style={{
                  height: `${orientation === 'w' ? whitePct : 100 - whitePct}%`,
                }}
              />
              <span className="absolute inset-x-0 top-1.5 text-center text-[9px] font-mono font-bold text-neutral-300 mix-blend-difference">
                {topLine ? formatEvalScore(topLine.cp, topLine.mate) : '0.0'}
              </span>
            </div>

            <Chessboard
              fen={currentFen}
              orientation={orientation}
              preferences={preferences}
              interactive={true}
              lastMove={lastMove}
              onMove={handleBoardMove}
              arrows={boardArrows}
            />
          </div>

          {/* Quick Controls */}
          <div className="w-full max-w-[580px] flex flex-wrap items-center justify-between gap-2 bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 rounded-xl px-4 py-2.5">
            <div className="text-xs text-neutral-600 dark:text-neutral-300 truncate">
              <span className="font-mono font-semibold mr-1.5">{openingInfo.eco}</span>
              <span>{openingInfo.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setOrientation((o) => (o === 'w' ? 'b' : 'w'))}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-xs font-medium cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Flip
              </button>
              <button
                type="button"
                onClick={() => setLiveEvalEnabled((v) => !v)}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
                  liveEvalEnabled
                    ? 'bg-emerald-700 text-white'
                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300'
                }`}
              >
                <Cpu className="w-3.5 h-3.5" />
                Engine {liveEvalEnabled ? 'On' : 'Off'}
              </button>
              <button
                type="button"
                onClick={() =>
                  onAskCoach(
                    currentFen,
                    moves.map((m) => m.san).join(' '),
                    topLine
                      ? `Eval: ${formatEvalScore(topLine.cp, topLine.mate)}, Best: ${topLine.pvSan.slice(0, 5).join(' ')}`
                      : undefined
                  )
                }
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-xs font-semibold cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Explain Position
              </button>
            </div>
          </div>
        </div>

        {/* Right: Engine Lines, Move List, Game Review Trigger & PGN Loader */}
        <div className="xl:col-span-5 space-y-4">
          {/* Stockfish MultiPV Panel */}
          <div className="bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 rounded-xl p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 flex items-center gap-2">
                <Cpu className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                Stockfish 19 Multi-PV
              </div>
              <span className="text-[11px] font-mono tabular-nums text-neutral-500">
                {evaluating ? 'Calculating…' : topLine ? `Depth ${topLine.depth}` : 'Idle'}
              </span>
            </div>

            {engineLines.length === 0 ? (
              <div className="text-xs text-neutral-500 py-2">
                {liveEvalEnabled ? 'Analyzing position…' : 'Engine paused.'}
              </div>
            ) : (
              <div className="space-y-1.5">
                {engineLines.map((line) => (
                  <div
                    key={line.multipv}
                    className="flex items-start gap-2.5 text-xs py-1 px-2 rounded-lg bg-neutral-50 dark:bg-[#11151C]"
                  >
                    <span className="font-mono tabular-nums font-semibold text-emerald-700 dark:text-emerald-400 w-12 shrink-0">
                      {formatEvalScore(line.cp, line.mate)}
                    </span>
                    <span className="font-mono text-neutral-700 dark:text-neutral-300 truncate">
                      {line.pvSan.join(' ')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Current Move Explanation */}
          {currentAnalyzed && (
            <div className="bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 rounded-xl p-4 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold capitalize text-neutral-900 dark:text-white">
                  {currentAnalyzed.moveNumber}. {currentAnalyzed.san} — {currentAnalyzed.classification}
                </span>
                <span className="font-mono tabular-nums text-neutral-500">
                  Best: {currentAnalyzed.bestMoveSan}
                </span>
              </div>
              <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
                {currentAnalyzed.explanation}
              </p>
            </div>
          )}

          {/* Full Game Review Action */}
          <div className="bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
                  Full Stockfish Game Review
                </h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Move-by-move accuracy, win-probability graph, and critical moments.
                </p>
              </div>
              <button
                type="button"
                onClick={startFullReview}
                disabled={moves.length === 0 || Boolean(reviewProgress)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer whitespace-nowrap"
              >
                <ScanSearch className="w-3.5 h-3.5" />
                {reviewProgress
                  ? `${reviewProgress.done}/${reviewProgress.total}`
                  : 'Run Review'}
              </button>
            </div>

            {reviewProgress && (
              <div className="w-full h-2 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden">
                <div
                  className="h-full bg-emerald-600 transition-all duration-200"
                  style={{
                    width: `${Math.round((reviewProgress.done / Math.max(1, reviewProgress.total)) * 100)}%`,
                  }}
                />
              </div>
            )}
          </div>

          <MoveHistory
            moves={moves}
            currentPly={currentPly}
            onSelectPly={setCurrentPly}
            analyzedMoves={reviewReport?.moves}
          />

          {/* Load Sample or PGN */}
          <div className="bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 rounded-xl p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                Load PGN or Master Game
              </span>
              <div className="flex items-center gap-1.5">
                {MASTER_GAMES.map((mg) => (
                  <button
                    key={mg.id}
                    type="button"
                    onClick={() => loadFromPgn(mg.pgn)}
                    className="px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-[11px] font-medium cursor-pointer"
                  >
                    {mg.title.split(' ')[1] || mg.title}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              value={pgnInput}
              onChange={(e) => setPgnInput(e.target.value)}
              rows={2}
              placeholder="Paste PGN moves here (e.g. 1. e4 e5 2. Nf3 Nc6 3. Bb5)…"
              className="w-full px-3 py-2 rounded-lg text-xs font-mono bg-neutral-50 dark:bg-[#11151C] border border-neutral-200 dark:border-neutral-800 resize-none"
            />
            {loadError && <p className="text-xs text-red-500">{loadError}</p>}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => loadFromPgn(pgnInput)}
                disabled={!pgnInput.trim()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-xs font-semibold disabled:opacity-40 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                Load PGN
              </button>
              <button
                type="button"
                onClick={() => {
                  chessRef.current = new Chess();
                  setBaseFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
                  setMoves([]);
                  setCurrentPly(0);
                  setReviewReport(null);
                  setLoadError(null);
                  setPgnInput('');
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 text-xs font-medium cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                Clear Board
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Full Game Review Report Section */}
      {reviewReport && (
        <section className="bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">
                Game Review Summary
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                {reviewReport.summary}
              </p>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-center">
                <div className="text-xs text-neutral-500">White Accuracy</div>
                <div className="text-2xl font-mono tabular-nums font-bold text-neutral-900 dark:text-white">
                  {reviewReport.whiteAccuracy}%
                </div>
              </div>
              <div className="text-center">
                <div className="text-xs text-neutral-500">Black Accuracy</div>
                <div className="text-2xl font-mono tabular-nums font-bold text-neutral-900 dark:text-white">
                  {reviewReport.blackAccuracy}%
                </div>
              </div>
            </div>
          </div>

          {/* Interactive SVG Evaluation Graph */}
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-neutral-500">
              Evaluation Graph (Click any point to inspect that ply)
            </div>
            <div className="h-32 w-full bg-neutral-950 rounded-xl border border-neutral-800 p-2 relative overflow-hidden">
              <svg viewBox={`0 0 ${Math.max(100, reviewReport.moves.length * 10)} 100`} className="w-full h-full" preserveAspectRatio="none">
                <line x1="0" y1="50" x2={Math.max(100, reviewReport.moves.length * 10)} y2="50" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
                {reviewReport.moves.length > 0 && (
                  <polygon
                    fill="rgba(255,255,255,0.82)"
                    points={`0,100 ${reviewReport.moves
                      .map((m, idx) => {
                        const x = ((idx + 0.5) / reviewReport.moves.length) * Math.max(100, reviewReport.moves.length * 10);
                        const y = 100 - evalToWhiteBarPct(m.evalAfterCp, m.mateAfter);
                        return `${x.toFixed(1)},${y.toFixed(1)}`;
                      })
                      .join(' ')} ${Math.max(100, reviewReport.moves.length * 10)},100`}
                  />
                )}
              </svg>
              {/* Clickable column overlay */}
              <div className="absolute inset-0 flex">
                {reviewReport.moves.map((m) => (
                  <button
                    key={m.ply}
                    type="button"
                    onClick={() => setCurrentPly(m.ply)}
                    className={`flex-1 h-full hover:bg-emerald-500/20 cursor-pointer ${
                      currentPly === m.ply ? 'bg-emerald-500/35 border-x border-emerald-400' : ''
                    }`}
                    title={`${m.moveNumber}. ${m.san} (${m.classification})`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Classification Table & Critical Moments */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-semibold mb-3">Move Quality Breakdown</h3>
              <div className="divide-y divide-neutral-200 dark:divide-neutral-800 text-xs">
                {CLASS_ORDER.map((c) => (
                  <div key={c.key} className="py-2 grid grid-cols-[1fr_64px_64px] items-center">
                    <span className={`font-semibold ${c.color}`}>{c.label}</span>
                    <span className="font-mono tabular-nums text-right">
                      {reviewReport.counts.w[c.key]}
                    </span>
                    <span className="font-mono tabular-nums text-right">
                      {reviewReport.counts.b[c.key]}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-3">Critical Moments</h3>
              {reviewReport.criticalMoments.length === 0 ? (
                <p className="text-xs text-neutral-500">Clean game — no major tactical swings detected.</p>
              ) : (
                <div className="space-y-2">
                  {reviewReport.criticalMoments.map((cm) => (
                    <button
                      key={cm.ply}
                      type="button"
                      onClick={() => setCurrentPly(cm.ply)}
                      className="w-full text-left p-3 rounded-xl bg-neutral-50 dark:bg-[#11151C] hover:border-emerald-500 border border-neutral-200 dark:border-neutral-800 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span>
                          {cm.moveNumber}.{cm.color === 'b' ? '..' : ''} {cm.san} ({cm.classification})
                        </span>
                        <span className="font-mono text-emerald-600 dark:text-emerald-400">
                          Best: {cm.bestMoveSan}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                        {cm.explanation}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
};
