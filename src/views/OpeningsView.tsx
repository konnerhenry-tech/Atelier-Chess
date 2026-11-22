import React, { useEffect, useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import {
  BookmarkPlus,
  ChevronLeft,
  ChevronRight,
  Download,
  Play,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react';
import { Chessboard } from '../components/Chessboard';
import { OPENINGS_DATABASE } from '../data/openings';
import { BoardPreferences, OpeningEntry, PieceType, RepertoireLine } from '../types/chess';
import { soundEngine } from '../utils/soundEngine';

interface OpeningsViewProps {
  preferences: BoardPreferences;
  repertoire: RepertoireLine[];
  onAddRepertoire: (line: Omit<RepertoireLine, 'id' | 'attempts' | 'successes'>) => void;
  onRecordDrill: (lineId: string, success: boolean) => void;
  onDeleteRepertoire: (lineId: string) => void;
  initialSubTab?: 'explorer' | 'repertoire';
}

const OPENING_CATEGORIES = [
  'All',
  'Open Games',
  'Semi-Open Games',
  'Closed Games',
  'Semi-Closed Games',
  'Indian Defenses',
  'Flank Openings',
  'Gambits',
] as const;

export const OpeningsView: React.FC<OpeningsViewProps> = ({
  preferences,
  repertoire,
  onAddRepertoire,
  onRecordDrill,
  onDeleteRepertoire,
  initialSubTab = 'explorer',
}) => {
  const [subTab, setSubTab] = useState<'explorer' | 'repertoire'>(initialSubTab);

  useEffect(() => {
    setSubTab(initialSubTab);
  }, [initialSubTab]);

  // Explorer State
  const [searchQuery, setSearchQuery] = useState('');
  const [catFilter, setCatFilter] = useState<string>('All');
  const [selectedOpening, setSelectedOpening] = useState<OpeningEntry>(OPENINGS_DATABASE[0]);
  const [stepPly, setStepPly] = useState<number>(OPENINGS_DATABASE[0].moves.length);
  const [boardMoves, setBoardMoves] = useState<string[]>(OPENINGS_DATABASE[0].moves);
  const [orientation, setOrientation] = useState<'w' | 'b'>('w');

  // Repertoire State
  const [repColorFilter, setRepColorFilter] = useState<'w' | 'b'>('w');
  const [newLineName, setNewLineName] = useState('');
  const [newLineEco, setNewLineEco] = useState('C50');
  const [newLinePgn, setNewLinePgn] = useState('');
  const [newLineNotes, setNewLineNotes] = useState('');
  const [repError, setRepError] = useState<string | null>(null);

  // Drill Quiz State
  const [drillLine, setDrillLine] = useState<RepertoireLine | null>(null);
  const [drillPly, setDrillPly] = useState(0);
  const [drillFen, setDrillFen] = useState('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  const [drillFeedback, setDrillFeedback] = useState<string | null>(null);

  const filteredOpenings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return OPENINGS_DATABASE.filter((op) => {
      if (catFilter !== 'All' && op.category !== catFilter) return false;
      if (!q) return true;
      return (
        op.name.toLowerCase().includes(q) ||
        (op.variation && op.variation.toLowerCase().includes(q)) ||
        op.eco.toLowerCase().includes(q)
      );
    });
  }, [searchQuery, catFilter]);

  // Compute current FEN from boardMoves + stepPly
  const { currentFen, lastMove, matchingContinuations } = useMemo(() => {
    const c = new Chess();
    let lm: { from: string; to: string } | null = null;
    const activePrefix = boardMoves.slice(0, stepPly);
    for (const san of activePrefix) {
      try {
        const m = c.move(san);
        if (m) lm = { from: m.from, to: m.to };
      } catch {
        break;
      }
    }

    // Find database openings matching the current move prefix
    const continuations = OPENINGS_DATABASE.filter((op) => {
      if (op.moves.length <= activePrefix.length) return false;
      for (let i = 0; i < activePrefix.length; i++) {
        if (op.moves[i] !== activePrefix[i]) return false;
      }
      return true;
    }).slice(0, 6);

    return {
      currentFen: c.fen(),
      lastMove: lm,
      matchingContinuations: continuations,
    };
  }, [boardMoves, stepPly]);

  const handleSelectOpening = (op: OpeningEntry) => {
    setSelectedOpening(op);
    setBoardMoves(op.moves);
    setStepPly(op.moves.length);
  };

  const handleExplorerMove = (from: string, to: string, promotion?: PieceType) => {
    const c = new Chess();
    const prefix = boardMoves.slice(0, stepPly);
    try {
      for (const san of prefix) c.move(san);
      const m = c.move({ from, to, promotion });
      if (!m) return false;
      soundEngine.play(m.captured ? 'capture' : 'move');
      const nextMoves = [...prefix, m.san];
      setBoardMoves(nextMoves);
      setStepPly(nextMoves.length);
      return true;
    } catch {
      return false;
    }
  };

  // Repertoire Helpers
  const handleImportRepertoire = () => {
    setRepError(null);
    const c = new Chess();
    try {
      c.loadPgn(newLinePgn.trim());
    } catch {
      setRepError('Invalid PGN sequence. Example: 1. e4 e5 2. Nf3 Nc6 3. Bb5');
      return;
    }
    const history = c.history();
    if (history.length === 0) {
      setRepError('Please provide at least one legal move.');
      return;
    }
    onAddRepertoire({
      color: repColorFilter,
      name: newLineName.trim() || 'Custom Variation',
      eco: newLineEco.trim() || 'A00',
      moves: history,
      notes: newLineNotes.trim() || 'Saved repertoire variation.',
    });
    setNewLineName('');
    setNewLinePgn('');
    setNewLineNotes('');
  };

  const startDrill = (line: RepertoireLine) => {
    setDrillLine(line);
    setDrillFeedback(null);
    const c = new Chess();
    if (line.color === 'b' && line.moves.length > 0) {
      c.move(line.moves[0]);
      setDrillPly(1);
    } else {
      setDrillPly(0);
    }
    setDrillFen(c.fen());
  };

  const handleDrillMove = (from: string, to: string, promotion?: PieceType) => {
    if (!drillLine) return false;
    const c = new Chess();
    c.load(drillFen);
    try {
      const m = c.move({ from, to, promotion });
      if (!m) return false;

      const expectedSan = drillLine.moves[drillPly];
      if (m.san === expectedSan) {
        soundEngine.play(m.captured ? 'capture' : 'move');
        let nextPly = drillPly + 1;
        if (nextPly < drillLine.moves.length) {
          c.move(drillLine.moves[nextPly]);
          nextPly++;
        }
        setDrillFen(c.fen());
        setDrillPly(nextPly);

        if (nextPly >= drillLine.moves.length) {
          setDrillFeedback(`Line complete! ${drillLine.name} mastered.`);
          soundEngine.play('puzzle-success');
          onRecordDrill(drillLine.id, true);
        } else {
          setDrillFeedback(`Correct (${m.san}). Continue the variation.`);
        }
        return true;
      } else {
        soundEngine.play('puzzle-error');
        setDrillFeedback(`Played ${m.san} — repertoire calls for ${expectedSan}.`);
        onRecordDrill(drillLine.id, false);
        return false;
      }
    } catch {
      return false;
    }
  };

  const exportRepertoirePgn = () => {
    const content = repertoire
      .filter((r) => r.color === repColorFilter)
      .map((r) => {
        const c = new Chess();
        r.moves.forEach((m) => c.move(m));
        return `[Event "${r.name}"]\n[ECO "${r.eco}"]\n\n${c.pgn()}`;
      })
      .join('\n\n');
    const blob = new Blob([content || '*'], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `atelier-repertoire-${repColorFilter === 'w' ? 'white' : 'black'}.pgn`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Sub-view switcher */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 rounded-2xl p-4">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900 dark:text-white">
            Openings &amp; Repertoire Studio
          </h1>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Explore {OPENINGS_DATABASE.length} verified ECO openings or drill your personalized White &amp; Black repertoires.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-neutral-100 dark:bg-[#11151C] rounded-xl">
          <button
            type="button"
            onClick={() => setSubTab('explorer')}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
              subTab === 'explorer'
                ? 'bg-white dark:bg-[#1F2633] text-neutral-900 dark:text-white shadow-sm'
                : 'text-neutral-500'
            }`}
          >
            Opening Explorer
          </button>
          <button
            type="button"
            onClick={() => setSubTab('repertoire')}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
              subTab === 'repertoire'
                ? 'bg-white dark:bg-[#1F2633] text-neutral-900 dark:text-white shadow-sm'
                : 'text-neutral-500'
            }`}
          >
            My Repertoire ({repertoire.length})
          </button>
        </div>
      </div>

      {subTab === 'explorer' ? (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Left: Opening List */}
          <div className="xl:col-span-5 bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 rounded-2xl p-4 space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search ECO code, Sicilian, Ruy Lopez, Catalan…"
                className="w-full pl-9 pr-3 py-2 rounded-lg text-xs bg-neutral-50 dark:bg-[#11151C] border border-neutral-200 dark:border-neutral-800"
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {OPENING_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCatFilter(cat)}
                  className={`px-2 py-1 rounded text-[11px] font-medium cursor-pointer ${
                    catFilter === cat
                      ? 'bg-emerald-700 text-white'
                      : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="divide-y divide-neutral-200 dark:divide-neutral-800 max-h-[540px] overflow-y-auto pr-1">
              {filteredOpenings.map((op) => {
                const active = selectedOpening.id === op.id;
                return (
                  <button
                    key={op.id}
                    type="button"
                    onClick={() => handleSelectOpening(op)}
                    className={`w-full text-left py-3 px-2.5 rounded-lg transition-colors cursor-pointer ${
                      active ? 'bg-emerald-500/10' : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-neutral-900 dark:text-white">
                        {op.name}
                        {op.variation ? `: ${op.variation}` : ''}
                      </span>
                      <span className="text-xs font-mono text-emerald-700 dark:text-emerald-400 shrink-0">
                        {op.eco}
                      </span>
                    </div>
                    <div className="text-xs font-mono text-neutral-500 dark:text-neutral-400 mt-0.5 truncate">
                      {op.pgn}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: Interactive Board & Strategic Manual */}
          <div className="xl:col-span-7 space-y-4">
            <div className="bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-mono text-emerald-700 dark:text-emerald-400">
                    ECO {selectedOpening.eco} · {selectedOpening.category}
                  </div>
                  <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">
                    {selectedOpening.name}
                    {selectedOpening.variation ? ` — ${selectedOpening.variation}` : ''}
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setOrientation((o) => (o === 'w' ? 'b' : 'w'))}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-xs font-medium cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Flip
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onAddRepertoire({
                        color: orientation,
                        name: selectedOpening.variation
                          ? `${selectedOpening.name}: ${selectedOpening.variation}`
                          : selectedOpening.name,
                        eco: selectedOpening.eco,
                        moves: boardMoves.slice(0, stepPly),
                        notes: selectedOpening.description,
                      });
                      setSubTab('repertoire');
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold cursor-pointer"
                  >
                    <BookmarkPlus className="w-3.5 h-3.5" />
                    Save to Repertoire
                  </button>
                </div>
              </div>

              <Chessboard
                fen={currentFen}
                orientation={orientation}
                preferences={preferences}
                sizeOverridePx={Math.min(460, preferences.boardSizePx)}
                lastMove={lastMove}
                onMove={handleExplorerMove}
              />

              {/* Step through move sequence */}
              <div className="flex items-center justify-between gap-2 bg-neutral-50 dark:bg-[#11151C] border border-neutral-200 dark:border-neutral-800 rounded-xl px-3 py-2">
                <div className="text-xs font-mono text-neutral-700 dark:text-neutral-300 truncate">
                  {boardMoves.slice(0, stepPly).join(' ') || 'Starting position'}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setStepPly((p) => Math.max(0, p - 1))}
                    disabled={stepPly === 0}
                    className="p-1.5 rounded bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setStepPly((p) => Math.min(boardMoves.length, p + 1))}
                    disabled={stepPly >= boardMoves.length}
                    className="p-1.5 rounded bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {matchingContinuations.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-xs font-medium text-neutral-500">
                    Continuations from current position:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {matchingContinuations.map((mc) => (
                      <button
                        key={mc.id}
                        type="button"
                        onClick={() => handleSelectOpening(mc)}
                        className="px-2.5 py-1 rounded-md bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-xs font-medium cursor-pointer"
                      >
                        {mc.eco} · {mc.variation || mc.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed">
                {selectedOpening.description}
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-[#11151C] border border-neutral-200 dark:border-neutral-800">
                  <div className="font-semibold text-neutral-900 dark:text-white mb-1.5">
                    White’s Typical Plans
                  </div>
                  <ul className="list-disc pl-4 space-y-1 text-neutral-600 dark:text-neutral-300">
                    {selectedOpening.whitePlans.map((pl) => (
                      <li key={pl}>{pl}</li>
                    ))}
                  </ul>
                </div>
                <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-[#11151C] border border-neutral-200 dark:border-neutral-800">
                  <div className="font-semibold text-neutral-900 dark:text-white mb-1.5">
                    Black’s Typical Plans
                  </div>
                  <ul className="list-disc pl-4 space-y-1 text-neutral-600 dark:text-neutral-300">
                    {selectedOpening.blackPlans.map((pl) => (
                      <li key={pl}>{pl}</li>
                    ))}
                  </ul>
                </div>
                <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-[#11151C] border border-neutral-200 dark:border-neutral-800">
                  <div className="font-semibold text-neutral-900 dark:text-white mb-1.5">
                    Common Mistakes
                  </div>
                  <ul className="list-disc pl-4 space-y-1 text-neutral-600 dark:text-neutral-300">
                    {selectedOpening.commonMistakes.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                </div>
                <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-[#11151C] border border-neutral-200 dark:border-neutral-800">
                  <div className="font-semibold text-neutral-900 dark:text-white mb-1.5">
                    Tactical Ideas
                  </div>
                  <ul className="list-disc pl-4 space-y-1 text-neutral-600 dark:text-neutral-300">
                    {selectedOpening.tacticalIdeas.map((ti) => (
                      <li key={ti}>{ti}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* REPERTOIRE BUILDER & DRILL QUIZ */
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          <div className="xl:col-span-5 space-y-4">
            <div className="bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 p-1 bg-neutral-100 dark:bg-[#11151C] rounded-lg">
                  <button
                    type="button"
                    onClick={() => setRepColorFilter('w')}
                    className={`px-3 py-1 rounded-md text-xs font-semibold cursor-pointer ${
                      repColorFilter === 'w'
                        ? 'bg-white dark:bg-[#1F2633] text-neutral-900 dark:text-white shadow-sm'
                        : 'text-neutral-500'
                    }`}
                  >
                    White Repertoire
                  </button>
                  <button
                    type="button"
                    onClick={() => setRepColorFilter('b')}
                    className={`px-3 py-1 rounded-md text-xs font-semibold cursor-pointer ${
                      repColorFilter === 'b'
                        ? 'bg-white dark:bg-[#1F2633] text-neutral-900 dark:text-white shadow-sm'
                        : 'text-neutral-500'
                    }`}
                  >
                    Black Repertoire
                  </button>
                </div>

                <button
                  type="button"
                  onClick={exportRepertoirePgn}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-xs font-medium cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export PGN
                </button>
              </div>

              <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {repertoire.filter((r) => r.color === repColorFilter).map((line) => {
                  const rate =
                    line.attempts > 0 ? Math.round((line.successes / line.attempts) * 100) : 0;
                  return (
                    <div key={line.id} className="py-3 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-neutral-900 dark:text-white">
                          {line.name}
                        </div>
                        <span className="text-xs font-mono text-neutral-500">{line.eco}</span>
                      </div>
                      <div className="text-xs font-mono text-neutral-500 truncate">
                        {line.moves.join(' ')}
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[11px] font-mono text-neutral-500">
                          Accuracy: {rate}% ({line.successes}/{line.attempts})
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => startDrill(line)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
                          >
                            <Play className="w-3 h-3" />
                            Drill
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (drillLine?.id === line.id) {
                                setDrillLine(null);
                                setDrillFeedback(null);
                              }
                              onDeleteRepertoire(line.id);
                            }}
                            className="p-1.5 rounded text-neutral-400 hover:text-red-500 cursor-pointer"
                            aria-label="Delete repertoire line"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* PGN Import Form */}
            <div className="bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 rounded-2xl p-4 space-y-2.5">
              <h3 className="text-sm font-semibold">Add Repertoire Variation (PGN)</h3>
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  value={newLineName}
                  onChange={(e) => setNewLineName(e.target.value)}
                  placeholder="Line Name"
                  className="col-span-2 px-3 py-1.5 rounded-lg text-xs bg-neutral-50 dark:bg-[#11151C] border border-neutral-200 dark:border-neutral-800"
                />
                <input
                  type="text"
                  value={newLineEco}
                  onChange={(e) => setNewLineEco(e.target.value)}
                  placeholder="ECO"
                  className="px-3 py-1.5 rounded-lg text-xs font-mono bg-neutral-50 dark:bg-[#11151C] border border-neutral-200 dark:border-neutral-800"
                />
              </div>
              <textarea
                value={newLinePgn}
                onChange={(e) => setNewLinePgn(e.target.value)}
                rows={2}
                placeholder="1. d4 Nf6 2. c4 g6 3. Nc3 Bg7"
                className="w-full px-3 py-2 rounded-lg text-xs font-mono bg-neutral-50 dark:bg-[#11151C] border border-neutral-200 dark:border-neutral-800 resize-none"
              />
              <input
                type="text"
                value={newLineNotes}
                onChange={(e) => setNewLineNotes(e.target.value)}
                placeholder="Strategic notes…"
                className="w-full px-3 py-1.5 rounded-lg text-xs bg-neutral-50 dark:bg-[#11151C] border border-neutral-200 dark:border-neutral-800"
              />
              {repError && <p className="text-xs text-red-500">{repError}</p>}
              <button
                type="button"
                onClick={handleImportRepertoire}
                className="w-full py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold cursor-pointer"
              >
                Import to {repColorFilter === 'w' ? 'White' : 'Black'} Repertoire
              </button>
            </div>
          </div>

          {/* Right: Interactive Repertoire Quiz Board */}
          <div className="xl:col-span-7 bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 space-y-4">
            {drillLine ? (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-neutral-500">
                      Repertoire Quiz · Playing {drillLine.color === 'w' ? 'White' : 'Black'}
                    </div>
                    <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
                      {drillLine.name}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => startDrill(drillLine)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-xs font-medium cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Restart Drill
                  </button>
                </div>

                <Chessboard
                  fen={drillFen}
                  orientation={drillLine.color}
                  preferences={preferences}
                  sizeOverridePx={Math.min(460, preferences.boardSizePx)}
                  interactive={drillPly < drillLine.moves.length}
                  allowedColor={drillLine.color}
                  onMove={handleDrillMove}
                />

                {drillFeedback && (
                  <div className="p-3 rounded-xl bg-neutral-50 dark:bg-[#11151C] border border-neutral-200 dark:border-neutral-800 text-xs">
                    {drillFeedback}
                  </div>
                )}
              </>
            ) : (
              <div className="py-20 text-center space-y-2">
                <h3 className="text-base font-semibold text-neutral-900 dark:text-white">
                  Select a Repertoire Line to Drill
                </h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 max-w-md mx-auto">
                  Choose any saved White or Black opening line on the left and press Drill to practice your moves against automatic replies.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
