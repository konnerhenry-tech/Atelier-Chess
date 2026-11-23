import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Chess, Move, Square } from 'chess.js';
import { BOARD_THEMES } from '../data/boardThemes';
import { ChessPieceSvg } from '../data/pieceSets';
import { BoardPreferences, PieceCode, PieceColor, PieceType } from '../types/chess';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'] as const;

export interface BoardArrow {
  from: string;
  to: string;
  color?: string;
}

interface ChessboardProps {
  fen: string;
  orientation?: PieceColor;
  preferences: BoardPreferences;
  interactive?: boolean;
  allowedColor?: PieceColor | 'both' | 'none';
  lastMove?: { from: string; to: string } | null;
  onMove?: (from: string, to: string, promotion?: PieceType) => boolean | void;
  arrows?: BoardArrow[];
  highlightedSquares?: Record<string, string>;
  blindfold?: boolean;
  sizeOverridePx?: number;
  editorSelectedPiece?: PieceCode | 'erase' | null;
  onEditorSquareAction?: (square: string) => void;
  disableContextArrows?: boolean;
}

interface DragState {
  from: Square;
  piece: PieceCode;
  clientX: number;
  clientY: number;
  squareSize: number;
}

interface PromotionPending {
  from: Square;
  to: Square;
  color: PieceColor;
}

function squareToGrid(sq: string, orientation: PieceColor): { col: number; row: number } {
  const fileIdx = FILES.indexOf(sq[0] as (typeof FILES)[number]);
  const rankIdx = RANKS.indexOf(sq[1] as (typeof RANKS)[number]);
  if (orientation === 'w') {
    return { col: fileIdx, row: rankIdx };
  }
  return { col: 7 - fileIdx, row: 7 - rankIdx };
}

