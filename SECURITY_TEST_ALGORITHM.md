# Security and End-to-End Testing Algorithm

## Objective
Build a repeatable, breach-focused test flow that validates all major personas (platform, owner, management, admin, operator, kiosk device, gate device, library device, attendance staff, parent) and reports:
- functional failures
- authorization failures
- cross-tenant data leaks
- route-scope and API-scope bypasses

## Test Layers
1. Schema and migration checks
- Run db migration and seed smoke:
- npm run db:push
- npm run db:seed
- Fail if migration/seed returns non-zero.

2. Role routing and layout lock checks
- Validate each persona lands on intended home route.
- Validate terminal device accounts cannot access control layouts.
- Validate kiosk, gate, and library pages render without nav/signout actions.

3. API access matrix checks
- Execute scripts/security/access-matrix.ts with per-actor session cookies.
- For each actor, run:
- allowed endpoint assertions (200/201/202 or declared expected)
- denied endpoint assertions (must return 401/403/404)
- Classify deviations as:
- availability_issue (allowed endpoint fails)
- security_breach (denied endpoint reachable)

4. Tenant isolation checks
- For actor in org A, attempt access to records in org B by id and by query filters.
- Must return 403/404 and never return foreign payload rows.
- Repeat for:
- attendance reports and recent
- management statistics and summary
- library issue/return/reissue
- gate tap and context resolution

5. Business-critical workflow checks
- Owner: create org, edit org, disable org, request reactivation.
- Platform: approve/reject org requests, suspend/reactivate org, approve/reject reactivation.
- Management: create device accounts, assign users, fetch device stats.
- Parent: wallet top-up, view notifications, toggle messaging preferences.
- Gate/Kiosk/Library: complete POS flows with valid and invalid cards/scans.

6. Security abuse checks
- Replay requests with missing org context header/cookie.
- Tamper with device headers (x-device-id/x-device-code).
- Attempt horizontal privilege escalation by swapping ids in URL/body.
- Attempt CSRF-like POSTs without auth cookie.
- Attempt role pivot (device account against attendance/control APIs).

7. Reporting
- Save machine report to scripts/security/latest-report.json.
- Publish findings with severity:
- Critical: cross-tenant data read/write
- High: unauthorized endpoint access
- Medium: stale redirects/route leaks
- Low: inconsistent status codes/error messages

## Runbook
1. Start app in a dedicated environment.
2. Acquire session cookies for each actor account.
3. Replace cookie placeholders in scripts/security/matrix.sample.json.
4. Run:
- npx tsx scripts/security/access-matrix.ts scripts/security/matrix.sample.json
5. Review scripts/security/latest-report.json.

## Immediate Failure Gates
- Any security_breach result in access matrix.
- Any cross-tenant record leak in API payloads.
- Any terminal device account that can open attendance, admin, or management controls.

## Notes
- Keep at least 2 organizations in test data for tenant isolation checks.
- Use deterministic test users and deterministic device codes per org.
- Run this suite after every auth, middleware, or route-guard change.
