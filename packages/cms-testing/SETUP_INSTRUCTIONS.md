# Setup Instructions for CMS Testing

## Overview

This document provides step-by-step instructions to set up automated testing for Xibo CMS PWA features.

## What You'll Need

### 1. OAuth Credentials

You need to create an OAuth application in Xibo CMS to get API access.

**How to get credentials:**

1. Log into Xibo CMS: https://displays.superpantalles.com
2. Navigate to **Applications** (in the main menu, under Admin section)
3. Click **Add Application** button
4. Fill in the form:
   - **Name**: `Automated Testing` (or any name you prefer)
   - **Auth Code**: Leave this field empty (we use client credentials flow)
   - **Client ID**: Will be auto-generated
   - **Client Secret**: Will be auto-generated
5. Click **Save**
6. The next screen will show your credentials. **Copy them immediately** - the secret won't be shown again!

**Example credentials format:**
```
Client ID: isiSdUCy
Client Secret: abc123xyz789...
```

### 2. Environment Configuration

Create a `.env` file in this directory:

```bash
cd packages/cms-testing
cp .env.example .env
```

Edit `.env` and add your credentials:

```env
# Xibo CMS Configuration
CMS_URL=https://displays.superpantalles.com
CLIENT_ID=your_client_id_from_above
CLIENT_SECRET=your_client_secret_from_above

# Test Configuration
TEST_DISPLAY_GROUP=Test Displays
```

**Important**: `.env` is gitignored - your credentials are safe and won't be committed.

### 3. Display Group Setup

You need a display group for testing.

**Option A: Use existing display group**

If you already have a display group, update `.env`:

```env
TEST_DISPLAY_GROUP=Your Existing Group Name
```

**Option B: Create new display group**

1. In CMS, go to **Display** > **Display Groups**
2. Click **Add Display Group**
3. Name: `Test Displays`
4. Description: `Group for automated testing`
5. Click **Save**
6. Click on the group to edit it
7. Click **Members** tab
8. Add your test displays (tecmandp1, tecmandp2, tecmandp3, etc.)
9. Click **Save**

### 4. Test Layouts

You have two options:

**Option A: Create layouts manually (Recommended)**

This is the easiest and most reliable method:

1. In CMS, go to **Layouts** > **Add Layout**
2. Create three layouts:

**Test Layout A:**
- Name: `Test Layout A`
- Resolution: `1920x1080` (or match your display)
- Click **Add Layout**
- Click on the layout to edit
- Add a **Text** widget:
  - Text: `MORNING SCHEDULE - Test A`
  - Font size: 72
  - Color: White
