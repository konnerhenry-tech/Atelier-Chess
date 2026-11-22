import { Chess } from 'chess.js';
import { OPENINGS_DATABASE } from '../data/openings';
import { AnalyzedMove, GameReviewReport, MoveClassification, MoveRecord } from '../types/chess';
import { cpToWinProb, formatEvalScore, uciToSan } from '../utils/chessHelpers';
import { stockfishService } from './stockfishService';

/**
 * Transparent move classification criteria based on Expected Win Probability loss:
 * - Book: Matches a known opening theory line in the ECO database (plies <= 12)
 * - Best: Win probability loss <= 0.6% and matches engine top choice
 * - Brilliant (!!): Sacrifices material (captured value < moved piece value or leaves material hanging)
 *   while maintaining winProbLoss <= 2.5% in a non-trivial position
 * - Great (!): Top engine move where the 2nd best alternative drops >= 12% win probability
 * - Excellent: Win probability loss <= 2.0%
 * - Good: Win probability loss <= 5.0%
 * - Inaccuracy (?!): 5.0% < Win probability loss <= 10.0%
 * - Mistake (?): 10.0% < Win probability loss <= 20.0%
 * - Blunder (??): Win probability loss > 20.0%
 */
function classifyMove(params: {
  isBook: boolean;
  isTopMove: boolean;
  wpLoss: number;
  secondBestGap: number;
  isSacrifice: boolean;
  wpBefore: number;
  wpAfter: number;
}): { classification: MoveClassification; explanation: string } {
  const { isBook, isTopMove, wpLoss, secondBestGap, isSacrifice, wpBefore, wpAfter } = params;

  if (isBook) {
    return {
      classification: 'book',
      explanation: 'Standard opening theory move following established master practice.',
    };
  }

  if (isSacrifice && wpLoss <= 2.5 && wpAfter >= 38 && wpBefore < 92) {
    return {
      classification: 'brilliant',
      explanation: 'Brilliant tactical sacrifice that maintains or strengthens your position.',
    };
  }

  if (isTopMove && secondBestGap >= 12 && wpBefore < 94) {
    return {
      classification: 'great',
      explanation: 'Critical finding — the only strong move that preserves the advantage.',
    };
  }

  if (isTopMove || wpLoss <= 0.6) {
    return {
      classification: 'best',
      explanation: 'The engine’s top recommended move in this position.',
    };
  }

  if (wpLoss <= 2.0) {
    return {
      classification: 'excellent',
      explanation: 'Very accurate choice with negligible difference from the engine best.',
    };
  }

  if (wpLoss <= 5.0) {
    return {
      classification: 'good',
      explanation: 'Solid practical move that keeps the position on course.',
    };
  }

  if (wpLoss <= 10.0) {
    return {
      classification: 'inaccuracy',
      explanation: `Slight slip (−${wpLoss.toFixed(1)}% win probability). A more precise continuation was available.`,
    };
  }

  if (wpLoss <= 20.0) {
    return {
      classification: 'mistake',
      explanation: `Significant mistake (−${wpLoss.toFixed(1)}% win probability) that gives the opponent real counterplay.`,
    };
  }

  return {
    classification: 'blunder',
    explanation: `Decisive blunder (−${wpLoss.toFixed(1)}% win probability) that sharply swings the evaluation.`,
  };
}

function estimateMaterialScore(fen: string, color: 'w' | 'b'): number {
  const vals: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
  const placement = fen.split(' ')[0] || '';
  let sum = 0;
  for (const ch of placement) {
    const lower = ch.toLowerCase();
    if (!vals[lower]) continue;
    const isWhite = ch === ch.toUpperCase();
    if ((color === 'w' && isWhite) || (color === 'b' && !isWhite)) {
      sum += vals[lower];
    }
  }
  return sum;
}

export function detectOpeningFromMoves(moves: MoveRecord[]): { eco: string; name: string } {
  const sanList = moves.map((m) => m.san);
  let bestMatch = { eco: 'A00', name: 'Starting / Custom Position', len: 0 };

  for (const op of OPENINGS_DATABASE) {
    if (op.moves.length > sanList.length) continue;
    let matches = true;
    for (let i = 0; i < op.moves.length; i++) {
      if (op.moves[i] !== sanList[i]) {
        matches = false;
        break;
      }
    }
    if (matches && op.moves.length >= bestMatch.len) {
      bestMatch = {
        eco: op.eco,
        name: op.variation ? `${op.name}: ${op.variation}` : op.name,
        len: op.moves.length,
      };
    }
  }

  return { eco: bestMatch.eco, name: bestMatch.name };
}

