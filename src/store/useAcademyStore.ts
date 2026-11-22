import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_PREFERENCES } from '../data/boardThemes';
import {
  BoardPreferences,
  CustomizationPreset,
  LinkedChessAccount,
  RepertoireLine,
  SavedGameRecord,
  TimeControlCategory,
} from '../types/chess';
import { createInitialRating, GlickoRating, updateGlicko2 } from '../utils/glicko2';
import { soundEngine } from '../utils/soundEngine';

export interface PlayerProfileState {
  username: string;
  avatarUrl: string;
  skillLevel: 'Beginner' | 'Intermediate' | 'Advanced';
  xp: number;
  streakDays: number;
  lastActiveDate: string;
  dailyGoalXp: number;
  dailyXpEarned: number;
  ratings: {
    bullet: GlickoRating;
    blitz: GlickoRating;
    rapid: GlickoRating;
    classical: GlickoRating;
  };
  ratingHistory: { date: string; category: string; rating: number }[];
  completedLessons: string[];
  puzzleStats: {
    attempted: number;
    solved: number;
    currentStreak: number;
    bestStreak: number;
    puzzleRating: number;
    weakThemes: Record<string, number>;
  };
  achievements: string[];
  games: SavedGameRecord[];
  repertoire: RepertoireLine[];
  presets: CustomizationPreset[];
  friends: string[];
  linkedAccounts?: {
    chesscom?: LinkedChessAccount;
    lichess?: LinkedChessAccount;
  };
}

const STORAGE_KEY_PREFS = 'atelier_chess_prefs_v1';
const STORAGE_KEY_PROFILE = 'atelier_chess_profile_v1';
const STORAGE_KEY_THEME = 'atelier_chess_ui_theme_v1';

const AVATAR_CHOICES = [
  '/src/assets/images/avatar_tactician_1795303198124.jpg',
  '/src/assets/images/avatar_strategist_1795303199284.jpg',
  '/src/assets/images/avatar_obsidian_king_1795307612445.jpg',
  '/src/assets/images/avatar_walnut_knight_1795307611350.jpg',
  '/src/assets/images/avatar_emerald_queen_1795307611973.jpg',
  '/src/assets/images/avatar_golden_rook_1795307612323.jpg',
];

function getTodayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultProfile(): PlayerProfileState {
  return {
    username: 'AtelierPlayer',
    avatarUrl: AVATAR_CHOICES[0],
    skillLevel: 'Intermediate',
    xp: 0,
    streakDays: 1,
    lastActiveDate: getTodayIso(),
    dailyGoalXp: 100,
    dailyXpEarned: 0,
    ratings: {
      bullet: createInitialRating(100),
      blitz: createInitialRating(100),
      rapid: createInitialRating(100),
      classical: createInitialRating(100),
    },
    ratingHistory: [{ date: getTodayIso(), category: 'rapid', rating: 100 }],
    completedLessons: [],
    puzzleStats: {
      attempted: 0,
      solved: 0,
      currentStreak: 0,
      bestStreak: 0,
      puzzleRating: 400,
      weakThemes: {},
    },
    achievements: [],
    games: [],
    repertoire: [
      {
        id: 'rep-default-w1',
        color: 'w',
        name: 'Italian Game: Giuoco Piano',
        eco: 'C53',
        moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6', 'd3'],
        notes: 'Solid classical center control before preparing d4.',
        attempts: 0,
        successes: 0,
      },
      {
        id: 'rep-default-b1',
        color: 'b',
        name: 'Caro-Kann Defense: Classical',
        eco: 'B18',
        moves: ['e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4', 'Nxe4', 'Bf5'],
        notes: 'Develop the light-squared bishop outside the pawn chain before ...e6.',
        attempts: 0,
        successes: 0,
      },
    ],
    presets: [],
    friends: [],
    linkedAccounts: {},
  };
}

