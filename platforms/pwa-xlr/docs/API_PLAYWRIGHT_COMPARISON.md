# API vs Playwright Usage Comparison

Comprehensive comparison of how Ansible playbooks and Playwright tests use Xibo CMS APIs.

---

## Summary

Both Ansible playbooks and Playwright tests use the **same Xibo REST API** with consistent patterns. This document highlights usage patterns, best practices, and any discrepancies found.

**Key Finding:** Both tools follow identical API usage patterns with only minor syntax differences between YAML (Ansible) and JavaScript (Playwright).

---

## Authentication

### Ansible Implementation

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
  no_log: true

- name: Set access token
  ansible.builtin.set_fact:
    access_token: "{{ oauth_response.json.access_token }}"
  no_log: true
```

**File:** `playbooks/services/configure-xibo-test-campaign.yml:15-31`

### Playwright Implementation

```javascript
const tokenResponse = await request.post(`${CMS_URL}/api/authorize/access_token`, {
  form: {
    grant_type: 'client_credentials',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET
  },
  ignoreHTTPSErrors: true
});

const tokenData = await tokenResponse.json();
const token = tokenData.access_token;
```

**File:** `e2e-tests/tests/03-assign-test-media.spec.js:27-37`

### Comparison

| Aspect | Ansible | Playwright | Match |
|--------|---------|------------|-------|
| **Endpoint** | `/api/authorize/access_token` | `/api/authorize/access_token` | ✅ |
| **Method** | POST | POST | ✅ |
| **Content-Type** | `form-urlencoded` | `form-urlencoded` | ✅ |
| **Parameters** | `grant_type`, `client_id`, `client_secret` | Same | ✅ |
| **Response** | `oauth_response.json.access_token` | `tokenData.access_token` | ✅ |
| **Security** | `no_log: true` | Not sensitive in test | ⚠️ |

**Verdict:** ✅ **Identical** - Both use OAuth 2.0 client credentials grant correctly

---

## List Resources (GET)

### List Displays

**Ansible:**
```yaml
- name: Check if display exists
  ansible.builtin.uri:
    url: "{{ xibo_base_url }}/api/display"
    method: GET
    headers:
      Authorization: "Bearer {{ access_token }}"
    status_code: 200
  register: displays_response

- name: Find test display
  ansible.builtin.set_fact:
    test_display: "{{ displays_response.json | selectattr('display', 'equalto', display_name) | list | first | default(none) }}"
```

**Playwright:**
```javascript
const displaysResp = await request.get(`${CMS_URL}/api/display`, {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/json'
  },
  ignoreHTTPSErrors: true
});

const displays = await displaysResp.json();
const testPwaDisplay = displays.find(d => d.display === 'test_pwa');
```

**Comparison:**

| Aspect | Ansible | Playwright | Match |
|--------|---------|------------|-------|
| **Endpoint** | `GET /api/display` | `GET /api/display` | ✅ |
| **Authorization** | Bearer token | Bearer token | ✅ |
| **Filtering** | Jinja2 `selectattr` | JS `find()` | ✅ |
| **Accept Header** | Not set | `application/json` | ⚠️ |

**Verdict:** ✅ **Functionally identical** - Syntax differs but same result

---

## Create Resources (POST)

### Create Layout

**Ansible:**
```yaml
- name: Create layout if it doesn't exist
  ansible.builtin.uri:
    url: "{{ xibo_base_url }}/api/layout"
    method: POST
    headers:
      Authorization: "Bearer {{ access_token }}"
      Content-Type: "application/x-www-form-urlencoded"
    body_format: form-urlencoded
    body:
      name: "{{ layout_name }}"
      description: "Automated test layout for XLR player"
      resolutionId: 9  # 1920x1080
      duration: "{{ layout_duration }}"
    status_code: [200, 201]
  register: layout_create
  when: existing_layout is none
```

**Playwright:**
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
  },
  ignoreHTTPSErrors: true
});

const { layoutId } = await layoutResp.json();
```

**Comparison:**

| Aspect | Ansible | Playwright | Match |
|--------|---------|------------|-------|
| **Endpoint** | `POST /api/layout` | `POST /api/layout` | ✅ |
| **Content-Type** | `form-urlencoded` | `form-urlencoded` | ✅ |
| **Parameters** | `name`, `description`, `resolutionId`, `duration` | Same | ✅ |
| **Status Codes** | `[200, 201]` | Default (any 2xx) | ⚠️ |
| **Response** | `layout_create.json.layoutId` | `layoutId` | ✅ |

