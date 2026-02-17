# Xibo CMS Testing Package

Automated testing for Xibo CMS PWA player features including campaigns, dayparting, and transitions.

## Features

This package provides automated testing for:

- **Campaign Management**: Create and manage campaigns with multiple layouts
- **Dayparting**: Recurring time-based schedules (Mon-Fri 9-5, weekends, etc.)
- **Layout Transitions**: Fade in/out, fly in/out with direction
- **Priority Resolution**: High-priority campaigns override lower priority

## Setup

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Configure OAuth Credentials

You need to create an OAuth application in Xibo CMS to get API credentials.

**In Xibo CMS:**

1. Go to **Applications** menu (Admin section)
2. Click **Add Application**
3. Fill in:
   - **Name**: "Automated Testing"
   - **Auth Code**: (leave empty for client credentials flow)
4. Save and copy the **Client ID** and **Client Secret**

### 3. Create Environment File

```bash
cd packages/cms-testing
cp .env.example .env
```

Edit `.env` and add your credentials:

```env
CMS_URL=https://your-cms.example.com
CLIENT_ID=your_client_id_here
CLIENT_SECRET=your_client_secret_here
TEST_DISPLAY_GROUP=Test Displays
```

### 4. Create Test Display Group

In Xibo CMS:

1. Go to **Display** > **Display Groups**
2. Create a group named "Test Displays" (or match TEST_DISPLAY_GROUP in .env)
3. Add your test displays to this group

### 5. Create Test Layouts (Manual Method - Recommended)

Creating layouts via API is complex. It's easier to create them manually:

1. Go to **Layouts** > **Add Layout**
2. Create 3 layouts named:
   - "Test Layout A" (red background, text: "MORNING")
   - "Test Layout B" (blue background, text: "AFTERNOON")
   - "Test Layout C" (green background, text: "EVENING")
3. Add a text widget to each layout
4. Set layout transitions:
   - Layout A: fadeIn (1000ms) → fadeOut (1000ms)
   - Layout B: flyIn North (500ms) → flyOut South (500ms)
   - Layout C: fadeIn (2000ms) → flyOut East (1000ms)

## Usage

### Run All Tests

```bash
npm test
# or from workspace root:
pnpm run test --filter @xiboplayer/cms-testing
```

This will:
1. Authenticate with CMS
2. Find test layouts and display groups
3. Create a campaign with your test layouts
4. Create two schedules:
   - Immediate schedule (starts in 1 minute, runs for 1 hour)
   - Recurring weekday schedule (Mon-Fri, 9am-5pm)
5. Verify schedules are created correctly

### Individual Test Scripts

```bash
# Create test layouts programmatically (advanced)
npm run test:create-layouts

# Create test campaigns
npm run test:create-campaigns

# Create test schedules
npm run test:create-schedules

# Verify player is displaying content
npm run test:verify

# Clean up all test content
npm run test:cleanup
```

## Manual Verification

After running tests:

1. Open the PWA player: `https://your-cms.example.com/player/`
2. Connect to CMS if not already connected
3. Select your test display
4. Verify:
   - [ ] Layouts cycle through campaign
   - [ ] Transitions are visible (fade, fly)
   - [ ] Schedule activates at correct times
   - [ ] Priority resolution works

## API Client Usage

You can also use the API client programmatically:

```javascript
import { XiboCmsClient } from './src/xibo-api-client.js';

const client = new XiboCmsClient();

// Authenticate
await client.authenticate();

// Get display groups
const groups = await client.getDisplayGroups();
console.log('Display groups:', groups);

// Create a campaign
const campaign = await client.createCampaign('My Campaign');

// Assign layouts
await client.assignLayoutsToCampaign(campaign.campaignId, [layoutId1, layoutId2]);

// Create a schedule
await client.scheduleEvent({
  campaignId: campaign.campaignId,
  displayGroupIds: [groupId],
  fromDt: '09:00:00',
  toDt: '17:00:00',
  recurrenceType: 'Week',
  recurrenceDetail: '1,2,3,4,5', // Mon-Fri
  isPriority: 10
});
```

## Test Scenarios

### Scenario 1: Campaign with Multiple Layouts

**Goal**: Verify campaigns cycle through multiple layouts

1. Create campaign with 3+ layouts
2. Schedule campaign to display group
3. Verify layouts cycle in order
4. Check transition effects between layouts

### Scenario 2: Dayparting (Recurring Schedules)

**Goal**: Verify time-based scheduling works

1. Create weekday schedule (Mon-Fri, 9am-5pm)
2. Create weekend schedule (Sat-Sun, all day)
3. Wait for schedule activation time
4. Verify correct campaign displays at correct time

### Scenario 3: Priority Resolution

**Goal**: Verify priority system works

1. Create low-priority campaign (priority: 10)
2. Create high-priority campaign (priority: 100)
3. Schedule both for same time period
4. Verify high-priority campaign overrides low-priority

### Scenario 4: Layout Transitions

**Goal**: Verify transition animations work

1. Configure layouts with different transitions
2. Add to campaign
3. Observe transitions on player:
   - fadeIn/fadeOut
   - flyIn/flyOut with direction (N, S, E, W, NE, SE, SW, NW)
   - Duration settings respected

## Troubleshooting

### Authentication Fails

**Error**: `Authentication failed: 401`

**Solution**: 
- Verify CLIENT_ID and CLIENT_SECRET in .env
- Ensure OAuth application is created in CMS
- Check CMS URL is correct and accessible

### Display Group Not Found

**Error**: `Display group "Test Displays" not found`

**Solution**:
- Create display group in CMS
- Or update TEST_DISPLAY_GROUP in .env to match existing group

### No Test Layouts

**Error**: `No test layouts found`

**Solution**:
- Create layouts manually in CMS (recommended)
- Or run `npm run test:create-layouts` (advanced)
- Ensure layouts are named "Test Layout A", "Test Layout B", etc.

### Schedule Not Appearing on Player

**Possible causes**:
1. Display not in correct display group
2. Schedule times are outside current time
3. Player not connected to CMS
4. Player not authorized for display

**Solutions**:
- Check display is in TEST_DISPLAY_GROUP
- Verify schedule times in CMS Schedule page
- Reconnect player to CMS
- Authorize player for display in CMS

## Architecture

```
packages/cms-testing/
├── src/
│   ├── xibo-api-client.js       # CMS REST API client
│   ├── run-tests.js             # Main test orchestration
│   ├── create-test-layouts.js   # Layout creation helpers
│   ├── create-test-campaigns.js # Campaign creation
│   ├── create-test-schedules.js # Schedule creation
│   ├── verify-player.js         # Browser-based verification
│   └── cleanup-tests.js         # Remove test content
├── .env                          # Configuration (gitignored)
├── .env.example                  # Configuration template
└── package.json                  # Dependencies and scripts
```

## Xibo CMS API Reference

Key API endpoints used:

- `POST /api/authorize/access_token` - OAuth authentication
- `GET /api/displaygroup` - List display groups
- `GET /api/layout` - List layouts
- `POST /api/campaign` - Create campaign
- `POST /api/campaign/layout/assign/:id` - Assign layout to campaign
- `POST /api/schedule` - Create schedule event
- `GET /api/schedule/data/displaygroup` - Get display group schedule

Full API docs: `https://your-cms.example.com/swagger.json`

## Contributing

When adding new tests:

1. Keep tests independent and idempotent
2. Clean up test data after runs
3. Document expected behavior
4. Add to run-tests.js orchestration

## License

AGPL-3.0-or-later - See LICENSE in repository root
