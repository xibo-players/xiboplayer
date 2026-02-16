# Get Started in 3 Steps

Complete guide to running your first CMS test in under 10 minutes.

## Step 1: Get OAuth Credentials (3 minutes)

### 1.1 Open Xibo CMS
Navigate to: https://displays.superpantalles.com

### 1.2 Create OAuth Application
1. Click the **hamburger menu** (top left)
2. Scroll to **Applications** (under Admin section)
3. Click **Add Application** (top right, blue button)

### 1.3 Fill in Form
```
Name: Automated Testing
Auth Code: [leave empty]
```

### 1.4 Save and Copy Credentials
After clicking Save, you'll see:
```
Client ID: isiSdUCy
Client Secret: abc123xyz789qwertyuiop...
```

**IMPORTANT**: Copy these immediately. The secret won't be shown again!

---

## Step 2: Configure Package (2 minutes)

### 2.1 Create .env File

```bash
cd packages/cms-testing
cp .env.example .env
```

### 2.2 Add Credentials

Edit `.env` and paste your credentials:

```env
CMS_URL=https://displays.superpantalles.com
CLIENT_ID=isiSdUCy
CLIENT_SECRET=abc123xyz789qwertyuiop...
TEST_DISPLAY_GROUP=Test Displays
```

Save and close.

### 2.3 Install Dependencies

From monorepo root:

```bash
npm install
```

---

## Step 3: Create Test Content (5 minutes)

### 3.1 Create Display Group

In CMS:
1. **Display** menu → **Display Groups**
2. **Add Display Group** (blue button)
3. Name: `Test Displays`
4. Save
5. Click the group → **Members** tab
6. Click **Assign Displays**
7. Select: `tecmandp1`, `tecmandp2`, `tecmandp3`
8. Save

### 3.2 Create Test Layouts

**Layout A:**
1. **Layouts** menu → **Add Layout**
2. Name: `Test Layout A`
3. Resolution: `1920x1080`
4. Template: Blank (or any)
5. Save
6. Click on layout to edit
7. Click **Add Region** → drag to cover full screen
8. Click region → **Add Module** → **Text**
9. Text field: `MORNING SCHEDULE - Layout A`
10. Font size: `72`
11. Save widget
12. Layout properties (gear icon) → Background: `#FF0000` (red)
13. **Publish** layout (top right)

**Layout B:**
- Repeat above with:
  - Name: `Test Layout B`
  - Text: `AFTERNOON SCHEDULE - Layout B`
  - Background: `#0000FF` (blue)

**Layout C:**
- Repeat above with:
  - Name: `Test Layout C`
  - Text: `EVENING SCHEDULE - Layout C`
  - Background: `#00FF00` (green)

---

## Run Your First Test

```bash
cd packages/cms-testing
npm test
```

Expected output:

```
🧪 Xibo CMS Feature Testing
============================================================

📡 Phase 1: Authenticating with CMS...
✅ Authenticated successfully

📺 Phase 2: Finding display groups...
   Found 1 display group(s):
   - Test Displays (ID: 123)
   ✅ Using display group: Test Displays (ID: 123)

🎨 Phase 3: Checking for test layouts...
   Found 3 test layout(s):
   - Test Layout A (ID: 456)
   - Test Layout B (ID: 457)
   - Test Layout C (ID: 458)

📁 Phase 4: Managing test campaign...
✅ Created campaign: Automated Test Campaign (ID: 789)
✅ Assigned 3 layouts to campaign

📅 Phase 5: Creating test schedules...
   Creating immediate test schedule:
   - Start: 2026-01-30 11:36:00
   - End: 2026-01-30 12:36:00
✅ Created immediate schedule (ID: 1001)

   Creating recurring weekday schedule (Mon-Fri, 9am-5pm)...
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

---

## Verify on Player

### Open Player
Navigate to: https://displays.superpantalles.com/player/

### Connect to CMS (if needed)
1. Enter CMS URL: `https://displays.superpantalles.com`
2. Click **Connect**
3. Enter display code (if prompted)