**Verdict:** ✅ **Identical** - Same parameters and behavior

---

## Update Resources (PUT)

### Publish Layout

**Ansible:**
```yaml
- name: Publish layout
  ansible.builtin.uri:
    url: "{{ xibo_base_url }}/api/layout/publish/{{ layout_id }}"
    method: PUT
    headers:
      Authorization: "Bearer {{ access_token }}"
    status_code: [200, 204]
```

**Playwright:**
```javascript
await request.put(`${CMS_URL}/api/layout/publish/${layoutId}`, {
  headers: { 'Authorization': `Bearer ${token}` },
  ignoreHTTPSErrors: true
});
```

**Comparison:**

| Aspect | Ansible | Playwright | Match |
|--------|---------|------------|-------|
| **Endpoint** | `PUT /api/layout/publish/{id}` | Same | ✅ |
| **Authorization** | Bearer token | Bearer token | ✅ |
| **Body** | None (not required) | None | ✅ |
| **Status Codes** | `[200, 204]` | Any 2xx | ⚠️ |

**Verdict:** ✅ **Identical**

---

## Assignment Operations

### Assign Layout to Campaign

**Ansible:**
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
    status_code: [200, 201, 204]
```

**Playwright:**
```javascript
// Not directly used in tests - uses schedule API instead
// (See discrepancy below)
```

**Comparison:**

| Aspect | Ansible | Playwright | Match |
|--------|---------|------------|-------|
| **Endpoint** | `POST /api/campaign/layout/assign/{id}` | N/A | ❌ |
| **Usage** | Assigns layout to campaign | Not used | ❌ |

**Discrepancy:** Playwright tests skip campaign assignment and go directly to schedule creation.

**Reason:** Schedule API is more direct and reliable for assigning content to displays.

**Verdict:** ⚠️ **Different approach, both valid**

---

## Schedule Creation

### Create Schedule

**Ansible:**
```yaml
# Not implemented in basic playbooks
# Only in advanced deployment scripts
```

**Playwright:**
```javascript
const scheduleResp = await request.post(`${CMS_URL}/api/schedule`, {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  data: {
    eventTypeId: 1,
    campaignId: 12,
    displayGroupIds: [testPwaDisplay.displayGroupId],
    isPriority: 0,
    displayOrder: 1,
    dayPartId: 0,
    fromDt: '2026-01-01 00:00:00',
    toDt: '2027-12-31 23:59:59'
  },
  ignoreHTTPSErrors: true
});
```

**File:** `e2e-tests/tests/03-assign-test-media.spec.js:61-77`

**Comparison:**

| Aspect | Ansible | Playwright | Match |
|--------|---------|------------|-------|
| **Endpoint** | Not used | `POST /api/schedule` | ❌ |
| **Content-Type** | N/A | `application/json` | N/A |
| **Parameters** | N/A | `eventTypeId`, `campaignId`, `displayGroupIds`, etc. | N/A |

**Discrepancy:** Ansible playbooks don't use schedule API, rely on display update instead.

**Issue:** Display update API is broken (see Display Update section below)

**Recommendation:** Ansible should adopt Playwright's schedule approach

**Verdict:** ⚠️ **Playwright uses better approach**

---

## Widget Creation

### Add Text Widget

**Ansible:**
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
      text: "<h1>XLR Player Test</h1><p>Campaign auto-configured via Ansible!</p>"
      duration: "{{ layout_duration }}"
    status_code: [200, 201]
  when: existing_layout is none
```

**Playwright:**
```javascript
await request.post(`${CMS_URL}/api/playlist/widget/text/${layoutId}`, {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/x-www-form-urlencoded'
  },
  form: {
    text: '<h1>Hello World</h1>',
    duration: 60
  }
});
```

**Comparison:**

| Aspect | Ansible | Playwright | Match |
|--------|---------|------------|-------|
| **Endpoint** | `POST /api/playlist/widget/text/{id}` | Same | ✅ |
| **Content-Type** | `form-urlencoded` | `form-urlencoded` | ✅ |
| **Parameters** | `text`, `duration` | Same | ✅ |
| **HTML Support** | Yes | Yes | ✅ |

