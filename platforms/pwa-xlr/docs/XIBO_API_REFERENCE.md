# Xibo CMS REST API Reference

Complete reference for Xibo CMS API endpoints based on analysis of Ansible playbooks and Playwright tests.

**Base URL:** `https://{your-domain}/api`

**Authentication:** OAuth 2.0 Client Credentials

---

## Table of Contents

1. [Authentication](#authentication)
2. [Display Management](#display-management)
3. [Layout Management](#layout-management)
4. [Campaign Management](#campaign-management)
5. [Schedule Management](#schedule-management)
6. [Widget Management](#widget-management)
7. [Media Management](#media-management)
8. [Known Issues & Workarounds](#known-issues--workarounds)

---

## Authentication

### Get Access Token

**Endpoint:** `POST /api/authorize/access_token`

**Content-Type:** `application/x-www-form-urlencoded`

**Parameters:**
```
grant_type: "client_credentials"
client_id: "{your-client-id}"
client_secret: "{your-client-secret}"
```

**Response:**
```json
{
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

**Example (curl):**
```bash
curl -X POST https://displays.example.com/api/authorize/access_token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=your-client-id" \
  -d "client_secret=your-secret"
```

**Example (Playwright):**
```javascript
const tokenResponse = await request.post(`${CMS_URL}/api/authorize/access_token`, {
  form: {
    grant_type: 'client_credentials',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET
  }
});
const { access_token } = await tokenResponse.json();
```

**Example (Ansible):**
```yaml
- name: Get OAuth2 access token
  ansible.builtin.uri:
    url: "{{ xibo_base_url }}/api/authorize/access_token"
    method: POST
    body_format: form-urlencoded
    body:
      grant_type: client_credentials
      client_id: "{{ xibo_client_id }}"
      client_secret: "{{ xibo_client_secret }}"
    status_code: 200
  register: oauth_response
```

**Creating API Credentials in CMS:**
1. Navigate to: **Applications → Add Application**
2. Grant Type: **Client Credentials**
3. Save and note the Client ID and Client Secret

---

## Display Management

### List Displays

**Endpoint:** `GET /api/display`

**Headers:**
```
Authorization: Bearer {access_token}
Accept: application/json
```

**Response:**
```json
[
  {
    "displayId": 1,
    "display": "Test Display",
    "displayGroupId": 5,
    "defaultLayoutId": 10,
    "defaultLayout": "Default Layout",
    "license": "chromeOS",
    "licensed": 1,
    "loggedIn": 1,
    "lastAccessed": "2026-02-03 10:30:00",
    ...
  }
]
```

**Example (Playwright):**
```javascript
const displaysResp = await request.get(`${CMS_URL}/api/display`, {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/json'
  }
});
const displays = await displaysResp.json();
const testDisplay = displays.find(d => d.display === 'test_pwa');
```

### Get Single Display

**Endpoint:** `GET /api/display/{id}`

**Status:** ⚠️ **NOT SUPPORTED** - Returns 405 Method Not Allowed

**Workaround:** Use `GET /api/display` and filter client-side

### Update Display Default Layout (Simple Method)

**Endpoint:** `PUT /api/display/defaultlayout/{displayId}`

**Status:** ✅ **WORKING** - Simple, only needs layoutId

**Headers:**
```
Authorization: Bearer {access_token}
Content-Type: application/x-www-form-urlencoded
```

**Parameters:**
```
layoutId: 25        # The layout ID to set as default
```

**Response:** 200 OK (returns empty array `[]`)

**Example (Playwright):**
```javascript
await request.put(`${CMS_URL}/api/display/defaultlayout/${displayId}`, {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/x-www-form-urlencoded'
  },
  form: {
    layoutId: String(layoutId)
  }
});
```

**Note:** This is the CORRECT endpoint for updating default layout. Much simpler than `PUT /api/display/{id}`.

---

### Update Display (Complex Method)

**Endpoint:** `PUT /api/display/{id}`

**Status:** ⚠️ **AVOID** - Requires ALL display fields (50+)

**Parameters:** Requires *every* display property including:
```
display, license, defaultLayoutId, licensed, loggedIn, incSchedule,
emailAlert, alertTimeout, wakeOnLanEnabled, wakeOnLanTime,
broadCastAddress, secureOn, cidr, latitude, longitude,
displayProfileId, clearCachedData, rekeyXmr, ...
```

**Known Issue:** API validation is too strict - requires 50+ fields even to change one property

**Better Alternatives:**
1. ✅ Use `PUT /display/defaultlayout/{id}` (simple, 1 parameter)
2. ✅ Use `POST /api/schedule` (most reliable, scheduling-based)

---

## Layout Management

### List Layouts

**Endpoint:** `GET /api/layout`

**Headers:**
```
Authorization: Bearer {access_token}
```

**Response:**
```json
[
  {
    "layoutId": 25,
    "layout": "Test Layout A",
    "description": "Test layout with image",
    "duration": 60,
    "width": 1920,
    "height": 1080,
    "resolutionId": 9,
    "statusMessage": "Published",
    "published": 1,
    ...
  }
]
```

**Example (Ansible):**
```yaml
- name: Check if layout already exists
  ansible.builtin.uri:
    url: "{{ xibo_base_url }}/api/layout"
    method: GET
    headers:
      Authorization: "Bearer {{ access_token }}"
    status_code: 200
  register: layouts_response

- name: Find existing layout
  ansible.builtin.set_fact:
    existing_layout: "{{ layouts_response.json | selectattr('layout', 'equalto', layout_name) | list | first | default(none) }}"
```

### Create Layout

**Endpoint:** `POST /api/layout`

**Headers:**
```
Authorization: Bearer {access_token}
Content-Type: application/x-www-form-urlencoded
```

**Parameters:**
```
name: "Layout Name"
description: "Layout description"
resolutionId: 9              # 9 = 1920x1080
duration: 60                 # Duration in seconds
```

**Response:**
```json
{
  "layoutId": 42,
  "layout": "Layout Name",
  "ownerId": 1,
  ...
}
```

**Common Resolution IDs:**
- `9` = 1920x1080 (Full HD)
- `10` = 3840x2160 (4K)
- Use `GET /api/resolution` to list all

**Example (Playwright):**
```javascript
const layoutResp = await request.post(`${CMS_URL}/api/layout`, {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/x-www-form-urlencoded'
  },
  form: {
    name: 'Test Layout',
    description: 'Automated test layout',
    resolutionId: 9,
    duration: 60
  }
});
const { layoutId } = await layoutResp.json();
```

### Publish Layout

**Endpoint:** `PUT /api/layout/publish/{layoutId}`

**Headers:**
```
Authorization: Bearer {access_token}
```

**Response:** 200 or 204 (No Content)

**Example (Ansible):**
```yaml
- name: Publish layout
  ansible.builtin.uri:
    url: "{{ xibo_base_url }}/api/layout/publish/{{ layout_id }}"
    method: PUT
    headers:
      Authorization: "Bearer {{ access_token }}"
    status_code: [200, 204]
```

### Retire Layout

**Endpoint:** `PUT /api/layout/retire/{layoutId}`

### Delete Layout

**Endpoint:** `DELETE /api/layout/{layoutId}`

---

## Campaign Management

### List Campaigns

**Endpoint:** `GET /api/campaign`

**Headers:**
```
Authorization: Bearer {access_token}
```

**Response:**
```json
[
  {
    "campaignId": 12,
    "campaign": "Test Campaign",
    "isLayoutSpecific": 0,
    "numberOfLayouts": 2,
    ...
  }
]
```

### Create Campaign

**Endpoint:** `POST /api/campaign`

**Headers:**
```
Authorization: Bearer {access_token}
Content-Type: application/x-www-form-urlencoded
```

**Parameters:**
```
name: "Campaign Name"
```

**Response:**
```json
{
  "campaignId": 15,
  "campaign": "Campaign Name",
  ...
}
```

**Example (Ansible):**
```yaml
- name: Create campaign
  ansible.builtin.uri:
    url: "{{ xibo_base_url }}/api/campaign"
    method: POST
    headers:
      Authorization: "Bearer {{ access_token }}"
      Content-Type: "application/x-www-form-urlencoded"
    body_format: form-urlencoded
    body:
      name: "{{ campaign_name }}"
    status_code: [200, 201]
  register: campaign_create
```

### Assign Layout to Campaign

**Endpoint:** `POST /api/campaign/layout/assign/{campaignId}`

**Headers:**
```
Authorization: Bearer {access_token}
Content-Type: application/x-www-form-urlencoded
```

**Parameters:**
```
layoutId: 25
displayOrder: 1           # Optional: Order within campaign
```

**Status Codes:** 200, 201, or 204

**Note:** `displayOrder` parameter may not always be respected

**Example (Ansible):**
```yaml
- name: Assign layout to campaign
  ansible.builtin.uri:
    url: "{{ xibo_base_url }}/api/campaign/layout/assign/{{ campaign_id }}"
    method: POST
    headers:
      Authorization: "Bearer {{ access_token }}"
      Content-Type: "application/x-www-form-urlencoded"
    body_format: form-urlencoded
    body:
      layoutId: "{{ layout_id }}"
      displayOrder: 1
    status_code: [200, 201, 204]
```

### Unassign Layout from Campaign

**Endpoint:** `POST /api/campaign/layout/unassign/{campaignId}`

**Parameters:**
```
layoutId: 25
```

### Delete Campaign

**Endpoint:** `DELETE /api/campaign/{campaignId}`

---

## Schedule Management

### Create Schedule Event

**Endpoint:** `POST /api/schedule`

**Headers:**
```
Authorization: Bearer {access_token}
Content-Type: application/json
```

**Parameters:**
```json
{
  "eventTypeId": 1,                    // 1=Layout, 2=Campaign
  "campaignId": 12,                    // Campaign or Layout campaign ID
  "displayGroupIds": [5],              // Array of display group IDs
  "isPriority": 0,                     // 0=Normal, 1=Priority
  "displayOrder": 1,
  "dayPartId": 0,                      // 0=Always
  "fromDt": "2026-01-01 00:00:00",    // REQUIRED - cannot be empty!
  "toDt": "2027-12-31 23:59:59"       // End date
}
```

**Important Notes:**
- ✅ **Most reliable way to assign content to displays**
- ⚠️ `fromDt` is REQUIRED (API error if empty)
- Schedule targets `displayGroupIds`, not `displayId`
- Every display belongs to a display group (get from display object)

**Response:**
```json
{
  "eventId": 42,
  "campaignId": 12,
  ...
}
```

**Example (Playwright):**
```javascript
// Get display group ID first
const testDisplay = displays.find(d => d.display === 'test_pwa');
const displayGroupId = testDisplay.displayGroupId;

// Create schedule
const scheduleResp = await request.post(`${CMS_URL}/api/schedule`, {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  data: {
    eventTypeId: 1,
    campaignId: 12,
    displayGroupIds: [displayGroupId],
    isPriority: 0,
    displayOrder: 1,
    dayPartId: 0,
    fromDt: '2026-01-01 00:00:00',
    toDt: '2027-12-31 23:59:59'
  }
});
```

### List Schedules

**Endpoint:** `GET /api/schedule`

### Delete Schedule Event

**Endpoint:** `DELETE /api/schedule/{eventId}`

---

## Widget Management

### Add Text Widget to Layout

**Endpoint:** `POST /api/playlist/widget/text/{layoutId}`

**Headers:**
```
Authorization: Bearer {access_token}
Content-Type: application/x-www-form-urlencoded
```

**Parameters:**
```
text: "<h1>Hello World</h1>"
duration: 60
```

**Response:**
```json
{
  "widgetId": 123,
  "playlistId": 456,
  ...
}
```

**Example (Ansible):**
```yaml
- name: Add text widget to layout
  ansible.builtin.uri:
    url: "{{ xibo_base_url }}/api/playlist/widget/text/{{ layout_id }}"
    method: POST
    headers:
      Authorization: "Bearer {{ access_token }}"
      Content-Type: "application/x-www-form-urlencoded"
    body_format: form-urlencoded
    body:
      text: "<h1>XLR Player Test</h1><p>Auto-configured!</p>"
      duration: "{{ layout_duration }}"
    status_code: [200, 201]
```

### Add Image Widget

**Endpoint:** `POST /api/playlist/widget/image/{layoutId}`

**Parameters:**
```
mediaIds: "42"     # Media library ID
duration: 10
```

### Add Video Widget

**Endpoint:** `POST /api/playlist/widget/video/{layoutId}`

### Add Other Widget Types

General pattern: `POST /api/playlist/widget/{type}/{layoutId}`

**Widget Types:**
- `text` - Text/HTML content
- `image` - Images from media library
- `video` - Video files
- `audio` - Audio files
- `embedded` - Embedded HTML
- `webpage` - External web page
- `ticker` - RSS/Data ticker
- `clock` - Clock widget
- `weather` - Weather widget
- ... (many more available)

---

## Media Management

### Upload Media

**Endpoint:** `POST /api/library`

**Headers:**
```
Authorization: Bearer {access_token}
```

**Content-Type:** `multipart/form-data`

**Parameters:**
```
files: [binary file data]
name: "filename.jpg"
oldMediaId: null
updateInLayouts: 0
deleteOldRevisions: 0
```

**Supported File Types:**
- **Images:** JPG, PNG, GIF, BMP, SVG
- **Videos:** MP4, WebM, AVI, MOV
- **Audio:** MP3, WAV, OGG
- **Documents:** PDF
- **Other:** Various widget-specific formats

### List Media

**Endpoint:** `GET /api/library`

### Delete Media

**Endpoint:** `DELETE /api/library/{mediaId}`

---

## Known Issues & Workarounds

### Issue 1: Display Update API Broken

**Problem:** `PUT /api/display/{id}` requires ALL display fields

**Error:** 422 Unprocessable Entity or 500 Internal Server Error

**Attempted:**
```yaml
# This FAILS:
- name: Update display default layout
  ansible.builtin.uri:
    url: "/api/display/{{ display_id }}"
    method: PUT
    body:
      defaultLayoutId: "{{ layout_id }}"
```

**Error Response:**
```json
{
  "error": "Validation failed",
  "message": "Missing required fields: display, license, ..."
}
```

**Workaround:** Use **Schedule API** instead:
```javascript
// Instead of updating display.defaultLayoutId, create a schedule:
await request.post(`${CMS_URL}/api/schedule`, {
  data: {
    eventTypeId: 1,
    campaignId: layoutCampaignId,
    displayGroupIds: [display.displayGroupId],
    isPriority: 0,
    fromDt: '2026-01-01 00:00:00',
    toDt: '2099-12-31 23:59:59'
  }
});
```

### Issue 2: Campaign Layout Order Not Respected

**Problem:** `displayOrder` parameter in layout assignment may not work

**Status:** Under investigation

**Current Approach:** Test and verify, may need manual ordering in CMS UI

### Issue 3: Schedule Requires fromDt

**Problem:** Cannot create "always-on" schedule without start date

**Error:** API returns error if `fromDt` is empty

**Workaround:** Use far past/future dates:
```json
{
  "fromDt": "2026-01-01 00:00:00",
  "toDt": "2099-12-31 23:59:59"
}
```

### Issue 4: GET /api/display/{id} Not Supported

**Problem:** Cannot get single display by ID

**Workaround:** Use `GET /api/display` and filter:
```javascript
const displays = await request.get(`${CMS_URL}/api/display`).json();
const myDisplay = displays.find(d => d.displayId === targetId);
```

---

## Best Practices

### 1. Always Check Existence Before Creating

```javascript
// Get layouts
const layouts = await request.get(`${CMS_URL}/api/layout`).json();
const existing = layouts.find(l => l.layout === 'My Layout');

if (!existing) {
  // Create only if doesn't exist
  const newLayout = await request.post(`${CMS_URL}/api/layout`, ...);
}
```

### 2. Use Schedule API for Content Assignment

✅ **Recommended:**
```javascript
// Assign via schedule (reliable)
await request.post(`${CMS_URL}/api/schedule`, { ... });
```

❌ **Avoid:**
```javascript
// Update display directly (broken)
await request.put(`${CMS_URL}/api/display/${id}`, { ... });
```

### 3. Always Publish Layouts Before Scheduling

```javascript
// 1. Create layout
const { layoutId } = await createLayout();

// 2. Add widgets
await addTextWidget(layoutId, ...);

// 3. PUBLISH (important!)
await request.put(`${CMS_URL}/api/layout/publish/${layoutId}`);

// 4. Schedule
await scheduleLayout(layoutId, ...);
```

### 4. Handle Display Groups Correctly

```javascript
// Every display has a displayGroupId
const display = displays.find(d => d.display === 'test_pwa');

// Use displayGroupId for scheduling, not displayId
await request.post(`${CMS_URL}/api/schedule`, {
  data: {
    displayGroupIds: [display.displayGroupId],  // Correct
    // NOT: displayId: display.displayId         // Wrong
    ...
  }
});
```

### 5. Token Expiration Handling

```javascript
let token = await getToken();
let tokenExpiry = Date.now() + (3600 * 1000); // 1 hour

async function apiCall(endpoint) {
  if (Date.now() >= tokenExpiry) {
    token = await getToken();
    tokenExpiry = Date.now() + (3600 * 1000);
  }
  return request.get(endpoint, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
}
```

---

## API Testing with Playwright

### Complete Example

```javascript
const { test, expect } = require('@playwright/test');

const CMS_URL = 'https://displays.example.com';
const CLIENT_ID = 'your-client-id';
const CLIENT_SECRET = 'your-client-secret';

test('Create and schedule layout', async ({ request }) => {
  // 1. Get token
  const tokenResp = await request.post(`${CMS_URL}/api/authorize/access_token`, {
    form: {
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET
    }
  });
  const { access_token } = await tokenResp.json();

  // 2. Create layout
  const layoutResp = await request.post(`${CMS_URL}/api/layout`, {
    headers: {
      'Authorization': `Bearer ${access_token}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    form: {
      name: 'Test Layout',
      description: 'Automated test',
      resolutionId: 9,
      duration: 60
    }
  });
  const { layoutId } = await layoutResp.json();

  // 3. Add widget
  await request.post(`${CMS_URL}/api/playlist/widget/text/${layoutId}`, {
    headers: {
      'Authorization': `Bearer ${access_token}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    form: {
      text: '<h1>Hello World</h1>',
      duration: 60
    }
  });

  // 4. Publish
  await request.put(`${CMS_URL}/api/layout/publish/${layoutId}`, {
    headers: { 'Authorization': `Bearer ${access_token}` }
  });

  // 5. Get display
  const displaysResp = await request.get(`${CMS_URL}/api/display`, {
    headers: { 'Authorization': `Bearer ${access_token}` }
  });
  const displays = await displaysResp.json();
  const testDisplay = displays.find(d => d.display === 'test_pwa');

  // 6. Get layout's campaign ID
  const layoutsResp = await request.get(`${CMS_URL}/api/layout`, {
    headers: { 'Authorization': `Bearer ${access_token}` }
  });
  const layouts = await layoutsResp.json();
  const layout = layouts.find(l => l.layoutId === layoutId);

  // 7. Schedule
  await request.post(`${CMS_URL}/api/schedule`, {
    headers: {
      'Authorization': `Bearer ${access_token}`,
      'Content-Type': 'application/json'
    },
    data: {
      eventTypeId: 1,
      campaignId: layout.campaignId,
      displayGroupIds: [testDisplay.displayGroupId],
      isPriority: 0,
      fromDt: '2026-01-01 00:00:00',
      toDt: '2027-12-31 23:59:59'
    }
  });

  console.log('✅ Layout created and scheduled!');
});
```

---

## Additional Resources

- **Xibo API Documentation:** https://xibosignage.com/docs/api
- **Swagger UI:** `https://your-cms/api/swagger.json`
- **CMS Version:** Check with `GET /api/about`

---

## Changelog

- **2026-02-03:** Initial comprehensive documentation based on Ansible and Playwright analysis
- Documented all endpoints found in production use
- Added known issues and workarounds
- Included best practices from real-world usage

---

**Last Updated:** 2026-02-03
