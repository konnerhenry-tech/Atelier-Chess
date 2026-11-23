import React, { useMemo, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import {
  Award,
  Camera,
  Check,
  Cloud,
  CloudOff,
  Download,
  ExternalLink,
  ImagePlus,
  Link2,
  LogIn,
  LogOut,
  RefreshCw,
  Search,
  Swords,
  Trophy,
  Unlink,
  Upload,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  FriendRequestRecord,
  FriendshipRecord,
  PublicProfileRecord,
} from '../services/firestoreSync';
import { PlayerProfileState } from '../store/useAcademyStore';
import { resolveAssetUrl } from '../utils/assetUrls';
import { LinkedChessAccount, SavedGameRecord } from '../types/chess';

interface ProfileViewProps {
  profile: PlayerProfileState;
  avatarChoices: string[];
  onUpdateProfile: (
    patch: Partial<Pick<PlayerProfileState, 'username' | 'avatarUrl' | 'skillLevel' | 'dailyGoalXp'>>
  ) => void;
  onReviewGame: (game: SavedGameRecord) => void;
  onImportProfileJson: (raw: string) => boolean;
  authUser: User | null;
  authLoading: boolean;
  cloudSyncState: 'idle' | 'syncing' | 'synced' | 'error';
  cloudError: string | null;
  onSignInGoogle: () => Promise<void>;
  onSignOutGoogle: () => Promise<void>;
  publicProfiles: PublicProfileRecord[];
  incomingRequests: FriendRequestRecord[];
  outgoingRequests: FriendRequestRecord[];
  friendships: FriendshipRecord[];
  onSendFriendRequest: (target: PublicProfileRecord) => Promise<void>;
  onRespondFriendRequest: (req: FriendRequestRecord, accept: boolean) => Promise<void>;
  onRemoveFriendship: (friendshipId: string) => Promise<void>;
  onChallengeFriendInArena: (friendUid: string, friendName: string) => void;
  onConnectExternalAccount: (account: LinkedChessAccount, applyEloToAtelier: boolean) => void;
  onDisconnectExternalAccount: (platform: 'chesscom' | 'lichess') => void;
  appUrl?: string;
  linkCopied?: boolean;
  onCopyAppLink?: () => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  profile,
  avatarChoices,
  onUpdateProfile,
  onReviewGame,
  onImportProfileJson,
  authUser,
  authLoading,
  cloudSyncState,
  cloudError,
  onSignInGoogle,
  onSignOutGoogle,
  publicProfiles,
  incomingRequests,
  outgoingRequests,
  friendships,
  onSendFriendRequest,
  onRespondFriendRequest,
  onRemoveFriendship,
  onChallengeFriendInArena,
  onConnectExternalAccount,
  onDisconnectExternalAccount,
  appUrl,
  linkCopied,
  onCopyAppLink,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pfpUploadInputRef = useRef<HTMLInputElement | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [leaderboardMetric, setLeaderboardMetric] = useState<'blitz' | 'rapid' | 'xp'>('blitz');
  const [selectedFriendProfile, setSelectedFriendProfile] = useState<PublicProfileRecord | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // PFP Changer state
  const [pfpModalOpen, setPfpModalOpen] = useState(false);
  const [customPfpUrl, setCustomPfpUrl] = useState('');
  const [pfpError, setPfpError] = useState<string | null>(null);

  // External Chess.com / Lichess Account Linker
  const [extPlatform, setExtPlatform] = useState<'chesscom' | 'lichess'>('chesscom');
  const [extUsername, setExtUsername] = useState('');
  const [applyImportedElo, setApplyImportedElo] = useState(true);
  const [extLoading, setExtLoading] = useState(false);
  const [extError, setExtError] = useState<string | null>(null);

  const handleUploadPfp = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPfpError(null);

    if (!file.type.startsWith('image/')) {
      setPfpError('Please choose an image file (PNG, JPG, or WebP).');
      return;
    }

    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Could not read file.'));
        reader.onload = () => {
          const img = new Image();
          img.onerror = () => reject(new Error('Invalid image file.'));
          img.onload = () => {
            const size = 128;
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              reject(new Error('Canvas unavailable.'));
              return;
            }
            // Center-crop square
            const minSide = Math.min(img.width, img.height);
            const sx = (img.width - minSide) / 2;
            const sy = (img.height - minSide) / 2;
            ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);

            let out = canvas.toDataURL('image/jpeg', 0.78);
            if (out.length > 28000) {
              out = canvas.toDataURL('image/jpeg', 0.55);
            }
            if (out.length > 32000) {
              reject(new Error('Image is still too large after compression.'));
              return;
            }
            resolve(out);
          };
          img.src = String(reader.result || '');
        };
        reader.readAsDataURL(file);
      });

      onUpdateProfile({ avatarUrl: dataUrl });
      setActionNotice('Profile picture updated.');
      setPfpModalOpen(false);
    } catch (err) {
      setPfpError(err instanceof Error ? err.message : 'Unable to process image.');
    }
  };

  const handleApplyCustomPfpUrl = () => {
    const trimmed = customPfpUrl.trim();
    setPfpError(null);
    if (!trimmed) return;
    if (!/^https:\/\/.+/.test(trimmed) || trimmed.length > 512) {
      setPfpError('Enter a valid https:// image URL (under 512 characters).');
      return;
    }
    onUpdateProfile({ avatarUrl: trimmed });
    setCustomPfpUrl('');
    setActionNotice('Profile picture updated.');
    setPfpModalOpen(false);
  };

  const handleLinkExternal = async (platformOverride?: 'chesscom' | 'lichess', usernameOverride?: string) => {
    const plat = platformOverride ?? extPlatform;
    const uname = (usernameOverride ?? extUsername).trim();
    if (!uname) return;

    setExtLoading(true);
    setExtError(null);
    try {
      const resp = await fetch(
        `/api/external-account?platform=${encodeURIComponent(plat)}&username=${encodeURIComponent(uname)}`
      );
      const data = await resp.json();
      if (!resp.ok) {
        setExtError(data.message || 'Could not retrieve player profile.');
        return;
      }
      const linked = data as LinkedChessAccount;
      onConnectExternalAccount(linked, applyImportedElo);
      setActionNotice(
        `Connected ${plat === 'chesscom' ? 'Chess.com' : 'Lichess'} account @${linked.username}${
          applyImportedElo ? ' and synced ratings to Atelier Elo.' : '.'
        }`
      );
      if (!usernameOverride) setExtUsername('');
    } catch {
      setExtError('Network error contacting Chess.com / Lichess lookup.');
    } finally {
      setExtLoading(false);
    }
  };

  const totalGames =
    profile.ratings.bullet.games +
    profile.ratings.blitz.games +
    profile.ratings.rapid.games +
    profile.ratings.classical.games;

  const totalWins =
    profile.ratings.bullet.wins +
    profile.ratings.blitz.wins +
    profile.ratings.rapid.wins +
    profile.ratings.classical.wins;

  const winRate = totalGames > 0 ? Math.round((totalWins / totalGames) * 100) : 0;

  const pendingIncoming = useMemo(
    () => incomingRequests.filter((r) => r.status === 'pending'),
    [incomingRequests]
  );

  const friendUidSet = useMemo(() => {
    const set = new Set<string>();
    if (!authUser) return set;
    friendships.forEach((f) => {
      set.add(f.userA === authUser.uid ? f.userB : f.userA);
    });
    return set;
  }, [friendships, authUser]);

  const outgoingPendingSet = useMemo(() => {
    return new Set(outgoingRequests.filter((r) => r.status === 'pending').map((r) => r.toUid));
  }, [outgoingRequests]);

  const publicByUid = useMemo(() => {
    const map = new Map<string, PublicProfileRecord>();
    publicProfiles.forEach((p) => map.set(p.uid, p));
    return map;
  }, [publicProfiles]);

  const searchResults = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return publicProfiles
      .filter((p) => p.uid !== authUser?.uid)
      .filter((p) => (!q ? true : p.usernameLower.includes(q)))
      .slice(0, 8);
  }, [publicProfiles, searchTerm, authUser?.uid]);

  const sortedLeaderboard = useMemo(() => {
    return [...publicProfiles]
      .sort((a, b) => {
        if (leaderboardMetric === 'blitz') return b.blitzRating - a.blitzRating;
        if (leaderboardMetric === 'rapid') return b.rapidRating - a.rapidRating;
        return b.xp - a.xp;
      })
      .slice(0, 20);
  }, [publicProfiles, leaderboardMetric]);

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `atelier-chess-${profile.username.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setActionNotice('Profile JSON exported.');
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const ok = onImportProfileJson(text);
    setActionNotice(ok ? 'Profile backup restored.' : 'Invalid profile JSON file.');
    e.target.value = '';
  };

  return (
    <div className="space-y-6">
      {/* Header & Account Sync */}
      <div className="bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setPfpModalOpen((v) => !v)}
              className="relative group w-20 h-20 rounded-2xl overflow-hidden border border-neutral-300 dark:border-neutral-700 cursor-pointer shrink-0"
              aria-label="Change profile picture"
              title="Change PFP"
            >
              <img
                src={resolveAssetUrl(profile.avatarUrl)}
                alt={profile.username}
                referrerPolicy="no-referrer"
                onError={(e) => {
                  const target = e.currentTarget;
                  if (avatarChoices[0] && target.src !== avatarChoices[0]) {
                    target.src = avatarChoices[0];
                  }
                }}
                className="w-full h-full object-cover"
              />
              <span className="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-[10px] font-semibold gap-1">
                <Camera className="w-4 h-4" />
                Change PFP
              </span>
            </button>
            <div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">
                {profile.skillLevel} Tier · {profile.xp} XP · {totalGames} Rated Games ({winRate}% Win Rate)
              </div>
              <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white mt-0.5">
                {profile.username}
              </h1>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {avatarChoices.map((url, idx) => (
                  <button
                    key={url}
                    type="button"
                    onClick={() => onUpdateProfile({ avatarUrl: url })}
                    className={`w-8 h-8 rounded-lg overflow-hidden border-2 cursor-pointer transition-transform hover:scale-105 ${
                      profile.avatarUrl === url ? 'border-emerald-600' : 'border-transparent opacity-75 hover:opacity-100'
                    }`}
                    aria-label={`Select avatar ${idx + 1}`}
                  >
                    <img src={resolveAssetUrl(url)} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setPfpModalOpen((v) => !v)}
                  className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-[#11151C] hover:bg-neutral-100 dark:hover:bg-neutral-800 text-xs font-medium cursor-pointer"
                >
                  <ImagePlus className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>{pfpModalOpen ? 'Close PFP' : 'Change PFP'}</span>
                </button>
              </div>
            </div>
          </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs">
            <span className="block text-neutral-500 mb-1">Display Name</span>
            <input
              type="text"
              value={profile.username}
              maxLength={28}
              onChange={(e) => onUpdateProfile({ username: e.target.value })}
              className="px-3 py-1.5 rounded-lg text-xs bg-neutral-50 dark:bg-[#11151C] border border-neutral-200 dark:border-neutral-800"
            />
          </label>
          <label className="text-xs">
            <span className="block text-neutral-500 mb-1">Skill Track</span>
            <select
              value={profile.skillLevel}
              onChange={(e) =>
                onUpdateProfile({
                  skillLevel: e.target.value as 'Beginner' | 'Intermediate' | 'Advanced',
                })
              }
              className="px-3 py-1.5 rounded-lg text-xs bg-neutral-50 dark:bg-[#11151C] border border-neutral-200 dark:border-neutral-800"
            >
              <option value="Beginner">Beginner</option>
              <option value="Intermediate">Intermediate</option>
              <option value="Advanced">Advanced</option>
            </select>
          </label>

          {onCopyAppLink && (
            <button
              type="button"
              onClick={onCopyAppLink}
              title={appUrl}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                linkCopied
                  ? 'border-emerald-600/50 bg-emerald-600/10 text-emerald-700 dark:text-emerald-300'
                  : 'border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800'
              }`}
            >
              {linkCopied ? <Check className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
              <span>{linkCopied ? 'Copied!' : 'Copy Link'}</span>
            </button>
          )}

          {authUser ? (
            <div className="flex items-center gap-2">
              <div className="px-3 py-1.5 rounded-lg bg-emerald-700/10 border border-emerald-600/30 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-1.5">
                <Cloud className="w-3.5 h-3.5" />
                <span>
                  {cloudSyncState === 'syncing'
                    ? 'Syncing…'
                    : cloudSyncState === 'error'
                      ? 'Sync Issue'
                      : authUser.email || 'Cloud Synced'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => void onSignOutGoogle()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 text-xs font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={authLoading}
              onClick={() => void onSignInGoogle()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
            >
              <LogIn className="w-4 h-4" />
              {authLoading ? 'Connecting…' : 'Sign in with Google'}
            </button>
          )}
        </div>
        </div>

        {/* Expandable Profile Picture Studio */}
        {pfpModalOpen && (
          <div className="pt-4 border-t border-neutral-200 dark:border-neutral-800 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
                  Customize Profile Picture (PFP)
                </h2>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Pick a chess portrait, upload your own photo, or paste an image URL.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPfpModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
                aria-label="Close avatar picker"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {avatarChoices.map((url, idx) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => {
                    onUpdateProfile({ avatarUrl: url });
                    setActionNotice('Profile picture updated.');
                    setPfpModalOpen(false);
                  }}
                  className={`w-14 h-14 rounded-xl overflow-hidden border-2 cursor-pointer transition-transform hover:scale-105 ${
                    profile.avatarUrl === url ? 'border-emerald-600 ring-2 ring-emerald-500/30' : 'border-neutral-200 dark:border-neutral-700'
                  }`}
                  aria-label={`Chess avatar portrait ${idx + 1}`}
                >
                  <img src={resolveAssetUrl(url)} alt={`Chess portrait ${idx + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <input
                ref={pfpUploadInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={(e) => void handleUploadPfp(e)}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => pfpUploadInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                Upload Photo
              </button>

              {authUser?.photoURL && (
                <button
                  type="button"
                  onClick={() => {
                    if (authUser.photoURL) {
                      onUpdateProfile({ avatarUrl: authUser.photoURL });
                      setActionNotice('Restored Google profile photo.');
                      setPfpModalOpen(false);
                    }
                  }}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-[#11151C] hover:bg-neutral-100 dark:hover:bg-neutral-800 text-xs font-medium cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5" />
                  Use Google Photo
                </button>
              )}

              <div className="flex-1 min-w-[220px] flex items-center gap-2">
                <input
                  type="url"
                  value={customPfpUrl}
                  onChange={(e) => setCustomPfpUrl(e.target.value)}
                  placeholder="https://... custom image URL"
                  className="flex-1 px-3 py-2 rounded-lg text-xs bg-neutral-50 dark:bg-[#11151C] border border-neutral-200 dark:border-neutral-800"
                />
                <button
                  type="button"
                  onClick={handleApplyCustomPfpUrl}
                  className="px-3 py-2 rounded-lg bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-xs font-semibold cursor-pointer"
                >
                  Apply URL
                </button>
              </div>
            </div>

            {pfpError && (
              <p className="text-xs text-red-600 dark:text-red-400">{pfpError}</p>
            )}
          </div>
        )}
      </div>

      {cloudError && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
          <CloudOff className="w-4 h-4 shrink-0" />
          <span>{cloudError}</span>
        </div>
      )}

      {actionNotice && (
        <div className="p-3 rounded-xl bg-emerald-700/10 border border-emerald-600/30 text-xs text-emerald-700 dark:text-emerald-300 flex items-center justify-between">
          <span>{actionNotice}</span>
          <button type="button" onClick={() => setActionNotice(null)} className="cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Ratings Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {(
          [
            { label: 'Bullet', r: profile.ratings.bullet },
            { label: 'Blitz', r: profile.ratings.blitz },
            { label: 'Rapid', r: profile.ratings.rapid },
            { label: 'Classical', r: profile.ratings.classical },
          ] as const
        ).map((item) => (
          <div
            key={item.label}
            className="bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 rounded-xl p-4"
          >
            <div className="text-xs text-neutral-500">{item.label} (Atelier Glicko-2)</div>
            <div className="text-2xl font-mono tabular-nums font-bold mt-1">{item.r.rating}</div>
            <div className="text-xs font-mono tabular-nums text-neutral-500 mt-1">
              {item.r.wins}W · {item.r.losses}L · {item.r.draws}D · RD ±{item.r.rd}
            </div>
          </div>
        ))}
      </div>

      {/* Connect Chess.com or Lichess Account */}
      <div className="bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold flex items-center gap-2 text-neutral-900 dark:text-white">
              <Link2 className="w-4 h-4 text-emerald-600" />
              Connect Chess.com or Lichess Account
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              Fetch your live official Chess.com or Lichess ratings and optionally import them as your starting Atelier Elo.
            </p>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleLinkExternal();
          }}
          className="flex flex-wrap items-center gap-2.5"
        >
          <div className="flex items-center gap-1 p-1 bg-neutral-100 dark:bg-[#11151C] rounded-lg text-xs">
            <button
              type="button"
              onClick={() => setExtPlatform('chesscom')}
              className={`px-3 py-1.5 rounded-md font-semibold cursor-pointer ${
                extPlatform === 'chesscom'
                  ? 'bg-white dark:bg-[#1F2633] text-neutral-900 dark:text-white shadow-xs'
                  : 'text-neutral-500'
              }`}
            >
              Chess.com
            </button>
            <button
              type="button"
              onClick={() => setExtPlatform('lichess')}
              className={`px-3 py-1.5 rounded-md font-semibold cursor-pointer ${
                extPlatform === 'lichess'
                  ? 'bg-white dark:bg-[#1F2633] text-neutral-900 dark:text-white shadow-xs'
                  : 'text-neutral-500'
              }`}
            >
              Lichess.org
            </button>
          </div>

          <input
            type="text"
            value={extUsername}
            onChange={(e) => setExtUsername(e.target.value)}
            placeholder={`Enter ${extPlatform === 'chesscom' ? 'Chess.com' : 'Lichess'} username…`}
            className="flex-1 min-w-[200px] px-3 py-2 rounded-lg text-xs bg-neutral-50 dark:bg-[#11151C] border border-neutral-200 dark:border-neutral-800"
          />

          <label className="inline-flex items-center gap-2 text-xs font-medium text-neutral-600 dark:text-neutral-300 cursor-pointer">
            <input
              type="checkbox"
              checked={applyImportedElo}
              onChange={(e) => setApplyImportedElo(e.target.checked)}
              className="accent-emerald-600 w-4 h-4"
            />
            Sync imported Elo to Atelier ratings
          </label>

          <button
            type="submit"
            disabled={extLoading || !extUsername.trim()}
            className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold disabled:opacity-40 cursor-pointer"
          >
            {extLoading ? 'Fetching…' : 'Connect & Sync'}
          </button>
        </form>

        {extError && <p className="text-xs text-red-500">{extError}</p>}

        {(profile.linkedAccounts?.chesscom || profile.linkedAccounts?.lichess) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            {(['chesscom', 'lichess'] as const).map((plat) => {
              const acc = profile.linkedAccounts?.[plat];
              if (!acc) return null;
              return (
                <div
                  key={plat}
                  className="p-3.5 rounded-xl bg-neutral-50 dark:bg-[#11151C] border border-neutral-200 dark:border-neutral-800 space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold text-sm flex items-center gap-1.5">
                      <span>{plat === 'chesscom' ? 'Chess.com' : 'Lichess'}</span>
                      <span className="font-mono text-emerald-600 dark:text-emerald-400">
                        @{acc.username}
                      </span>
                      <a
                        href={acc.profileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-neutral-400 hover:text-emerald-500"
                        title="View public profile"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={extLoading}
                        onClick={() => void handleLinkExternal(plat, acc.username)}
                        className="p-1.5 rounded-md hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-500 cursor-pointer"
                        title="Refresh live ratings"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onDisconnectExternalAccount(plat);
                          setActionNotice(
                            `Disconnected ${plat === 'chesscom' ? 'Chess.com' : 'Lichess'} account.`
                          );
                        }}
                        className="p-1.5 rounded-md hover:bg-red-500/10 text-neutral-400 hover:text-red-500 cursor-pointer"
                        title="Disconnect account"
                      >
                        <Unlink className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-2 font-mono text-center">
                    <div className="p-1.5 rounded bg-white dark:bg-[#151921]">
                      <div className="text-[10px] text-neutral-500">Bullet</div>
                      <div className="font-bold">{acc.ratings.bullet ?? '—'}</div>
                    </div>
                    <div className="p-1.5 rounded bg-white dark:bg-[#151921]">
                      <div className="text-[10px] text-neutral-500">Blitz</div>
                      <div className="font-bold">{acc.ratings.blitz ?? '—'}</div>
                    </div>
                    <div className="p-1.5 rounded bg-white dark:bg-[#151921]">
                      <div className="text-[10px] text-neutral-500">Rapid</div>
                      <div className="font-bold">{acc.ratings.rapid ?? '—'}</div>
                    </div>
                    <div className="p-1.5 rounded bg-white dark:bg-[#151921]">
                      <div className="text-[10px] text-neutral-500">Classical</div>
                      <div className="font-bold">{acc.ratings.classical ?? '—'}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Friends, Social Search & Global Leaderboard */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-600" />
              Friends &amp; Rivals ({friendships.length})
            </h2>
          </div>

          {!authUser ? (
            <div className="p-4 rounded-xl bg-neutral-50 dark:bg-[#11151C] border border-neutral-200 dark:border-neutral-800 text-xs text-neutral-600 dark:text-neutral-300 space-y-3">
              <p>
                Sign in with Google to save your ratings, repertoire, and studio presets across devices,
                add chess friends, and join the Global Leaderboard.
              </p>
              <button
                type="button"
                onClick={() => void onSignInGoogle()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 text-white font-semibold cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                Sign in with Google
              </button>
            </div>
          ) : (
            <>
              {/* Incoming Friend Requests */}
              {pendingIncoming.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                    Incoming Friend Requests ({pendingIncoming.length})
                  </div>
                  {pendingIncoming.map((req) => (
                    <div
                      key={req.id}
                      className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-2.5">
                        <img
                          src={req.fromAvatar}
                          alt={req.fromName}
                          referrerPolicy="no-referrer"
                          className="w-8 h-8 rounded-lg object-cover"
                        />
                        <span className="font-semibold">{req.fromName}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => void onRespondFriendRequest(req, true)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-700 text-white font-semibold cursor-pointer"
                        >
                          <Check className="w-3 h-3" />
                          Accept
                        </button>
                        <button
                          type="button"
                          onClick={() => void onRespondFriendRequest(req, false)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-neutral-200 dark:bg-neutral-800 font-semibold cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                          Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Friends List */}
              {friendships.length === 0 ? (
                <p className="text-xs text-neutral-500">
                  No friends added yet. Search registered players below to connect.
                </p>
              ) : (
                <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
                  {friendships.map((f) => {
                    const isA = f.userA === authUser.uid;
                    const friendUid = isA ? f.userB : f.userA;
                    const friendName = isA ? f.nameB : f.nameA;
                    const friendAvatar = isA ? f.avatarB : f.avatarA;
                    const friendPub = publicByUid.get(friendUid);

                    return (
                      <div key={f.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() => {
                            if (friendPub) setSelectedFriendProfile(friendPub);
                          }}
                          className="flex items-center gap-2.5 text-left hover:underline cursor-pointer"
                        >
                          <img
                            src={friendAvatar}
                            alt={friendName}
                            referrerPolicy="no-referrer"
                            className="w-8 h-8 rounded-lg object-cover border border-neutral-200 dark:border-neutral-700"
                          />
                          <div>
                            <div className="font-semibold text-sm">{friendName}</div>
                            <div className="text-neutral-500 font-mono">
                              {friendPub ? `Blitz ${friendPub.blitzRating} · ${friendPub.skillLevel}` : 'Connected Friend'}
                            </div>
                          </div>
                        </button>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onChallengeFriendInArena(friendUid, friendName)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-700 text-white font-semibold cursor-pointer"
                            title="Challenge to Live Match"
                          >
                            <Swords className="w-3.5 h-3.5" />
                            Challenge
                          </button>
                          <button
                            type="button"
                            onClick={() => void onRemoveFriendship(f.id)}
                            className="p-1.5 rounded-lg text-neutral-400 hover:text-red-500 hover:bg-red-500/10 cursor-pointer"
                            title="Remove Friend"
                          >
                            <UserMinus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Search Players */}
              <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800 space-y-2">
                <label className="text-xs font-medium text-neutral-500 block">
                  Find Players by Username
                </label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search Atelier Chess players…"
                    className="w-full pl-8 pr-3 py-2 rounded-lg text-xs bg-neutral-50 dark:bg-[#11151C] border border-neutral-200 dark:border-neutral-800"
                  />
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {searchResults.length === 0 ? (
                    <p className="text-xs text-neutral-500 py-2">No other discoverable players match yet.</p>
                  ) : (
                    searchResults.map((p) => {
                      const isFriend = friendUidSet.has(p.uid);
                      const isPending = outgoingPendingSet.has(p.uid);
                      return (
                        <div
                          key={p.uid}
                          className="flex items-center justify-between p-2 rounded-lg bg-neutral-50 dark:bg-[#11151C] text-xs"
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedFriendProfile(p)}
                            className="flex items-center gap-2 text-left hover:underline cursor-pointer"
                          >
                            <img
                              src={resolveAssetUrl(p.avatarUrl)}
                              alt={p.username}
                              referrerPolicy="no-referrer"
                              className="w-7 h-7 rounded object-cover"
                            />
                            <div>
                              <div className="font-semibold">{p.username}</div>
                              <div className="text-neutral-500 font-mono">
                                Blitz {p.blitzRating} · {p.xp} XP
                              </div>
                            </div>
                          </button>
                          {isFriend ? (
                            <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                              <UserCheck className="w-3.5 h-3.5" />
                              Friends
                            </span>
                          ) : isPending ? (
                            <span className="text-neutral-400 font-medium">Requested</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                void onSendFriendRequest(p).then(() =>
                                  setActionNotice(`Friend request sent to ${p.username}.`)
                                );
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 font-semibold cursor-pointer"
                            >
                              <UserPlus className="w-3.5 h-3.5" />
                              Add
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Global Cloud Leaderboard */}
        <div className="lg:col-span-6 bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-500" />
              Global Leaderboard
            </h2>
            <div className="flex gap-1 bg-neutral-100 dark:bg-[#11151C] p-1 rounded-lg text-xs">
              {(
                [
                  { id: 'blitz', label: 'Blitz' },
                  { id: 'rapid', label: 'Rapid' },
                  { id: 'xp', label: 'Academy XP' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setLeaderboardMetric(m.id)}
                  className={`px-2.5 py-1 rounded-md font-medium cursor-pointer ${
                    leaderboardMetric === m.id
                      ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white shadow-xs'
                      : 'text-neutral-500'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {!authUser ? (
            <p className="text-xs text-neutral-500 py-8 text-center">
              Sign in with Google to view and compete on the live Global Leaderboard.
            </p>
          ) : sortedLeaderboard.length === 0 ? (
            <p className="text-xs text-neutral-500 py-8 text-center">
              Leaderboard populates automatically as players sign in and sync profiles.
            </p>
          ) : (
            <div className="divide-y divide-neutral-200 dark:divide-neutral-800 max-h-80 overflow-y-auto">
              {sortedLeaderboard.map((player, idx) => (
                <div
                  key={player.uid}
                  className="py-2.5 flex items-center justify-between text-xs gap-3"
                >
                  <button
                    type="button"
                    onClick={() => setSelectedFriendProfile(player)}
                    className="flex items-center gap-3 text-left hover:underline cursor-pointer"
                  >
                    <span className="w-5 font-mono font-bold text-neutral-400">#{idx + 1}</span>
                    <img
                      src={resolveAssetUrl(player.avatarUrl)}
                      alt={player.username}
                      referrerPolicy="no-referrer"
                      className="w-7 h-7 rounded-lg object-cover"
                    />
                    <div>
                      <div className="font-semibold">
                        {player.username}
                        {player.uid === authUser.uid ? ' (You)' : ''}
                      </div>
                      <div className="text-neutral-500">
                        {player.skillLevel} · {player.totalWins}W / {player.totalGames}G
                        {player.linkedBadge ? ` · ${player.linkedBadge}` : ''}
                      </div>
                    </div>
                  </button>
                  <div className="font-mono tabular-nums font-bold text-sm text-emerald-600 dark:text-emerald-400">
                    {leaderboardMetric === 'blitz'
                      ? player.blitzRating
                      : leaderboardMetric === 'rapid'
                        ? player.rapidRating
                        : `${player.xp} XP`}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Game History, Achievements & JSON Portability */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5">
          <h2 className="text-base font-semibold mb-4">Complete Game History</h2>
          {profile.games.length === 0 ? (
            <p className="text-xs text-neutral-500">No games saved yet.</p>
          ) : (
            <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {profile.games.map((g) => (
                <div key={g.id} className="py-3 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-semibold text-sm">
                      {g.whiteName} vs {g.blackName}
                    </div>
                    <div className="text-neutral-500 mt-0.5">
                      {new Date(g.date).toLocaleDateString()} · {g.timeControl} · {g.openingName || 'Chess'}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-semibold">{g.result}</span>
                    <button
                      type="button"
                      onClick={() => onReviewGame(g)}
                      className="px-2.5 py-1 rounded bg-neutral-100 dark:bg-neutral-800 font-medium cursor-pointer"
                    >
                      Review
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 space-y-3">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-500" />
              Honors &amp; Achievements
            </h2>
            {profile.achievements.length === 0 ? (
              <p className="text-xs text-neutral-500">Earn achievements by playing and training.</p>
            ) : (
              <ul className="space-y-2 text-xs">
                {profile.achievements.map((a) => (
                  <li key={a} className="flex items-center gap-2">
                    <Award className="w-4 h-4 text-emerald-500" />
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 space-y-3">
            <h2 className="text-base font-semibold">Profile Backup</h2>
            <p className="text-xs text-neutral-500">
              Export or restore your repertoire, board presets, and game archive as portable JSON.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleExportJson}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-xs font-medium cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Export JSON
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 text-xs font-medium cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                Import JSON
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                onChange={(e) => void handleImportFile(e)}
                className="hidden"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Public Player Inspection Modal */}
      {selectedFriendProfile && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setSelectedFriendProfile(null)}
        >
          <div
            className="max-w-md w-full bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <img
                  src={resolveAssetUrl(selectedFriendProfile.avatarUrl)}
                  alt={selectedFriendProfile.username}
                  referrerPolicy="no-referrer"
                  className="w-14 h-14 rounded-xl object-cover"
                />
                <div>
                  <h3 className="text-lg font-semibold">{selectedFriendProfile.username}</h3>
                  <div className="text-xs text-neutral-500">
                    {selectedFriendProfile.skillLevel} · {selectedFriendProfile.xp} XP ·{' '}
                    {selectedFriendProfile.totalWins} Wins
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedFriendProfile(null)}
                className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-neutral-50 dark:bg-[#11151C]">
                <div className="text-neutral-500">Blitz Rating</div>
                <div className="text-lg font-mono font-bold">{selectedFriendProfile.blitzRating}</div>
              </div>
              <div className="p-3 rounded-xl bg-neutral-50 dark:bg-[#11151C]">
                <div className="text-neutral-500">Rapid Rating</div>
                <div className="text-lg font-mono font-bold">{selectedFriendProfile.rapidRating}</div>
              </div>
              <div className="p-3 rounded-xl bg-neutral-50 dark:bg-[#11151C]">
                <div className="text-neutral-500">Bullet Rating</div>
                <div className="text-lg font-mono font-bold">{selectedFriendProfile.bulletRating}</div>
              </div>
              <div className="p-3 rounded-xl bg-neutral-50 dark:bg-[#11151C]">
                <div className="text-neutral-500">Puzzle Rating</div>
                <div className="text-lg font-mono font-bold">{selectedFriendProfile.puzzleRating}</div>
              </div>
            </div>

            {authUser && selectedFriendProfile.uid !== authUser.uid && (
              <div className="flex justify-end gap-2">
                {friendUidSet.has(selectedFriendProfile.uid) ? (
                  <button
                    type="button"
                    onClick={() => {
                      onChallengeFriendInArena(
                        selectedFriendProfile.uid,
                        selectedFriendProfile.username
                      );
                      setSelectedFriendProfile(null);
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
                  >
                    <Swords className="w-3.5 h-3.5" />
                    Challenge to Match
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={outgoingPendingSet.has(selectedFriendProfile.uid)}
                    onClick={() => {
                      void onSendFriendRequest(selectedFriendProfile);
                      setSelectedFriendProfile(null);
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-700 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    {outgoingPendingSet.has(selectedFriendProfile.uid)
                      ? 'Request Pending'
                      : 'Send Friend Request'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
