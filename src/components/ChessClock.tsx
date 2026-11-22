import React from 'react';
import { Clock } from 'lucide-react';

interface ChessClockProps {
  timeMs: number;
  active: boolean;
  isLowTime?: boolean;
  unlimited?: boolean;
  label?: string;
}

export function formatClockMs(ms: number): string {
  const clamped = Math.max(0, ms);
  const totalSeconds = Math.floor(clamped / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const tenths = Math.floor((clamped % 1000) / 100);

  if (clamped < 20000 && clamped > 0) {
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${tenths}`;
  }
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export const ChessClock: React.FC<ChessClockProps> = ({
  timeMs,
  active,
  unlimited = false,
  label,
}) => {
  const low = !unlimited && timeMs > 0 && timeMs <= 20000;
  const flagged = !unlimited && timeMs <= 0;

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border font-mono tabular-nums text-sm font-semibold transition-colors ${
        flagged
          ? 'bg-red-600 text-white border-red-700'
          : active
            ? low
              ? 'bg-red-600/15 text-red-600 dark:text-red-400 border-red-500/50'
              : 'bg-emerald-600 text-white border-emerald-700'
            : 'bg-neutral-100 dark:bg-[#1B2029] text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-neutral-800'
      }`}
    >
      <Clock className="w-3.5 h-3.5 shrink-0 opacity-80" />
      {label && <span className="text-[11px] font-sans font-normal opacity-80 mr-1">{label}</span>}
      <span>{unlimited ? '∞' : formatClockMs(timeMs)}</span>
    </div>
  );
};