export const Chessboard: React.FC<ChessboardProps> = ({
  fen,
  orientation = 'w',
  preferences,
  interactive = true,
  allowedColor = 'both',
  lastMove = null,
  onMove,
  arrows = [],
  highlightedSquares = {},
  blindfold = false,
  sizeOverridePx,
  editorSelectedPiece = null,
  onEditorSquareAction,
  disableContextArrows = false,
}) => {
  // Unique per board instance so SVG arrowhead ids never collide when several boards
  // are on the page (a duplicate id makes every board use the first board's marker).
  const boardUid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const boardRef = useRef<HTMLDivElement>(null);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [hoverSquare, setHoverSquare] = useState<Square | null>(null);
  const [promotionPending, setPromotionPending] = useState<PromotionPending | null>(null);
  const [userArrows, setUserArrows] = useState<BoardArrow[]>([]);
  const [userMarks, setUserMarks] = useState<Record<string, boolean>>({});
  const rightDragStart = useRef<string | null>(null);
  const dragMovedEnough = useRef(false);
  const dragStartCoords = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const baseTheme = useMemo(
    () => BOARD_THEMES.find((t) => t.id === preferences.boardThemeId) || BOARD_THEMES[0],
    [preferences.boardThemeId]
  );

  const theme = useMemo(() => {
    if (!preferences.useCustomColors) return baseTheme;
    return {
      ...baseTheme,
      light: preferences.customLightHex || baseTheme.light,
      dark: preferences.customDarkHex || baseTheme.dark,
    };
  }, [baseTheme, preferences.useCustomColors, preferences.customLightHex, preferences.customDarkHex]);

  // Parse board state safely
  const { chess, boardGrid, inCheckSquare } = useMemo(() => {
    const instance = new Chess();
    try {
      instance.load(fen);
    } catch {
      // Fallback for custom editor FENs without both kings: parse piece placement manually
      const fallbackGrid: ({ type: PieceType; color: PieceColor } | null)[][] = Array.from(
        { length: 8 },
        () => Array(8).fill(null)
      );
      const placement = fen.split(' ')[0] || '';
      const rows = placement.split('/');
      rows.forEach((rowStr, rIdx) => {
        if (rIdx >= 8) return;
        let cIdx = 0;
        for (const ch of rowStr) {
          if (cIdx >= 8) break;
          if (/[1-8]/.test(ch)) {
            cIdx += parseInt(ch, 10);
          } else {
            const color: PieceColor = ch === ch.toUpperCase() ? 'w' : 'b';
            const type = ch.toLowerCase() as PieceType;
            fallbackGrid[rIdx][cIdx] = { type, color };
            cIdx++;
          }
        }
      });
      return { chess: null, boardGrid: fallbackGrid, inCheckSquare: null as Square | null };
    }

    const grid = instance.board();
    let checkSq: Square | null = null;
    if (instance.inCheck()) {
      const turn = instance.turn();
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const p = grid[r][c];
          if (p && p.type === 'k' && p.color === turn) {
            checkSq = `${FILES[c]}${RANKS[r]}` as Square;
          }
        }
      }
    }
    return { chess: instance, boardGrid: grid, inCheckSquare: checkSq };
  }, [fen]);

  // Clear selection when FEN changes
  useEffect(() => {
    setSelectedSquare(null);
    setPromotionPending(null);
    setDragState(null);
    setUserArrows([]);
    setUserMarks({});
  }, [fen]);

  const legalMovesForSelected = useMemo<Move[]>(() => {
    if (!chess || !selectedSquare || !interactive) return [];
    const turn = chess.turn();
    if (allowedColor !== 'both' && allowedColor !== turn) return [];
    try {
      return chess.moves({ square: selectedSquare, verbose: true });
    } catch {
      return [];
    }
  }, [chess, selectedSquare, interactive, allowedColor]);

  const legalTargetMap = useMemo(() => {
    const map = new Map<string, Move[]>();
    for (const m of legalMovesForSelected) {
      const existing = map.get(m.to) || [];
      existing.push(m);
      map.set(m.to, existing);
    }
    return map;
  }, [legalMovesForSelected]);

  const getSquareFromPoint = useCallback(
    (clientX: number, clientY: number): Square | null => {
      const el = boardRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
        return null;
      }
      const col = Math.floor(((clientX - rect.left) / rect.width) * 8);
      const row = Math.floor(((clientY - rect.top) / rect.height) * 8);
      if (col < 0 || col > 7 || row < 0 || row > 7) return null;
      const file = orientation === 'w' ? FILES[col] : FILES[7 - col];
      const rank = orientation === 'w' ? RANKS[row] : RANKS[7 - row];
      return `${file}${rank}` as Square;
    },
    [orientation]
  );

  const attemptMove = useCallback(
    (from: Square, to: Square) => {
      if (!chess || !interactive || !onMove) return false;
      const turn = chess.turn();
      if (allowedColor !== 'both' && allowedColor !== turn) return false;

      const candidates = chess.moves({ square: from, verbose: true }).filter((m) => m.to === to);
      if (candidates.length === 0) {
        return false;
      }

      const isPromo = candidates.some((m) => Boolean(m.promotion));
      if (isPromo) {
        if (preferences.autoQueen) {
          onMove(from, to, 'q');
          setSelectedSquare(null);
          return true;
        }
        setPromotionPending({ from, to, color: turn });
        return true;
      }

      onMove(from, to);
      setSelectedSquare(null);
      return true;
    },
    [chess, interactive, onMove, allowedColor, preferences.autoQueen]
  );

  const canDragPiece = useCallback(
    (pieceColor: PieceColor): boolean => {
      if (!interactive || !chess) return false;
      if (allowedColor === 'none') return false;
      if (allowedColor !== 'both' && allowedColor !== pieceColor) return false;
      return chess.turn() === pieceColor;
    },
    [interactive, chess, allowedColor]
  );

  const handlePointerDown = (e: React.PointerEvent, sq: Square, piece: { type: PieceType; color: PieceColor } | null) => {
    // Handle Board Editor click directly
    if (editorSelectedPiece && onEditorSquareAction && e.button === 0) {
      e.preventDefault();
      onEditorSquareAction(sq);
      return;
    }

    // Right-click for arrows / highlights
    if (e.button === 2) {
      if (!disableContextArrows && preferences.enableArrows !== false) {
        rightDragStart.current = sq;
      }
      return;
    }

    if (e.button !== 0 || !interactive) return;

    // Clear user annotations on left click
    if (userArrows.length > 0 || Object.keys(userMarks).length > 0) {
      setUserArrows([]);
      setUserMarks({});
    }

    // Check if clicking a legal target of already-selected piece
    if (selectedSquare && legalTargetMap.has(sq)) {
      attemptMove(selectedSquare, sq);
      return;
    }

    // Castling convenience: if King is selected and user clicks own rook on castling target
    if (selectedSquare && chess) {
      const selPiece = chess.get(selectedSquare);
      if (selPiece?.type === 'k' && piece?.type === 'r' && piece.color === selPiece.color) {
        const rank = selPiece.color === 'w' ? '1' : '8';
        if (sq === `h${rank}` && legalTargetMap.has(`g${rank}`)) {
          attemptMove(selectedSquare, `g${rank}` as Square);
          return;
        }
        if (sq === `a${rank}` && legalTargetMap.has(`c${rank}`)) {
          attemptMove(selectedSquare, `c${rank}` as Square);
          return;
        }
      }
    }

    // Otherwise select & start drag if movable piece
    if (piece && canDragPiece(piece.color)) {
      const pieceCode = `${piece.color}${piece.type.toUpperCase()}` as PieceCode;
      const rect = boardRef.current?.getBoundingClientRect();
      const squareSize = rect ? rect.width / 8 : 64;
      setSelectedSquare(sq);
      dragStartCoords.current = { x: e.clientX, y: e.clientY };
      dragMovedEnough.current = false;
      setDragState({
        from: sq,
        piece: pieceCode,
        clientX: e.clientX,
        clientY: e.clientY,
        squareSize,
      });
    } else {
      setSelectedSquare(null);
    }
  };

  useEffect(() => {
    if (!dragState) return;

    const handlePointerMove = (e: PointerEvent) => {
      const dx = e.clientX - dragStartCoords.current.x;
      const dy = e.clientY - dragStartCoords.current.y;
      if (Math.hypot(dx, dy) > 4) {
        dragMovedEnough.current = true;
      }
      setDragState((prev) => (prev ? { ...prev, clientX: e.clientX, clientY: e.clientY } : null));
      setHoverSquare(getSquareFromPoint(e.clientX, e.clientY));
    };

    const handlePointerUp = (e: PointerEvent) => {
      const targetSq = getSquareFromPoint(e.clientX, e.clientY);
      if (targetSq && targetSq !== dragState.from && dragMovedEnough.current) {
        attemptMove(dragState.from, targetSq);
      }
      setDragState(null);
      setHoverSquare(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [dragState, getSquareFromPoint, attemptMove]);

  const arrowRgba =
    preferences.arrowColor === 'amber'
      ? 'rgba(245, 158, 11, 0.85)'
      : preferences.arrowColor === 'sky'
        ? 'rgba(56, 189, 248, 0.85)'
        : preferences.arrowColor === 'rose'
          ? 'rgba(244, 63, 94, 0.85)'
          : 'rgba(16, 185, 129, 0.85)';

  const handleContextUp = (sq: Square) => {
    if (disableContextArrows || preferences.enableArrows === false || !rightDragStart.current) return;
    const startSq = rightDragStart.current;
    rightDragStart.current = null;
    if (startSq === sq) {
      setUserMarks((prev) => ({ ...prev, [sq]: !prev[sq] }));
    } else {
      setUserArrows((prev) => {
        const exists = prev.some((a) => a.from === startSq && a.to === sq);
        if (exists) {
          return prev.filter((a) => !(a.from === startSq && a.to === sq));
        }
        return [...prev, { from: startSq, to: sq, color: arrowRgba }];
      });
    }
  };

  const displayRanks = orientation === 'w' ? RANKS : [...RANKS].reverse();
  const displayFiles = orientation === 'w' ? FILES : [...FILES].reverse();

  const boardPx = sizeOverridePx ?? preferences.boardSizePx;
  const isOutsideCoords = preferences.coordinateMode === 'outside';

  const transitionMs =
    preferences.animationSpeed === 'instant'
      ? 0
      : preferences.animationSpeed === 'fast'
        ? 90
        : preferences.animationSpeed === 'normal'
          ? 160
          : 240;

  const allArrows = [...arrows, ...userArrows];

  const cornerClass =
    preferences.boardCornerStyle === 'sharp'
      ? 'rounded-none'
      : preferences.boardCornerStyle === 'rounded'
        ? 'rounded-2xl'
        : 'rounded-lg';

  const textureOverlay =
    preferences.boardTexture === 'wood-grain'
      ? 'repeating-linear-gradient(15deg, rgba(255,255,255,0.035) 0px, rgba(255,255,255,0.035) 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 6px)'
      : preferences.boardTexture === 'slate'
        ? 'radial-gradient(circle at 25% 25%, rgba(255,255,255,0.12), transparent 55%), radial-gradient(circle at 75% 75%, rgba(0,0,0,0.14), transparent 55%)'
        : preferences.boardTexture === 'linen'
          ? 'repeating-linear-gradient(0deg, rgba(255,255,255,0.04) 0px, rgba(255,255,255,0.04) 1px, transparent 1px, transparent 4px), repeating-linear-gradient(90deg, rgba(0,0,0,0.04) 0px, rgba(0,0,0,0.04) 1px, transparent 1px, transparent 4px)'
          : theme.textureCss;

  return (
    <div
      className="relative select-none touch-none mx-auto"
      style={{
        width: `min(100%, ${boardPx}px)`,
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        className={`${cornerClass} overflow-hidden shadow-lg border transition-colors`}
        style={{
          backgroundColor: theme.frameBg,
          borderColor: theme.border,
          padding: isOutsideCoords ? '18px' : '4px',
        }}
      >
        {/* Outside Top File Coordinates */}
        {isOutsideCoords && (
          <div className="grid grid-cols-8 px-0 mb-1">
            {displayFiles.map((f) => (
              <div
                key={`top-${f}`}
                className="text-center text-[11px] font-mono font-semibold uppercase tracking-wider leading-none"
                style={{ color: theme.frameText }}
              >
                {f}
              </div>
            ))}
          </div>
        )}

        <div className="relative flex items-stretch">
          {/* Outside Left Rank Coordinates */}
          {isOutsideCoords && (
            <div className="grid grid-rows-8 pr-1.5 -ml-3.5 w-3.5">
              {displayRanks.map((r) => (
                <div
                  key={`left-${r}`}
                  className="flex items-center justify-center text-[11px] font-mono font-semibold leading-none"
                  style={{ color: theme.frameText }}
                >
                  {r}
                </div>
              ))}
            </div>
          )}

          {/* 8x8 Grid */}
          <div
            ref={boardRef}
            className={`relative grid grid-cols-8 grid-rows-8 w-full aspect-square ${
              preferences.boardCornerStyle === 'sharp' ? 'rounded-none' : 'rounded-[3px]'
            } overflow-hidden`}
            style={{
              backgroundImage: textureOverlay,
            }}
          >
            {displayRanks.map((rank, visualRow) =>
              displayFiles.map((file, visualCol) => {
                const sq = `${file}${rank}` as Square;
                const boardRow = RANKS.indexOf(rank);
                const boardCol = FILES.indexOf(file);
                const isLight = (boardRow + boardCol) % 2 === 0;
                const piece = boardGrid[boardRow]?.[boardCol] ?? null;

                const isLastFrom = preferences.showLastMove && lastMove?.from === sq;
                const isLastTo = preferences.showLastMove && lastMove?.to === sq;
                const isSelected = selectedSquare === sq;
                const isLegalTarget = preferences.showLegalMoves && legalTargetMap.has(sq);
                const isCheck = inCheckSquare === sq;
                const isHover = dragState && hoverSquare === sq && legalTargetMap.has(sq);
                const isBeingDragged = dragState?.from === sq && dragMovedEnough.current;
                const customMark = highlightedSquares[sq];
                const isUserMarked = userMarks[sq];

                const showInsideRank = preferences.coordinateMode === 'inside' && visualCol === 0;
                const showInsideFile = preferences.coordinateMode === 'inside' && visualRow === 7;
                const coordColor = isLight ? theme.dark : theme.light;

                return (
                  <div
                    key={sq}
                    data-square={sq}
                    onPointerDown={(e) => handlePointerDown(e, sq, piece)}
                    onPointerUp={(e) => {
                      if (e.button === 2) handleContextUp(sq);
                    }}
                    className={`relative flex items-center justify-center ${
                      interactive && (piece || isLegalTarget || editorSelectedPiece) ? 'cursor-pointer' : ''
                    }`}
                    style={{
                      backgroundColor: isLight ? theme.light : theme.dark,
                    }}
                  >
                    {/* Last move highlight */}
                    {(isLastFrom || isLastTo) && (
                      <div
                        className="absolute inset-0 pointer-events-none"
                        style={{
                          backgroundColor: isLastTo ? theme.highlightTo : theme.highlightFrom,
                        }}
                      />
                    )}

                    {/* Selected highlight */}
                    {isSelected && (
                      <div
                        className="absolute inset-0 pointer-events-none"
                        style={{
                          backgroundColor:
                            preferences.highlightStyle === 'subtle'
                              ? 'rgba(16, 185, 129, 0.22)'
                              : preferences.highlightStyle === 'ring'
                                ? 'transparent'
                                : theme.selected,
                          boxShadow:
                            preferences.highlightStyle === 'border'
                              ? 'inset 0 0 0 3px rgba(255,255,255,0.88)'
                              : preferences.highlightStyle === 'ring'
                                ? 'inset 0 0 0 3px rgba(16, 185, 129, 0.9)'
                                : undefined,
                        }}
                      />
                    )}

                    {/* Custom or right-click square highlight */}
                    {(customMark || isUserMarked) && (
                      <div
                        className="absolute inset-0 pointer-events-none"
                        style={{
                          backgroundColor: customMark || 'rgba(239, 68, 68, 0.45)',
                        }}
                      />
                    )}

                    {/* King in check glow */}
                    {isCheck && (
                      <div className="absolute inset-0 pointer-events-none animate-check-pulse" />
                    )}

                    {/* Drag hover target ring */}
                    {isHover && (
                      <div
                        className="absolute inset-0 pointer-events-none ring-2 ring-inset ring-white/80"
                        style={{ backgroundColor: 'rgba(16, 185, 129, 0.22)' }}
                      />
                    )}

                    {/* Coordinates inside square */}
                    {showInsideRank && (
                      <span
                        className="absolute top-0.5 left-1 text-[10px] font-mono font-bold leading-none pointer-events-none select-none"
                        style={{ color: coordColor }}
                      >
                        {rank}
                      </span>
                    )}
                    {showInsideFile && (
                      <span
                        className="absolute bottom-0.5 right-1 text-[10px] font-mono font-bold leading-none pointer-events-none select-none"
                        style={{ color: coordColor }}
                      >
                        {file}
                      </span>
                    )}

                    {/* Chess Piece */}
                    {piece && !isBeingDragged && !blindfold && (
                      <div
                        className="relative z-10 w-[86%] h-[86%] pointer-events-none"
                        style={{
                          transition: `transform ${transitionMs}ms cubic-bezier(0.16, 1, 0.3, 1)`,
                        }}
                      >
                        <ChessPieceSvg
                          piece={`${piece.color}${piece.type.toUpperCase()}` as PieceCode}
                          setId={preferences.pieceSetId}
                          className={`w-full h-full ${
                            preferences.pieceDropShadow !== false
                              ? 'drop-shadow-[0_2px_3px_rgba(0,0,0,0.28)]'
                              : ''
                          }`}
                        />
                      </div>
                    )}

                    {/* Legal move indicator */}
                    {isLegalTarget && (
                      <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                        {piece ? (
                          <div
                            className="w-[88%] h-[88%] rounded-full border-[4px]"
                            style={{ borderColor: theme.legalDot }}
                          />
                        ) : (
                          <div
                            className="w-[28%] h-[28%] rounded-full"
                            style={{ backgroundColor: theme.legalDot }}
                          />
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {/* SVG Arrow Overlay Layer */}
            {allArrows.length > 0 && (
              <svg
                viewBox="0 0 800 800"
                className="absolute inset-0 w-full h-full pointer-events-none z-30"
              >
                <defs>
                  {allArrows.map((arrow, idx) => (
                    <marker
                      key={`marker-${idx}`}
                      id={`${boardUid}-arrowhead-${idx}`}
                      markerWidth="4"
                      markerHeight="4"
                      refX="2.4"
                      refY="2"
                      orient="auto"
                    >
                      <polygon points="0 0, 4 2, 0 4" fill={arrow.color || 'rgba(16, 185, 129, 0.85)'} />
                    </marker>
                  ))}
                </defs>
                {allArrows.map((arrow, idx) => {
                  const fromPos = squareToGrid(arrow.from, orientation);
                  const toPos = squareToGrid(arrow.to, orientation);
                  const x1 = fromPos.col * 100 + 50;
                  const y1 = fromPos.row * 100 + 50;
                  const x2 = toPos.col * 100 + 50;
                  const y2 = toPos.row * 100 + 50;
                  const dx = x2 - x1;
                  const dy = y2 - y1;
                  const len = Math.hypot(dx, dy) || 1;
                  const shorten = 18;
                  const ex = x2 - (dx / len) * shorten;
                  const ey = y2 - (dy / len) * shorten;

                  return (
                    <line
                      key={`arrow-${arrow.from}-${arrow.to}-${idx}`}
                      x1={x1}
                      y1={y1}
                      x2={ex}
                      y2={ey}
                      stroke={arrow.color || 'rgba(16, 185, 129, 0.85)'}
                      strokeWidth="13"
                      strokeLinecap="round"
                      markerEnd={`url(#${boardUid}-arrowhead-${idx})`}
                    />
                  );
                })}
              </svg>
            )}

            {/* Pawn Promotion Selector Overlay */}
            {promotionPending && (
              <div
                className="absolute inset-0 z-40 bg-black/55 backdrop-blur-[2px] flex items-center justify-center p-4"
                onClick={() => setPromotionPending(null)}
              >
                <div
                  className="bg-white dark:bg-[#171C24] border border-neutral-200 dark:border-neutral-700 rounded-xl p-3 shadow-2xl flex items-center gap-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300 px-2 whitespace-nowrap">
                    Promote to
                  </span>
                  {(['q', 'r', 'b', 'n'] as PieceType[]).map((pt) => (
                    <button
                      key={pt}
                      type="button"
                      onClick={() => {
                        onMove?.(promotionPending.from, promotionPending.to, pt);
                        setPromotionPending(null);
                        setSelectedSquare(null);
                      }}
                      className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg bg-neutral-100 hover:bg-emerald-500/20 dark:bg-neutral-800 dark:hover:bg-emerald-500/25 border border-neutral-200 dark:border-neutral-700 flex items-center justify-center transition-transform hover:scale-105 cursor-pointer"
                      aria-label={`Promote to ${pt.toUpperCase()}`}
                    >
                      <ChessPieceSvg
                        piece={`${promotionPending.color}${pt.toUpperCase()}` as PieceCode}
                        setId={preferences.pieceSetId}
                        className="w-10 h-10"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Floating Dragged Piece */}
      {dragState && dragMovedEnough.current && (
        <div
          className="fixed z-50 pointer-events-none"
          style={{
            left: dragState.clientX - dragState.squareSize * 0.48,
            top: dragState.clientY - dragState.squareSize * 0.48,
            width: dragState.squareSize * 0.96,
            height: dragState.squareSize * 0.96,
          }}
        >
          <ChessPieceSvg
            piece={dragState.piece}
            setId={preferences.pieceSetId}
            className="w-full h-full drop-shadow-[0_10px_14px_rgba(0,0,0,0.45)] scale-110"
          />
        </div>
      )}
    </div>
  );
};
