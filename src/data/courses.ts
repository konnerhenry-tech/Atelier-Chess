import { AcademyLesson } from '../types/chess';

export const ACADEMY_LESSONS: AcademyLesson[] = [
  // BEGINNER TRACK
  {
    id: 'beg-1-pieces-setup',
    tier: 'Beginner',
    order: 1,
    title: 'Piece Movement & Central Control',
    subtitle: 'Learn how Pawns, Knights, Bishops, and Rooks command the board.',
    xpReward: 50,
    estimatedMinutes: 3,
    concepts: ['Board setup', 'Piece names', 'Piece movement', 'Center squares'],
    steps: [
      {
        id: 'step-1',
        title: 'Claim the Center with Your Pawn',
        instruction:
          'Pawns move forward 1 square—or 2 squares on their very first move. Advance your King’s Pawn two squares to e4 to control central d5 and f5.',
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        goalType: 'make-move',
        expectedMoves: ['e2e4'],
        hint: 'Drag or tap the pawn on e2 and move it to e4.',
        successMessage: 'Great start! Moving e2-e4 opens diagonals for your Queen and Bishop while staking a central claim.',
      },
      {
        id: 'step-2',
        title: 'Leap with the Knight',
        instruction:
          'Knights move in an L-shape (2 squares one way, 1 perpendicular) and can jump over pieces. Develop your Kingside Knight to f3 to attack Black’s e5 pawn.',
        fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
        goalType: 'make-move',
        expectedMoves: ['g1f3'],
        hint: 'Select the Knight on g1 and move it to f3.',
        successMessage: 'Excellent! Developing Knights toward the center maximizes their reach.',
      },
      {
        id: 'step-3',
        title: 'Diagonal Sweep with the Bishop',
        instruction:
          'Bishops glide diagonally any number of unobstructed squares. Develop your Light-Squared Bishop to c4, aiming directly at Black’s f7 pawn.',
        fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
        goalType: 'make-move',
        expectedMoves: ['f1c4'],
        hint: 'Move the Bishop from f1 to c4.',
        successMessage: 'Well done! You have formed the classic Italian Game opening posture.',
      },
    ],
  },
  {
    id: 'beg-2-capturing-check',
    tier: 'Beginner',
    order: 2,
    title: 'Capturing & Delivering Check',
    subtitle: 'Win undefended material and put the enemy King under direct attack.',
    xpReward: 60,
    estimatedMinutes: 3,
    concepts: ['Capturing', 'Check', 'Piece safety'],
    steps: [
      {
        id: 'cap-1',
        title: 'Capture an Undefended Piece',
        instruction:
          'Always scan for loose enemy pieces! Capture Black’s undefended Rook on e6 with your Bishop.',
        fen: '4k3/8/4r3/8/2B5/8/8/4K3 w - - 0 1',
        goalType: 'make-move',
        expectedMoves: ['c4e6'],
        hint: 'Your Bishop on c4 controls the diagonal straight through e6.',
        successMessage: 'Clean capture! Winning an undefended Rook (+5) decides the game.',
      },
      {
        id: 'cap-2',
        title: 'Deliver a Checking Attack',
        instruction:
          'When a King is directly attacked, that is Check. Deliver check with your Queen while simultaneously attacking Black’s undefended Knight on a5.',
        fen: '4k3/8/8/n7/8/8/8/3QK3 w - - 0 1',
        goalType: 'make-move',
        expectedMoves: ['d1a4'],
        hint: 'Move your Queen to a4, attacking both the King on e8 diagonally and the Knight on a5.',
        successMessage: 'Check and a double attack! Black must deal with the check and loses the Knight.',
      },
    ],
  },
  {
    id: 'beg-3-checkmate-stalemate',
    tier: 'Beginner',
    order: 3,
    title: 'Checkmate vs. Stalemate',
    subtitle: 'Finish the game cleanly—and avoid accidentally gifting a draw.',
    xpReward: 70,
    estimatedMinutes: 4,
    concepts: ['Checkmate', 'Stalemate', 'Back-rank mate'],
    steps: [
      {
        id: 'cm-1',
        title: 'Back-Rank Checkmate',
        instruction:
          'Black’s King is trapped behind its own three pawns on the 8th rank. Deliver Checkmate in one move with your Rook.',
        fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1',
        goalType: 'make-move',
        expectedMoves: ['d1d8'],
        hint: 'Slide the d1 Rook all the way up to d8.',
        successMessage: 'Checkmate! The Black King has no escape squares and no piece can block or capture.',
      },
      {
        id: 'cm-2',
        title: 'Avoid Stalemate—Find Mate!',
        instruction:
          'Warning: Moving Qb6 or Qc7 would leave Black with no legal moves and NOT in check—a Stalemate draw. Find a move that delivers Checkmate instead!',
        fen: 'k7/8/1K6/8/8/8/8/6Q1 w - - 0 1',
        goalType: 'make-move',
        expectedMoves: ['g1g8', 'g1a1'],
        hint: 'Check the Black King along the 8th rank (Qg8) or the a-file (Qa1) while your King guards b7 and a7.',
        successMessage: 'Checkmate! Always verify the enemy King is actually in check when taking away its final squares.',
      },
    ],
  },
  {
    id: 'beg-4-special-rules',
    tier: 'Beginner',
    order: 4,
    title: 'Castling, En Passant & Promotion',
    subtitle: 'Master the three special rules of chess every player must know.',
    xpReward: 80,
    estimatedMinutes: 4,
    concepts: ['Castling', 'En passant', 'Pawn promotion', 'Opening principles'],
    steps: [
      {
        id: 'sp-1',
        title: 'Castle Kingside to Safety',
        instruction:
          'Castling moves your King two squares toward a Rook and leaps the Rook over—safeguarding the King and activating the Rook in one turn. Castle Kingside (O-O)!',
        fen: 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
        goalType: 'make-move',
        expectedMoves: ['e1g1'],
        hint: 'Move your King from e1 to g1 (two squares toward the h1 Rook).',
        successMessage: 'Safe and sound! Your King is tucked behind pawns and your Rook is ready to join the fight.',
      },
      {
        id: 'sp-2',
        title: 'Capture En Passant',
        instruction:
          'Black just pushed their pawn two squares from d7 to d5, passing right beside your e5 pawn. Capture it En Passant by moving your e5 pawn diagonally onto d6.',
        fen: '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1',
        goalType: 'make-move',
        expectedMoves: ['e5d6'],
        hint: 'Move your e5 pawn diagonally to the empty d6 square.',
        successMessage: 'Brilliant! En passant is legal only on the very next move after an enemy pawn advances two squares.',
      },
      {
        id: 'sp-3',
        title: 'Pawn Promotion',
        instruction:
          'When a pawn reaches the far edge of the board, it promotes into a Queen, Rook, Bishop, or Knight. Push c7 to c8 and promote to a Queen.',
        fen: '8/2P3k1/8/8/8/8/6K1/8 w - - 0 1',
        goalType: 'make-move',
        expectedMoves: ['c7c8q'],
        hint: 'Advance the c7 pawn to c8 and select the Queen.',
        successMessage: 'A brand-new Queen enters the board! You can even promote to a second or third Queen.',
      },
    ],
  },

  // INTERMEDIATE TRACK
  {
    id: 'int-1-forks-double-attacks',
    tier: 'Intermediate',
    order: 5,
    title: 'Forks & Double Attacks',
    subtitle: 'Attack two high-value targets simultaneously so your opponent cannot save both.',
    xpReward: 90,
    estimatedMinutes: 4,
    concepts: ['Forks', 'Double attacks', 'Knight tactics'],
    steps: [
      {
        id: 'fk-1',
        title: 'The Royal Knight Fork',
        instruction:
          'Knights are the deadliest forking pieces because their jumps cannot be blocked. Find the Knight move that checks the Black King on e8 AND attacks the Queen on c8!',
        fen: '2q1k3/8/8/8/4N3/8/8/4K3 w - - 0 1',
        goalType: 'make-move',
        expectedMoves: ['e4d6'],
        hint: 'Leap your Knight from e4 to d6, attacking both e8 and c8.',
        successMessage: 'Royal Fork! Black must move the King out of check, leaving the Queen behind.',
      },
      {
        id: 'fk-2',
        title: 'Queen Diagonal Fork',
        instruction:
          'The Queen excels at long-range double attacks. Move your Queen to a square that checks Black’s King on g8 AND attacks the undefended Rook on a8.',
        fen: 'r5k1/8/8/8/8/8/8/3QK3 w - - 0 1',
        goalType: 'make-move',
        expectedMoves: ['d1d5'],
        hint: 'Advance your Queen along the d-file to d5—both g8 and a8 lie on diagonals from d5!',
        successMessage: 'Decisive Queen fork! From d5, your Queen slices both diagonals at once.',
      },
    ],
  },
  {
    id: 'int-2-pins-skewers',
    tier: 'Intermediate',
    order: 6,
    title: 'Pins, Skewers & Removing the Defender',
    subtitle: 'Immobilize enemy pieces along files and diagonals, or spear through the front piece.',
    xpReward: 100,
    estimatedMinutes: 5,
    concepts: ['Pins', 'Skewers', 'Removing the defender'],
    steps: [
      {
        id: 'ps-1',
        title: 'Win with an Absolute Pin',
        instruction:
          'An absolute pin locks a piece in place because moving it would expose the King behind it. Pin Black’s Queen on e6 to Black’s King on g8!',
        fen: '6k1/8/4q3/8/8/8/2B5/6K1 w - - 0 1',
        goalType: 'make-move',
        expectedMoves: ['c2b3'],
        hint: 'Move your Bishop from c2 to b3 to line up e6 and g8 along the a2-g8 diagonal.',
        successMessage: 'Absolute pin! Black’s Queen cannot escape because the King stands directly behind her.',
      },
      {
        id: 'ps-2',
        title: 'Skewer the King to Win the Rook',
        instruction:
          'A skewer attacks a high-value piece in front (the King), forcing it to step aside and leave the Rook behind exposed. Skewer Black’s King and Rook along the c-file!',
        fen: '8/2r5/8/8/2k5/8/8/R3K3 w - - 0 1',
        goalType: 'make-move',
        expectedMoves: ['a1c1'],
        hint: 'Slide your Rook from a1 to c1 to check the King on c4 with the c7 Rook behind it.',
        successMessage: 'Skewered cleanly! The King must step off the c-file, winning the c7 Rook.',
      },
    ],
  },
  {
    id: 'int-3-discovered-attacks',
    tier: 'Intermediate',
    order: 7,
    title: 'Discovered Attacks & Pawn Structures',
    subtitle: 'Unleash hidden batteries along open files and exploit structural weaknesses.',
    xpReward: 110,
    estimatedMinutes: 5,
    concepts: ['Discovered attacks', 'Tactical combinations', 'Pawn structures', 'Positional concepts'],
    steps: [
      {
        id: 'da-1',
        title: 'Unleash a Discovered Check',
        instruction:
          'Your Rook on e1 lines up with Black’s King on e8, blocked only by your Bishop on e4. Move the Bishop to capture Black’s Rook on a8 with Discovered Check!',
        fen: 'r3k3/8/8/8/4B3/8/8/4R1K1 w - - 0 1',
        goalType: 'make-move',
        expectedMoves: ['e4a8'],
        hint: 'Move your Bishop from e4 to a8, capturing the Rook while uncovering a check from your e1 Rook.',
        successMessage: 'Devastating! Because your move reveals a check, Black has no time to save material.',
      },
    ],
  },

  // ADVANCED TRACK
  {
    id: 'adv-1-endgame-opposition',
    tier: 'Advanced',
    order: 8,
    title: 'Endgame Theory: King Opposition',
    subtitle: 'Master key squares and direct opposition to promote pawns in King-and-Pawn endgames.',
    xpReward: 130,
    estimatedMinutes: 5,
    concepts: ['Endgame theory', 'Opposition', 'Calculation'],
    steps: [
      {
        id: 'eg-1',
        title: 'Seize the Key Squares',
        instruction:
          'In King & Pawn endgames, leading with your King ahead of your pawn secures promotion. Step your King forward onto d5 or f5 to outflank Black’s King!',
        fen: '4k3/8/8/4P3/4K3/8/8/8 w - - 0 1',
        goalType: 'make-move',
        expectedMoves: ['e4d5', 'e4f5'],
        hint: 'Advance your King to d5 or f5, ahead of your e5 pawn.',
        successMessage: 'Textbook technique! Keeping your King in front of the pawn guarantees promotion.',
      },
    ],
  },
  {
    id: 'adv-2-sacrifices-prophylaxis',
    tier: 'Advanced',
    order: 9,
    title: 'Positional Sacrifices & Prophylaxis',
    subtitle: 'Spot the classic Greek Gift sacrifice and anticipate your opponent’s counterplay.',
    xpReward: 150,
    estimatedMinutes: 6,
    concepts: ['Positional sacrifices', 'Strategic planning', 'Prophylaxis', 'Complex tactical patterns'],
    steps: [
      {
        id: 'pr-1',
        title: 'The Classic Greek Gift Sacrifice',
        instruction:
          'Black’s castled King lacks a Knight defender on f6, and your Knight on f3 + Queen on d1 are poised to follow up with Ng5+ and Qh5. Launch the classic sacrifice Bxh7+!',
        fen: 'r1bq1rk1/pppn1ppp/4p3/3p4/1b1P4/2NBPN2/PP3PPP/R1BQK2R w KQ - 0 1',
        goalType: 'make-move',
        expectedMoves: ['d3h7'],
        hint: 'Capture the h7 pawn with your d3 Bishop.',
        successMessage: 'Bxh7+! After ...Kxh7 Ng5+ Kg8 Qh5, Black’s kingside collapses under the coordinated attack.',
      },
    ],
  },
];
