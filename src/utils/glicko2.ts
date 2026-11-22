export interface GlickoRating {
  rating: number;
  rd: number;
  volatility: number;
  games: number;
  wins: number;
  losses: number;
  draws: number;
}

export function createInitialRating(initial = 100): GlickoRating {
  return {
    rating: initial,
    rd: 200,
    volatility: 0.06,
    games: 0,
    wins: 0,
    losses: 0,
    draws: 0,
  };
}

/**
 * Standard Glicko-2 single-match rating update.
 * Score: 1 = win, 0.5 = draw, 0 = loss.
 */
export function updateGlicko2(
  player: GlickoRating,
  opponentRating: number,
  opponentRd: number,
  score: 1 | 0.5 | 0
): GlickoRating {
  const SCALE = 173.7178;
  const tau = 0.5;

  const mu = (player.rating - 1500) / SCALE;
  const phi = player.rd / SCALE;
  const sigma = player.volatility;

  const muJ = (opponentRating - 1500) / SCALE;
  const phiJ = opponentRd / SCALE;

  const g = 1 / Math.sqrt(1 + (3 * phiJ * phiJ) / (Math.PI * Math.PI));
  const E = 1 / (1 + Math.exp(-g * (mu - muJ)));

  const v = 1 / (g * g * E * (1 - E));
  const delta = v * g * (score - E);

  // Iterative volatility update (Illinois algorithm)
  const a = Math.log(sigma * sigma);
  const f = (x: number) => {
    const ex = Math.exp(x);
    const num1 = ex * (delta * delta - phi * phi - v - ex);
    const den1 = 2 * Math.pow(phi * phi + v + ex, 2);
    return num1 / den1 - (x - a) / (tau * tau);
  };

  let A = a;
  let B: number;
  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v);
  } else {
    let k = 1;
    while (f(a - k * tau) < 0 && k < 20) k++;
    B = a - k * tau;
  }

  let fA = f(A);
  let fB = f(B);
  for (let i = 0; i < 30 && Math.abs(B - A) > 1e-6; i++) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA = fA / 2;
    }
    B = C;
    fB = fC;
  }

  const newSigma = Math.exp(A / 2);
  const phiStar = Math.sqrt(phi * phi + newSigma * newSigma);
  const newPhi = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const newMu = mu + newPhi * newPhi * g * (score - E);

  let nextRating = Math.max(100, Math.min(3500, Math.round(newMu * SCALE + 1500)));
  if (score === 1 && nextRating <= player.rating) {
    nextRating = Math.min(3500, player.rating + 8);
  } else if (score === 0 && player.rating > 100 && nextRating >= player.rating) {
    nextRating = Math.max(100, player.rating - 8);
  }

  return {
    rating: nextRating,
    rd: Math.max(35, Math.min(350, Math.round(newPhi * SCALE))),
    volatility: Number(newSigma.toFixed(5)),
    games: player.games + 1,
    wins: player.wins + (score === 1 ? 1 : 0),
    losses: player.losses + (score === 0 ? 1 : 0),
    draws: player.draws + (score === 0.5 ? 1 : 0),
  };
}