**Verdict:** ✅ **Identical**

---

## Display Update (Known Issue)

### Ansible Attempts

**File:** `playbooks/services/configure-xibo-test-campaign.yml:156-167`

```yaml
- name: Assign campaign to display
  ansible.builtin.uri:
    url: "{{ xibo_base_url }}/api/display/{{ display_id }}"
    method: PUT
    headers:
      Authorization: "Bearer {{ access_token }}"
      Content-Type: "application/x-www-form-urlencoded"
    body_format: form-urlencoded
    body:
      defaultLayoutId: "{{ layout_id }}"
    status_code: [200, 204]
  when: display_id is defined
```

**Playwright Attempts:**
```javascript
// NOT USED - Known to fail
// Use schedule API instead
```

**Issue:** ❌ **BROKEN API ENDPOINT**

**Error:** 422 Unprocessable Entity or 500 Internal Server Error

**Reason:** API requires ALL display fields, not just `defaultLayoutId`

**Required Fields:**
```
display, license, defaultLayoutId, licensed, loggedIn, incSchedule,
emailAlert, alertTimeout, wakeOnLanEnabled, wakeOnLanTime,
broadCastAddress, secureOn, cidr, latitude, longitude,
displayProfileId, clearCachedData, rekeyXmr, ...
```

**Workaround:** Use `POST /api/schedule` instead (Playwright approach)

**Verdict:** ❌ **Both fail on display update, Playwright uses better workaround**

---

## Best Practices Comparison

### Ansible Best Practices

✅ **Good:**
- Checks for existing resources before creating
- Uses `no_log` for sensitive data
- Handles multiple status codes
- Conditional execution with `when`
- Idempotent operations

⚠️ **Needs Improvement:**
- Should use schedule API instead of display update
- Could add more error handling
- Should validate API responses

### Playwright Best Practices

✅ **Good:**
- Uses schedule API (more reliable)
- Comprehensive error checking
- Screenshots for verification
- Cleanup after tests
- Ignores HTTPS errors for self-signed certs

⚠️ **Needs Improvement:**
- Hard-coded credentials in test files
- Could cache OAuth tokens
- Could add retry logic

---

## Discrepancies Found

### 1. Display Assignment Method

| Tool | Method | Status |
|------|--------|--------|
| **Ansible** | `PUT /api/display/{id}` with `defaultLayoutId` | ❌ Fails |
| **Playwright** | `POST /api/schedule` with `campaignId` + `displayGroupIds` | ✅ Works |

**Recommendation:** Ansible should adopt schedule-based approach

### 2. Campaign Usage

| Tool | Creates Campaign | Assigns Layout | Uses Schedule |
|------|------------------|----------------|---------------|
| **Ansible** | ✅ Yes | ✅ Yes | ❌ No |
| **Playwright** | ⚠️ Uses existing | ❌ Skips | ✅ Yes |

**Recommendation:** Both approaches valid, schedule is more direct

### 3. Accept Headers

| Tool | Sets Accept Header |
|------|-------------------|
| **Ansible** | ❌ No (relies on default) |
| **Playwright** | ✅ Yes (`application/json`) |

**Impact:** None (API defaults to JSON)

**Recommendation:** Add `Accept: application/json` to Ansible for explicitness

### 4. Error Handling

| Tool | Status Code Validation | Error Messages |
|------|----------------------|----------------|
| **Ansible** | ✅ Explicit list `[200, 201, 204]` | ⚠️ Limited |
| **Playwright** | ⚠️ Implicit (any 2xx) | ✅ Detailed |

**Recommendation:** Both could improve

---

## Recommended Unified Approach

### 1. Authentication (OAuth 2.0)

```
POST /api/authorize/access_token
  grant_type: client_credentials
  client_id: {id}
  client_secret: {secret}
```

**Both tools:** ✅ Already using this

### 2. Create Layout

```
POST /api/layout
  name: "Layout Name"
  description: "Description"
  resolutionId: 9
  duration: 60
```

**Both tools:** ✅ Already using this

### 3. Add Widget

```
POST /api/playlist/widget/{type}/{layoutId}
  {widget-specific parameters}
```

**Both tools:** ✅ Already using this

### 4. Publish Layout

```
PUT /api/layout/publish/{layoutId}
```

