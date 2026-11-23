import React from 'react';
import {
  Award,
  BookOpen,
  Compass,
  Flame,
  Gamepad2,
  LineChart,
  Puzzle,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-react';
import { ACADEMY_LESSONS } from '../data/courses';
import { PUZZLES_DATABASE } from '../data/puzzles';
import { PlayerProfileState } from '../store/useAcademyStore';
import { resolveAssetUrl } from '../utils/assetUrls';
import { AppSection, SavedGameRecord } from '../types/chess';

interface DashboardViewProps {
  profile: PlayerProfileState;
  onNavigate: (section: AppSection) => void;
  onQuickMatch: () => void;
  onReviewGame: (game: SavedGameRecord) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  profile,
  onNavigate,
  onQuickMatch,
  onReviewGame,
}) => {
  const dailyPct = Math.min(100, Math.round((profile.dailyXpEarned / profile.dailyGoalXp) * 100));
  const nextLesson =
    ACADEMY_LESSONS.find((l) => !profile.completedLessons.includes(l.id)) || ACADEMY_LESSONS[0];
  const dailyPuzzle = PUZZLES_DATABASE[0];

  const ratingCards = [
    { key: 'bullet', label: 'Bullet', data: profile.ratings.bullet },
    { key: 'blitz', label: 'Blitz', data: profile.ratings.blitz },
    { key: 'rapid', label: 'Rapid', data: profile.ratings.rapid },
    { key: 'classical', label: 'Classical', data: profile.ratings.classical },
  ];

  // Build simple SVG rating trend points scaled naturally around player's actual Elo
  const historyPoints = profile.ratingHistory.slice(-16);
  const vals = historyPoints.map((p) => p.rating);
  const minR = Math.max(50, Math.min(...vals, 100) - 40);
  const maxR = Math.max(minR + 120, Math.max(...vals, 100) + 40);
  const svgPoints = historyPoints
    .map((pt, idx) => {
      const x = historyPoints.length === 1 ? 150 : (idx / (historyPoints.length - 1)) * 300;
      const y = 76 - ((pt.rating - minR) / Math.max(1, maxR - minR)) * 64;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <div className="space-y-8">
      {/* Editorial Hero Split */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden">
        <div className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-between gap-6">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => onNavigate('profile')}
                className="relative group w-11 h-11 rounded-xl overflow-hidden border border-neutral-300 dark:border-neutral-700 shrink-0 cursor-pointer"
                title="Change profile picture"
              >
                <img
                  src={resolveAssetUrl(profile.avatarUrl)}
                  alt={profile.username}
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    const target = e.currentTarget;
                    const fallback = '/src/assets/images/avatar_tactician_1795303198124.jpg';
                    const resolvedFallback = resolveAssetUrl(fallback);
                    if (!target.src.endsWith(resolvedFallback)) {
                      target.src = resolvedFallback;
                    }
                  }}
                  className="w-full h-full object-cover"
                />
              </button>
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-neutral-500 dark:text-neutral-400">
                <span>{profile.skillLevel} Track</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">{profile.xp} Total XP</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">{profile.streakDays}-Day Streak</span>
              </div>
            </div>
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-neutral-900 dark:text-white [text-wrap:balance]">
              Welcome back, {profile.username}. Ready for sharper calculation?
            </h1>
            <p className="text-sm sm:text-base text-neutral-600 dark:text-neutral-300 max-w-2xl leading-relaxed">
              Train against Stockfish 19, dissect every mistake with expected win-probability review, drill
              grandmaster openings, or challenge live opponents on the server arena.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onQuickMatch}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
            >
              <Users className="w-4 h-4" />
              Quick Online Match
            </button>
            <button
              type="button"
              onClick={() => onNavigate('play')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-white text-white dark:text-neutral-900 text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
            >
              <Gamepad2 className="w-4 h-4" />
              Play vs Stockfish 19
            </button>
            <button
              type="button"
              onClick={() => onNavigate('academy')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-900 dark:text-neutral-100 text-sm font-medium transition-colors cursor-pointer whitespace-nowrap"
            >
              <BookOpen className="w-4 h-4" />
              Continue Academy
            </button>
            <button
              type="button"
              onClick={() => onNavigate('coach')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800/70 text-neutral-800 dark:text-neutral-200 text-sm font-medium transition-colors cursor-pointer whitespace-nowrap"
            >
              <Sparkles className="w-4 h-4" />
              Ask AI Coach
            </button>
          </div>
        </div>

        <div className="lg:col-span-5 relative min-h-[220px] lg:min-h-full bg-neutral-900 overflow-hidden">
          <img
            src={resolveAssetUrl('/src/assets/images/hero_chess_atelier_1795303199561.jpg')}
            alt="Handcrafted Staunton wooden chess set on inlaid walnut board"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent flex items-end p-5">
            <div className="text-white">
              <div className="text-xs text-neutral-300 font-medium">Next Recommended Lesson</div>
              <div className="text-base font-semibold mt-0.5">{nextLesson.title}</div>
            </div>
          </div>
        </div>
      </section>

      {/* 4-Column Glicko-2 Rating Strip */}
      <section aria-label="Time Control Ratings">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
            Atelier Internal Ratings (Glicko-2)
          </h2>
          <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-500 dark:text-neutral-400">
            {profile.linkedAccounts?.chesscom && (
              <span className="font-mono text-emerald-600 dark:text-emerald-400">
                Chess.com @{profile.linkedAccounts.chesscom.username} (
                {profile.linkedAccounts.chesscom.ratings.blitz ??
                  profile.linkedAccounts.chesscom.ratings.rapid ??
                  'Linked'}
                )
              </span>
            )}
            {profile.linkedAccounts?.lichess && (
              <span className="font-mono text-emerald-600 dark:text-emerald-400">
                Lichess @{profile.linkedAccounts.lichess.username} (
                {profile.linkedAccounts.lichess.ratings.blitz ??
                  profile.linkedAccounts.lichess.ratings.rapid ??
                  'Linked'}
                )
              </span>
            )}
            <button
              type="button"
              onClick={() => onNavigate('profile')}
              className="hover:underline text-emerald-700 dark:text-emerald-400 font-medium cursor-pointer"
            >
              Connect Chess.com / Lichess
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {ratingCards.map((c) => {
            const winRate =
              c.data.games > 0 ? Math.round((c.data.wins / c.data.games) * 100) : 0;
            return (
              <div
                key={c.key}
                className="bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 rounded-xl p-4"
              >
                <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
                  <span className="font-medium">{c.label}</span>
                  <span className="font-mono tabular-nums">RD ±{c.data.rd}</span>
                </div>
                <div className="mt-2 text-2xl font-mono tabular-nums font-semibold text-neutral-900 dark:text-white">
                  {c.data.rating}
                </div>
                <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 font-mono tabular-nums">
                  {c.data.games} games · {winRate}% win
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Middle Bento Grid: Daily Goal + Daily Puzzle + Rating Progression */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Daily Goal & Academy Progress */}
        <div className="bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 rounded-xl p-5 flex flex-col justify-between gap-4">
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-neutral-900 dark:text-white">
                Daily Training Goal
              </h3>
              <Flame className="w-4 h-4 text-amber-500" />
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
              Earn XP from lessons, puzzles, repertoire drills, and completed games.
            </p>
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs font-mono tabular-nums mb-1.5">
                <span className="text-neutral-700 dark:text-neutral-300">
                  {profile.dailyXpEarned} / {profile.dailyGoalXp} XP
                </span>
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                  {dailyPct}%
                </span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden">
                <div
                  className="h-full bg-emerald-600 transition-all duration-300"
                  style={{ width: `${dailyPct}%` }}
                />
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between text-xs">
            <span className="text-neutral-500 dark:text-neutral-400">
              Lessons: {profile.completedLessons.length}/{ACADEMY_LESSONS.length} completed
            </span>
            <button
              type="button"
              onClick={() => onNavigate('academy')}
              className="text-emerald-700 dark:text-emerald-400 font-semibold hover:underline cursor-pointer"
            >
              Open Academy
            </button>
          </div>
        </div>

        {/* Daily Puzzle */}
        <div className="bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 rounded-xl p-5 flex flex-col justify-between gap-4">
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-neutral-900 dark:text-white">
                Daily Tactical Puzzle
              </h3>
              <Puzzle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="mt-2 text-sm font-medium text-neutral-800 dark:text-neutral-200">
              {dailyPuzzle.title}
            </div>
            <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              {dailyPuzzle.difficulty} · Est. Puzzle Rating {dailyPuzzle.rating} · {dailyPuzzle.themes.join(' / ')}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center bg-neutral-50 dark:bg-[#11151C] rounded-lg p-2.5 border border-neutral-200 dark:border-neutral-800">
              <div>
                <div className="text-[11px] text-neutral-500 dark:text-neutral-400">Solved</div>
                <div className="text-sm font-mono tabular-nums font-semibold">
                  {profile.puzzleStats.solved}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-neutral-500 dark:text-neutral-400">Streak</div>
                <div className="text-sm font-mono tabular-nums font-semibold">
                  {profile.puzzleStats.currentStreak}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-neutral-500 dark:text-neutral-400">Rating</div>
                <div className="text-sm font-mono tabular-nums font-semibold">
                  {profile.puzzleStats.puzzleRating}
                </div>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('puzzles')}
            className="w-full py-2 px-4 rounded-lg bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-white text-white dark:text-neutral-900 text-xs font-semibold transition-colors cursor-pointer"
          >
            Solve Daily Puzzle
          </button>
        </div>

        {/* Rating History Graph */}
        <div className="bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 rounded-xl p-5 flex flex-col justify-between gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-neutral-900 dark:text-white">
              Rating Trajectory
            </h3>
            <LineChart className="w-4 h-4 text-neutral-400" />
          </div>

          <div className="h-24 w-full bg-neutral-50 dark:bg-[#11151C] rounded-lg border border-neutral-200 dark:border-neutral-800 p-2">
            <svg viewBox="0 0 300 84" className="w-full h-full overflow-visible">
              <line x1="0" y1="42" x2="300" y2="42" stroke="currentColor" className="text-neutral-300 dark:text-neutral-700" strokeDasharray="3 3" strokeWidth="1" />
              {historyPoints.length > 1 ? (
                <polyline
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  points={svgPoints}
                />
              ) : (
                <circle cx="150" cy="42" r="4" fill="#10b981" />
              )}
            </svg>
          </div>

          <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
            <span>Repertoire lines: {profile.repertoire.length}</span>
            <button
              type="button"
              onClick={() => onNavigate('openings')}
              className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-semibold hover:underline cursor-pointer"
            >
              <Compass className="w-3.5 h-3.5" />
              Opening Explorer
            </button>
          </div>
        </div>
      </section>

      {/* Recent Games & Achievements */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-neutral-900 dark:text-white">
              Recent Games Archive
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('analyze')}
              className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
            >
              Open Game Review
            </button>
          </div>

          {profile.games.length === 0 ? (
            <div className="py-10 text-center space-y-3 border border-dashed border-neutral-200 dark:border-neutral-800 rounded-xl">
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                No completed games recorded yet. Play a match against Stockfish or an online opponent to start your archive.
              </p>
              <button
                type="button"
                onClick={() => onNavigate('play')}
                className="px-4 py-2 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 transition-colors cursor-pointer"
              >
                Play Your First Game
              </button>
            </div>
          ) : (
            <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {profile.games.slice(0, 6).map((g) => (
                <div
                  key={g.id}
                  className="py-3 flex flex-wrap items-center justify-between gap-3 text-sm"
                >
                  <div>
                    <div className="font-medium text-neutral-900 dark:text-white">
                      {g.whiteName} vs {g.blackName}
                    </div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                      {g.timeControl} · {g.openingName || 'Standard Game'} · {g.termination}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono tabular-nums text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                      {g.result}
                    </span>
                    <button
                      type="button"
                      onClick={() => onReviewGame(g)}
                      className="px-3 py-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-xs font-medium cursor-pointer"
                    >
                      Review
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-4 bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-neutral-900 dark:text-white">
              Achievements
            </h3>
            <Trophy className="w-4 h-4 text-amber-500" />
          </div>
          {profile.achievements.length === 0 ? (
            <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
              Complete your first lesson, solve a puzzle, or finish a full match to unlock academy honors.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {profile.achievements.map((ach) => (
                <li
                  key={ach}
                  className="flex items-center gap-2.5 text-sm text-neutral-800 dark:text-neutral-200"
                >
                  <Award className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>{ach}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
};
