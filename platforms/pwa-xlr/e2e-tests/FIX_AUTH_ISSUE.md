# Authentication Persistence Issue - Fixed

## Problem

The player was showing the credentials screen again instead of staying authenticated because:

1. **LocalStorage was cleared** - Browser clear data or cookies cleared
2. **Tests not loading auth state** - Some tests don't use `storageState`
3. **Different browser contexts** - Manual browser vs test browser have separate storage

## Solution Applied

Created `restore-auth.js` which:
- ✅ Checks current authentication state
- ✅ Re-injects the correct configuration
- ✅ Saves it to storage state file
- ✅ Reloads player to apply
- ✅ Verifies authentication works

## How to Use

### Quick Restore (Anytime)
```bash
cd /home/pau/Devel/tecman/xibo_players/platforms/pwa-xlr/e2e-tests
node restore-auth.js
```

This will:
- Open browser (visible)
- Restore authentication
- Show you it's working
- Save state for tests

### Run Tests with Authentication
```bash
# Make sure setup test runs first (creates auth)
npx playwright test tests/00-setup-once.spec.js

# Then run other tests (they load saved auth)
npx playwright test tests/01-playback-default.spec.js --headed
```

### Update All Tests to Use Auth

Add this line to any test file that needs authentication:
```javascript
test.use({ storageState: 'playwright/.auth/player-auth.json' });
```

## Preventing Future Issues

### Option 1: Pin Browser Context
Keep one browser window open and authenticated - don't close it between tests.

### Option 2: Always Run Setup First
```bash
# Run all tests in order (setup first)
npx playwright test --workers=1 --headed
```

### Option 3: Use Persistent Context
Modify tests to use persistent browser context that survives between runs.

## Why It Happens

**LocalStorage is ephemeral:**
- Cleared when browser closes (normal behavior)
- Cleared when cookies/data cleared
- Separate for each browser profile/context
- Not shared between manual browser and test browser

**Tests use separate contexts:**
- Test runner creates fresh contexts
- Manual browser has its own storage
- Need to explicitly share via storageState

## Current Configuration

Saved in `playwright/.auth/player-auth.json`:
```json
{
  "cmsAddress": "https://displays.superpantalles.com",
  "cmsKey": "isiSdUCy",
  "displayName": "test_pwa",
  "hardwareKey": "000000000000000000000000093dc477",
  "xmrChannel": "794ef61c-f55e-4752-89a7-a3857db653db"
}
```

This file is loaded by tests that have:
```javascript
test.use({ storageState: 'playwright/.auth/player-auth.json' });
```

## Verification

After running `restore-auth.js`, verify:
```bash
# Check screenshot shows content (not credentials)
xdg-open screenshots/restore-auth-success.png

# Run a test to confirm
npx playwright test tests/01-playback-default.spec.js --headed
```

## Quick Commands Reference

```bash
# Restore authentication immediately
node restore-auth.js

# Run setup + tests
npx playwright test --workers=1 --headed

# Run just one test (must have setup run first)
npx playwright test tests/01-playback-default.spec.js --headed

# Check auth file exists and is valid
cat playwright/.auth/player-auth.json | jq
```

## Status

✅ **FIXED** - Authentication restored and player working again!