- Set background color to red (#FF0000) in layout properties
- Click **Save**

**Test Layout B:**
- Name: `Test Layout B`
- Add Text widget: `AFTERNOON SCHEDULE - Test B`
- Background: Blue (#0000FF)
- Save

**Test Layout C:**
- Name: `Test Layout C`
- Add Text widget: `EVENING SCHEDULE - Test C`
- Background: Green (#00FF00)
- Save

**Option B: Create programmatically (Advanced)**

```bash
npm run test:create-layouts
```

Note: This uses the CMS API to create layouts, which is more complex. Manual creation is recommended.

## Installation

From the monorepo root:

```bash
npm install
```

This will install all dependencies including `node-fetch`, `dotenv`, and `playwright`.

## Verification

Verify your setup is correct:

```bash
cd packages/cms-testing
npm run test:verify
```

This will:
- Test OAuth authentication
- List your display groups
- List test layouts
- Show current schedules

Expected output:

```
🔍 Verifying player configuration...

✅ Authenticated successfully

📺 Display Group: Test Displays
   Displays in group: 3
   - tecmandp1 (Status: Online)
   - tecmandp2 (Status: Offline)
   - tecmandp3 (Status: Online)

📁 Test Campaigns:
   (empty - run npm test to create)

✅ Verification complete!
```

## Running Tests

Once setup is complete:

```bash
npm test
```

This will:
1. Authenticate with CMS
2. Find your test layouts
3. Create a campaign grouping the layouts
4. Create two schedules:
   - Immediate schedule (starts in 1 minute, runs for 1 hour)
   - Recurring weekday schedule (Mon-Fri, 9am-5pm)

## Verifying on Player

After running tests:

1. Open player: https://displays.superpantalles.com/player/
2. If not connected:
   - Enter CMS URL: `https://displays.superpantalles.com`
   - Click **Connect**
   - Enter display code (shown on physical display)
3. Wait for schedule to activate (within 1 minute of test run)
4. Watch for:
   - Layouts cycling: A → B → C → A → ...
   - Transitions between layouts (fade in/out, fly in/out)
   - Schedule changing at correct times

## Troubleshooting

### Authentication Failed

**Error**: `Authentication failed: 401 Unauthorized`

**Cause**: Invalid or missing OAuth credentials

**Solution**:
1. Verify CLIENT_ID and CLIENT_SECRET in `.env`
2. Check OAuth application exists in CMS (Applications menu)
3. Try creating a new OAuth application and updating credentials

### Display Group Not Found

**Error**: `Display group "Test Displays" not found`

**Cause**: Display group doesn't exist or name mismatch

**Solution**:
1. Run `npm run test:verify` to see available groups
2. Either:
   - Create "Test Displays" group in CMS, OR
   - Update TEST_DISPLAY_GROUP in `.env` to match existing group

### No Test Layouts Found

**Error**: `No test layouts found. Please create test layouts manually`

**Cause**: Test layouts don't exist or are named incorrectly

**Solution**:
1. Run `npm run test:verify` to see existing layouts
2. Ensure layouts are named exactly:
   - `Test Layout A`
   - `Test Layout B`
   - `Test Layout C`
3. Create missing layouts manually in CMS

### CMS URL Not Accessible

**Error**: `fetch failed` or connection timeout

**Cause**: CMS URL is incorrect or CMS is down

**Solution**:
1. Verify CMS URL in `.env` (should be https://displays.superpantalles.com)
2. Try opening CMS URL in browser to verify it's accessible
3. Check VPN/network connection if CMS is on private network

### Player Shows No Schedule

**Possible Causes**:
1. Display not in correct display group
2. Schedule not activated yet (check start time)
3. Player not authorized for display
4. Player cache needs refresh

**Solutions**:
1. Verify display is in TEST_DISPLAY_GROUP:
   - CMS → Display → Display Groups → Test Displays → Members
2. Check schedule times:
   - CMS → Schedule → Show All
   - Look for "Automated Test Campaign"
3. Authorize player:
   - CMS → Displays → Find display → Authorize
4. Refresh player:
   - Press F5 in player browser
   - Or disconnect and reconnect

## Next Steps

Once setup is working:

1. Read [README.md](README.md) for full documentation
2. Explore [QUICKSTART.md](QUICKSTART.md) for common workflows
3. Experiment with different test scenarios:
   - Different schedule times
   - Priority resolution
   - Weekend vs weekday schedules
4. Set up Playwright for automated browser testing

## Getting Help

If you're still stuck:

1. Check CMS logs:
   - CMS → Advanced → Audit Log
2. Check player console:
   - Open player → F12 → Console tab
3. Run verification:
   ```bash
   npm run test:verify
   ```
4. Check this package's issue tracker or documentation

## Security Notes

- **Never commit `.env` file** - it contains sensitive credentials
- **Rotate OAuth credentials regularly** - especially if compromised
- **Use separate OAuth app for testing** - don't reuse production credentials
- **Limit permissions** - the OAuth user should only have necessary permissions

## Cleanup

To remove all test content:

```bash
npm run test:cleanup
```

This will delete:
- Test campaigns
- Associated schedules

It will NOT delete:
- Test layouts (you might want to reuse them)
- Display groups
- OAuth applications

To also delete layouts, uncomment the layout deletion section in `src/cleanup-tests.js`.
