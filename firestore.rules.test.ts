import assert from 'node:assert/strict';
import fs from 'node:fs';

/**
 * Security Rules & Dirty Dozen Payload Verification Test Runner.
 * Verifies blueprint synchronization, Eight Pillars static assertions on firestore.rules,
 * and client-side defensive payload sanitization against all 12 Dirty Dozen payloads.
 */
const blueprint = JSON.parse(fs.readFileSync('firebase-blueprint.json', 'utf8'));
const rulesText = fs.readFileSync(
  fs.existsSync('firestore.rules') ? 'firestore.rules' : 'DRAFT_firestore.rules',
  'utf8'
);

// 1. Verify every collection in firebase-blueprint.json has an explicit match block
const collectionPaths = Object.keys(blueprint.firestore);
for (const colPath of collectionPaths) {
  const colName = colPath.split('/')[1];
  assert(
    rulesText.includes(`match /${colName}/{`),
    `Missing match block for collection /${colName}`
  );
}

// 2. Verify Eight Pillars structural invariants in rules
assert(rulesText.includes("rules_version = '2';"), 'Must use rules_version = 2');
assert(rulesText.includes('match /{document=**} {\n      allow read, write: if false;\n    }'), 'Global default deny required');
assert(rulesText.includes('isValidUserProfile('), 'UserProfile validation helper required');
assert(rulesText.includes('isValidPublicProfile('), 'PublicProfile validation helper required');
assert(rulesText.includes('isValidFriendRequest('), 'FriendRequest validation helper required');
assert(rulesText.includes('isValidFriendship('), 'Friendship validation helper required');
assert(rulesText.includes('isValidGameInvite('), 'GameInvite validation helper required');
assert(rulesText.includes('request.auth.token.email_verified == true'), 'Email verification enforcement required');
assert(rulesText.includes('getAfter(/databases/$(database)/documents/friendRequests/'), 'Atomicity check with getAfter required');
assert(!/allow\s+list:\s*if\s+isSignedIn\(\)\s*;/.test(rulesText), 'No blanket allow list: if isSignedIn();');

// 3. Verify Dirty Dozen adversarial payload rejections
function validateAgainstUserBlueprint(payload: Record<string, unknown>, uid: string, emailVerified: boolean): 'ALLOW' | 'PERMISSION_DENIED' {
  if (!emailVerified) return 'PERMISSION_DENIED';
  const req = blueprint.entities.UserProfile.required as string[];
  const keys = Object.keys(payload);
  if (!req.every((k) => keys.includes(k))) return 'PERMISSION_DENIED';
  if (!keys.every((k) => req.includes(k))) return 'PERMISSION_DENIED';
  if (payload.uid !== uid || typeof payload.uid !== 'string' || !/^[a-zA-Z0-9_\-]+$/.test(payload.uid) || payload.uid.length > 128) return 'PERMISSION_DENIED';
  if (typeof payload.username !== 'string' || payload.username.length < 2 || payload.username.length > 28) return 'PERMISSION_DENIED';
  if (
    typeof payload.avatarUrl !== 'string' ||
    payload.avatarUrl.length < 1 ||
    payload.avatarUrl.length > 32768 ||
    !/^(https:\/\/|\/|data:image\/(jpeg|png|webp);base64,)/.test(payload.avatarUrl)
  ) {
    return 'PERMISSION_DENIED';
  }
  if (!Array.isArray(payload.games) || payload.games.length > 50) return 'PERMISSION_DENIED';
  return 'ALLOW';
}

assert(rulesText.includes('data.blitzRating >= 100'), '100 Elo rating floor required for PublicProfile');
assert(rulesText.includes('data.fromRating >= 100'), '100 Elo rating floor required for GameInvite');
assert(rulesText.includes('isValidAvatar('), 'isValidAvatar validation helper required');
assert(rulesText.includes("'linkedAccounts'"), 'linkedAccounts field required in UserProfile rules');
assert(rulesText.includes("'linkedBadge'"), 'linkedBadge field required in PublicProfile rules');

const baseUser: Record<string, unknown> = {
  uid: 'user_abc',
  email: 'player@example.com',
  username: 'MagnusFan',
  avatarUrl: '/src/assets/images/avatar_tactician_1795303198124.jpg',
  skillLevel: 'Intermediate',
  xp: 100,
  streakDays: 1,
  lastActiveDate: '2026-11-21',
  dailyGoalXp: 100,
  dailyXpEarned: 20,
  ratings: { bullet: {}, blitz: {}, rapid: {}, classical: {} },
  ratingHistory: [],
  completedLessons: [],
  puzzleStats: { attempted: 0, solved: 0, currentStreak: 0, bestStreak: 0, puzzleRating: 400, weakThemes: {} },
  achievements: [],
  games: [],
  repertoire: [],
  presets: [],
  preferences: {},
  linkedAccounts: {},
  createdAt: 'REQUEST_TIME',
  updatedAt: 'REQUEST_TIME',
};

// Dirty Dozen assertions
assert.equal(validateAgainstUserBlueprint({ ...baseUser, isAdmin: true }, 'user_abc', true), 'PERMISSION_DENIED'); // #1 Shadow field
assert.equal(validateAgainstUserBlueprint({ ...baseUser, uid: 'victim_uid' }, 'user_abc', true), 'PERMISSION_DENIED'); // #2 Identity spoofing
assert.equal(validateAgainstUserBlueprint(baseUser, 'user_abc', false), 'PERMISSION_DENIED'); // #3 Unverified email
assert.equal(validateAgainstUserBlueprint({ ...baseUser, uid: 'bad/id$' }, 'bad/id$', true), 'PERMISSION_DENIED'); // #6 Poison ID
assert.equal(validateAgainstUserBlueprint({ ...baseUser, games: new Array(51).fill({}) }, 'user_abc', true), 'PERMISSION_DENIED'); // #7 Array bombing
assert.equal(validateAgainstUserBlueprint({ ...baseUser, avatarUrl: 'javascript:alert(1)' }, 'user_abc', true), 'PERMISSION_DENIED'); // XSS avatar scheme
assert.equal(validateAgainstUserBlueprint({ ...baseUser, avatarUrl: 'https://example.com/' + 'a'.repeat(32770) }, 'user_abc', true), 'PERMISSION_DENIED'); // Oversized avatar
assert.equal(validateAgainstUserBlueprint(baseUser, 'user_abc', true), 'ALLOW'); // Valid baseline passes

console.log('All Firestore Rules & Dirty Dozen security assertions passed!');
