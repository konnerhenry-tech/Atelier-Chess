export type PieceColor = 'w' | 'b';
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type PieceCode = `${PieceColor}${Uppercase<PieceType>}`;

export type CoordinateMode = 'inside' | 'outside' | 'none';
export type AnimationSpeed = 'instant' | 'fast' | 'normal' | 'smooth';
export type HighlightStyle = 'classic' | 'ring' | 'border' | 'subtle';
export type BoardCornerStyle = 'classic' | 'rounded' | 'sharp';
export type BoardTextureStyle = 'none' | 'wood-grain' | 'slate' | 'linen';
export type SoundPackStyle = 'wood' | 'marble' | 'crisp';
export type ArrowColorPreset = 'emerald' | 'amber' | 'sky' | 'rose';

export interface LinkedChessAccount {
  platform: 'chesscom' | 'lichess';
  username: string;
  profileUrl: string;
  ratings: {
    bullet?: number;
    blitz?: number;
    rapid?: number;
    classical?: number;
  };
  lastSyncedAt: string;
}

export type TimeControlCategory = 'bullet' | 'blitz' | 'rapid' | 'classical' | 'unlimited';

export interface TimeControl {
  id: string;
  label: string;
  category: TimeControlCategory;
  initialMs: number;
  incrementMs: number;
}

export type AIDifficultyTier =
  | 'beginner'
  | 'easy'
  | 'intermediate'
  | 'advanced'
  | 'expert'
  | 'master'
  | 'custom';

export type AIPlayStyle = 'balanced' | 'aggressive' | 'solid' | 'tactical';

export interface AIConfig {
  tier: AIDifficultyTier;
  label: string;
  skillLevel: number; // Stockfish Skill Level 0-20
  depth: number;      // Max depth
  thinkTimeMs: number;
  style: AIPlayStyle;
  description: string;
}

export interface BoardTheme {
  id: string;
  name: string;
  category:
    | 'Wood'
    | 'Tournament'
    | 'Blue & Cyan'
    | 'Purple & Midnight'
    | 'Marble & Gold'
    | 'Neon & Retro'
    | 'Minimalist & Glass'
    | 'Nature & Contrast';
  light: string;
  dark: string;
  border: string;
  frameBg: string;
  frameText: string;
  highlightFrom: string;
  highlightTo: string;
  selected: string;
  legalDot: string;
  isDarkTheme?: boolean;
  textureCss?: string;
}

export interface BoardPreferences {
  boardThemeId: string;
  pieceSetId: string;
  coordinateMode: CoordinateMode;
  highlightStyle: HighlightStyle;
  showLegalMoves: boolean;
  showLastMove: boolean;
  animationSpeed: AnimationSpeed;
  boardSizePx: number;
  soundEnabled: boolean;
  soundVolume: number;
  ambientMusicEnabled: boolean;
  ambientVolume: number;
  autoQueen: boolean;
  boardCornerStyle: BoardCornerStyle;
  boardTexture: BoardTextureStyle;
  pieceDropShadow: boolean;
  enableArrows: boolean;
  arrowColor: ArrowColorPreset;
  soundPack: SoundPackStyle;
  useCustomColors: boolean;
  customLightHex: string;
  customDarkHex: string;
}

export interface CustomizationPreset {
  id: string;
  name: string;
  createdAt: string;
  preferences: BoardPreferences;
}

export interface MoveRecord {
  ply: number;
  moveNumber: number;
  color: PieceColor;
  san: string;
  uci: string;
  from: string;
  to: string;
  fenBefore: string;
  fenAfter: string;
  captured?: PieceType;
  promotion?: PieceType;
  isCheck: boolean;
  isCheckmate: boolean;
  isCastling: boolean;
  isEnPassant: boolean;
  timeRemainingMs?: number;
}

export type MoveClassification =
  | 'brilliant'
  | 'great'
  | 'best'
  | 'excellent'
  | 'good'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder'
  | 'book';

export interface AnalyzedMove {
  ply: number;
  moveNumber: number;
  color: PieceColor;
  san: string;
  uci: string;
  fenBefore: string;
  fenAfter: string;
  evalBeforeCp: number; // White-relative centipawns
  evalAfterCp: number;  // White-relative centipawns
  mateBefore?: number | null;
  mateAfter?: number | null;
  bestMoveUci: string;
  bestMoveSan: string;
  pvSan: string[];
  winProbBefore: number; // 0-100 for side that moved
  winProbAfter: number;  // 0-100 for side that moved
  winProbLoss: number;
  classification: MoveClassification;
  explanation: string;
}

export interface GameReviewReport {
  whiteAccuracy: number;
  blackAccuracy: number;
  openingName: string;
  openingEco: string;
  moves: AnalyzedMove[];
  counts: {
    w: Record<MoveClassification, number>;
    b: Record<MoveClassification, number>;
  };
  criticalMoments: AnalyzedMove[];
  summary: string;
}

export interface SavedGameRecord {
  id: string;
  date: string;
  mode: 'ai' | 'local' | 'multiplayer' | 'analysis';
  timeControl: string;
  category: TimeControlCategory;
  whiteName: string;
  blackName: string;
  playerColor: PieceColor;
  result: '1-0' | '0-1' | '1/2-1/2';
  termination: string;
  pgn: string;
  finalFen: string;
  moveCount: number;
  openingName?: string;
  openingEco?: string;
  accuracy?: number;
}

export interface OpeningEntry {
  id: string;
  eco: string;
  name: string;
  variation?: string;
  category:
    | 'Open Games'
    | 'Semi-Open Games'
    | 'Closed Games'
    | 'Semi-Closed Games'
    | 'Indian Defenses'
    | 'Flank Openings'
    | 'Gambits';
  styleTags: ('Classical' | 'Modern' | 'Aggressive' | 'Defensive')[];
  moves: string[]; // SAN moves
  pgn: string;
  fen: string;
  description: string;
  whitePlans: string[];
  blackPlans: string[];
  commonMistakes: string[];
  tacticalIdeas: string[];
}

export interface PuzzleItem {
  id: string;
  title: string;
  category:
    | 'Daily'
    | 'Mate in 1'
    | 'Mate in 2'
    | 'Mate in 3'
    | 'Tactics'
    | 'Defensive'
    | 'Endgame'
    | 'Opening Trap';
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced' | 'Master';
  rating: number;
  fen: string;
  solutionUci: string[]; // Alternating player move, opponent reply, player move...
  themes: string[];
  explanation: string;
}

export interface LessonStep {
  id: string;
  title: string;
  instruction: string;
  fen: string;
  goalType: 'make-move' | 'sequence' | 'capture-target';
  expectedMoves?: string[]; // UCI or SAN accepted
  solutionSequence?: string[]; // SAN or UCI sequence
  hint: string;
  successMessage: string;
}

export interface AcademyLesson {
  id: string;
  tier: 'Beginner' | 'Intermediate' | 'Advanced';
  order: number;
  title: string;
  subtitle: string;
  xpReward: number;
  estimatedMinutes: number;
  concepts: string[];
  steps: LessonStep[];
}

export interface RepertoireLine {
  id: string;
  color: 'w' | 'b';
  name: string;
  eco: string;
  moves: string[]; // SAN sequence
  notes: string;
  attempts: number;
  successes: number;
  lastPracticed?: string;
}

export type AppSection =
  | 'dashboard'
  | 'play'
  | 'multiplayer'
  | 'analyze'
  | 'academy'
  | 'puzzles'
  | 'openings'
  | 'repertoire'
  | 'tools'
  | 'coach'
  | 'studio'
  | 'profile';
