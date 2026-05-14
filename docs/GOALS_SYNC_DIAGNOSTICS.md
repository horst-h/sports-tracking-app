# Goals Synchronization Diagnostics

## Problem
Goals are not syncing across devices - each device has its own separate goals stored locally.

## Root Cause Analysis

The goals system uses a **hybrid approach**:
- **Backend**: Netlify Blobs (persistent, shared across devices)
- **Client**: IndexedDB (local cache, device-specific)

When syncing fails, goals are only stored in IndexedDB and isolated to each device.

## Logging Added

I've added comprehensive logging throughout the goals system to help diagnose the issue:

### Backend Logging (`netlify/functions/`)

**GoalsStore Factory** (`_lib/goalsStore.ts`):
```
[GoalsStore] Creating store - NETLIFY env: {isNetlify} NODE_ENV: {nodeEnv}
[GoalsStore] ✅ Successfully using Netlify Blobs for persistence
[GoalsStore] ⚠️ NETLIFY environment not set - using in-memory store (NOT PERSISTED)
[GoalsStore] ❌ Netlify Blobs initialization failed
```

**Netlify Blobs Store** (`_lib/goalsStore.ts`):
```
[NetlifyBlobsGoalsStore] Initialized successfully
[NetlifyBlobsGoalsStore] Retrieved goal: goals/{athleteId}/{year}/{sport}
[NetlifyBlobsGoalsStore] Saved goal: goals/{athleteId}/{year}/{sport}
[NetlifyBlobsGoalsStore] Error saving goal: {error}
```

**Goals API Handler** (`goals.ts`):
```
[Goals API] Incoming POST request
[Goals API] Authenticated athlete: {athleteId}
[Goals API] Saving goal: athlete={id}, year={year}, sport={sport}
[Goals API] Goal saved successfully with version {version}
```

### Client Logging (`src/repositories/goalsRepository.ts`)

**API Calls**:
```
[GoalsRepository] Saving goal to backend (2026/run): {goalData}
[GoalsRepository] ✅ Goal saved successfully (2026/run): {remoteGoal}
[GoalsRepository] Fetching goal from backend: /.netlify/functions/goals?year=2026&sport=run
[GoalsRepository] Fetched goal (2026/run): {goal}
```

**Cache Synchronization**:
```
[GoalsRepository] saveGoals() called for year 2026: {goals}
[GoalsRepository] Synced 2 goals to backend, maxVersion: 3
[GoalsRepository] ✅ Goals saved to local cache
[GoalsRepository] loadGoals() called for year 2026
[GoalsRepository] Version check - Backend: 5, Cache: 3
[GoalsRepository] ✅ Backend is newer, updating cache
```

## How to Diagnose

### 1. Check Backend Configuration

**In Netlify Dashboard:**
```
Settings → Build & Deploy → Environment
Look for: NETLIFY = true (should be set automatically in production)
```

**Expected output in function logs:**
```
[GoalsStore] Creating store - NETLIFY env: true
[GoalsStore] ✅ Successfully using Netlify Blobs for persistence
```

If you see:
```
[GoalsStore] ⚠️ NETLIFY environment not set
```
→ **Problem**: Backend is falling back to in-memory storage (not persisted)

### 2. Check API Calls

**In Browser Console** (when saving goals):
```
[GoalsRepository] Saving goal to backend (2026/run): {distanceKm: 100}
[GoalsRepository] ✅ Goal saved successfully (2026/run): {version: 1}
```

If you see:
```
[GoalsRepository] No valid token for saving goal (2026/run)
```
→ **Problem**: Authentication failure, token expired or invalid

If you see:
```
[GoalsRepository] ⚠️ Failed to save 2026/run goal to backend
[GoalsRepository] Error saving goal: Response 401
```
→ **Problem**: API authentication or permissions issue

### 3. Check Netlify Function Logs

**In Netlify Dashboard:**
```
Functions → goals → Logs
```

**Expected sequence for saving:**
```
[Goals API] Incoming PUT request
[Goals API] Authenticated athlete: 123456
[Goals API] Saving goal: athlete=123456, year=2026, sport=run
[NetlifyBlobsGoalsStore] Saved goal: goals/123456/2026/run
[Goals API] Goal saved successfully with version 1
```

**Red flags:**
```
[Goals API] ❌ NETLIFY environment not set
[NetlifyBlobsGoalsStore] Error saving goal: Error initializing Blobs
[Goals API] Goal deletion result: false
```

### 4. Check Sync on Another Device

**Expected behavior:**
1. Save goal on Device A → logs show `✅ Successfully saved to backend`
2. Wait a few seconds
3. Open app on Device B → logs show:
   ```
   [GoalsRepository] Background sync: received 1 goals from backend
   [GoalsRepository] Version check - Backend: 1, Cache: 0
   [GoalsRepository] ✅ Backend is newer, updating cache
   ```
4. Goals appear on Device B

**If goals don't sync:**
- Check if Device B is trying to fetch from backend (look for `[GoalsRepository] Fetching goal from backend` logs)
- Check if authentication is working on Device B
- Check Netlify function logs to see if GET request is received

## Likely Issues

### Issue 1: NETLIFY env not set in production
**Symptoms:**
```
[GoalsStore] ⚠️ NETLIFY environment not set
Return value: InMemoryGoalsStore (not persisted)
```
**Solution:** Verify `NETLIFY=true` is set in Netlify environment variables

### Issue 2: Netlify Blobs not installed
**Symptoms:**
```
[NetlifyBlobsGoalsStore] Failed to load @netlify/blobs: Error: Cannot find module '@netlify/blobs'
```
**Solution:** Run `npm install @netlify/blobs@^10.7.0`

### Issue 3: Invalid or expired auth token
**Symptoms:**
```
[GoalsRepository] No valid token for saving goal
```
**Solution:** User needs to re-authenticate or refresh their Strava token

### Issue 4: Backend API errors
**Symptoms:**
```
[Goals API] Incoming PUT request
[Goals API] Error saving goal: Response 500
```
**Solution:** Check full error in Netlify function logs

## Testing Fix

1. **Enable logging** - Changes are already committed
2. **Open Browser DevTools** → Console
3. **Save goals** → observe `[GoalsRepository]` logs
4. **Check Netlify logs** → observe `[Goals API]` and `[NetlifyBlobsGoalsStore]` logs
5. **Switch to another device** → verify sync happens

## Files Modified

- `netlify/functions/_lib/goalsStore.ts` - Backend store with logging
- `netlify/functions/goals.ts` - API handler with logging
- `src/repositories/goalsRepository.ts` - Client-side sync with logging

These changes are **non-breaking** and only add console logging for debugging.
