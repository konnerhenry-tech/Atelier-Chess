import React, { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  BookMarked,
  BookOpen,
  Check,
  Compass,
  Cpu,
  Gamepad2,
  LayoutDashboard,
  Link2,
  Menu,
  Moon,
  Palette,
  Puzzle,
  Sparkles,
  Sun,
  User as UserIcon,
  Users,
  Volume2,
  VolumeX,
  Wrench,
  X,
} from 'lucide-react';
import { auth } from './firebase';
import {
  FriendRequestRecord,
  FriendshipRecord,
  GameInviteRecord,
  loadOrCreateCloudProfile,
  PublicProfileRecord,
  removeFriendship,
  respondToFriendRequest,
  sendFriendRequest,
  sendGameInviteToFriend,
  signInWithGoogle,
  signOutGoogle,
  subscribeSocialData,
  syncCloudProfile,
  updateGameInviteStatus,
} from './services/firestoreSync';
import { useAcademyStore } from './store/useAcademyStore';
import { AppSection, SavedGameRecord } from './types/chess';
import { AcademyView } from './views/AcademyView';
import { AnalyzeReviewView } from './views/AnalyzeReviewView';
import { CoachView } from './views/CoachView';
import { DashboardView } from './views/DashboardView';
import { MultiplayerView } from './views/MultiplayerView';
import { OpeningsView } from './views/OpeningsView';
import { PlayAIView } from './views/PlayAIView';
import { ProfileView } from './views/ProfileView';
import { PuzzlesView } from './views/PuzzlesView';
import { StudioView } from './views/StudioView';
import { resolveAssetUrl } from './utils/assetUrls';
import { ToolsView } from './views/ToolsView';

const SIDEBAR_ITEMS: { id: AppSection; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'play', label: 'Play Stockfish', icon: Gamepad2 },
  { id: 'multiplayer', label: 'Online Arena', icon: Users },
  { id: 'analyze', label: 'Analysis & Review', icon: Cpu },
  { id: 'academy', label: 'Academy', icon: BookOpen },
  { id: 'puzzles', label: 'Puzzles', icon: Puzzle },
  { id: 'openings', label: 'Openings', icon: Compass },
  { id: 'repertoire', label: 'Repertoire', icon: BookMarked },
  { id: 'coach', label: 'AI Coach', icon: Sparkles },
  { id: 'tools', label: 'Chess Tools', icon: Wrench },
  { id: 'studio', label: 'Board Studio', icon: Palette },
  { id: 'profile', label: 'Profile', icon: UserIcon },
];