export async function runStockfishGameReview(
  moves: MoveRecord[],
  onProgress?: (completed: number, total: number) => void,
  depth = 11
): Promise<GameReviewReport> {
  const analyzed: AnalyzedMove[] = [];
  const opening = detectOpeningFromMoves(moves);

  // Build quick lookup set of book FENs for plies <= 12
  const bookFens = new Set<string>();
  for (const op of OPENINGS_DATABASE) {
    const c = new Chess();
    for (const m of op.moves) {
      try {
        c.move(m);
        bookFens.add(c.fen().split(' ').slice(0, 4).join(' '));
      } catch {
        break;
      }
    }
  }

  let prevEvalCp = 25; // Standard slight White opening edge
  let prevMate: number | null = null;
  let prevBestUci = '';
  let prevSecondBestGap = 0;

  // Evaluate starting position only if moves exist
  if (moves.length > 0) {
    const startEval = await stockfishService.evaluatePosition(moves[0].fenBefore, {
      depth,
      movetimeMs: 450,
      multiPv: 2,
    });
    const l1 = startEval.lines[0];
    const l2 = startEval.lines[1];
    prevEvalCp = l1?.cp ?? 25;
    prevMate = l1?.mate ?? null;
    prevBestUci = l1?.bestMoveUci || startEval.bestMoveUci;
    if (l1 && l2) {
      const wp1 = cpToWinProb(l1.cp, l1.mate);
      const wp2 = cpToWinProb(l2.cp, l2.mate);
      prevSecondBestGap = Math.abs(wp1 - wp2);
    }
  }

  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    onProgress?.(i, moves.length);

    const evalAfter = await stockfishService.evaluatePosition(move.fenAfter, {
      depth,
      movetimeMs: 420,
      multiPv: 2,
    });

    const line1 = evalAfter.lines[0];
    const line2 = evalAfter.lines[1];

    const evalAfterCp = line1 ? line1.cp : move.isCheckmate ? (move.color === 'w' ? 10000 : -10000) : 0;
    const mateAfter = move.isCheckmate ? (move.color === 'w' ? 1 : -1) : line1?.mate ?? null;

    // Convert White-relative evals to the moving player's perspective
    const sign = move.color === 'w' ? 1 : -1;
    const wpBefore = cpToWinProb(prevEvalCp * sign, prevMate !== null ? prevMate * sign : null);
    const wpAfter = cpToWinProb(evalAfterCp * sign, mateAfter !== null ? mateAfter * sign : null);
    const wpLoss = Math.max(0, wpBefore - wpAfter);

    const shortFenAfter = move.fenAfter.split(' ').slice(0, 4).join(' ');
    const isBook = move.ply <= 12 && bookFens.has(shortFenAfter);
    const isTopMove = move.uci === prevBestUci;

    const matBefore =
      estimateMaterialScore(move.fenBefore, move.color) -
      estimateMaterialScore(move.fenBefore, move.color === 'w' ? 'b' : 'w');
    const matAfter =
      estimateMaterialScore(move.fenAfter, move.color) -
      estimateMaterialScore(move.fenAfter, move.color === 'w' ? 'b' : 'w');
    const isSacrifice = matAfter <= matBefore - 2 && !move.captured;

    const { classification, explanation } = classifyMove({
      isBook,
      isTopMove,
      wpLoss,
      secondBestGap: prevSecondBestGap,
      isSacrifice,
      wpBefore,
      wpAfter,
    });

    const bestMoveSan = prevBestUci ? uciToSan(move.fenBefore, prevBestUci) : move.san;
    const pvSan = line1?.pvSan ?? [];

    analyzed.push({
      ply: move.ply,
      moveNumber: move.moveNumber,
      color: move.color,
      san: move.san,
      uci: move.uci,
      fenBefore: move.fenBefore,
      fenAfter: move.fenAfter,
      evalBeforeCp: prevEvalCp,
      evalAfterCp,
      mateBefore: prevMate,
      mateAfter,
      bestMoveUci: prevBestUci,
      bestMoveSan,
      pvSan,
      winProbBefore: wpBefore,
      winProbAfter: wpAfter,
      winProbLoss: wpLoss,
      classification,
      explanation:
        classification === 'mistake' || classification === 'blunder' || classification === 'inaccuracy'
          ? `${explanation} Best was ${bestMoveSan} (eval ${formatEvalScore(prevEvalCp, prevMate)}).`
          : explanation,
    });

    prevEvalCp = evalAfterCp;
    prevMate = mateAfter;
    prevBestUci = line1?.bestMoveUci || evalAfter.bestMoveUci;
    if (line1 && line2) {
      const wp1 = cpToWinProb(line1.cp * (move.color === 'w' ? -1 : 1), line1.mate);
      const wp2 = cpToWinProb(line2.cp * (move.color === 'w' ? -1 : 1), line2.mate);
      prevSecondBestGap = Math.abs(wp1 - wp2);
    } else {
      prevSecondBestGap = 0;
    }
  }

  onProgress?.(moves.length, moves.length);

  const emptyCounts = (): Record<MoveClassification, number> => ({
    brilliant: 0,
    great: 0,
    best: 0,
    excellent: 0,
    good: 0,
    book: 0,
    inaccuracy: 0,
    mistake: 0,
    blunder: 0,
  });

  const counts = { w: emptyCounts(), b: emptyCounts() };
  const moveAcc = { w: [] as number[], b: [] as number[] };

  for (const m of analyzed) {
    counts[m.color][m.classification]++;
    // Accuracy formula derived from Win% loss (0 loss = 100%, 25+ loss approaches 0%)
    const acc = Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * m.winProbLoss) - 3.1669));
    moveAcc[m.color].push(acc);
  }

  const avg = (arr: number[]) =>
    arr.length === 0 ? 100 : Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10;

  const whiteAccuracy = avg(moveAcc.w);
  const blackAccuracy = avg(moveAcc.b);

  const criticalMoments = [...analyzed]
    .filter((m) => ['brilliant', 'great', 'mistake', 'blunder'].includes(m.classification))
    .sort((a, b) => b.winProbLoss - a.winProbLoss)
    .slice(0, 6);

  const totalErrorsW = counts.w.mistake + counts.w.blunder;
  const totalErrorsB = counts.b.mistake + counts.b.blunder;
  const summary = `Opening: ${opening.name} (${opening.eco}). White achieved ${whiteAccuracy}% accuracy (${totalErrorsW} major errors); Black achieved ${blackAccuracy}% accuracy (${totalErrorsB} major errors).`;

  return {
    whiteAccuracy,
    blackAccuracy,
    openingName: opening.name,
    openingEco: opening.eco,
    moves: analyzed,
    counts,
    criticalMoments,
    summary,
  };
}
