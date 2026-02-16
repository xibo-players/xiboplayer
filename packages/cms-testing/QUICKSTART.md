# Quick Start Guide

Get up and running with CMS testing in 5 minutes.

## Prerequisites

- Xibo CMS access (https://displays.superpantalles.com)
- Admin rights to create OAuth applications
- Node.js 18+ installed

## Step 1: Create OAuth Application (2 minutes)

1. Log into Xibo CMS: https://displays.superpantalles.com
2. Go to **Applications** (in Admin menu)
3. Click **Add Application**
4. Enter:
   - **Name**: "Automated Testing"
   - **Auth Code**: (leave blank)
5. Click **Save**
6. Copy the **Client ID** and **Client Secret** shown

## Step 2: Configure Environment (1 minute)

```bash
cd packages/cms-testing
cp .env.example .env
```

Edit `.env` and paste your credentials:

```env
CMS_URL=https://displays.superpantalles.com
CLIENT_ID=paste_client_id_here
CLIENT_SECRET=paste_client_secret_here
TEST_DISPLAY_GROUP=Test Displays
```

## Step 3: Create Test Display Group (30 seconds)

1. In CMS, go to **Display** > **Display Groups**
2. Click **Add Display Group**
3. Name: "Test Displays"
4. Save
5. Add your test displays to this group

## Step 4: Create Test Layouts (2 minutes)

Create 3 simple layouts in CMS:

**Layout 1: "Test Layout A"**
- Add Layout → Name: "Test Layout A"
- Add a Text widget
- Text: "MORNING SCHEDULE"
- Background: Red (#FF0000)
- Save

**Layout 2: "Test Layout B"**
- Add Layout → Name: "Test Layout B"
- Add a Text widget
- Text: "AFTERNOON SCHEDULE"
- Background: Blue (#0000FF)
- Save

**Layout 3: "Test Layout C"**
- Add Layout → Name: "Test Layout C"
- Add a Text widget
- Text: "EVENING SCHEDULE"
- Background: Green (#00FF00)
- Save

## Step 5: Run Tests

```bash
npm install
npm test
```

You should see:

```
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
   Creating campaign: Automated Test Campaign
✅ Created campaign: Automated Test Campaign (ID: 789)
   Assigning layouts to campaign...
✅ Assigned layout 456 to campaign 789
✅ Assigned layout 457 to campaign 789
✅ Assigned layout 458 to campaign 789

📅 Phase 5: Creating test schedules...
   Creating immediate test schedule:
   - Start: 2026-01-30 15:01:00
   - End: 2026-01-30 16:01:00
✅ Created immediate schedule (ID: 1001)

   Creating recurring weekday schedule (Mon-Fri, 9am-5pm)...
✅ Created weekday schedule (ID: 1002)

✅ Phase 6: Verifying schedule...
   Schedule data: [...]

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

💡 Run `npm run test:verify` to launch automated browser testing
```

## Step 6: Verify on Player

1. Open: https://displays.superpantalles.com/player/
2. Connect to CMS (if needed)
3. Select a display from "Test Displays" group
4. Wait for schedule to activate (should be within 1 minute)
5. Watch layouts cycle: A → B → C → A → ...

## Troubleshooting

**Authentication fails?**
- Check CLIENT_ID and CLIENT_SECRET in .env
- Verify OAuth app exists in CMS

**No layouts found?**
- Ensure layouts are named exactly "Test Layout A", "Test Layout B", "Test Layout C"
- Check you have permission to view layouts

**Schedule doesn't appear?**
- Check displays are in "Test Displays" group
- Verify immediate schedule start time (should be 1 minute from test run)
- Check CMS Schedule page for created schedules

## Cleanup

Remove all test content:

```bash
npm run test:cleanup
```

This will delete test campaigns but leave layouts (in case you want to reuse them).

## What's Next?

- Read [README.md](README.md) for detailed documentation
- Explore advanced test scenarios
- Create custom test campaigns
- Set up Playwright for automated browser testing

Happy testing! 🎉
