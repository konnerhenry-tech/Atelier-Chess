import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import {
  Copy,
  Flag,
  Handshake,
  RotateCcw,
  ScanSearch,
  Sliders,
  Sparkles,
  Swords,
  Undo2,
} from 'lucide-react';
import { Chessboard } from '../components/Chessboard';
import { ChessClock } from '../components/ChessClock';
import { MoveHistory } from '../components/MoveHistory';
import { ChessPieceSvg } from '../data/pieceSets';
import { detectOpeningFromMoves } from '../engine/gameReview';
import { stockfishService } from '../engine/stockfishService';
import {
  AIConfig,
  AIDifficultyTier,
  AIPlayStyle,
  BoardPreferences,
  MoveRecord,
  PieceCode,
  PieceColor,
  PieceType,
  SavedGameRecord,
  TimeControl,
} from '../types/chess';
import { computeMaterialFromFen } from '../utils/chessHelpers';
import { soundEngine } from '../utils/soundEngine';

export const AI_PRESETS: Record<Exclude<AIDifficultyTier, 'custom'>, AIConfig> = {
  beginner: {
    tier: 'beginner',
    label: 'Beginner',
    skillLevel: 1,
    depth: 3,
    thinkTimeMs: 350,
    style: 'balanced',
    description: 'Gentle Stockfish Skill 1 — ideal for learning basic piece safety.',
  },
  easy: {
    tier: 'easy',
    label: 'Easy',
    skillLevel: 4,
    depth: 5,
    thinkTimeMs: 450,
    style: 'balanced',
    description: 'Stockfish Skill 4 — develops cleanly while leaving occasional tactical chances.',
  },
  intermediate: {
    tier: 'intermediate',
    label: 'Intermediate',
    skillLevel: 8,
    depth: 8,
    thinkTimeMs: 650,
    style: 'balanced',
    description: 'Stockfish Skill 8 — punishes hanging pieces and plays sound openings.',
  },
  advanced: {
    tier: 'advanced',
    label: 'Advanced',
    skillLevel: 12,
    depth: 11,
    thinkTimeMs: 900,
    style: 'tactical',
    description: 'Stockfish Skill 12 — strong tactical awareness and solid endgame technique.',
  },
  expert: {
    tier: 'expert',
    label: 'Expert',
    skillLevel: 16,
    depth: 13,
    thinkTimeMs: 1200,
    style: 'aggressive',
    description: 'Stockfish Skill 16 — sharp calculation and relentless initiative.',
  },
  master: {
    tier: 'master',
    label: 'Master',
    skillLevel: 20,
    depth: 16,
    thinkTimeMs: 1800,
    style: 'balanced',
    description: 'Full-strength Stockfish 19 (Skill 20) — grandmaster-caliber precision.',
  },
};

export const TIME_CONTROLS: TimeControl[] = [
  { id: 'bullet-1-0', label: '1+0 Bullet', category: 'bullet', initialMs: 60000, incrementMs: 0 },
  { id: 'bullet-2-1', label: '2+1 Bullet', category: 'bullet', initialMs: 120000, incrementMs: 1000 },
  { id: 'blitz-3-0', label: '3+0 Blitz', category: 'blitz', initialMs: 180000, incrementMs: 0 },
  { id: 'blitz-3-2', label: '3+2 Blitz', category: 'blitz', initialMs: 180000, incrementMs: 2000 },
  { id: 'blitz-5-0', label: '5+0 Blitz', category: 'blitz', initialMs: 300000, incrementMs: 0 },
  { id: 'rapid-10-0', label: '10+0 Rapid', category: 'rapid', initialMs: 600000, incrementMs: 0 },
  { id: 'rapid-15-10', label: '15+10 Rapid', category: 'rapid', initialMs: 900000, incrementMs: 10000 },
  { id: 'classical-30-0', label: '30+0 Classical', category: 'classical', initialMs: 1800000, incrementMs: 0 },
  { id: 'unlimited', label: 'Unlimited', category: 'unlimited', initialMs: 0, incrementMs: 0 },
];

