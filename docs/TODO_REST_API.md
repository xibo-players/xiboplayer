# Future: Custom CMS REST Endpoints for Player Protocol

## Goal

Replace the XMDS SOAP protocol with RESTful JSON endpoints for player communication. This enables standard HTTP caching, simpler error handling, and eliminates the need for SOAP libraries in modern player implementations.

## Feasibility

**HIGH** — The Xibo CMS uses Slim Framework 4 with a `/custom/` directory that supports PSR-4 autoloading. All required factories and services (DisplayFactory, ScheduleFactory, RequiredFileFactory) are already available via dependency injection.

## Estimated Effort

~40-55 hours total development time.

## Proposed Endpoints

| Endpoint | Replaces XMDS | Effort | Priority |
|----------|---------------|--------|----------|
| `POST /api/player/register` | RegisterDisplay | 4-6h | High |
| `GET /api/player/{id}/required-files` | RequiredFiles | 8-12h | Critical |
| `GET /api/player/{id}/schedule` | Schedule | 6-10h | Critical |
| `GET /api/player/{id}/resource/{layout}/{region}/{media}` | GetResource | 5-8h | Critical |
| `POST /api/player/{id}/log` | SubmitLog | 3-4h | Medium |
| `POST /api/player/{id}/stats` | SubmitStats | 6-8h | Medium |
| `POST /api/player/{id}/screenshot` | SubmitScreenShot | 2-3h | Low |
| `POST /api/player/{id}/media-inventory` | MediaInventory | 2-3h | Medium |
| `PUT /api/player/{id}/status` | NotifyStatus | 3-4h | Medium |

## Benefits

### JSON Instead of XML (~30% Bandwidth Reduction)
- SOAP envelope overhead eliminated
- JSON is more compact than XML for the same data
- Native parsing in all modern languages (no XML/SOAP library needed)

### Standard HTTP Caching
- `ETag` and `If-None-Match` for schedule and required-files
- `304 Not Modified` when nothing has changed (saves bandwidth + processing)
- `Cache-Control` headers for media files
- CDN-compatible caching layer possible

### RESTful Conventions
- Predictable URL structure (`/api/player/{id}/schedule`)
- Standard HTTP methods (GET, POST, PUT, DELETE)
- Standard HTTP status codes (200, 304, 400, 401, 404, 500)
- Self-documenting API

### Simpler Error Handling
- HTTP status codes instead of SOAP faults
- JSON error bodies with structured error codes
- Standard error middleware can handle all errors consistently

### Incremental Adoption
- Players can migrate endpoint by endpoint
- XMDS remains available for legacy players
- No big-bang migration required
- Both protocols can coexist indefinitely

### Better Tooling
- Standard REST debugging tools (curl, Postman, browser DevTools)
- OpenAPI/Swagger documentation possible
- Standard monitoring and logging
- Rate limiting via standard HTTP middleware

### Content Negotiation
- `Accept` header for future format flexibility
- Could support JSON, XML, or binary responses
- Version negotiation via `Accept-Version` header

### Standard Authentication
- Reuses existing OAuth2 infrastructure
- Display-scoped tokens (player gets token for its own display only)
- Standard `Authorization: Bearer` header
- Token refresh without full re-registration

## Implementation Path

### Phase 1: Core Endpoints (Critical Priority)
1. `required-files` — file manifest with hashes
2. `schedule` — current schedule XML/JSON
3. `resource` — widget HTML resources

### Phase 2: Registration + Status
4. `register` — display registration/heartbeat
5. `status` — notify display status
6. `media-inventory` — report cached files

### Phase 3: Reporting
7. `log` — submit player logs
8. `stats` — submit proof-of-play stats
9. `screenshot` — submit display screenshot

### Architecture

```
/custom/
├── PlayerRestController.php    # Main controller
├── PlayerRestMiddleware.php    # Display-scoped auth
└── routes.php                  # Route registration
```

The controller uses existing factories:
- `DisplayFactory` — display lookup and validation
- `ScheduleFactory` — schedule generation
- `RequiredFileFactory` — file manifest
- `ModuleFactory` — widget resource rendering
- `LogFactory`, `StatFactory` — reporting

### Authentication Flow

1. Player calls `POST /api/player/register` with hardware key + CMS key
2. CMS returns display-scoped OAuth2 token
3. All subsequent calls use `Authorization: Bearer {token}`
4. Token includes display ID claim for scoping

### HTTP Caching Strategy

```
GET /api/player/{id}/schedule
→ 200 OK + ETag: "abc123"

GET /api/player/{id}/schedule
If-None-Match: "abc123"
→ 304 Not Modified (no body, minimal bandwidth)
```

For required-files:
```
GET /api/player/{id}/required-files
→ 200 OK + Last-Modified: Wed, 12 Feb 2026 01:00:00 GMT

GET /api/player/{id}/required-files
If-Modified-Since: Wed, 12 Feb 2026 01:00:00 GMT
→ 304 Not Modified
```

## Compatibility

- XMDS SOAP remains fully functional — no breaking changes
- Legacy Windows, Android, and Linux players continue using XMDS
- New/modern players can adopt REST incrementally
- Both protocols share the same underlying business logic

## Open Questions

1. Should media file downloads go through the REST API or remain as direct HTTP downloads?
2. Should the schedule be returned as JSON (new format) or XML (compatible with existing parsing)?
3. How to handle XMR (push notifications) — keep WebSocket or add Server-Sent Events?
4. Should we implement GraphQL as an alternative for complex queries?