### Select Display
Choose one of:
- tecmandp1
- tecmandp2
- tecmandp3

### Watch It Work
Within 1 minute, you should see:
1. Campaign starts
2. Layout A appears (red background, "MORNING SCHEDULE")
3. After ~60 seconds, transitions to Layout B (blue, "AFTERNOON")
4. After ~60 seconds, transitions to Layout C (green, "EVENING")
5. Cycles back to Layout A

**Look for:**
- ✅ Layouts cycling in order
- ✅ Fade/fly transitions between layouts
- ✅ No errors in browser console (F12)

---

## Cleanup

When done testing:

```bash
npm run test:cleanup
```

This will remove:
- Test campaigns
- Test schedules

It will keep:
- Test layouts (you can reuse them)
- Display groups
- OAuth application

---

## Troubleshooting

### "Authentication failed"

**Cause**: Wrong OAuth credentials

**Fix**:
1. Go to CMS → Applications
2. Delete old application
3. Create new one
4. Update `.env` with new credentials
5. Try again

### "Display group not found"

**Cause**: Group name mismatch

**Fix**:
```bash
npm run test:verify
```

This shows available groups. Either:
- Create "Test Displays" group in CMS, OR
- Update `TEST_DISPLAY_GROUP` in `.env`

### "No test layouts found"

**Cause**: Layouts don't exist or are named wrong

**Fix**:
1. Check layout names are EXACTLY:
   - `Test Layout A`
   - `Test Layout B`
   - `Test Layout C`
2. Check they're published
3. Try `npm run test:verify` to see existing layouts

### "Schedule doesn't appear on player"

**Possible causes**:
1. Display not in "Test Displays" group
2. Schedule start time in future
3. Player not authorized

**Fix**:
1. Check CMS → Display Groups → Test Displays → Members
2. Check CMS → Schedule → Show All (verify schedule exists)
3. Check CMS → Displays → [your display] → Authorize

### Still stuck?

Run verification:
```bash
npm run test:verify
```

This shows:
- Can you authenticate?
- What display groups exist?
- What test layouts exist?
- What campaigns exist?

See [SETUP_INSTRUCTIONS.md](SETUP_INSTRUCTIONS.md) for detailed troubleshooting.

---

## What's Next?

**Learn more:**
- [QUICKSTART.md](QUICKSTART.md) - Quick reference guide
- [README.md](README.md) - Complete documentation
- [SETUP_INSTRUCTIONS.md](SETUP_INSTRUCTIONS.md) - Detailed setup

**Experiment:**
- Create different schedules (weekends, evenings, etc.)
- Test priority resolution (high vs low priority)
- Try different layout transitions
- Add more layouts to campaigns

**Automate:**
- Integrate with CI/CD
- Set up automated testing
- Schedule regular verification

---

## Summary Checklist

Setup:
- [x] Created OAuth application in CMS
- [x] Configured .env with credentials
- [x] Installed dependencies (npm install)
- [x] Created "Test Displays" group in CMS
- [x] Created 3 test layouts (A, B, C)

Testing:
- [x] Ran `npm test` successfully
- [x] Opened player in browser
- [x] Verified layouts are cycling
- [x] Confirmed transitions are working

Cleanup:
- [x] Ran `npm run test:cleanup`

**You're all set! 🎉**

---

## Quick Command Reference

```bash
# Run all tests
npm test

# Verify configuration
npm run test:verify

# Clean up test content
npm run test:cleanup

# From monorepo root
npm run test -w packages/cms-testing
```

---

## Support

- Documentation: [README.md](README.md)
- Troubleshooting: [SETUP_INSTRUCTIONS.md](SETUP_INSTRUCTIONS.md)
- API Reference: https://displays.superpantalles.com/swagger.json