export default function App() {
  const {
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
    importProfileJson,
    avatarChoices,
  } = useAcademyStore();

  const [section, setSection] = useState<AppSection>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [quickMatchTrigger, setQuickMatchTrigger] = useState(0);
  const [runtimeAppUrl, setRuntimeAppUrl] = useState<string>('');
  const [linkCopied, setLinkCopied] = useState(false);
  const [copyToastVisible, setCopyToastVisible] = useState(false);
  const copyTimerRef = useRef<number | null>(null);

  // Firebase Auth & Social Cloud Sync State
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [cloudHydratedUid, setCloudHydratedUid] = useState<string | null>(null);
  const [cloudSyncState, setCloudSyncState] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const [cloudError, setCloudError] = useState<string | null>(null);

  const [publicProfiles, setPublicProfiles] = useState<PublicProfileRecord[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<FriendRequestRecord[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequestRecord[]>([]);
  const [friendships, setFriendships] = useState<FriendshipRecord[]>([]);
  const [incomingInvites, setIncomingInvites] = useState<GameInviteRecord[]>([]);
  const [, setOutgoingInvites] = useState<GameInviteRecord[]>([]);
  const [pendingInviteTarget, setPendingInviteTarget] = useState<{ uid: string; name: string } | null>(null);

  const latestLocalRef = useRef({ profile, preferences });
  latestLocalRef.current = { profile, preferences };

  // Cross-view contextual handoffs
  const [reviewPgn, setReviewPgn] = useState<string | null>(null);
  const [reviewFen, setReviewFen] = useState<string | null>(null);
  const [playFen, setPlayFen] = useState<string | null>(null);
  const [coachContext, setCoachContext] = useState<{
    fen: string | null;
    pgn: string | null;
    evalSummary: string | null;
  }>({ fen: null, pgn: null, evalSummary: null });

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setAuthReady(true);
      if (!user) {
        setCloudHydratedUid(null);
        setCloudSyncState('idle');
        setPublicProfiles([]);
        setIncomingRequests([]);
        setOutgoingRequests([]);
        setFriendships([]);
        setIncomingInvites([]);
        setOutgoingInvites([]);
      }
    });
    return () => unsub();
  }, []);

  // Load or seed cloud profile + attach onSnapshot listeners ONLY when auth is ready & signed in
  useEffect(() => {
    if (!authReady || !authUser) return;

    let cancelled = false;
    let unsubSocial: (() => void) | null = null;

    const initCloud = async () => {
      setCloudSyncState('syncing');
      setCloudError(null);
      try {
        const res = await loadOrCreateCloudProfile(
          authUser,
          latestLocalRef.current.profile,
          latestLocalRef.current.preferences
        );
        if (cancelled) return;
        setProfile((prev) => ({ ...prev, ...res.profilePatch }));
        if (res.preferencesPatch) {
          updatePreferences(res.preferencesPatch);
        }
        setCloudHydratedUid(authUser.uid);
        setCloudSyncState('synced');

        unsubSocial = subscribeSocialData(authUser.uid, {
          onPublicProfiles: setPublicProfiles,
          onIncomingRequests: setIncomingRequests,
          onOutgoingRequests: setOutgoingRequests,
          onFriendships: setFriendships,
          onIncomingInvites: setIncomingInvites,
          onOutgoingInvites: setOutgoingInvites,
          onError: (err) => {
            setCloudSyncState('error');
            setCloudError(err instanceof Error ? err.message : 'Cloud listener error.');
          },
        });
      } catch (err) {
        if (!cancelled) {
          setCloudSyncState('error');
          setCloudError(err instanceof Error ? err.message : 'Failed to synchronize cloud profile.');
        }
      }
    };

    void initCloud();

    return () => {
      cancelled = true;
      if (unsubSocial) unsubSocial();
    };
  }, [authReady, authUser?.uid]);

  // Debounced automatic sync of profile + board preferences to Firestore
  useEffect(() => {
    if (!authUser || cloudHydratedUid !== authUser.uid) return;
    const timer = window.setTimeout(() => {
      setCloudSyncState('syncing');
      void syncCloudProfile(authUser, profile, preferences)
        .then(() => {
          setCloudSyncState('synced');
          setCloudError(null);
        })
        .catch((err) => {
          setCloudSyncState('error');
          setCloudError(err instanceof Error ? err.message : 'Cloud save failed.');
        });
    }, 900);

    return () => clearTimeout(timer);
  }, [authUser, cloudHydratedUid, profile, preferences]);

  const handleSignInGoogle = async () => {
    setAuthLoading(true);
    setCloudError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setCloudError(err instanceof Error ? err.message : 'Google Sign-In failed.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOutGoogle = async () => {
    await signOutGoogle();
  };

  const navigate = (next: AppSection) => {
    setSection(next);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleReviewGame = (game: SavedGameRecord) => {
    setReviewFen(null);
    setReviewPgn(game.pgn);
    navigate('analyze');
  };

  // Resolve runtime APP_URL from server environment (.env)
  useEffect(() => {
    let active = true;
    fetch('/api/health')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (active && data?.appUrl && typeof data.appUrl === 'string') {
          setRuntimeAppUrl(data.appUrl);
        }
      })
      .catch(() => {
        // fallback to Vite env / window.location.origin
      });
    return () => {
      active = false;
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const envAppUrl =
    typeof import.meta.env.VITE_APP_URL === 'string' &&
    import.meta.env.VITE_APP_URL &&
    import.meta.env.VITE_APP_URL !== 'MY_APP_URL'
      ? import.meta.env.VITE_APP_URL
      : '';
  const shareableAppUrl =
    runtimeAppUrl || envAppUrl || (typeof window !== 'undefined' ? window.location.origin : '');

  const handleCopyAppLink = async () => {
    const urlToCopy = shareableAppUrl;
    if (!urlToCopy) return;
    const safeHref = urlToCopy.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    let copied = false;

    try {
      if (
        navigator.clipboard &&
        typeof navigator.clipboard.write === 'function' &&
        typeof ClipboardItem !== 'undefined'
      ) {
        const htmlBlob = new Blob([`<a href="${safeHref}">Atelier Chess</a>`], {
          type: 'text/html',
        });
        const textBlob = new Blob([urlToCopy], { type: 'text/plain' });
        await navigator.clipboard.write([
          new ClipboardItem({ 'text/html': htmlBlob, 'text/plain': textBlob }),
        ]);
        copied = true;
      }
    } catch {
      copied = false;
    }

    if (!copied) {
      try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          await navigator.clipboard.writeText(urlToCopy);
          copied = true;
        }
      } catch {
        copied = false;
      }
    }

    if (!copied) {
      try {
        const el = document.createElement('textarea');
        el.value = urlToCopy;
        el.setAttribute('readonly', '');
        el.style.position = 'fixed';
        el.style.opacity = '0';
        document.body.appendChild(el);
        el.select();
        copied = document.execCommand('copy');
        document.body.removeChild(el);
      } catch {
        copied = false;
      }
    }

    if (copied) {
      setLinkCopied(true);
      setCopyToastVisible(true);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => {
        setLinkCopied(false);
        setCopyToastVisible(false);
      }, 2600);
    }
  };

  const handleAskCoach = (fen: string, pgn: string, evalSummary?: string) => {
    setCoachContext({ fen, pgn, evalSummary: evalSummary || null });
    navigate('coach');
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F6F2] text-[#141619] dark:bg-[#0D1014] dark:text-[#F1F3F5] transition-colors">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-40 h-14 px-4 sm:px-6 bg-white/90 dark:bg-[#11151C]/90 backdrop-blur-md border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-8">
        {/* Zone 1: Single-line Brand Wordmark */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="lg:hidden p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <button
            type="button"
            onClick={() => navigate('dashboard')}
            className="font-display text-lg font-bold tracking-tight text-neutral-900 dark:text-white whitespace-nowrap shrink-0 cursor-pointer"
          >
            Atelier Chess
          </button>
        </div>

        {/* Zone 2: 5 concise single-line text links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-neutral-600 dark:text-neutral-300">
          {(
            [
              { id: 'play', label: 'Play' },
              { id: 'analyze', label: 'Analyze' },
              { id: 'academy', label: 'Learn' },
              { id: 'openings', label: 'Openings' },
              { id: 'studio', label: 'Studio' },
            ] as { id: AppSection; label: string }[]
          ).map((link) => (
            <button
              key={link.id}
              type="button"
              onClick={() => navigate(link.id)}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                section === link.id
                  ? 'border-emerald-600 text-neutral-950 dark:text-white'
                  : 'border-transparent hover:text-neutral-950 dark:hover:text-white hover:border-neutral-300 dark:hover:border-neutral-700'
              }`}
            >
              {link.label}
            </button>
          ))}
        </nav>

        {/* Zone 3: Copy Link & Primary Action */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void handleCopyAppLink()}
            title={shareableAppUrl}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              linkCopied
                ? 'border-emerald-600/50 bg-emerald-600/10 text-emerald-700 dark:text-emerald-300'
                : 'border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-[#171C26] text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
          >
            {linkCopied ? <Check className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
            <span>{linkCopied ? 'Copied!' : 'Copy Link'}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setQuickMatchTrigger((n) => n + 1);
              navigate('multiplayer');
            }}
            className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Quick Match
          </button>
        </div>
      </header>

      <div className="flex-1 flex max-w-[1440px] w-full mx-auto">
        {/* Desktop Workspace Rail */}
        <aside className="hidden lg:flex flex-col w-56 shrink-0 border-r border-neutral-200 dark:border-neutral-800 bg-white/50 dark:bg-[#10141B]/60 p-3 justify-between">
          <nav className="space-y-1">
            {SIDEBAR_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigate(item.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    active
                      ? 'bg-emerald-700 text-white font-semibold'
                      : 'text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200/60 dark:hover:bg-neutral-800/70'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Compact Workspace Preferences Footer */}
          <div className="pt-3 mt-4 border-t border-neutral-200 dark:border-neutral-800 space-y-2.5">
            <button
              type="button"
              onClick={() => navigate('profile')}
              className="w-full flex items-center gap-2.5 p-2 rounded-xl bg-neutral-100/80 dark:bg-neutral-800/60 hover:bg-neutral-200/70 dark:hover:bg-neutral-800 transition-colors text-left cursor-pointer"
              title="Edit profile & change PFP"
            >
              <img
                src={resolveAssetUrl(profile.avatarUrl)}
                alt={profile.username}
                referrerPolicy="no-referrer"
                onError={(e) => {
                  const target = e.currentTarget;
                  const fallback = avatarChoices[0];
                  if (fallback && !target.src.endsWith(fallback)) {
                    target.src = fallback;
                  }
                }}
                className="w-8 h-8 rounded-lg object-cover border border-neutral-300 dark:border-neutral-700 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-neutral-900 dark:text-white truncate">
                  {profile.username}
                </div>
                <div className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
                  {profile.ratings.blitz.rating} Blitz Elo
                </div>
              </div>
            </button>

            <div className="flex items-center justify-between gap-2 px-1">
              <button
                type="button"
                onClick={() => setDarkMode((d) => !d)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-xs font-medium cursor-pointer"
                aria-label="Toggle light/dark theme"
              >
                {darkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                <span>{darkMode ? 'Light' : 'Dark'}</span>
              </button>
              <button
                type="button"
                onClick={() => updatePreferences({ soundEnabled: !preferences.soundEnabled })}
                className="p-2 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-xs cursor-pointer"
                aria-label="Toggle sound effects"
                title="Toggle Sound"
              >
                {preferences.soundEnabled ? (
                  <Volume2 className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <VolumeX className="w-3.5 h-3.5 text-neutral-400" />
                )}
              </button>
            </div>
          </div>
        </aside>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div
            className="fixed inset-0 top-14 z-50 lg:hidden bg-black/50 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
          >
            <div
              className="w-64 h-full bg-white dark:bg-[#11151C] border-r border-neutral-200 dark:border-neutral-800 p-4 flex flex-col justify-between overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => navigate('profile')}
                  className="w-full flex items-center gap-2.5 p-2.5 rounded-xl bg-neutral-100 dark:bg-neutral-800/70 text-left cursor-pointer"
                >
                  <img
                    src={resolveAssetUrl(profile.avatarUrl)}
                    alt={profile.username}
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      const target = e.currentTarget;
                      const fallback = avatarChoices[0];
                      if (fallback && !target.src.endsWith(fallback)) {
                        target.src = fallback;
                      }
                    }}
                    className="w-9 h-9 rounded-lg object-cover border border-neutral-300 dark:border-neutral-700 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-neutral-900 dark:text-white truncate">
                      {profile.username}
                    </div>
                    <div className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
                      {profile.ratings.blitz.rating} Blitz Elo · Edit PFP
                    </div>
                  </div>
                </button>
                <nav className="space-y-1">
                {SIDEBAR_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const active = section === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => navigate(item.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer ${
                        active
                          ? 'bg-emerald-700 text-white'
                          : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
                </nav>
              </div>

              <div className="pt-4 border-t border-neutral-200 dark:border-neutral-800 flex gap-2">
                <button
                  type="button"
                  onClick={() => setDarkMode((d) => !d)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-xs font-medium"
                >
                  {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                  {darkMode ? 'Light Mode' : 'Dark Mode'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Main Viewport */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 min-w-0">
          {section === 'dashboard' && (
            <DashboardView
              profile={profile}
              onNavigate={navigate}
              onQuickMatch={() => {
                setQuickMatchTrigger((n) => n + 1);
                navigate('multiplayer');
              }}
              onReviewGame={handleReviewGame}
            />
          )}

          {section === 'play' && (
            <PlayAIView
              preferences={preferences}
              playerName={profile.username}
              initialFen={playFen}
              lastRatingDelta={lastRatingDelta}
              onGameFinished={(g, rated, oppRating) =>
                recordGameFinished(g, { rated, opponentRating: oppRating })
              }
              onSendToReview={(pgn) => {
                setReviewFen(null);
                setReviewPgn(pgn);
                navigate('analyze');
              }}
              onAskCoach={(fen, pgn) => handleAskCoach(fen, pgn)}
            />
          )}

          {section === 'multiplayer' && (
            <MultiplayerView
              preferences={preferences}
              playerName={profile.username}
              playerRating={profile.ratings.blitz.rating}
              ratings={profile.ratings}
              skillLevel={profile.skillLevel}
              authUser={authUser}
              friendships={friendships}
              incomingInvites={incomingInvites}
              publicProfiles={publicProfiles}
              pendingInviteTarget={pendingInviteTarget}
              quickMatchTrigger={quickMatchTrigger}
              onQuickMatchConsumed={() => setQuickMatchTrigger(0)}
              lastRatingDelta={lastRatingDelta}
              onClearPendingInviteTarget={() => setPendingInviteTarget(null)}
              onSendGameInvite={async (toUid, toName, roomCode, tc) => {
                if (!authUser) return;
                await sendGameInviteToFriend(authUser, profile, toUid, toName, roomCode, tc);
              }}
              onRespondGameInvite={async (invite, accept) => {
                await updateGameInviteStatus(invite.id, accept ? 'accepted' : 'declined');
              }}
              onGameFinished={(g, rated, oppRating) =>
                recordGameFinished(g, { rated, opponentRating: oppRating })
              }
            />
          )}

          {section === 'analyze' && (
            <AnalyzeReviewView
              preferences={preferences}
              initialPgn={reviewPgn}
              initialFen={reviewFen}
              onAskCoach={handleAskCoach}
            />
          )}

          {section === 'academy' && (
            <AcademyView
              preferences={preferences}
              completedLessons={profile.completedLessons}
              xp={profile.xp}
              streakDays={profile.streakDays}
              onCompleteLesson={recordLessonComplete}
            />
          )}

          {section === 'puzzles' && (
            <PuzzlesView
              preferences={preferences}
              puzzleStats={profile.puzzleStats}
              onRecordPuzzle={recordPuzzleAttempt}
            />
          )}

          {section === 'openings' && (
            <OpeningsView
              key="openings"
              preferences={preferences}
              repertoire={profile.repertoire}
              onAddRepertoire={addRepertoireLine}
              onRecordDrill={recordRepertoireDrill}
              onDeleteRepertoire={deleteRepertoireLine}
              initialSubTab="explorer"
            />
          )}

          {section === 'repertoire' && (
            <OpeningsView
              key="repertoire"
              preferences={preferences}
              repertoire={profile.repertoire}
              onAddRepertoire={addRepertoireLine}
              onRecordDrill={recordRepertoireDrill}
              onDeleteRepertoire={deleteRepertoireLine}
              initialSubTab="repertoire"
            />
          )}

          {section === 'tools' && (
            <ToolsView
              preferences={preferences}
              onSendFenToAnalysis={(fen) => {
                setReviewPgn(null);
                setReviewFen(fen);
                navigate('analyze');
              }}
              onSendFenToPlay={(fen) => {
                setPlayFen(fen);
                navigate('play');
              }}
            />
          )}

          {section === 'coach' && (
            <CoachView
              preferences={preferences}
              skillLevel={profile.skillLevel}
              onChangeSkillLevel={(lvl) => updateProfileInfo({ skillLevel: lvl })}
              initialFen={coachContext.fen}
              initialPgn={coachContext.pgn}
              initialEvalSummary={coachContext.evalSummary}
            />
          )}

          {section === 'studio' && (
            <StudioView
              preferences={preferences}
              presets={profile.presets}
              onUpdate={updatePreferences}
              onReset={resetPreferences}
              onSavePreset={savePreset}
              onDeletePreset={deletePreset}
            />
          )}

          {section === 'profile' && (
            <ProfileView
              profile={profile}
              avatarChoices={avatarChoices}
              onUpdateProfile={updateProfileInfo}
              onReviewGame={handleReviewGame}
              onImportProfileJson={importProfileJson}
              authUser={authUser}
              authLoading={authLoading}
              cloudSyncState={cloudSyncState}
              cloudError={cloudError}
              onSignInGoogle={handleSignInGoogle}
              onSignOutGoogle={handleSignOutGoogle}
              publicProfiles={publicProfiles}
              incomingRequests={incomingRequests}
              outgoingRequests={outgoingRequests}
              friendships={friendships}
              onSendFriendRequest={async (target) => {
                if (!authUser) return;
                await sendFriendRequest(authUser, profile, target);
              }}
              onRespondFriendRequest={async (req, accept) => {
                if (!authUser) return;
                await respondToFriendRequest(authUser, req, accept);
              }}
              onRemoveFriendship={async (friendshipId) => {
                await removeFriendship(friendshipId);
              }}
              onChallengeFriendInArena={(uid, name) => {
                setPendingInviteTarget({ uid, name });
                navigate('multiplayer');
              }}
              onConnectExternalAccount={connectExternalAccount}
              onDisconnectExternalAccount={disconnectExternalAccount}
              appUrl={shareableAppUrl}
              linkCopied={linkCopied}
              onCopyAppLink={handleCopyAppLink}
            />
          )}
        </main>
      </div>

      {/* Subtle Copy Link Success Notification */}
      {copyToastVisible && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 shadow-lg border border-neutral-800 dark:border-neutral-300 text-xs font-medium max-w-sm"
        >
          <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 dark:text-emerald-700 flex items-center justify-center shrink-0">
            <Check className="w-3.5 h-3.5" />
          </span>
          <div className="min-w-0">
            <div className="font-semibold">Atelier Chess link copied!</div>
            <div className="text-[11px] font-mono opacity-75 truncate">{shareableAppUrl}</div>
          </div>
        </div>
      )}
    </div>
  );
}
