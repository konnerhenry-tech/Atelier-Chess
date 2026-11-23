import { Chess } from 'chess.js';
import { PieceColor, PieceType } from '../types/chess';

const PIECE_VALUES: Record<PieceType, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

const STARTING_COUNTS: Record<PieceType, number> = {
  p: 8,
  n: 2,
  b: 2,
  r: 2,
  q: 1,
  k: 1,
};

export interface MaterialInfo {
  capturedByWhite: PieceType[]; // Black pieces captured by White
  capturedByBlack: PieceType[]; // White pieces captured by Black
  whiteAdvantage: number;       // Positive if White ahead, negative if Black ahead
}

export function computeMaterialFromFen(fen: string): MaterialInfo {
  const counts: Record<PieceColor, Record<PieceType, number>> = {
    w: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
    b: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
  };

  const placement = fen.split(' ')[0] || '';
  for (const ch of placement) {
    if (/[pnbrqkPNBRQK]/.test(ch)) {
      const color: PieceColor = ch === ch.toUpperCase() ? 'w' : 'b';
      const type = ch.toLowerCase() as PieceType;
      counts[color][type]++;
    }
  }

  const order: PieceType[] = ['q', 'r', 'b', 'n', 'p'];
  const capturedByWhite: PieceType[] = [];
  const capturedByBlack: PieceType[] = [];

  let whiteMaterial = 0;
  let blackMaterial = 0;

  // A promoted pawn leaves the pawn count short without having been captured. Count the
  // "extra" pieces of each side (more queens/rooks/bishops/knights than at the start) as
  // promotions and subtract them from the missing-pawn total.
  const promotions = (color: PieceColor): number =>
    (['q', 'r', 'b', 'n'] as PieceType[]).reduce(
      (sum, pt) => sum + Math.max(0, counts[color][pt] - STARTING_COUNTS[pt]),
      0
    );

  for (const pt of order) {
    whiteMaterial += counts.w[pt] * PIECE_VALUES[pt];
    blackMaterial += counts.b[pt] * PIECE_VALUES[pt];

    const missingBlack =
      pt === 'p'
        ? Math.max(0, STARTING_COUNTS.p - counts.b.p - promotions('b'))
        : Math.max(0, STARTING_COUNTS[pt] - counts.b[pt]);
    for (let i = 0; i < missingBlack; i++) capturedByWhite.push(pt);

    const missingWhite =
      pt === 'p'
        ? Math.max(0, STARTING_COUNTS.p - counts.w.p - promotions('w'))
        : Math.max(0, STARTING_COUNTS[pt] - counts.w[pt]);
    for (let i = 0; i < missingWhite; i++) capturedByBlack.push(pt);
  }

  return {
    capturedByWhite,
    capturedByBlack,
    whiteAdvantage: whiteMaterial - blackMaterial,
  };
}

export function uciLineToSan(fen: string, uciMoves: string[]): string[] {
  const c = new Chess();
  try {
    c.load(fen);
  } catch {
    return [];
  }
  const result: string[] = [];
  for (const uci of uciMoves) {
    if (!uci || uci.length < 4) break;
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotion = uci.length > 4 ? (uci[4] as PieceType) : undefined;
    try {
      const m = c.move({ from, to, promotion });
      if (!m) break;
      result.push(m.san);
    } catch {
      break;
    }
  }
  return result;
}

export function uciToSan(fen: string, uci: string): string {
  return uciLineToSan(fen, [uci])[0] || uci;
}

/**
 * Standard expected win probability (0-100) from centipawn score (from side's perspective).
 */
export function cpToWinProb(cp: number, mate?: number | null): number {
  if (mate !== undefined && mate !== null) {
    return mate > 0 ? 100 : 0;
  }
  const clamped = Math.max(-2000, Math.min(2000, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * clamped)) - 1);
}

export function formatEvalScore(cp: number, mate?: number | null): string {
  if (mate !== undefined && mate !== null) {
    return mate > 0 ? `M${mate}` : `-M${Math.abs(mate)}`;
  }
  const pawns = cp / 100;
  const sign = pawns > 0 ? '+' : '';
  return `${sign}${pawns.toFixed(1)}`;
}

export function evalToWhiteBarPct(cp: number, mate?: number | null): number {
  if (mate !== undefined && mate !== null) {
    return mate > 0 ? 97 : 3;
  }
  const wp = cpToWinProb(cp, null);
  return Math.max(4, Math.min(96, wp));
}

export function validateFenString(fen: string): { valid: boolean; error?: string } {
  const c = new Chess();
  try {
    c.load(fen.trim());
    return { valid: true };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : 'Invalid FEN position',
    };
  }
}
