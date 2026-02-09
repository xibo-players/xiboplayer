# Xibo Player Testing Guide

This repository includes comprehensive testing infrastructure for Xibo CMS integration.

## CMS Testing Package

Location: `packages/cms-testing/`

### Purpose

Automated testing for Xibo CMS PWA player features:
- Campaign management (multiple layouts in sequence)
- Dayparting (recurring time-based schedules)
- Layout transitions (fade, fly animations)
- Priority resolution (high-priority campaigns override low-priority)

### Quick Start

```bash
# 1. Setup OAuth credentials (see packages/cms-testing/SETUP_INSTRUCTIONS.md)
cd packages/cms-testing
cp .env.example .env
# Edit .env with your CMS credentials

# 2. Install dependencies
npm install

# 3. Create test layouts in CMS (see QUICKSTART.md)

# 4. Run tests
npm test

# 5. Verify on player
# Open https://displays.superpantalles.com/player/
```

### Documentation

- **[QUICKSTART.md](packages/cms-testing/QUICKSTART.md)** - 5-minute getting started guide
- **[SETUP_INSTRUCTIONS.md](packages/cms-testing/SETUP_INSTRUCTIONS.md)** - Detailed setup steps
- **[README.md](packages/cms-testing/README.md)** - Complete package documentation

### Available Scripts

From `packages/cms-testing/`:

```bash
npm test                  # Run all tests (recommended)
npm run test:verify       # Verify current configuration
npm run test:cleanup      # Remove all test content
```

### What Gets Tested

✅ **Campaign Creation**
- Create campaigns with multiple layouts
- Assign layouts in specific order
- Verify campaigns appear in schedule

✅ **Dayparting Schedules**
- Recurring schedules (Mon-Fri 9am-5pm, weekends, etc.)
- Time-based activation/deactivation
- Day-of-week filtering

✅ **Layout Transitions**
- Fade in/out animations
- Fly in/out with direction (N, S, E, W, NE, SE, SW, NW)
- Duration configuration
- Transition between layouts in campaigns

✅ **Priority Resolution**
- High-priority campaigns override low-priority
- Same-priority campaigns merge layouts
- Priority inheritance from schedules

### Test Workflow

```
1. Authenticate with CMS via OAuth2
2. Find test display group and layouts
3. Create campaign with multiple layouts
4. Schedule campaign with:
   - Immediate schedule (starts in 1 minute)
   - Recurring weekday schedule (Mon-Fri 9-5)
5. Verify schedule via API
6. Manual verification on player
```

### Architecture

```
packages/cms-testing/
├── src/
│   ├── xibo-api-client.js       # CMS REST API client
│   ├── run-tests.js             # Main test orchestrator
│   ├── verify-player.js         # Configuration verification
│   ├── cleanup-tests.js         # Test cleanup utility
│   └── index.js                 # Package exports
├── .env                          # Configuration (not in git)
├── .env.example                  # Configuration template
├── package.json                  # Dependencies
├── README.md                     # Full documentation
├── QUICKSTART.md                 # 5-minute guide
└── SETUP_INSTRUCTIONS.md         # Detailed setup
```

### Prerequisites

1. **Xibo CMS Access**
   - URL: https://displays.superpantalles.com
   - Admin rights to create OAuth applications

2. **OAuth Credentials**
   - Create via CMS → Applications → Add Application
   - Copy Client ID and Client Secret to `.env`

3. **Display Group**
   - Create "Test Displays" group in CMS
   - Add test displays to group

4. **Test Layouts**
   - Create manually in CMS (recommended)
   - Name: "Test Layout A", "Test Layout B", "Test Layout C"
   - Simple text widgets for easy identification

### Example Test Run

```bash
$ npm test

🧪 Xibo CMS Feature Testing
============================================================

📡 Phase 1: Authenticating with CMS...
✅ Authenticated successfully

📺 Phase 2: Finding display groups...
   Found 3 display group(s):
   - Test Displays (ID: 123)
   ✅ Using display group: Test Displays (ID: 123)

🎨 Phase 3: Checking for test layouts...
   Found 3 test layout(s):
   - Test Layout A (ID: 456)
   - Test Layout B (ID: 457)
   - Test Layout C (ID: 458)

📁 Phase 4: Managing test campaign...
✅ Created campaign: Automated Test Campaign (ID: 789)
✅ Assigned layout 456 to campaign 789
✅ Assigned layout 457 to campaign 789
✅ Assigned layout 458 to campaign 789

📅 Phase 5: Creating test schedules...
✅ Created immediate schedule (ID: 1001)
✅ Created weekday schedule (ID: 1002)

✅ Phase 6: Verifying schedule...

============================================================
✅ Tests completed successfully!

📋 Summary:
   - Display Group: Test Displays
   - Campaign: Automated Test Campaign (3 layouts)
   - Schedules: 2 (1 immediate, 1 recurring weekday)

🎯 Next steps:
   1. Open player: https://displays.superpantalles.com/player/
   2. Verify layouts display correctly
   3. Check transitions between layouts
   4. Verify schedule changes at correct times
```

### Manual Verification Checklist

After running tests, open player and verify:

- [ ] Campaign appears in schedule
- [ ] All 3 layouts cycle correctly (A → B → C → A)
- [ ] Transitions are visible between layouts
- [ ] Immediate schedule activates within 1 minute
- [ ] Recurring schedule activates during specified hours
- [ ] Priority resolution works (if multiple schedules)

### Troubleshooting

| Issue | Solution |
|-------|----------|
| Authentication fails | Verify OAuth credentials in `.env` |
| Display group not found | Create "Test Displays" in CMS or update `.env` |
| No test layouts | Create layouts named "Test Layout A/B/C" |
| Schedule doesn't appear | Check display is in correct group, verify times |
| Player shows nothing | Check player authorization, CMS connection |

See [SETUP_INSTRUCTIONS.md](packages/cms-testing/SETUP_INSTRUCTIONS.md) for detailed troubleshooting.

### Integration with CI/CD

The testing package can be integrated into CI/CD:

```yaml
# Example GitHub Actions workflow
- name: Run CMS Tests
  working-directory: packages/cms-testing
  env:
    CMS_URL: ${{ secrets.CMS_URL }}
    CLIENT_ID: ${{ secrets.CLIENT_ID }}
    CLIENT_SECRET: ${{ secrets.CLIENT_SECRET }}
  run: |
    npm install
    npm test
```

### Future Enhancements

Planned features:
- [ ] Playwright-based browser automation
- [ ] Screenshot comparison testing
- [ ] Video playback testing
- [ ] Widget rendering tests
- [ ] Performance benchmarks
- [ ] Multi-display synchronization tests

### Contributing

When adding new tests:
1. Keep tests independent and idempotent
2. Clean up test data after runs
3. Document expected behavior
4. Add to `run-tests.js` orchestration

### Support

- Package documentation: `packages/cms-testing/README.md`
- Quick start guide: `packages/cms-testing/QUICKSTART.md`
- Setup instructions: `packages/cms-testing/SETUP_INSTRUCTIONS.md`
- CMS API docs: https://displays.superpantalles.com/swagger.json
