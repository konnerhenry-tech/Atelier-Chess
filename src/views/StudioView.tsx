import React, { useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import { BookmarkPlus, Check, RotateCcw, Trash2, Volume2, VolumeX } from 'lucide-react';
import { Chessboard } from '../components/Chessboard';
import { BOARD_THEMES } from '../data/boardThemes';
import { ChessPieceSvg, PIECE_SETS } from '../data/pieceSets';
import {
  AnimationSpeed,
  ArrowColorPreset,
  BoardCornerStyle,
  BoardPreferences,
  BoardTextureStyle,
  CoordinateMode,
  CustomizationPreset,
  HighlightStyle,
  PieceCode,
  PieceType,
  SoundPackStyle,
} from '../types/chess';
import { soundEngine } from '../utils/soundEngine';

interface StudioViewProps {
  preferences: BoardPreferences;
  presets: CustomizationPreset[];
  onUpdate: (patch: Partial<BoardPreferences>) => void;
  onReset: () => void;
  onSavePreset: (name: string) => void;
  onDeletePreset: (id: string) => void;
}

const THEME_CATEGORIES = [
  'All',
  'Wood',
  'Tournament',
  'Blue & Cyan',
  'Purple & Midnight',
  'Marble & Gold',
  'Neon & Retro',
  'Minimalist & Glass',
  'Nature & Contrast',
] as const;

export const StudioView: React.FC<StudioViewProps> = ({
  preferences,
  presets,
  onUpdate,
  onReset,
  onSavePreset,
  onDeletePreset,
}) => {
  const [previewChess] = useState(() => new Chess('r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4'));
  const [previewFen, setPreviewFen] = useState(previewChess.fen());
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>({
    from: 'f1',
    to: 'c4',
  });
  const [themeFilter, setThemeFilter] = useState<string>('All');
  const [pieceFilter, setPieceFilter] = useState<string>('All');
  const [presetName, setPresetName] = useState('');
  const [activeTab, setActiveTab] = useState<'themes' | 'pieces' | 'behavior'>('themes');

  const filteredThemes = useMemo(
    () =>
      themeFilter === 'All'
        ? BOARD_THEMES
        : BOARD_THEMES.filter((t) => t.category === themeFilter),
    [themeFilter]
  );

  const filteredPieceSets = useMemo(
    () =>
      pieceFilter === 'All'
        ? PIECE_SETS
        : PIECE_SETS.filter((s) => s.category === pieceFilter),
    [pieceFilter]
  );

  const handlePreviewMove = (from: string, to: string, promotion?: PieceType) => {
    try {
      const m = previewChess.move({ from, to, promotion });
      if (!m) return false;
      setPreviewFen(previewChess.fen());
      setLastMove({ from: m.from, to: m.to });
      soundEngine.play(m.captured ? 'capture' : 'move');
      return true;
    } catch {
      return false;
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      {/* Live Interactive Preview Column */}
      <div className="xl:col-span-5 xl:sticky xl:top-20 space-y-4">
        <div className="bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
                Customization Studio
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {BOARD_THEMES.length} board themes · {PIECE_SETS.length} vector piece sets
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                previewChess.load('r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4');
                setPreviewFen(previewChess.fen());
                setLastMove({ from: 'f1', to: 'c4' });
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-xs font-medium cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Preview
            </button>
          </div>

          <Chessboard
            fen={previewFen}
            preferences={preferences}
            sizeOverridePx={Math.min(440, preferences.boardSizePx)}
            lastMove={lastMove}
            onMove={handlePreviewMove}
          />

          {/* Presets Bar */}
          <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800 space-y-3">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="Save current setup as preset…"
                className="flex-1 px-3 py-1.5 rounded-lg text-xs bg-neutral-50 dark:bg-[#11151C] border border-neutral-200 dark:border-neutral-800"
              />
              <button
                type="button"
                onClick={() => {
                  if (presetName.trim()) {
                    onSavePreset(presetName);
                    setPresetName('');
                  }
                }}
                disabled={!presetName.trim()}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold disabled:opacity-40 cursor-pointer"
              >
                <BookmarkPlus className="w-3.5 h-3.5" />
                Save
              </button>
              <button
                type="button"
                onClick={onReset}
                className="px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 text-xs font-medium cursor-pointer"
              >
                Defaults
              </button>
            </div>

            {presets.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {presets.map((p) => (
                  <div
                    key={p.id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-xs"
                  >
                    <button
                      type="button"
                      onClick={() => onUpdate(p.preferences)}
                      className="font-medium hover:text-emerald-600 dark:hover:text-emerald-400 cursor-pointer"
                    >
                      {p.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeletePreset(p.id)}
                      className="text-neutral-400 hover:text-red-500 cursor-pointer"
                      aria-label={`Delete preset ${p.name}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right Column: Themes, Piece Sets, Animation & Audio Controls */}
      <div className="xl:col-span-7 bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 space-y-5">
        <div className="flex items-center gap-1 p-1 bg-neutral-100 dark:bg-[#11151C] rounded-xl w-fit">
          <button
            type="button"
            onClick={() => setActiveTab('themes')}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
              activeTab === 'themes'
                ? 'bg-white dark:bg-[#1F2633] text-neutral-900 dark:text-white shadow-sm'
                : 'text-neutral-500'
            }`}
          >
            Board Themes ({BOARD_THEMES.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('pieces')}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
              activeTab === 'pieces'
                ? 'bg-white dark:bg-[#1F2633] text-neutral-900 dark:text-white shadow-sm'
                : 'text-neutral-500'
            }`}
          >
            Piece Sets ({PIECE_SETS.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('behavior')}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
              activeTab === 'behavior'
                ? 'bg-white dark:bg-[#1F2633] text-neutral-900 dark:text-white shadow-sm'
                : 'text-neutral-500'
            }`}
          >
            Motion, Audio & Display
          </button>
        </div>

        {/* 32 Board Themes */}
        {activeTab === 'themes' && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-1.5">
              {THEME_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setThemeFilter(cat)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer ${
                    themeFilter === cat
                      ? 'bg-emerald-700 text-white'
                      : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-[#11151C] border border-neutral-200 dark:border-neutral-800 space-y-3">
              <label className="flex items-center justify-between text-xs font-semibold cursor-pointer">
                <span>Custom Square Color Override</span>
                <input
                  type="checkbox"
                  checked={preferences.useCustomColors}
                  onChange={(e) => onUpdate({ useCustomColors: e.target.checked })}
                  className="accent-emerald-600 w-4 h-4"
                />
              </label>
              {preferences.useCustomColors && (
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <label className="flex items-center justify-between gap-2 p-2 rounded-lg bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800">
                    <span>Light Squares</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px]">{preferences.customLightHex}</span>
                      <input
                        type="color"
                        value={preferences.customLightHex}
                        onChange={(e) => onUpdate({ customLightHex: e.target.value })}
                        className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent"
                      />
                    </div>
                  </label>
                  <label className="flex items-center justify-between gap-2 p-2 rounded-lg bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800">
                    <span>Dark Squares</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px]">{preferences.customDarkHex}</span>
                      <input
                        type="color"
                        value={preferences.customDarkHex}
                        onChange={(e) => onUpdate({ customDarkHex: e.target.value })}
                        className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent"
                      />
                    </div>
                  </label>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {filteredThemes.map((t) => {
                const active = !preferences.useCustomColors && preferences.boardThemeId === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onUpdate({ boardThemeId: t.id, useCustomColors: false })}
                    className={`group text-left rounded-xl p-2 border transition-all cursor-pointer ${
                      active
                        ? 'border-emerald-600 ring-2 ring-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-950/20'
                        : 'border-neutral-200 dark:border-neutral-800 hover:border-neutral-400'
                    }`}
                  >
                    <div className="grid grid-cols-4 grid-rows-2 h-12 rounded-md overflow-hidden border border-black/15">
                      {[0, 1, 2, 3, 4, 5, 6, 7].map((idx) => {
                        const r = Math.floor(idx / 4);
                        const c = idx % 4;
                        const isLight = (r + c) % 2 === 0;
                        return (
                          <div
                            key={idx}
                            style={{ backgroundColor: isLight ? t.light : t.dark }}
                          />
                        );
                      })}
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-1">
                      <span className="text-xs font-medium text-neutral-800 dark:text-neutral-200 truncate">
                        {t.name}
                      </span>
                      {active && <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 22 Complete SVG Piece Sets */}
        {activeTab === 'pieces' && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-1.5">
              {['All', 'Classic', 'Modern', 'Luxury', 'Artistic', 'High Contrast'].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setPieceFilter(cat)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer ${
                    pieceFilter === cat
                      ? 'bg-emerald-700 text-white'
                      : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredPieceSets.map((set) => {
                const active = preferences.pieceSetId === set.id;
                const samplePieces: PieceCode[] = ['wK', 'wQ', 'wN', 'bK', 'bR', 'bP'];
                return (
                  <button
                    key={set.id}
                    type="button"
                    onClick={() => onUpdate({ pieceSetId: set.id })}
                    className={`text-left p-3 rounded-xl border transition-all cursor-pointer ${
                      active
                        ? 'border-emerald-600 ring-2 ring-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-950/20'
                        : 'border-neutral-200 dark:border-neutral-800 hover:border-neutral-400'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-neutral-900 dark:text-white">
                        {set.name}
                      </span>
                      <span className="text-[11px] text-neutral-500">{set.category}</span>
                    </div>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 line-clamp-1">
                      {set.description}
                    </p>
                    <div className="mt-2.5 grid grid-cols-6 gap-1 bg-neutral-200/70 dark:bg-[#11151C] rounded-lg p-1.5">
                      {samplePieces.map((code) => (
                        <div key={code} className="aspect-square flex items-center justify-center">
                          <ChessPieceSvg piece={code} setId={set.id} className="w-7 h-7" />
                        </div>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Motion, Audio & Display Controls */}
        {activeTab === 'behavior' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
                Board Display & Highlights
              </h3>

              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300 flex justify-between">
                  <span>Board Size</span>
                  <span className="font-mono">{preferences.boardSizePx}px</span>
                </span>
                <input
                  type="range"
                  min={360}
                  max={720}
                  step={20}
                  value={preferences.boardSizePx}
                  onChange={(e) => onUpdate({ boardSizePx: Number(e.target.value) })}
                  className="w-full accent-emerald-600"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
                  Coordinates
                </span>
                <select
                  value={preferences.coordinateMode}
                  onChange={(e) => onUpdate({ coordinateMode: e.target.value as CoordinateMode })}
                  className="w-full px-3 py-2 rounded-lg text-xs bg-neutral-50 dark:bg-[#11151C] border border-neutral-200 dark:border-neutral-800"
                >
                  <option value="inside">Inside Squares</option>
                  <option value="outside">Outside Frame</option>
                  <option value="none">Hidden</option>
                </select>
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
                  Selection Highlight Style
                </span>
                <select
                  value={preferences.highlightStyle}
                  onChange={(e) => onUpdate({ highlightStyle: e.target.value as HighlightStyle })}
                  className="w-full px-3 py-2 rounded-lg text-xs bg-neutral-50 dark:bg-[#11151C] border border-neutral-200 dark:border-neutral-800"
                >
                  <option value="classic">Classic Fill</option>
                  <option value="border">Crisp Inner Border</option>
                  <option value="ring">Soft Ring</option>
                  <option value="subtle">Subtle Tint</option>
                </select>
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
                  Board Frame Corners
                </span>
                <select
                  value={preferences.boardCornerStyle}
                  onChange={(e) => onUpdate({ boardCornerStyle: e.target.value as BoardCornerStyle })}
                  className="w-full px-3 py-2 rounded-lg text-xs bg-neutral-50 dark:bg-[#11151C] border border-neutral-200 dark:border-neutral-800"
                >
                  <option value="classic">Classic</option>
                  <option value="rounded">Smooth Rounded</option>
                  <option value="sharp">Sharp Architectural</option>
                </select>
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
                  Surface Texture Overlay
                </span>
                <select
                  value={preferences.boardTexture}
                  onChange={(e) => onUpdate({ boardTexture: e.target.value as BoardTextureStyle })}
                  className="w-full px-3 py-2 rounded-lg text-xs bg-neutral-50 dark:bg-[#11151C] border border-neutral-200 dark:border-neutral-800"
                >
                  <option value="none">Smooth Matte</option>
                  <option value="wood-grain">Fine Wood Grain</option>
                  <option value="slate">Brushed Slate</option>
                  <option value="linen">Woven Linen</option>
                </select>
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
                  Animation Speed
                </span>
                <select
                  value={preferences.animationSpeed}
                  onChange={(e) => onUpdate({ animationSpeed: e.target.value as AnimationSpeed })}
                  className="w-full px-3 py-2 rounded-lg text-xs bg-neutral-50 dark:bg-[#11151C] border border-neutral-200 dark:border-neutral-800"
                >
                  <option value="instant">Instant (0ms)</option>
                  <option value="fast">Fast (90ms)</option>
                  <option value="normal">Normal (160ms)</option>
                  <option value="smooth">Smooth (240ms)</option>
                </select>
              </label>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
                Gameplay &amp; Sound Studio
              </h3>

              <label className="flex items-center justify-between py-1.5 text-xs font-medium cursor-pointer">
                <span>Show Legal Move Indicators</span>
                <input
                  type="checkbox"
                  checked={preferences.showLegalMoves}
                  onChange={(e) => onUpdate({ showLegalMoves: e.target.checked })}
                  className="accent-emerald-600 w-4 h-4"
                />
              </label>

              <label className="flex items-center justify-between py-1.5 text-xs font-medium cursor-pointer">
                <span>Highlight Last Move</span>
                <input
                  type="checkbox"
                  checked={preferences.showLastMove}
                  onChange={(e) => onUpdate({ showLastMove: e.target.checked })}
                  className="accent-emerald-600 w-4 h-4"
                />
              </label>

              <label className="flex items-center justify-between py-1.5 text-xs font-medium cursor-pointer">
                <span>Piece Drop Shadow</span>
                <input
                  type="checkbox"
                  checked={preferences.pieceDropShadow}
                  onChange={(e) => onUpdate({ pieceDropShadow: e.target.checked })}
                  className="accent-emerald-600 w-4 h-4"
                />
              </label>

              <label className="flex items-center justify-between py-1.5 text-xs font-medium cursor-pointer">
                <span>Show Analysis &amp; Hint Arrows</span>
                <input
                  type="checkbox"
                  checked={preferences.enableArrows}
                  onChange={(e) => onUpdate({ enableArrows: e.target.checked })}
                  className="accent-emerald-600 w-4 h-4"
                />
              </label>

              {preferences.enableArrows && (
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
                    Arrow Color Theme
                  </span>
                  <select
                    value={preferences.arrowColor}
                    onChange={(e) => onUpdate({ arrowColor: e.target.value as ArrowColorPreset })}
                    className="w-full px-3 py-2 rounded-lg text-xs bg-neutral-50 dark:bg-[#11151C] border border-neutral-200 dark:border-neutral-800"
                  >
                    <option value="emerald">Emerald Tournament</option>
                    <option value="amber">Amber Gold</option>
                    <option value="sky">Cobalt Sky</option>
                    <option value="rose">Crimson Threat</option>
                  </select>
                </label>
              )}

              <label className="flex items-center justify-between py-1.5 text-xs font-medium cursor-pointer">
                <span>Auto-Promote to Queen</span>
                <input
                  type="checkbox"
                  checked={preferences.autoQueen}
                  onChange={(e) => onUpdate({ autoQueen: e.target.checked })}
                  className="accent-emerald-600 w-4 h-4"
                />
              </label>

              <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800 space-y-3">
                <label className="flex items-center justify-between text-xs font-medium cursor-pointer">
                  <span className="flex items-center gap-1.5">
                    {preferences.soundEnabled ? (
                      <Volume2 className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <VolumeX className="w-3.5 h-3.5 text-neutral-400" />
                    )}
                    Board Sound Effects
                  </span>
                  <input
                    type="checkbox"
                    checked={preferences.soundEnabled}
                    onChange={(e) => onUpdate({ soundEnabled: e.target.checked })}
                    className="accent-emerald-600 w-4 h-4"
                  />
                </label>

                <div className="flex items-end gap-2">
                  <label className="flex-1 space-y-1">
                    <span className="text-xs text-neutral-500 block">Acoustic Sound Pack</span>
                    <select
                      value={preferences.soundPack}
                      onChange={(e) => onUpdate({ soundPack: e.target.value as SoundPackStyle })}
                      className="w-full px-3 py-2 rounded-lg text-xs bg-neutral-50 dark:bg-[#11151C] border border-neutral-200 dark:border-neutral-800"
                    >
                      <option value="wood">Classic Staunton Wood</option>
                      <option value="marble">Heavy Marble Stone</option>
                      <option value="crisp">Crisp Digital Studio</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => soundEngine.play('capture')}
                    className="px-3 py-2 rounded-lg bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-xs font-semibold cursor-pointer"
                  >
                    Test Sound
                  </button>
                </div>

                <label className="block space-y-1">
                  <span className="text-xs text-neutral-500 flex justify-between">
                    <span>SFX Volume</span>
                    <span className="font-mono">{Math.round(preferences.soundVolume * 100)}%</span>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={preferences.soundVolume}
                    onChange={(e) => onUpdate({ soundVolume: Number(e.target.value) })}
                    className="w-full accent-emerald-600"
                  />
                </label>

                <label className="flex items-center justify-between text-xs font-medium cursor-pointer">
                  <span>Ambient Study Music</span>
                  <input
                    type="checkbox"
                    checked={preferences.ambientMusicEnabled}
                    onChange={(e) => onUpdate({ ambientMusicEnabled: e.target.checked })}
                    className="accent-emerald-600 w-4 h-4"
                  />
                </label>

                {preferences.ambientMusicEnabled && (
                  <label className="block space-y-1">
                    <span className="text-xs text-neutral-500 flex justify-between">
                      <span>Music Volume</span>
                      <span className="font-mono">{Math.round(preferences.ambientVolume * 100)}%</span>
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={preferences.ambientVolume}
                      onChange={(e) => onUpdate({ ambientVolume: Number(e.target.value) })}
                      className="w-full accent-emerald-600"
                    />
                  </label>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