**Both tools:** ✅ Already using this

### 5. Assign to Display (RECOMMENDED METHOD)

```
POST /api/schedule
  eventTypeId: 1 (or 2 for campaign)
  campaignId: {layoutCampaignId}
  displayGroupIds: [{displayGroupId}]
  isPriority: 0
  fromDt: "2026-01-01 00:00:00"
  toDt: "2099-12-31 23:59:59"
```

**Ansible:** ❌ Should adopt this
**Playwright:** ✅ Already using this

---

## Migration Recommendations

### For Ansible Playbooks

**Update:** `playbooks/services/configure-xibo-test-campaign.yml`

**Replace:**
```yaml
- name: Assign campaign to display
  ansible.builtin.uri:
    url: "{{ xibo_base_url }}/api/display/{{ display_id }}"
    method: PUT
    body:
      defaultLayoutId: "{{ layout_id }}"
```

**With:**
```yaml
- name: Get layout campaign ID
  ansible.builtin.set_fact:
    campaign_id: "{{ (layouts_response.json | selectattr('layoutId', 'equalto', layout_id) | list | first).campaignId }}"

- name: Create schedule for display
  ansible.builtin.uri:
    url: "{{ xibo_base_url }}/api/schedule"
    method: POST
    headers:
      Authorization: "Bearer {{ access_token }}"
      Content-Type: "application/json"
    body_format: json
    body:
      eventTypeId: 1
      campaignId: "{{ campaign_id }}"
      displayGroupIds: ["{{ test_display.displayGroupId }}"]
      isPriority: 0
      fromDt: "2026-01-01 00:00:00"
      toDt: "2099-12-31 23:59:59"
    status_code: [200, 201]
```

**Benefits:**
- ✅ Actually works (display update is broken)
- ✅ More flexible (can schedule multiple layouts)
- ✅ Supports time-based scheduling
- ✅ Supports priority overrides

### For Playwright Tests

**No changes needed** - already using best practices

**Optional improvements:**
```javascript
// Move credentials to environment variables
const CLIENT_ID = process.env.XIBO_CLIENT_ID;
const CLIENT_SECRET = process.env.XIBO_CLIENT_SECRET;

// Add token caching
let cachedToken = null;
let tokenExpiry = 0;

async function getToken(request) {
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  const tokenResp = await request.post(...);
  cachedToken = tokenResp.access_token;
  tokenExpiry = Date.now() + (3600 * 1000); // 1 hour
  return cachedToken;
}
```

---

## Testing Matrix

### Operations Tested

| Operation | Ansible | Playwright | Working |
|-----------|---------|------------|---------|
| **OAuth Authentication** | ✅ | ✅ | ✅ |
| **List Displays** | ✅ | ✅ | ✅ |
| **List Layouts** | ✅ | ✅ | ✅ |
| **Create Layout** | ✅ | ✅ | ✅ |
| **Add Text Widget** | ✅ | ✅ | ✅ |
| **Add Image Widget** | ❌ | ✅ | ✅ |
| **Publish Layout** | ✅ | ✅ | ✅ |
| **Create Campaign** | ✅ | ❌ | ✅ |
| **Assign Layout to Campaign** | ✅ | ❌ | ✅ |
| **Create Schedule** | ❌ | ✅ | ✅ |
| **Update Display** | ⚠️ Tried | ❌ Avoided | ❌ Broken |

**Legend:**
- ✅ Implemented and works
- ⚠️ Implemented but fails
- ❌ Not implemented

---

## Conclusion

### Summary

Both Ansible and Playwright use the **same Xibo REST API** with identical parameters and behavior. The main difference is the **assignment strategy**:

- **Ansible:** Tries to update display directly (fails)
- **Playwright:** Uses schedule API (works)

### Recommendations

1. ✅ **Adopt schedule-based assignment** in Ansible playbooks
2. ✅ **Add Accept headers** to Ansible requests
3. ✅ **Move credentials to environment** in Playwright tests
4. ✅ **Unify error handling** across both tools
5. ✅ **Document API limitations** (display update broken)

### Verdict

**API Usage:** ✅ **Consistent across both tools**

**Best Practices:** ✅ **Playwright has better workarounds for known issues**

**Recommendation:** Update Ansible playbooks to use schedule API like Playwright does.

---

**Last Updated:** 2026-02-03
