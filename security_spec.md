# Atelier Chess — Firestore Security Specification (Phase 0)

## 1. Data Invariants
1. **PII Isolation**: Private user fields (`email`, full personal game history, preferences, presets) live exclusively in `/users/{userId}` and are readable/writable **only** by the verified authenticated owner (`request.auth.uid == userId && request.auth.token.email_verified == true`). `/users` cannot be listed.
2. **Public Profile Separation**: `/publicProfiles/{userId}` contains zero PII (no email/phone/address), enforces `uid == request.auth.uid` on write, and allows `get`/`list` strictly when `isSignedIn() && existing().isDiscoverable == true` (or owner `get`).
3. **Referential Integrity & Anti-Orphan Rule**:
   - A `FriendRequest` can only be created if `fromUid == request.auth.uid`, `toUid != request.auth.uid`, `status == 'pending'`, and `/publicProfiles/{toUid}` exists.
   - A `Friendship` can only be created atomically alongside an accepted `FriendRequest` addressed to `request.auth.uid` (`getAfter(/databases/$(database)/documents/friendRequests/$(requestId)).data.status == 'accepted'`).
   - A `GameInvite` can only be created if `fromUid == request.auth.uid`, `toUid != request.auth.uid`, `status == 'pending'`, and `/publicProfiles/{toUid}` exists.
4. **Terminal State Locking**: Once a `FriendRequest` (`accepted` / `declined`) or `GameInvite` (`accepted` / `declined` / `cancelled`) leaves `'pending'`, no further updates are permitted.
5. **Temporal Integrity & Immutability**: `createdAt` must equal `request.time` on creation and remain immutable forever; `updatedAt` must equal `request.time` on both create and update. `uid`, `fromUid`, `toUid`, `userA`, `userB`, and `requestId` are immutable after creation.
6. **Bounded Payloads**: All strings enforce explicit `.size()` bounds and arrays enforce strict max lengths (`games <= 50`, `repertoire <= 100`, `presets <= 16`, `completedLessons <= 100`, `achievements <= 50`, `ratingHistory <= 40`, `memberUids == 2`).

## 2. The "Dirty Dozen" Adversarial Attack Payloads
1. **Shadow Field Injection on UserProfile**: `{ ...validUser, isAdmin: true }` -> **REJECTED** (`keys().hasOnly(...)`).
2. **Identity Spoofing on PublicProfile**: `{ ...validPublic, uid: "victim_uid" }` written to `/publicProfiles/attacker_uid` -> **REJECTED** (`uid == request.auth.uid`).
3. **Unverified Email Bypass**: Valid payload with `request.auth.token.email_verified == false` -> **REJECTED** (`isVerified()`).
4. **PII Blanket Read on `/users/{victimUid}`**: Signed-in non-owner tries `get(/users/victimUid)` or `list(/users)` -> **REJECTED** (`userId == request.auth.uid`, `list: if false`).
5. **Client Timestamp Forgery**: `{ ...validInvite, createdAt: "2020-01-01T00:00:00Z" }` -> **REJECTED** (`createdAt == request.time`).
6. **Resource Poisoning / Path ID Overflow**: Writing to `/gameInvites/` + `'A'.repeat(200)` or `'bad/id$'` -> **REJECTED** (`isValidId()` regex + `<= 128`).
7. **Array Bombing (Denial of Wallet)**: `{ ...validUser, games: new Array(51).fill({}) }` -> **REJECTED** (`games.size() <= 50`).
8. **Type Poisoning on Update**: Updating `/publicProfiles/{uid}` with `{ blitzRating: "9999", updatedAt: serverTimestamp() }` -> **REJECTED** (`isValidPublicProfile(incoming())` checks `blitzRating is number`).
9. **State Shortcutting on FriendRequest**: Sender creates `FriendRequest` directly with `{ status: "accepted" }` -> **REJECTED** (`incoming().status == 'pending'`).
10. **Terminal State Re-opening on GameInvite**: Invitee updates an already `'declined'` `GameInvite` back to `'accepted'` -> **REJECTED** (`existing().status == 'pending'`).
11. **Unauthorized Friendship Forgery**: Attacker creates `/friendships/attacker_victim` directly without an accepted `FriendRequest` batch -> **REJECTED** (`getAfter(friendRequests/...)` must be `'accepted'` with `toUid == request.auth.uid`).
12. **Blanket Query Scraping on FriendRequests**: Attacker runs `getDocs(collection(db, 'friendRequests'))` without filtering by own `fromUid` or `toUid` -> **REJECTED** (`allow list` requires `resource.data.fromUid == request.auth.uid || resource.data.toUid == request.auth.uid`).
