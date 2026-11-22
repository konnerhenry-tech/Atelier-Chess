import React, { useEffect, useRef } from 'react';
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from 'lucide-react';
import { AnalyzedMove, MoveClassification, MoveRecord } from '../types/chess';

interface MoveHistoryProps {
  moves: MoveRecord[];
  currentPly: number;
  onSelectPly: (ply: number) => void;
  analyzedMoves?: AnalyzedMove[];
}

const CLASSIFICATION_STYLES: Record<MoveClassification, { symbol: string; colorClass: string; label: string }> = {
  brilliant: { symbol: '!!', colorClass: 'text-cyan-500 dark:text-cyan-400', label: 'Brilliant' },
  great: { symbol: '!', colorClass: 'text-sky-500 dark:text-sky-400', label: 'Great' },
  best: { symbol: '★', colorClass: 'text-emerald-600 dark:text-emerald-400', label: 'Best' },
  excellent: { symbol: '', colorClass: 'text-emerald-600 dark:text-emerald-400', label: 'Excellent' },
  good: { symbol: '', colorClass: 'text-neutral-500 dark:text-neutral-400', label: 'Good' },
  book: { symbol: 'B', colorClass: 'text-amber-600 dark:text-amber-400', label: 'Book' },
  inaccuracy: { symbol: '?!', colorClass: 'text-amber-500 dark:text-amber-400', label: 'Inaccuracy' },
  mistake: { symbol: '?', colorClass: 'text-orange-500 dark:text-orange-400', label: 'Mistake' },
  blunder: { symbol: '??', colorClass: 'text-red-600 dark:text-red-400', label: 'Blunder' },
};

export const MoveHistory: React.FC<MoveHistoryProps> = ({
  moves,
  currentPly,
  onSelectPly,
  analyzedMoves,
}) => {
  const activeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentPly]);

  // Group moves into pairs (1. e4 e5)
  const rows: { moveNumber: number; white?: MoveRecord; black?: MoveRecord }[] = [];
  for (let i = 0; i < moves.length; i += 2) {
    rows.push({
      moveNumber: Math.floor(i / 2) + 1,
      white: moves[i],
      black: moves[i + 1],
    });
  }

  const getAnalysis = (ply: number) => analyzedMoves?.find((a) => a.ply === ply);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-neutral-200 dark:border-neutral-800">
        <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">Move List</span>
        <span className="text-xs font-mono tabular-nums text-neutral-500 dark:text-neutral-400">
          {moves.length} {moves.length === 1 ? 'ply' : 'plies'}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-1.5 min-h-[160px] max-h-[320px]">
        {rows.length === 0 ? (
          <div className="h-full flex items-center justify-center py-8 text-xs text-neutral-400 dark:text-neutral-500">
            No moves played yet. White to move.
          </div>
        ) : (
          <div className="space-y-0.5">
            {rows.map((row) => {
              const whiteAnalysis = row.white ? getAnalysis(row.white.ply) : undefined;
              const blackAnalysis = row.black ? getAnalysis(row.black.ply) : undefined;

              return (
                <div
                  key={row.moveNumber}
                  className="grid grid-cols-[36px_1fr_1fr] items-center gap-1 text-sm"
                >
                  <span className="text-xs font-mono tabular-nums text-neutral-400 dark:text-neutral-500 text-right pr-2">
                    {row.moveNumber}.
                  </span>

                  {row.white ? (
                    <button
                      ref={currentPly === row.white.ply ? activeRef : null}
                      type="button"
                      onClick={() => onSelectPly(row.white!.ply)}
                      className={`flex items-center justify-between px-2 py-1 rounded text-left font-mono text-xs transition-colors cursor-pointer ${
                        currentPly === row.white.ply
                          ? 'bg-emerald-600 text-white font-semibold'
                          : 'text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                      }`}
                    >
                      <span>{row.white.san}</span>
                      {whiteAnalysis && CLASSIFICATION_STYLES[whiteAnalysis.classification].symbol && (
                        <span
                          className={`font-bold text-[11px] ${
                            currentPly === row.white.ply
                              ? 'text-white'
                              : CLASSIFICATION_STYLES[whiteAnalysis.classification].colorClass
                          }`}
                          title={CLASSIFICATION_STYLES[whiteAnalysis.classification].label}
                        >
                          {CLASSIFICATION_STYLES[whiteAnalysis.classification].symbol}
                        </span>
                      )}
                    </button>
                  ) : (
                    <div />
                  )}

                  {row.black ? (
                    <button
                      ref={currentPly === row.black.ply ? activeRef : null}
                      type="button"
                      onClick={() => onSelectPly(row.black!.ply)}
                      className={`flex items-center justify-between px-2 py-1 rounded text-left font-mono text-xs transition-colors cursor-pointer ${
                        currentPly === row.black.ply
                          ? 'bg-emerald-600 text-white font-semibold'
                          : 'text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                      }`}
                    >
                      <span>{row.black.san}</span>
                      {blackAnalysis && CLASSIFICATION_STYLES[blackAnalysis.classification].symbol && (
                        <span
                          className={`font-bold text-[11px] ${
                            currentPly === row.black.ply
                              ? 'text-white'
                              : CLASSIFICATION_STYLES[blackAnalysis.classification].colorClass
                          }`}
                          title={CLASSIFICATION_STYLES[blackAnalysis.classification].label}
                        >
                          {CLASSIFICATION_STYLES[blackAnalysis.classification].symbol}
                        </span>
                      )}
                    </button>
                  ) : (
                    <div />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Navigation bar */}
      <div className="grid grid-cols-4 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#11151C]">
        <button
          type="button"
          onClick={() => onSelectPly(0)}
          disabled={currentPly === 0}
          className="flex items-center justify-center py-2 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200/60 dark:hover:bg-neutral-800 disabled:opacity-35 cursor-pointer disabled:cursor-default"
          aria-label="Start of game"
        >
          <ChevronFirst className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => onSelectPly(Math.max(0, currentPly - 1))}
          disabled={currentPly === 0}
          className="flex items-center justify-center py-2 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200/60 dark:hover:bg-neutral-800 disabled:opacity-35 cursor-pointer disabled:cursor-default"
          aria-label="Previous move"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => onSelectPly(Math.min(moves.length, currentPly + 1))}
          disabled={currentPly >= moves.length}
          className="flex items-center justify-center py-2 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200/60 dark:hover:bg-neutral-800 disabled:opacity-35 cursor-pointer disabled:cursor-default"
          aria-label="Next move"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => onSelectPly(moves.length)}
          disabled={currentPly >= moves.length}
          className="flex items-center justify-center py-2 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200/60 dark:hover:bg-neutral-800 disabled:opacity-35 cursor-pointer disabled:cursor-default"
          aria-label="End of game"
        >
          <ChevronLast className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
