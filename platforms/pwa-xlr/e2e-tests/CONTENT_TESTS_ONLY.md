# Content-Only Test Suite

## Tests to Run (Authentication Already Done)

All tests use saved authentication from `playwright/.auth/player-auth.json`

### ✅ Already Passing:
1. ✓ Test 1: Setup (00-setup-once.spec.js)
2. ✓ Test 2: Default Playback (01-playback-default.spec.js)
3. ✓ Test 3: Stability (02-playback-stability.spec.js)
4. ✓ Test 4: Layout Assignment (03-assign-test-media.spec.js) - FIXED
5. ✓ Test 5: Layout Verification (04-verify-test-layout.spec.js)
6. ✓ Test 6: Authenticated Playback (authenticated-playback.spec.js)
7. ✓ Test 7: 5s Display (authenticated-player.spec.js) - FIXED
8. ✓ Test 8: Automated Setup (automated-player-setup.spec.js) - FIXED

### 🎯 Content Tests to Run:
9. player-test.spec.js - NEEDS FIX (add storageState)
10. media-playback-test.spec.js - NEEDS CHECK
11. player-playback-test.spec.js - NEEDS CHECK
12. full-playback-test.spec.js - NEEDS CHECK
13. verify-playback.spec.js - NEEDS CHECK
14. player-with-credentials.spec.js - NEEDS CHECK

### ⏭️ Skip (Setup duplicates):
- complete-setup-flow.spec.js
- configure-and-play.spec.js
- display-setup-test.spec.js
- fill-setup-and-play.spec.js
- get-key-and-play.spec.js
- simple-test.spec.js
- visual-authentication.spec.js

## Quick Fix Strategy

Add this line to the top of each content test:
```javascript
test.use({ storageState: 'playwright/.auth/player-auth.json' });
```

## Run Content Tests

```bash
# Run all content tests in sequence
npx playwright test \
  tests/player-test.spec.js \
  tests/media-playback-test.spec.js \
  tests/player-playback-test.spec.js \
  tests/full-playback-test.spec.js \
  tests/verify-playback.spec.js \
  tests/player-with-credentials.spec.js \
  --headed --workers=1
```
