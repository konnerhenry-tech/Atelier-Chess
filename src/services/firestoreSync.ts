import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { signInWithPopup, signOut, User } from 'firebase/auth';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '../firebase';
import { PlayerProfileState } from '../store/useAcademyStore';
import { BoardPreferences } from '../types/chess';

// Constraints synchronized verbatim with firebase-blueprint.json & firestore.rules
const ID_PATTERN = /^[a-zA-Z0-9_\-]+$/;
const ROOM_CODE_PATTERN = /^[A-Z0-9]+$/;
const USERNAME_MIN = 2;
const USERNAME_MAX = 28;
const AVATAR_MAX = 32768;
const AVATAR_PATTERN = /^(https:\/\/|\/|data:image\/(jpeg|png|webp);base64,)/;
const EMAIL_MAX = 256;
const DEFAULT_AVATAR = '/src/assets/images/avatar_tactician_1795303198124.jpg';

export interface PublicProfileRecord {
  uid: string;
  username: string;
  usernameLower: string;
  avatarUrl: string;
  skillLevel: 'Beginner' | 'Intermediate' | 'Advanced';
  xp: number;
  blitzRating: number;
  rapidRating: number;
  bulletRating: number;
  classicalRating: number;
  puzzleRating: number;
  totalWins: number;
  totalGames: number;
  isDiscoverable: boolean;
  linkedBadge?: string;
}

export interface FriendRequestRecord {
  id: string;
  fromUid: string;
  fromName: string;
  fromAvatar: string;
  toUid: string;
  toName: string;
  toAvatar: string;
  status: 'pending' | 'accepted' | 'declined';
}

export interface FriendshipRecord {
  id: string;
  userA: string;
  userB: string;
  nameA: string;
  avatarA: string;
  nameB: string;
  avatarB: string;
  memberUids: [string, string];
  requestId: string;
}

export interface GameInviteRecord {
  id: string;
  fromUid: string;
  fromName: string;
  fromRating: number;
  toUid: string;
  toName: string;
  roomCode: string;
  timeControlLabel: string;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
}

function sanitizeUsername(raw: string | null | undefined, fallback = 'AtelierPlayer'): string {
  const cleaned = (raw || fallback).trim().replace(/\s+/g, ' ').slice(0, USERNAME_MAX);
  return cleaned.length >= USERNAME_MIN ? cleaned : 'AtelierPlayer';
}

function sanitizeAvatar(raw: string | null | undefined): string {
  const val = (raw || '').trim();
  if (!val || val.length > AVATAR_MAX || !AVATAR_PATTERN.test(val)) return DEFAULT_AVATAR;
  return val;
}

function clampRating(val: number): number {
  if (!Number.isFinite(val)) return 100;
  return Math.max(100, Math.min(3500, Math.round(val)));
}

function sanitizeUserPayload(
  uid: string,
  email: string,
  profile: PlayerProfileState,
  preferences: BoardPreferences
) {
  const safeName = sanitizeUsername(profile.username);
  const safeAvatar = sanitizeAvatar(profile.avatarUrl);
  const safeSkill: 'Beginner' | 'Intermediate' | 'Advanced' =
    profile.skillLevel === 'Beginner' || profile.skillLevel === 'Advanced'
      ? profile.skillLevel
      : 'Intermediate';

  return {
    uid,
    email: email.slice(0, EMAIL_MAX),
    username: safeName,
    avatarUrl: safeAvatar,
    skillLevel: safeSkill,
    xp: Math.max(0, Math.min(10000000, Math.round(profile.xp || 0))),
    streakDays: Math.max(0, Math.min(10000, Math.round(profile.streakDays || 1))),
    lastActiveDate: String(profile.lastActiveDate || new Date().toISOString().slice(0, 10)).slice(0, 20),
    dailyGoalXp: Math.max(10, Math.min(5000, Math.round(profile.dailyGoalXp || 100))),
    dailyXpEarned: Math.max(0, Math.min(100000, Math.round(profile.dailyXpEarned || 0))),
    ratings: {
      bullet: profile.ratings.bullet,
      blitz: profile.ratings.blitz,
      rapid: profile.ratings.rapid,
      classical: profile.ratings.classical,
    },
    ratingHistory: (profile.ratingHistory || []).slice(-40),
    completedLessons: (profile.completedLessons || []).slice(0, 100).map((s) => String(s).slice(0, 80)),
    puzzleStats: profile.puzzleStats,
    achievements: (profile.achievements || []).slice(0, 50).map((s) => String(s).slice(0, 80)),
    games: (profile.games || []).slice(0, 50),
    repertoire: (profile.repertoire || []).slice(0, 100),
    presets: (profile.presets || []).slice(0, 16),
    preferences,
    linkedAccounts: profile.linkedAccounts || {},
  };
}