const AI_TIER_RATINGS: Record<Exclude<AIDifficultyTier, 'custom'>, number> = {
  beginner: 200,
  easy: 450,
  intermediate: 800,
  advanced: 1200,
  expert: 1650,
  master: 2100,
};

interface PlayAIViewProps {
  preferences: BoardPreferences;
  playerName: string;
  initialFen?: string | null;
  lastRatingDelta?: { category: string; delta: number; newRating: number } | null;
  onGameFinished: (game: SavedGameRecord, rated: boolean, opponentEstRating: number) => void;
  onSendToReview: (pgn: string, moves: MoveRecord[]) => void;
  onAskCoach: (fen: string, pgn: string) => void;
}

export const PlayAIView: React.FC<PlayAIViewProps> = ({
  preferences,
  playerName,
  initialFen,
  lastRatingDelta,
  onGameFinished,
  onSendToReview,
  onAskCoach,
}) => {
  const [opponentMode, setOpponentMode] = useState<'ai' | 'local'>('ai');
  const [isRatedMatch, setIsRatedMatch] = useState(true);
  const [tier, setTier] = useState<AIDifficultyTier>('intermediate');
  const [customSkill, setCustomSkill] = useState(10);
  const [customDepth, setCustomDepth] = useState(10);
  const [customThinkMs, setCustomThinkMs] = useState(800);
  const [playStyle, setPlayStyle] = useState<AIPlayStyle>('balanced');
  const [playerSidePref, setPlayerSidePref] = useState<'w' | 'b' | 'random'>('w');
  const [selectedTc, setSelectedTc] = useState<TimeControl>(TIME_CONTROLS[5]); // 10+0 Rapid

  // Active Match State
  const [startFen, setStartFen] = useState<string>('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  const chessRef = useRef(new Chess());
  const finishedRef = useRef(false);
  const takebackUsedRef = useRef(false);
  const [fen, setFen] = useState(chessRef.current.fen());
  const [moves, setMoves] = useState<MoveRecord[]>([]);
  const [viewPly, setViewPly] = useState<number>(0);
  const [playerColor, setPlayerColor] = useState<PieceColor>('w');
  const [orientation, setOrientation] = useState<PieceColor>('w');
  const [gameStatus, setGameStatus] = useState<'idle' | 'playing' | 'finished'>('playing');
  const [resultText, setResultText] = useState<string | null>(null);
  const [aiThinking, setAiThinking] = useState(false);

  const [whiteTimeMs, setWhiteTimeMs] = useState(selectedTc.initialMs);
  const [blackTimeMs, setBlackTimeMs] = useState(selectedTc.initialMs);
  const [drawOfferedByAI, setDrawOfferedByAI] = useState(false);
  const [copiedNotice, setCopiedNotice] = useState<string | null>(null);

  const activeConfig: AIConfig = useMemo(() => {
    if (tier === 'custom') {
      return {
        tier: 'custom',
        label: 'Custom Stockfish',
        skillLevel: customSkill,
        depth: customDepth,
        thinkTimeMs: customThinkMs,
        style: playStyle,
        description: `Custom Stockfish (Skill ${customSkill}, Depth ${customDepth}, ${customThinkMs}ms).`,
      };
    }
    return { ...AI_PRESETS[tier], style: playStyle };
  }, [tier, customSkill, customDepth, customThinkMs, playStyle]);

  const finishMatch = useCallback(
    (result: '1-0' | '0-1' | '1/2-1/2', termination: string, currentMoves: MoveRecord[]) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      setGameStatus('finished');
      setResultText(`${result} · ${termination}`);
      setAiThinking(false);

      const isWin =
        (result === '1-0' && playerColor === 'w') || (result === '0-1' && playerColor === 'b');
      soundEngine.play(result === '1/2-1/2' ? 'draw' : isWin ? 'victory' : 'defeat');

      const opening = detectOpeningFromMoves(currentMoves);
      const aiName =
        opponentMode === 'ai'
          ? `Stockfish 19 (${activeConfig.label})`
          : 'Local Opponent';
      const approxSkillRating =
        tier === 'custom' ? 100 + customSkill * 100 : AI_TIER_RATINGS[tier];
      // A game where a takeback was used is never rated.
      const shouldRate = opponentMode === 'ai' && isRatedMatch && !takebackUsedRef.current;

      onGameFinished(
        {
          id: `game_${Date.now()}`,
          date: new Date().toISOString(),
          mode: opponentMode,
          timeControl: selectedTc.label,
          category: selectedTc.category,
          whiteName: playerColor === 'w' ? playerName : aiName,
          blackName: playerColor === 'b' ? playerName : aiName,
          playerColor,
          result,
          termination,
          pgn: chessRef.current.pgn(),
          finalFen: chessRef.current.fen(),
          moveCount: currentMoves.length,
          openingEco: opening.eco,
          openingName: opening.name,
        },
        shouldRate,
        approxSkillRating
      );
    },
    [
      playerColor,
      opponentMode,
      isRatedMatch,
      activeConfig,
      tier,
      customSkill,
      selectedTc,
      playerName,
      onGameFinished,
    ]
  );

  const startNewGame = useCallback(
    (overrideColor?: PieceColor, customFen?: string) => {
      stockfishService.stopCurrent();
      finishedRef.current = false;
      takebackUsedRef.current = false;
      const chosenColor: PieceColor =
        overrideColor ??
        (playerSidePref === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : playerSidePref);

      const nextChess = new Chess();
      if (customFen) {
        try {
          nextChess.load(customFen);
        } catch {
          nextChess.reset();
        }
      }
      chessRef.current = nextChess;
      setStartFen(nextChess.fen());
      setFen(nextChess.fen());
      setMoves([]);
      setViewPly(0);
      setPlayerColor(chosenColor);
      setOrientation(chosenColor);
      setWhiteTimeMs(selectedTc.initialMs);
      setBlackTimeMs(selectedTc.initialMs);
      setGameStatus('playing');
      setResultText(null);
      setDrawOfferedByAI(false);
      setAiThinking(false);
      soundEngine.play('game-start');
    },
    [playerSidePref, selectedTc]
  );

  useEffect(() => {
    if (initialFen) {
      startNewGame(undefined, initialFen);
    }
  }, [initialFen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clock tick loop (pure state decrement)
  useEffect(() => {
    if (gameStatus !== 'playing' || selectedTc.category === 'unlimited' || moves.length === 0) return;

    // Subtract real elapsed time, not a fixed step: browsers throttle timers in background
    // tabs, which made the old fixed-step clock run slow.
    let last = performance.now();
    const interval = window.setInterval(() => {
      const now = performance.now();
      const elapsed = Math.round(now - last);
      last = now;
      const turn = chessRef.current.turn();
      if (turn === 'w') {
        setWhiteTimeMs((prev) => Math.max(0, prev - elapsed));
      } else {
        setBlackTimeMs((prev) => Math.max(0, prev - elapsed));
      }
    }, 100);

    return () => clearInterval(interval);
  }, [gameStatus, selectedTc.category, moves.length]);

  // One low-time warning per game when the player's clock drops under 10s.
  const lowTimeWarnedRef = useRef(false);
  useEffect(() => {
    if (gameStatus !== 'playing' || selectedTc.category === 'unlimited') {
      lowTimeWarnedRef.current = false;
      return;
    }
    const mine = playerColor === 'w' ? whiteTimeMs : blackTimeMs;
    if (mine > 10000) lowTimeWarnedRef.current = false;
    else if (mine > 0 && !lowTimeWarnedRef.current && moves.length > 0) {
      lowTimeWarnedRef.current = true;
      soundEngine.play('low-time');
    }
  }, [gameStatus, selectedTc.category, playerColor, whiteTimeMs, blackTimeMs, moves.length]);

  // Clean timeout detection outside state updater
  useEffect(() => {
    if (gameStatus !== 'playing' || selectedTc.category === 'unlimited' || moves.length === 0) return;
    if (whiteTimeMs === 0) {
      finishMatch('0-1', 'White Time Out', moves);
    } else if (blackTimeMs === 0) {
      finishMatch('1-0', 'Black Time Out', moves);
    }
  }, [gameStatus, selectedTc.category, whiteTimeMs, blackTimeMs, moves, finishMatch]);

  const checkBoardEnd = useCallback(
    (nextMoves: MoveRecord[]): boolean => {
      const c = chessRef.current;
      if (c.isCheckmate()) {
        const res = c.turn() === 'w' ? '0-1' : '1-0';
        finishMatch(res, 'Checkmate', nextMoves);
        return true;
      }
      if (c.isStalemate()) {
        finishMatch('1/2-1/2', 'Stalemate', nextMoves);
        return true;
      }
      if (c.isThreefoldRepetition()) {
        finishMatch('1/2-1/2', 'Threefold Repetition', nextMoves);
        return true;
      }
      if (c.isInsufficientMaterial()) {
        finishMatch('1/2-1/2', 'Insufficient Material', nextMoves);
        return true;
      }
      if (c.isDraw()) {
        finishMatch('1/2-1/2', '50-Move Rule Draw', nextMoves);
        return true;
      }
      return false;
    },
    [finishMatch]
  );

  const applyChessMove = useCallback(
    (from: string, to: string, promotion?: PieceType): boolean => {
      if (gameStatus !== 'playing') return false;
      const c = chessRef.current;
      const fenBefore = c.fen();
      const movingColor = c.turn();

      try {
        const move = c.move({ from, to, promotion });
        if (!move) return false;

        if (selectedTc.category !== 'unlimited') {
          if (movingColor === 'w') setWhiteTimeMs((t) => t + selectedTc.incrementMs);
          else setBlackTimeMs((t) => t + selectedTc.incrementMs);
        }

        const isCheck = c.inCheck();
        const isCheckmate = c.isCheckmate();
        const isCastling = move.san === 'O-O' || move.san === 'O-O-O';
        const isEnPassant = move.flags.includes('e');

        if (isCheck) soundEngine.play('check');
        else if (move.promotion) soundEngine.play('promote');
        else if (isCastling) soundEngine.play('castle');
        else if (move.captured) soundEngine.play('capture');
        else soundEngine.play('move');

        const record: MoveRecord = {
          ply: moves.length + 1,
          moveNumber: Math.floor(moves.length / 2) + 1,
          color: movingColor,
          san: move.san,
          uci: `${move.from}${move.to}${move.promotion || ''}`,
          from: move.from,
          to: move.to,
          fenBefore,
          fenAfter: c.fen(),
          captured: move.captured as PieceType | undefined,
          promotion: move.promotion as PieceType | undefined,
          isCheck,
          isCheckmate,
          isCastling,
          isEnPassant,
        };

        const nextMoves = [...moves, record];
        setFen(c.fen());
        setMoves(nextMoves);
        setViewPly(nextMoves.length);
        setDrawOfferedByAI(false);

        checkBoardEnd(nextMoves);
        return true;
      } catch {
        return false;
      }
    },
    [gameStatus, moves, selectedTc, checkBoardEnd]
  );

  // Trigger Stockfish move when it's AI's turn
  useEffect(() => {
    if (opponentMode !== 'ai' || gameStatus !== 'playing') return;
    const c = chessRef.current;
    const turn = c.turn();
    if (turn === playerColor) return;

    let cancelled = false;
    setAiThinking(true);

    const think = async () => {
      try {
        const currentFen = c.fen();
        const { moveUci } = await stockfishService.chooseAIMove(currentFen, {
          skillLevel: activeConfig.skillLevel,
          depth: activeConfig.depth,
          thinkTimeMs: activeConfig.thinkTimeMs,
          style: activeConfig.style,
        });
        if (cancelled || !moveUci || chessRef.current.fen() !== currentFen) return;

        const from = moveUci.slice(0, 2);
        const to = moveUci.slice(2, 4);
        const promo = moveUci.length > 4 ? (moveUci[4] as PieceType) : undefined;
        applyChessMove(from, to, promo);
      } catch {
        // Fallback: pick a legal move if worker errored
        if (!cancelled) {
          const legal = chessRef.current.moves({ verbose: true });
          if (legal.length > 0) {
            const pick = legal[Math.floor(Math.random() * legal.length)];
            applyChessMove(pick.from, pick.to, pick.promotion as PieceType | undefined);
          }
        }
      } finally {
        if (!cancelled) setAiThinking(false);
      }
    };

    const delayTimer = window.setTimeout(think, 180);
    return () => {
      cancelled = true;
      clearTimeout(delayTimer);
    };
  }, [fen, opponentMode, gameStatus, playerColor, activeConfig, applyChessMove]);

  const handleUndo = () => {
    if (gameStatus !== 'playing' || moves.length === 0 || aiThinking) return;
    if (opponentMode === 'ai' && isRatedMatch && !takebackUsedRef.current) {
      takebackUsedRef.current = true;
      setCopiedNotice('Takeback used — this game will no longer be rated.');
      setTimeout(() => setCopiedNotice(null), 3500);
    }
    const pliesToUndo = opponentMode === 'ai' && moves.length >= 2 ? 2 : 1;
    for (let i = 0; i < pliesToUndo; i++) {
      chessRef.current.undo();
    }
    const nextMoves = moves.slice(0, moves.length - pliesToUndo);
    setMoves(nextMoves);
    setFen(chessRef.current.fen());
    setViewPly(nextMoves.length);
  };

  const handleOfferDraw = () => {
    if (gameStatus !== 'playing') return;
    if (opponentMode === 'local') {
      finishMatch('1/2-1/2', 'Mutual Agreement', moves);
      return;
    }
    // Against Stockfish: accept draw if material/position is balanced after move 20
    const mat = computeMaterialFromFen(fen);
    const aiAdv = playerColor === 'w' ? -mat.whiteAdvantage : mat.whiteAdvantage;
    if (moves.length >= 24 && aiAdv <= 0) {
      finishMatch('1/2-1/2', 'Draw Accepted by Stockfish', moves);
    } else {
      setDrawOfferedByAI(false);
      setCopiedNotice('Stockfish declined the draw offer.');
      setTimeout(() => setCopiedNotice(null), 2500);
    }
  };

  // Displayed position when user clicks back in move history
  const displayedFen =
    viewPly === moves.length
      ? fen
      : viewPly === 0
        ? startFen
        : moves[viewPly - 1]?.fenAfter ?? fen;

  const displayedLastMove =
    viewPly > 0 && moves[viewPly - 1]
      ? { from: moves[viewPly - 1].from, to: moves[viewPly - 1].to }
      : null;

  const material = useMemo(() => computeMaterialFromFen(displayedFen), [displayedFen]);
  const openingDetected = useMemo(() => detectOpeningFromMoves(moves), [moves]);

  const topIsBlack = orientation === 'w';
  const topTime = topIsBlack ? blackTimeMs : whiteTimeMs;
  const bottomTime = topIsBlack ? whiteTimeMs : blackTimeMs;
  const currentTurn = chessRef.current.turn();
  const topActive = gameStatus === 'playing' && moves.length > 0 && currentTurn === (topIsBlack ? 'b' : 'w');
  const bottomActive = gameStatus === 'playing' && moves.length > 0 && currentTurn === (topIsBlack ? 'w' : 'b');

  const topName =
    opponentMode === 'ai'
      ? topIsBlack === (playerColor === 'b')
        ? playerName
        : `Stockfish 19 · ${activeConfig.label}`
      : topIsBlack
        ? 'Black (Local)'
        : 'White (Local)';

  const bottomName =
    opponentMode === 'ai'
      ? topIsBlack === (playerColor === 'b')
        ? `Stockfish 19 · ${activeConfig.label}`
        : playerName
      : topIsBlack
        ? 'White (Local)'
        : 'Black (Local)';

  const copyText = (txt: string, label: string) => {
    navigator.clipboard?.writeText(txt);
    setCopiedNotice(`${label} copied`);
    setTimeout(() => setCopiedNotice(null), 2000);
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      {/* Left/Center: Active Arena Board */}
      <div className="xl:col-span-7 flex flex-col items-center gap-3">
        {/* Top Player Strip */}
        <div
          className="w-full flex items-center justify-between px-3 py-2 bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 rounded-xl"
          style={{ maxWidth: preferences.boardSizePx }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-md bg-neutral-200 dark:bg-neutral-800 flex items-center justify-center text-xs font-bold shrink-0">
              {topIsBlack ? 'B' : 'W'}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-neutral-900 dark:text-white truncate">
                {topName}
              </div>
              <div className="flex items-center gap-1 h-4">
                {(topIsBlack ? material.capturedByBlack : material.capturedByWhite).slice(0, 8).map((pt, i) => (
                  <ChessPieceSvg
                    key={`${pt}-${i}`}
                    piece={`${topIsBlack ? 'w' : 'b'}${pt.toUpperCase()}` as PieceCode}
                    setId={preferences.pieceSetId}
                    className="w-3.5 h-3.5"
                  />
                ))}
                {((topIsBlack && material.whiteAdvantage < 0) || (!topIsBlack && material.whiteAdvantage > 0)) && (
                  <span className="text-[11px] font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                    +{Math.abs(material.whiteAdvantage)}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {aiThinking && opponentMode === 'ai' && (topIsBlack !== (playerColor === 'b')) && (
              <span className="text-xs text-neutral-500 dark:text-neutral-400">Thinking…</span>
            )}
            <ChessClock
              timeMs={topTime}
              active={topActive}
              unlimited={selectedTc.category === 'unlimited'}
            />
          </div>
        </div>

        {/* Chessboard */}
        <Chessboard
          fen={displayedFen}
          orientation={orientation}
          preferences={preferences}
          interactive={gameStatus === 'playing' && viewPly === moves.length && !aiThinking}
          allowedColor={opponentMode === 'ai' ? playerColor : 'both'}
          lastMove={displayedLastMove}
          onMove={applyChessMove}
        />

        {/* Bottom Player Strip */}
        <div
          className="w-full flex items-center justify-between px-3 py-2 bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 rounded-xl"
          style={{ maxWidth: preferences.boardSizePx }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-md bg-neutral-200 dark:bg-neutral-800 flex items-center justify-center text-xs font-bold shrink-0">
              {topIsBlack ? 'W' : 'B'}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-neutral-900 dark:text-white truncate">
                {bottomName}
              </div>
              <div className="flex items-center gap-1 h-4">
                {(topIsBlack ? material.capturedByWhite : material.capturedByBlack).slice(0, 8).map((pt, i) => (
                  <ChessPieceSvg
                    key={`${pt}-${i}`}
                    piece={`${topIsBlack ? 'b' : 'w'}${pt.toUpperCase()}` as PieceCode}
                    setId={preferences.pieceSetId}
                    className="w-3.5 h-3.5"
                  />
                ))}
                {((topIsBlack && material.whiteAdvantage > 0) || (!topIsBlack && material.whiteAdvantage < 0)) && (
                  <span className="text-[11px] font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                    +{Math.abs(material.whiteAdvantage)}
                  </span>
                )}
              </div>
            </div>
          </div>

          <ChessClock
            timeMs={bottomTime}
            active={bottomActive}
            unlimited={selectedTc.category === 'unlimited'}
          />
        </div>

        {/* Match Result Banner */}
        {gameStatus === 'finished' && resultText && (
          <div
            className="w-full p-4 rounded-xl bg-emerald-700 text-white flex flex-wrap items-center justify-between gap-3 animate-celebrate"
            style={{ maxWidth: preferences.boardSizePx }}
          >
            <div>
              <div className="text-xs uppercase tracking-wider opacity-85">Match Complete</div>
              <div className="text-base font-semibold flex flex-wrap items-center gap-2">
                <span>{resultText}</span>
                {opponentMode === 'ai' && isRatedMatch && !takebackUsedRef.current && lastRatingDelta && (
                  <span className="px-2 py-0.5 rounded bg-black/25 font-mono text-xs">
                    Elo {lastRatingDelta.delta >= 0 ? `+${lastRatingDelta.delta}` : lastRatingDelta.delta} →{' '}
                    {lastRatingDelta.newRating}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onSendToReview(chessRef.current.pgn(), moves)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-neutral-900 text-xs font-semibold hover:bg-neutral-100 cursor-pointer"
              >
                <ScanSearch className="w-3.5 h-3.5" />
                Game Review
              </button>
              <button
                type="button"
                onClick={() => startNewGame()}
                className="px-3 py-1.5 rounded-lg bg-emerald-900/60 hover:bg-emerald-900 text-white text-xs font-semibold cursor-pointer"
              >
                Play Again
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Right Column: Match Setup, Controls & Move History */}
      <div className="xl:col-span-5 space-y-4">
        {/* Match Controls */}
        <div className="bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
              <Swords className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              Match Setup
            </h2>
            <div className="flex items-center gap-1 p-1 bg-neutral-100 dark:bg-[#11151C] rounded-lg">
              <button
                type="button"
                onClick={() => setOpponentMode('ai')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md cursor-pointer ${
                  opponentMode === 'ai'
                    ? 'bg-white dark:bg-[#1F2633] text-neutral-900 dark:text-white shadow-sm'
                    : 'text-neutral-500'
                }`}
              >
                vs Stockfish 19
              </button>
              <button
                type="button"
                onClick={() => setOpponentMode('local')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md cursor-pointer ${
                  opponentMode === 'local'
                    ? 'bg-white dark:bg-[#1F2633] text-neutral-900 dark:text-white shadow-sm'
                    : 'text-neutral-500'
                }`}
              >
                Self / 2-Player
              </button>
            </div>
          </div>

          {opponentMode === 'ai' && (
            <div className="space-y-3">
              <div>
                <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1.5">
                  Engine Strength Tier
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                  {(
                    ['beginner', 'easy', 'intermediate', 'advanced', 'expert', 'master', 'custom'] as AIDifficultyTier[]
                  ).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTier(t)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium capitalize border transition-colors cursor-pointer ${
                        tier === t
                          ? 'bg-emerald-700 text-white border-emerald-700'
                          : 'bg-neutral-50 dark:bg-[#11151C] text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-neutral-800 hover:border-neutral-400'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1.5">
                  {activeConfig.description}
                </p>
              </div>

              {tier === 'custom' && (
                <div className="p-3 rounded-lg bg-neutral-50 dark:bg-[#11151C] border border-neutral-200 dark:border-neutral-800 space-y-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-700 dark:text-neutral-200">
                    <Sliders className="w-3.5 h-3.5" />
                    Custom Engine Parameters
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <label className="space-y-1">
                      <span className="text-neutral-500 flex justify-between">
                        <span>Skill</span>
                        <span className="font-mono">{customSkill}/20</span>
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={20}
                        value={customSkill}
                        onChange={(e) => setCustomSkill(Number(e.target.value))}
                        className="w-full accent-emerald-600"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-neutral-500 flex justify-between">
                        <span>Depth</span>
                        <span className="font-mono">{customDepth}</span>
                      </span>
                      <input
                        type="range"
                        min={1}
                        max={18}
                        value={customDepth}
                        onChange={(e) => setCustomDepth(Number(e.target.value))}
                        className="w-full accent-emerald-600"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-neutral-500 flex justify-between">
                        <span>Time</span>
                        <span className="font-mono">{customThinkMs}ms</span>
                      </span>
                      <input
                        type="range"
                        min={150}
                        max={3000}
                        step={150}
                        value={customThinkMs}
                        onChange={(e) => setCustomThinkMs(Number(e.target.value))}
                        className="w-full accent-emerald-600"
                      />
                    </label>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400 block mb-1">
                    AI Style
                  </label>
                  <select
                    value={playStyle}
                    onChange={(e) => setPlayStyle(e.target.value as AIPlayStyle)}
                    className="w-full px-2.5 py-1.5 rounded-lg text-xs bg-neutral-50 dark:bg-[#11151C] border border-neutral-200 dark:border-neutral-800"
                  >
                    <option value="balanced">Balanced</option>
                    <option value="aggressive">Aggressive</option>
                    <option value="tactical">Tactical</option>
                    <option value="solid">Solid Positional</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400 block mb-1">
                    Play As
                  </label>
                  <select
                    value={playerSidePref}
                    onChange={(e) => setPlayerSidePref(e.target.value as 'w' | 'b' | 'random')}
                    className="w-full px-2.5 py-1.5 rounded-lg text-xs bg-neutral-50 dark:bg-[#11151C] border border-neutral-200 dark:border-neutral-800"
                  >
                    <option value="w">White</option>
                    <option value="random">Random</option>
                    <option value="b">Black</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400 block mb-1">
              Time Control
            </label>
            <select
              value={selectedTc.id}
              onChange={(e) => {
                const found = TIME_CONTROLS.find((tc) => tc.id === e.target.value);
                if (found) setSelectedTc(found);
              }}
              className="w-full px-3 py-2 rounded-lg text-xs font-medium bg-neutral-50 dark:bg-[#11151C] border border-neutral-200 dark:border-neutral-800"
            >
              {TIME_CONTROLS.map((tc) => (
                <option key={tc.id} value={tc.id}>
                  {tc.label}
                </option>
              ))}
            </select>
          </div>

          {opponentMode === 'ai' && (
            <label className="flex items-center justify-between text-xs font-medium text-neutral-600 dark:text-neutral-300 cursor-pointer">
              <span>Rated Match (updates Atelier Elo)</span>
              <input
                type="checkbox"
                checked={isRatedMatch}
                onChange={(e) => setIsRatedMatch(e.target.checked)}
                className="accent-emerald-600 w-4 h-4"
              />
            </label>
          )}

          <button
            type="button"
            onClick={() => startNewGame()}
            className="w-full py-2.5 px-4 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            Start New Game
          </button>
        </div>

        {/* Opening & Action Toolbar */}
        <div className="bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-neutral-600 dark:text-neutral-300 truncate max-w-[220px]">
            <span className="font-mono font-semibold mr-1.5">{openingDetected.eco}</span>
            <span>{openingDetected.name}</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setOrientation((o) => (o === 'w' ? 'b' : 'w'))}
              className="p-2 rounded-lg bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-xs cursor-pointer"
              title="Flip Board"
              aria-label="Flip Board"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleUndo}
              disabled={gameStatus !== 'playing' || moves.length === 0 || aiThinking}
              className="p-2 rounded-lg bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 disabled:opacity-40 text-xs cursor-pointer"
              title="Takeback Move"
              aria-label="Takeback Move"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleOfferDraw}
              disabled={gameStatus !== 'playing'}
              className="p-2 rounded-lg bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 disabled:opacity-40 text-xs cursor-pointer"
              title="Offer Draw"
              aria-label="Offer Draw"
            >
              <Handshake className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                if (gameStatus === 'playing') {
                  finishMatch(playerColor === 'w' ? '0-1' : '1-0', 'Resignation', moves);
                }
              }}
              disabled={gameStatus !== 'playing'}
              className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 disabled:opacity-40 text-xs cursor-pointer"
              title="Resign"
              aria-label="Resign"
            >
              <Flag className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onAskCoach(displayedFen, chessRef.current.pgn())}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-xs font-medium cursor-pointer"
            >
              <Sparkles className="w-3 h-3" />
              Coach
            </button>
          </div>
        </div>

        {copiedNotice && (
          <div className="text-xs text-emerald-600 dark:text-emerald-400 px-1">{copiedNotice}</div>
        )}
        {drawOfferedByAI && (
          <div className="text-xs text-amber-500 px-1">Draw offered.</div>
        )}

        {/* Move History */}
        <MoveHistory moves={moves} currentPly={viewPly} onSelectPly={setViewPly} />

        {/* FEN / PGN Export */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => copyText(displayedFen, 'FEN')}
            className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-xs font-medium cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5" />
            Copy FEN
          </button>
          <button
            type="button"
            onClick={() => copyText(chessRef.current.pgn() || '*', 'PGN')}
            className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-xs font-medium cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5" />
            Copy PGN
          </button>
        </div>
      </div>
    </div>
  );
};