function migrateUnplayedLegacyRatings(profile: PlayerProfileState): PlayerProfileState {
  const r = profile.ratings;
  const totalGames =
    (r?.bullet?.games || 0) +
    (r?.blitz?.games || 0) +
    (r?.rapid?.games || 0) +
    (r?.classical?.games || 0);

  if (
    totalGames === 0 &&
    r?.rapid?.rating === 1200 &&
    r?.blitz?.rating === 1200 &&
    !profile.linkedAccounts?.chesscom &&
    !profile.linkedAccounts?.lichess
  ) {
    return {
      ...profile,
      ratings: {
        bullet: createInitialRating(100),
        blitz: createInitialRating(100),
        rapid: createInitialRating(100),
        classical: createInitialRating(100),
      },
      ratingHistory: [{ date: getTodayIso(), category: 'rapid', rating: 100 }],
    };
  }
  return profile;
}

export function useAcademyStore() {
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_THEME);
    return saved !== null ? saved === 'dark' : true;
  });

  const [preferences, setPreferences] = useState<BoardPreferences>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_PREFS);
      return saved ? { ...DEFAULT_PREFERENCES, ...JSON.parse(saved) } : DEFAULT_PREFERENCES;
    } catch {
      return DEFAULT_PREFERENCES;
    }
  });

  const [profile, setProfile] = useState<PlayerProfileState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_PROFILE);
      if (saved) {
        const parsed = JSON.parse(saved) as PlayerProfileState;
        const today = getTodayIso();
        const merged = migrateUnplayedLegacyRatings({
          ...defaultProfile(),
          ...parsed,
          linkedAccounts: parsed.linkedAccounts || {},
        });
        if (parsed.lastActiveDate !== today) {
          return {
            ...merged,
            dailyXpEarned: 0,
            lastActiveDate: today,
          };
        }
        return merged;
      }
    } catch {
      // ignore
    }
    return defaultProfile();
  });

  const [lastRatingDelta, setLastRatingDelta] = useState<{
    category: string;
    delta: number;
    newRating: number;
  } | null>(null);
  const pendingRatingDeltaRef = useRef<{
    category: string;
    delta: number;
    newRating: number;
  } | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) root.classList.add('dark');
    else root.classList.remove('dark');
    localStorage.setItem(STORAGE_KEY_THEME, darkMode ? 'dark' : 'light');
  }, [darkMode]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PREFS, JSON.stringify(preferences));
    soundEngine.configure({
      soundEnabled: preferences.soundEnabled,
      soundVolume: preferences.soundVolume,
      soundPack: preferences.soundPack,
      ambientMusicEnabled: preferences.ambientMusicEnabled,
      ambientVolume: preferences.ambientVolume,
    });
  }, [preferences]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PROFILE, JSON.stringify(profile));
    if (pendingRatingDeltaRef.current) {
      setLastRatingDelta(pendingRatingDeltaRef.current);
      pendingRatingDeltaRef.current = null;
    }
  }, [profile]);

  const updatePreferences = useCallback((patch: Partial<BoardPreferences>) => {
    setPreferences((prev) => ({ ...prev, ...patch }));
  }, []);

  const resetPreferences = useCallback(() => {
    setPreferences(DEFAULT_PREFERENCES);
  }, []);

  const savePreset = useCallback(
    (name: string) => {
      const clean = name.trim();
      if (!clean) return;
      const preset: CustomizationPreset = {
        id: `preset_${Date.now()}`,
        name: clean,
        createdAt: new Date().toISOString(),
        preferences: { ...preferences },
      };
      setProfile((prev) => ({
        ...prev,
        presets: [preset, ...prev.presets].slice(0, 16),
      }));
    },
    [preferences]
  );

  const deletePreset = useCallback((id: string) => {
    setProfile((prev) => ({
      ...prev,
      presets: prev.presets.filter((p) => p.id !== id),
    }));
  }, []);

  const recordLessonComplete = useCallback((lessonId: string, xpGain: number) => {
    setProfile((prev) => {
      const alreadyDone = prev.completedLessons.includes(lessonId);
      const earned = alreadyDone ? Math.round(xpGain * 0.25) : xpGain;
      const nextCompleted = alreadyDone ? prev.completedLessons : [...prev.completedLessons, lessonId];
      const nextAchievements = new Set(prev.achievements);
      if (nextCompleted.length >= 1) nextAchievements.add('First Lesson Complete');
      if (nextCompleted.length >= 4) nextAchievements.add('Beginner Graduate');
      if (nextCompleted.length >= 7) nextAchievements.add('Tactical Scholar');

      return {
        ...prev,
        xp: prev.xp + earned,
        dailyXpEarned: prev.dailyXpEarned + earned,
        completedLessons: nextCompleted,
        achievements: Array.from(nextAchievements),
      };
    });
  }, []);

  const recordPuzzleAttempt = useCallback((solved: boolean, puzzleRating: number, themes: string[]) => {
    setProfile((prev) => {
      const stats = prev.puzzleStats;
      const nextStreak = solved ? stats.currentStreak + 1 : 0;
      const nextBest = Math.max(stats.bestStreak, nextStreak);
      const delta = solved ? Math.max(8, Math.round((puzzleRating - stats.puzzleRating) / 25 + 14)) : -12;
      const weak = { ...stats.weakThemes };
      if (!solved) {
        themes.forEach((t) => {
          weak[t] = (weak[t] || 0) + 1;
        });
      }
      const nextAchievements = new Set(prev.achievements);
      if (stats.solved + (solved ? 1 : 0) >= 1) nextAchievements.add('First Puzzle Solved');
      if (nextStreak >= 5) nextAchievements.add('5-Puzzle Streak');

      const xpGain = solved ? 20 : 5;
      return {
        ...prev,
        xp: prev.xp + xpGain,
        dailyXpEarned: prev.dailyXpEarned + xpGain,
        achievements: Array.from(nextAchievements),
        puzzleStats: {
          attempted: stats.attempted + 1,
          solved: stats.solved + (solved ? 1 : 0),
          currentStreak: nextStreak,
          bestStreak: nextBest,
          puzzleRating: Math.max(600, Math.min(2800, stats.puzzleRating + delta)),
          weakThemes: weak,
        },
      };
    });
  }, []);

  const recordGameFinished = useCallback(
    (
      game: SavedGameRecord,
      opts?: { rated?: boolean; opponentRating?: number }
    ) => {
      setProfile((prev) => {
        const nextAchievements = new Set(prev.achievements);
        nextAchievements.add('First Completed Game');

        const isWin =
          (game.result === '1-0' && game.playerColor === 'w') ||
          (game.result === '0-1' && game.playerColor === 'b');
        const isDraw = game.result === '1/2-1/2';
        if (isWin) nextAchievements.add('First Victory');

        const score: 1 | 0.5 | 0 = isWin ? 1 : isDraw ? 0.5 : 0;
        const cat: Exclude<TimeControlCategory, 'unlimited'> =
          game.category === 'unlimited' ? 'rapid' : game.category;

        let nextRatings = { ...prev.ratings };
        let nextHistory = prev.ratingHistory;

        if (opts?.rated !== false) {
          const prevRating = prev.ratings[cat].rating;
          const updated = updateGlicko2(
            prev.ratings[cat],
            opts?.opponentRating ?? 200,
            150,
            score
          );
          nextRatings = { ...prev.ratings, [cat]: updated };
          nextHistory = [
            ...prev.ratingHistory,
            { date: getTodayIso(), category: cat, rating: updated.rating },
          ].slice(-40);

          pendingRatingDeltaRef.current = {
            category: cat,
            delta: updated.rating - prevRating,
            newRating: updated.rating,
          };
        }

        const xpGain = isWin ? 40 : isDraw ? 25 : 15;
        return {
          ...prev,
          xp: prev.xp + xpGain,
          dailyXpEarned: prev.dailyXpEarned + xpGain,
          ratings: nextRatings,
          ratingHistory: nextHistory,
          achievements: Array.from(nextAchievements),
          games: [game, ...prev.games].slice(0, 50),
        };
      });
    },
    []
  );

  const connectExternalAccount = useCallback(
    (account: LinkedChessAccount, applyEloToAtelier: boolean) => {
      setProfile((prev) => {
        const nextLinked = {
          ...(prev.linkedAccounts || {}),
          [account.platform]: account,
        };

        if (!applyEloToAtelier) {
          return { ...prev, linkedAccounts: nextLinked };
        }

        const clampElo = (val: number | undefined, fallback: number) =>
          val && Number.isFinite(val) ? Math.max(100, Math.min(3500, Math.round(val))) : fallback;

        const nextRatings = {
          bullet: {
            ...prev.ratings.bullet,
            rating: clampElo(account.ratings.bullet, prev.ratings.bullet.rating),
          },
          blitz: {
            ...prev.ratings.blitz,
            rating: clampElo(account.ratings.blitz, prev.ratings.blitz.rating),
          },
          rapid: {
            ...prev.ratings.rapid,
            rating: clampElo(account.ratings.rapid, prev.ratings.rapid.rating),
          },
          classical: {
            ...prev.ratings.classical,
            rating: clampElo(account.ratings.classical, prev.ratings.classical.rating),
          },
        };

        const bestImported =
          account.ratings.blitz ||
          account.ratings.rapid ||
          account.ratings.bullet ||
          account.ratings.classical;

        const nextHistory = bestImported
          ? [
              ...prev.ratingHistory,
              {
                date: getTodayIso(),
                category: 'blitz',
                rating: clampElo(bestImported, prev.ratings.blitz.rating),
              },
            ].slice(-40)
          : prev.ratingHistory;

        return {
          ...prev,
          linkedAccounts: nextLinked,
          ratings: nextRatings,
          ratingHistory: nextHistory,
        };
      });
    },
    []
  );

  const disconnectExternalAccount = useCallback((platform: 'chesscom' | 'lichess') => {
    setProfile((prev) => {
      const nextLinked = { ...(prev.linkedAccounts || {}) };
      delete nextLinked[platform];
      return { ...prev, linkedAccounts: nextLinked };
    });
  }, []);

  const addRepertoireLine = useCallback((line: Omit<RepertoireLine, 'id' | 'attempts' | 'successes'>) => {
    setProfile((prev) => ({
      ...prev,
      repertoire: [
        {
          ...line,
          id: `rep_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          attempts: 0,
          successes: 0,
        },
        ...prev.repertoire,
      ],
    }));
  }, []);

  const recordRepertoireDrill = useCallback((lineId: string, success: boolean) => {
    setProfile((prev) => ({
      ...prev,
      xp: prev.xp + (success ? 15 : 5),
      dailyXpEarned: prev.dailyXpEarned + (success ? 15 : 5),
      repertoire: prev.repertoire.map((r) =>
        r.id === lineId
          ? {
              ...r,
              attempts: r.attempts + 1,
              successes: r.successes + (success ? 1 : 0),
              lastPracticed: new Date().toISOString(),
            }
          : r
      ),
    }));
  }, []);

  const deleteRepertoireLine = useCallback((lineId: string) => {
    setProfile((prev) => ({
      ...prev,
      repertoire: prev.repertoire.filter((r) => r.id !== lineId),
    }));
  }, []);

  const updateProfileInfo = useCallback(
    (patch: Partial<Pick<PlayerProfileState, 'username' | 'avatarUrl' | 'skillLevel' | 'dailyGoalXp'>>) => {
      setProfile((prev) => ({ ...prev, ...patch }));
    },
    []
  );

  const addFriend = useCallback((handle: string) => {
    const clean = handle.trim().slice(0, 28);
    if (!clean) return;
    setProfile((prev) => {
      if (prev.friends.some((f) => f.toLowerCase() === clean.toLowerCase())) return prev;
      return { ...prev, friends: [clean, ...prev.friends].slice(0, 50) };
    });
  }, []);

  const removeFriend = useCallback((handle: string) => {
    setProfile((prev) => ({
      ...prev,
      friends: prev.friends.filter((f) => f.toLowerCase() !== handle.toLowerCase()),
    }));
  }, []);

  const importProfileJson = useCallback((raw: string): boolean => {
    try {
      const parsed = JSON.parse(raw) as Partial<PlayerProfileState>;
      if (!parsed || typeof parsed.username !== 'string' || !parsed.ratings) return false;
      setProfile((prev) => ({ ...prev, ...parsed }));
      return true;
    } catch {
      return false;
    }
  }, []);

  return {
    darkMode,
    setDarkMode,
    preferences,
    updatePreferences,
    resetPreferences,
    profile,
    setProfile,
    lastRatingDelta,
    savePreset,
    deletePreset,
    recordLessonComplete,
    recordPuzzleAttempt,
    recordGameFinished,
    connectExternalAccount,
    disconnectExternalAccount,
    addRepertoireLine,
    recordRepertoireDrill,
    deleteRepertoireLine,
    updateProfileInfo,
    addFriend,
    removeFriend,
    importProfileJson,
    avatarChoices: AVATAR_CHOICES,
  };
}