function buildLinkedBadge(profile: PlayerProfileState): string {
  const cc = profile.linkedAccounts?.chesscom;
  const li = profile.linkedAccounts?.lichess;
  if (cc) {
    const peak = Math.max(cc.ratings.blitz || 0, cc.ratings.rapid || 0, cc.ratings.bullet || 0, 0);
    return `Chess.com @${cc.username}${peak > 0 ? ` (${peak})` : ''}`.slice(0, 64);
  }
  if (li) {
    const peak = Math.max(li.ratings.blitz || 0, li.ratings.rapid || 0, li.ratings.bullet || 0, 0);
    return `Lichess @${li.username}${peak > 0 ? ` (${peak})` : ''}`.slice(0, 64);
  }
  return '';
}

function sanitizePublicPayload(uid: string, profile: PlayerProfileState) {
  const safeName = sanitizeUsername(profile.username);
  const safeAvatar = sanitizeAvatar(profile.avatarUrl);
  const safeSkill: 'Beginner' | 'Intermediate' | 'Advanced' =
    profile.skillLevel === 'Beginner' || profile.skillLevel === 'Advanced'
      ? profile.skillLevel
      : 'Intermediate';

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

  return {
    uid,
    username: safeName,
    usernameLower: safeName.toLowerCase(),
    avatarUrl: safeAvatar,
    skillLevel: safeSkill,
    xp: Math.max(0, Math.min(10000000, Math.round(profile.xp || 0))),
    blitzRating: clampRating(profile.ratings.blitz.rating),
    rapidRating: clampRating(profile.ratings.rapid.rating),
    bulletRating: clampRating(profile.ratings.bullet.rating),
    classicalRating: clampRating(profile.ratings.classical.rating),
    puzzleRating: clampRating(profile.puzzleStats.puzzleRating),
    totalWins: Math.max(0, Math.min(1000000, totalWins)),
    totalGames: Math.max(0, Math.min(1000000, totalGames)),
    isDiscoverable: true,
    linkedBadge: buildLinkedBadge(profile),
  };
}

export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signOutGoogle(): Promise<void> {
  await signOut(auth);
}

export async function loadOrCreateCloudProfile(
  user: User,
  localProfile: PlayerProfileState,
  localPreferences: BoardPreferences
): Promise<{
  profilePatch: Partial<PlayerProfileState>;
  preferencesPatch?: Partial<BoardPreferences>;
  isNewAccount: boolean;
}> {
  if (!ID_PATTERN.test(user.uid)) {
    throw new Error('Invalid user UID format.');
  }

  const userPath = `users/${user.uid}`;
  const publicPath = `publicProfiles/${user.uid}`;
  const userRef = doc(db, 'users', user.uid);
  const publicRef = doc(db, 'publicProfiles', user.uid);

  let snap;
  try {
    snap = await getDoc(userRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, userPath);
  }

  if (snap.exists()) {
    const data = snap.data() as Record<string, unknown>;
    const mergedProfile: PlayerProfileState = {
      ...localProfile,
      username: sanitizeUsername(String(data.username || localProfile.username)),
      avatarUrl: sanitizeAvatar(String(data.avatarUrl || localProfile.avatarUrl)),
      skillLevel:
        data.skillLevel === 'Beginner' || data.skillLevel === 'Advanced'
          ? data.skillLevel
          : 'Intermediate',
      xp: typeof data.xp === 'number' ? data.xp : localProfile.xp,
      streakDays: typeof data.streakDays === 'number' ? data.streakDays : localProfile.streakDays,
      lastActiveDate: String(data.lastActiveDate || localProfile.lastActiveDate),
      dailyGoalXp: typeof data.dailyGoalXp === 'number' ? data.dailyGoalXp : localProfile.dailyGoalXp,
      dailyXpEarned: typeof data.dailyXpEarned === 'number' ? data.dailyXpEarned : localProfile.dailyXpEarned,
      ratings: (data.ratings as PlayerProfileState['ratings']) || localProfile.ratings,
      ratingHistory: (data.ratingHistory as PlayerProfileState['ratingHistory']) || localProfile.ratingHistory,
      completedLessons: (data.completedLessons as string[]) || localProfile.completedLessons,
      puzzleStats: (data.puzzleStats as PlayerProfileState['puzzleStats']) || localProfile.puzzleStats,
      achievements: (data.achievements as string[]) || localProfile.achievements,
      games: (data.games as PlayerProfileState['games']) || localProfile.games,
      repertoire: (data.repertoire as PlayerProfileState['repertoire']) || localProfile.repertoire,
      presets: (data.presets as PlayerProfileState['presets']) || localProfile.presets,
      linkedAccounts:
        (data.linkedAccounts as PlayerProfileState['linkedAccounts']) ||
        localProfile.linkedAccounts ||
        {},
    };

    try {
      const pubSnap = await getDoc(publicRef);
      const pubBody = sanitizePublicPayload(user.uid, mergedProfile);
      if (!pubSnap.exists()) {
        await setDoc(publicRef, {
          ...pubBody,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        const { uid: _ignored, ...mutablePublic } = pubBody;
        await updateDoc(publicRef, {
          ...mutablePublic,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, publicPath);
    }

    return {
      profilePatch: mergedProfile,
      preferencesPatch: (data.preferences as Partial<BoardPreferences>) || undefined,
      isNewAccount: false,
    };
  }

  // First time cloud sign-in: seed cloud account from Google identity + current local progress
  const seededProfile: PlayerProfileState = {
    ...localProfile,
    username:
      localProfile.username === 'AtelierPlayer' && user.displayName
        ? sanitizeUsername(user.displayName)
        : sanitizeUsername(localProfile.username),
    avatarUrl:
      user.photoURL && localProfile.avatarUrl === DEFAULT_AVATAR
        ? sanitizeAvatar(user.photoURL)
        : sanitizeAvatar(localProfile.avatarUrl),
  };

  const userPayload = sanitizeUserPayload(
    user.uid,
    user.email || '',
    seededProfile,
    localPreferences
  );
  const publicPayload = sanitizePublicPayload(user.uid, seededProfile);

  try {
    const batch = writeBatch(db);
    batch.set(userRef, {
      ...userPayload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.set(publicRef, {
      ...publicPayload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, userPath);
  }

  return {
    profilePatch: seededProfile,
    isNewAccount: true,
  };
}

export async function syncCloudProfile(
  user: User,
  profile: PlayerProfileState,
  preferences: BoardPreferences
): Promise<void> {
  if (!ID_PATTERN.test(user.uid)) return;
  const userPath = `users/${user.uid}`;
  const publicPath = `publicProfiles/${user.uid}`;

  const userPayload = sanitizeUserPayload(user.uid, user.email || '', profile, preferences);
  const publicPayload = sanitizePublicPayload(user.uid, profile);

  const { uid: _uUid, ...mutableUser } = userPayload;
  const { uid: _pUid, ...mutablePublic } = publicPayload;

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'users', user.uid), {
      ...mutableUser,
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(db, 'publicProfiles', user.uid), {
      ...mutablePublic,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `${userPath},${publicPath}`);
  }
}

export async function sendFriendRequest(
  fromUser: User,
  fromProfile: PlayerProfileState,
  target: PublicProfileRecord
): Promise<void> {
  if (fromUser.uid === target.uid) return;
  if (!ID_PATTERN.test(fromUser.uid) || !ID_PATTERN.test(target.uid)) return;

  const requestId = `${fromUser.uid}_${target.uid}`;
  const path = `friendRequests/${requestId}`;
  const reqRef = doc(db, 'friendRequests', requestId);

  try {
    const existing = await getDoc(reqRef);
    if (existing.exists()) {
      const st = existing.data()?.status;
      if (st === 'pending' || st === 'accepted') return;
      await deleteDoc(reqRef);
    }

    await setDoc(reqRef, {
      fromUid: fromUser.uid,
      fromName: sanitizeUsername(fromProfile.username),
      fromAvatar: sanitizeAvatar(fromProfile.avatarUrl),
      toUid: target.uid,
      toName: sanitizeUsername(target.username),
      toAvatar: sanitizeAvatar(target.avatarUrl),
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function respondToFriendRequest(
  currentUser: User,
  request: FriendRequestRecord,
  accept: boolean
): Promise<void> {
  const reqPath = `friendRequests/${request.id}`;
  const reqRef = doc(db, 'friendRequests', request.id);

  try {
    if (!accept) {
      await updateDoc(reqRef, {
        status: 'declined',
        updatedAt: serverTimestamp(),
      });
      return;
    }

    // Canonical ordering userA < userB enforced by firestore.rules
    const [userA, userB] =
      request.fromUid < request.toUid
        ? [request.fromUid, request.toUid]
        : [request.toUid, request.fromUid];
    const [nameA, avatarA, nameB, avatarB] =
      request.fromUid < request.toUid
        ? [request.fromName, request.fromAvatar, request.toName, request.toAvatar]
        : [request.toName, request.toAvatar, request.fromName, request.fromAvatar];

    const friendshipId = `${userA}_${userB}`;
    const friendshipRef = doc(db, 'friendships', friendshipId);

    const batch = writeBatch(db);
    batch.update(reqRef, {
      status: 'accepted',
      updatedAt: serverTimestamp(),
    });
    batch.set(friendshipRef, {
      userA,
      userB,
      nameA: sanitizeUsername(nameA),
      avatarA: sanitizeAvatar(avatarA),
      nameB: sanitizeUsername(nameB),
      avatarB: sanitizeAvatar(avatarB),
      memberUids: [userA, userB],
      requestId: request.id,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `${reqPath} (uid=${currentUser.uid})`);
  }
}

export async function removeFriendship(friendshipId: string): Promise<void> {
  if (!ID_PATTERN.test(friendshipId)) return;
  const path = `friendships/${friendshipId}`;
  try {
    await deleteDoc(doc(db, 'friendships', friendshipId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function sendGameInviteToFriend(
  fromUser: User,
  fromProfile: PlayerProfileState,
  toUid: string,
  toName: string,
  roomCode: string,
  timeControlLabel: string
): Promise<void> {
  const cleanCode = roomCode.trim().toUpperCase();
  if (!ROOM_CODE_PATTERN.test(cleanCode) || cleanCode.length < 4 || cleanCode.length > 12) {
    throw new Error('Invalid room code.');
  }
  if (!ID_PATTERN.test(fromUser.uid) || !ID_PATTERN.test(toUid) || fromUser.uid === toUid) return;

  const inviteId = `inv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const path = `gameInvites/${inviteId}`;

  try {
    await setDoc(doc(db, 'gameInvites', inviteId), {
      fromUid: fromUser.uid,
      fromName: sanitizeUsername(fromProfile.username),
      fromRating: clampRating(fromProfile.ratings.blitz.rating),
      toUid,
      toName: sanitizeUsername(toName),
      roomCode: cleanCode,
      timeControlLabel: timeControlLabel.slice(0, 32),
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateGameInviteStatus(
  inviteId: string,
  status: 'accepted' | 'declined' | 'cancelled'
): Promise<void> {
  if (!ID_PATTERN.test(inviteId)) return;
  const path = `gameInvites/${inviteId}`;
  try {
    await updateDoc(doc(db, 'gameInvites', inviteId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export function subscribeSocialData(
  uid: string,
  callbacks: {
    onPublicProfiles: (profiles: PublicProfileRecord[]) => void;
    onIncomingRequests: (reqs: FriendRequestRecord[]) => void;
    onOutgoingRequests: (reqs: FriendRequestRecord[]) => void;
    onFriendships: (friends: FriendshipRecord[]) => void;
    onIncomingInvites: (invites: GameInviteRecord[]) => void;
    onOutgoingInvites: (invites: GameInviteRecord[]) => void;
    onError?: (error: unknown) => void;
  }
): () => void {
  const forwardError = (err: unknown, op: OperationType, path: string) => {
    try {
      handleFirestoreError(err, op, path);
    } catch (structured) {
      if (callbacks.onError) callbacks.onError(structured);
      else throw structured;
    }
  };

  const unsubPublic = onSnapshot(
    query(collection(db, 'publicProfiles'), where('isDiscoverable', '==', true), limit(100)),
    (snap) => {
      const list = snap.docs.map((d) => d.data() as PublicProfileRecord);
      callbacks.onPublicProfiles(list);
    },
    (err) => forwardError(err, OperationType.LIST, 'publicProfiles')
  );

  const unsubIncomingReq = onSnapshot(
    query(collection(db, 'friendRequests'), where('toUid', '==', uid)),
    (snap) => {
      callbacks.onIncomingRequests(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FriendRequestRecord, 'id'>) }))
      );
    },
    (err) => forwardError(err, OperationType.LIST, 'friendRequests(toUid)')
  );

  const unsubOutgoingReq = onSnapshot(
    query(collection(db, 'friendRequests'), where('fromUid', '==', uid)),
    (snap) => {
      callbacks.onOutgoingRequests(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FriendRequestRecord, 'id'>) }))
      );
    },
    (err) => forwardError(err, OperationType.LIST, 'friendRequests(fromUid)')
  );

  const unsubFriendships = onSnapshot(
    query(collection(db, 'friendships'), where('memberUids', 'array-contains', uid)),
    (snap) => {
      callbacks.onFriendships(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FriendshipRecord, 'id'>) }))
      );
    },
    (err) => forwardError(err, OperationType.LIST, 'friendships')
  );

  const unsubIncomingInv = onSnapshot(
    query(collection(db, 'gameInvites'), where('toUid', '==', uid)),
    (snap) => {
      callbacks.onIncomingInvites(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<GameInviteRecord, 'id'>) }))
      );
    },
    (err) => forwardError(err, OperationType.LIST, 'gameInvites(toUid)')
  );

  const unsubOutgoingInv = onSnapshot(
    query(collection(db, 'gameInvites'), where('fromUid', '==', uid)),
    (snap) => {
      callbacks.onOutgoingInvites(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<GameInviteRecord, 'id'>) }))
      );
    },
    (err) => forwardError(err, OperationType.LIST, 'gameInvites(fromUid)')
  );

  return () => {
    unsubPublic();
    unsubIncomingReq();
    unsubOutgoingReq();
    unsubFriendships();
    unsubIncomingInv();
    unsubOutgoingInv();
  };
}
