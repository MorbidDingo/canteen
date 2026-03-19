# Organisational Architecture (Certe)

This document defines the best-practice end-to-end architecture for converting Certe into a true multi-organization platform where each school/college has its own isolated app ecosystem.

## 1) Executive Direction

### What this architecture enables
- Each school/college is an isolated organization (tenant).
- Inside each organization, all current Certe modules work independently: canteen, gate, attendance, library, messaging, parent controls, wallet, kiosk, and analytics.
- A single person can have membership in multiple organizations with different roles per organization.
- A platform owner account (you) can control contractual access, enable/disable features, and suspend an org or org-admin access when needed.

### Recommended governance model
- Add a platform-only role: PLATFORM_OWNER.
- Keep existing operational roles as organization-scoped roles (ADMIN, MANAGEMENT, OPERATOR, LIB_OPERATOR, ATTENDANCE, PARENT, GENERAL).
- Never use organization data access for PLATFORM_OWNER by default. Use explicit support mode with audit trail for elevated access.

This gives you full business control without weakening tenant security.

---

## 2) Core Concepts

### Tenant boundary
- All business data must be scoped by organizationId directly or through a guaranteed parent relation.

### Membership model
- A user can belong to many organizations.
- User role is decided per organization membership, not globally.

### Contract entitlements
- Each organization has a contract profile defining:
  - Which modules are enabled.
  - Usage limits.
  - Whether payment integration is active.
  - Support/maintenance state.

### Control switches
- You can hard-disable a module for an organization even if UI exists.
- You can suspend an organization or suspend only selected org admins.

---

## 3) Data Model Blueprint

## New platform tables

1. organization
- id
- name
- slug
- type (SCHOOL, COLLEGE, OTHER)
- status (PENDING, ACTIVE, SUSPENDED, CLOSED)
- createdByUserId
- approvedByUserId
- approvedAt
- suspendedAt
- suspensionReason
- billing and contract metadata
- defaultTimezone

2. organization_membership
- id
- organizationId
- userId
- role (ADMIN, MANAGEMENT, OPERATOR, LIB_OPERATOR, ATTENDANCE, PARENT, GENERAL)
- status (ACTIVE, INVITED, SUSPENDED, REMOVED)
- invitedByUserId
- joinedAt
- suspendedAt
- suspensionReason

3. platform_role
- userId
- role (PLATFORM_OWNER, optional PLATFORM_SUPPORT)
- status (ACTIVE, DISABLED)

4. organization_contract
- id
- organizationId
- contractCode
- planName
- startsAt
- endsAt
- status (ACTIVE, EXPIRED, GRACE, TERMINATED)
- autoSuspendOnExpiry (boolean)
- notes

5. organization_feature_entitlement
- id
- organizationId
- featureKey
- enabled
- source (PLAN_DEFAULT, CONTRACT_OVERRIDE, OWNER_OVERRIDE)
- hardLockedByOwner
- updatedByUserId
- updatedAt

6. organization_payment_config
- id
- organizationId
- provider (RAZORPAY)
- mode (PLATFORM_MANAGED, ORG_MANAGED)
- keyId
- keySecretEncrypted
- webhookSecretEncrypted
- settlementOwner (ORG, PLATFORM)
- status (ACTIVE, DISABLED, PENDING_VERIFICATION)
- lastVerifiedAt
- updatedByUserId

7. organization_device
- id
- organizationId
- deviceType (GATE, KIOSK, ATTENDANCE)
- deviceCode
- authTokenHash
- status (ACTIVE, DISABLED)
- lastSeenAt

8. organization_approval_request
- id
- applicantUserId
- requestedName
- requestedSlug
- status (PENDING, APPROVED, REJECTED)
- reviewedByUserId
- reviewedAt
- reviewNotes

## Existing tables to scope

Add organizationId (direct or guaranteed derived scope) to high-risk entities:
- menu, settings, library entities, audit log, bulk upload, analytics snapshots, notifications templates.

For identifiers, move from global unique to per-org unique:
- child.grNumber -> unique(organizationId, grNumber)
- child.rfidCardId -> unique(organizationId, rfidCardId)
- library accessionNumber -> unique(organizationId, accessionNumber)

---

## 4) Roles and Access Policy

## Platform layer

PLATFORM_OWNER (you)
- Can create, approve, suspend, and close organizations.
- Can enable/disable any feature for any organization.
- Can suspend/reactivate org admins.
- Can view all organizations and all org admins.
- Can manage payment configuration policies.
- Must be fully audited for all sensitive actions.

Optional PLATFORM_SUPPORT
- Read-only diagnostics with explicit, time-bound support access.

## Organization layer

Organization ADMIN
- Full control only inside their organization.
- Cannot change platform-level contract or owner hard locks.

Other org roles
- Current behavior remains, but scoped strictly to active organization membership.

---

## 5) Feature Governance (Contract + Overrides)

## Feature catalog

Define canonical features such as:
- CANTEEN_ORDERS
- RFID_GATE
- ATTENDANCE
- LIBRARY
- MESSAGING
- BULK_PHOTO_UPLOAD
- PARENT_CONTROLS
- ANALYTICS_ADVANCED
- RAZORPAY_WALLET_TOPUP

## Decision engine per request

Every protected endpoint should evaluate:
1. Organization status is ACTIVE.
2. User membership status is ACTIVE for this organization.
3. Required role is present.
4. Required feature entitlement is enabled.
5. If hardLockedByOwner is true, org admin cannot bypass.

If any check fails, block with clear error code and audit event.

---

## 6) Suspension and Kill-Switch Strategy

## Organization-level suspension
- Effect: all org logins and devices blocked (except billing/support paths if needed).
- Use cases: legal issue, non-payment, abuse, emergency containment.

## Membership-level suspension
- Effect: only selected user blocked in that organization.
- Use case: temporarily pause a problematic org admin account.

## Module-level freeze
- Effect: disable only selected features (example: disable Razorpay but keep attendance).

## Emergency lock
- Immediate owner-triggered lock for a tenant with reason and expiry window.

---

## 7) Razorpay Strategy per Organization

Best model: support both configuration modes.

1. Platform-managed mode
- You configure and rotate Razorpay credentials for the org.
- Good for managed-service contracts.

2. Org-managed mode
- Org admin enters their own Razorpay keys.
- Owner can approve/disable those credentials.

Recommended controls
- Secrets encrypted at rest.
- Credentials masked in UI.
- Verification call required before activation.
- Owner can force-disable payment integration instantly.
- All payment config changes produce immutable audit entries.

This directly answers your question: yes, both you and org admins can manage Razorpay, under policy and approval rules.

---

## 8) End-to-End Phased Plan

## Phase 0: Product and policy freeze
- Finalize role matrix and feature catalog.
- Finalize suspension policy, contract states, and approval SOP.
- Finalize Razorpay governance rules (who can edit in each mode).

Deliverables:
- Access policy matrix.
- Contract entitlement matrix.
- Audit event catalog.

## Phase 1: Foundation schema migration
- Add organization, membership, platform_role, contract, feature_entitlement, payment_config, device, and approval tables.
- Add organizationId columns and FKs to scoped entities.
- Convert global unique identifiers to per-org composite uniqueness.

Deliverables:
- Drizzle migrations.
- Backfill scripts.
- Data integrity report.

## Phase 2: Authentication and context model
- Introduce activeOrganizationId in session context.
- Replace global role checks with membership role resolution.
- Add organization switcher for multi-org users.

Deliverables:
- Auth helper APIs.
- UI switcher.
- Session hardening tests.

## Phase 3: Authorization and endpoint hardening
- Create centralized guard: requireOrgAccess(role, feature).
- Patch all route-group layouts and APIs to enforce org + feature checks.
- Fix device endpoints to resolve organization first, then RFID lookup by org.

Deliverables:
- Shared guard library.
- Updated APIs.
- Cross-tenant penetration tests.

## Phase 4: Owner console and org lifecycle
- Build owner dashboard for:
  - org approvals
  - org suspension/reactivation
  - admin suspension/reactivation
  - feature toggles per org
  - contract status and expiry alerts
- Build “all orgs” and “all org admins” searchable views.

Deliverables:
- Owner console UI/API.
- Full audit coverage for owner actions.

## Phase 5: Contract-driven feature control
- Bind feature entitlements to contract records.
- Add auto-enforcement jobs for contract expiry/grace.
- Add owner overrides with reason capture.

Deliverables:
- Entitlement engine.
- Scheduled enforcement jobs.
- Exception handling workflow.

## Phase 6: Razorpay per-org onboarding
- Implement platform-managed and org-managed credential flows.
- Add key verification and webhook onboarding.
- Add safe rotation and rollback logic.

Deliverables:
- Payment config UI/API.
- Secret management integration.
- Verification dashboard.

## Phase 7: Migration and backward compatibility
- Create default organization from existing production data.
- Map existing roles into membership records.
- Enable compatibility adapter for legacy role reads (short-term only).

Deliverables:
- One-time migration runbook.
- Rollback plan.
- Validation checks.

## Phase 8: Observability, compliance, and launch
- Add tenant-aware audit dashboards and anomaly alerts.
- Add cross-tenant access attempt alerts.
- Run staging load tests and tenant-isolation test suite.
- Roll out with feature flags and gradual tenant migration.

Deliverables:
- Monitoring dashboards.
- Security sign-off.
- Production rollout checklist.

---

## 9) Suggested API Surface (High Level)

Owner APIs
- POST /api/platform/organizations/:id/approve
- POST /api/platform/organizations/:id/suspend
- POST /api/platform/organizations/:id/reactivate
- POST /api/platform/memberships/:id/suspend
- POST /api/platform/memberships/:id/reactivate
- PUT /api/platform/organizations/:id/features/:featureKey
- PUT /api/platform/organizations/:id/contracts/current
- PUT /api/platform/organizations/:id/payment-config

Org admin APIs
- GET /api/org/current/features
- PUT /api/org/current/payment-config (if mode allows)
- GET /api/org/current/admins

Shared safety
- All endpoints must enforce actor scope, organization status, contract status, and feature entitlement.

---

## 10) Security and Legal Guardrails

- Enforce strict tenant isolation at query layer and business layer.
- Encrypt payment secrets and sensitive credentials.
- Require reason codes for suspension and hard feature blocks.
- Maintain immutable audit trails for owner and admin actions.
- Define data retention and export policies per organization contract.
- Add controlled support-access workflow for platform owner diagnostics.

---

## 11) Best-Practice Recommendation for Certe

Use a two-level authority model:
- Platform authority: PLATFORM_OWNER (you) for commercial and risk controls.
- Tenant authority: Org ADMIN for day-to-day school operations.

This is the best balance for your business because it gives you:
- Contract enforcement power.
- Immediate safety controls.
- Full visibility of organizations and their admins.
- Flexible Razorpay ownership model.
- Strong tenant isolation for trust and legal safety.

---

## 12) Success Criteria

The architecture is considered complete when:
- No API allows cross-tenant read/write.
- Owner can suspend any org or org admin in under one minute.
- Feature toggles are contract-aware and enforceable in real-time.
- Razorpay can be configured by owner or org admin as per policy.
- Every critical governance action is auditable and queryable.

---

## 13) Implementation Spec (Drizzle-Oriented)

Use this as the source of truth for migration tickets.

## 13.1 Enums

- organization_type: SCHOOL, COLLEGE, OTHER
- organization_status: PENDING, ACTIVE, SUSPENDED, CLOSED
- membership_status: INVITED, ACTIVE, SUSPENDED, REMOVED
- org_role: ADMIN, MANAGEMENT, OPERATOR, LIB_OPERATOR, ATTENDANCE, PARENT, GENERAL
- platform_role: PLATFORM_OWNER, PLATFORM_SUPPORT
- platform_role_status: ACTIVE, DISABLED
- contract_status: ACTIVE, EXPIRED, GRACE, TERMINATED
- feature_source: PLAN_DEFAULT, CONTRACT_OVERRIDE, OWNER_OVERRIDE
- payment_provider: RAZORPAY
- payment_mode: PLATFORM_MANAGED, ORG_MANAGED
- payment_status: PENDING_VERIFICATION, ACTIVE, DISABLED
- device_type: GATE, KIOSK, ATTENDANCE
- device_status: ACTIVE, DISABLED

## 13.2 New Tables (column-level)

1. organization
- id text pk
- name text not null
- slug text not null unique
- type organization_type not null default SCHOOL
- status organization_status not null default PENDING
- createdByUserId text not null fk user.id
- approvedByUserId text fk user.id
- approvedAt timestamp
- suspendedAt timestamp
- suspensionReason text
- defaultTimezone text not null default Asia/Kolkata
- contactEmail text
- contactPhone text
- createdAt timestamp not null
- updatedAt timestamp not null

2. organization_membership
- id text pk
- organizationId text not null fk organization.id on delete cascade
- userId text not null fk user.id on delete cascade
- role org_role not null
- status membership_status not null default INVITED
- invitedByUserId text fk user.id
- joinedAt timestamp
- suspendedAt timestamp
- suspensionReason text
- createdAt timestamp not null
- updatedAt timestamp not null
- unique(organizationId, userId, role)

3. platform_user_role
- id text pk
- userId text not null fk user.id on delete cascade unique
- role platform_role not null
- status platform_role_status not null default ACTIVE
- createdAt timestamp not null
- updatedAt timestamp not null

4. organization_contract
- id text pk
- organizationId text not null fk organization.id on delete cascade
- contractCode text not null
- planName text not null
- startsAt timestamp not null
- endsAt timestamp not null
- status contract_status not null default ACTIVE
- autoSuspendOnExpiry boolean not null default true
- notes text
- createdByUserId text not null fk user.id
- createdAt timestamp not null
- updatedAt timestamp not null

5. organization_feature_entitlement
- id text pk
- organizationId text not null fk organization.id on delete cascade
- featureKey text not null
- enabled boolean not null default false
- source feature_source not null default PLAN_DEFAULT
- hardLockedByOwner boolean not null default false
- updatedByUserId text not null fk user.id
- updatedAt timestamp not null
- unique(organizationId, featureKey)

6. organization_payment_config
- id text pk
- organizationId text not null fk organization.id on delete cascade
- provider payment_provider not null default RAZORPAY
- mode payment_mode not null default ORG_MANAGED
- keyId text
- keySecretEncrypted text
- webhookSecretEncrypted text
- settlementOwner text not null default ORG
- status payment_status not null default PENDING_VERIFICATION
- lastVerifiedAt timestamp
- updatedByUserId text not null fk user.id
- createdAt timestamp not null
- updatedAt timestamp not null
- unique(organizationId, provider)

7. organization_device
- id text pk
- organizationId text not null fk organization.id on delete cascade
- deviceType device_type not null
- deviceCode text not null
- authTokenHash text not null
- status device_status not null default ACTIVE
- lastSeenAt timestamp
- createdAt timestamp not null
- updatedAt timestamp not null
- unique(organizationId, deviceType, deviceCode)

8. organization_approval_request
- id text pk
- applicantUserId text not null fk user.id
- requestedName text not null
- requestedSlug text not null
- status text not null default PENDING
- reviewedByUserId text fk user.id
- reviewedAt timestamp
- reviewNotes text
- createdAt timestamp not null
- updatedAt timestamp not null

## 13.3 Existing Tables: required tenant columns

Add organizationId fk organization.id (not null after backfill) to:
- child
- menuItem
- appSetting
- librarySetting
- book
- bookCopy
- bulkPhotoUpload
- auditLog

Add or update unique constraints:
- child: unique(organizationId, grNumber)
- child: unique(organizationId, rfidCardId)
- temporaryRfidAccess: unique(organizationId, temporaryRfidCardId)
- bookCopy: unique(organizationId, accessionNumber)

Drop old global unique constraints only after backfill validation.

## 13.4 Session model changes

- Keep global user identity in better-auth user/session.
- Store activeOrganizationId in session metadata or secure cookie.
- Resolve runtime role from organization_membership where status=ACTIVE.

---

## 14) API Guard Contract and Middleware

## 14.1 Request context contract

All protected routes should resolve this context:

- actorUserId
- actorPlatformRole (nullable)
- activeOrganizationId (nullable for platform routes)
- membershipRole (nullable)
- membershipStatus
- organizationStatus
- featureFlags map

## 14.2 Shared guard interface

Use one central helper across routes and layouts:

```
requireAccess({
  scope: "platform" | "organization",
  organizationId?: string,
  allowedPlatformRoles?: Array<"PLATFORM_OWNER" | "PLATFORM_SUPPORT">,
  allowedOrgRoles?: Array<"ADMIN" | "MANAGEMENT" | "OPERATOR" | "LIB_OPERATOR" | "ATTENDANCE" | "PARENT" | "GENERAL">,
  requiredFeature?: string,
  allowWhenOrgSuspended?: boolean,
})
```

Behavior:
- Validates session.
- Validates platform role if platform scope.
- Validates active organization + membership status if organization scope.
- Validates organization status (blocked when SUSPENDED/CLOSED unless explicitly allowed).
- Validates entitlement for requiredFeature.
- Returns typed context for downstream query filters.

## 14.3 Mandatory API rules

- No database query for tenant data without organizationId in filter or join constraint.
- Device endpoints (gate/kiosk/attendance) must authenticate device and infer organization from organization_device.
- Any owner override action must write audit event with reason and target organization.
- All 403 responses should include machine-readable reason codes:
  - ORG_SUSPENDED
  - MEMBERSHIP_SUSPENDED
  - FEATURE_DISABLED
  - CONTRACT_EXPIRED
  - INSUFFICIENT_ROLE

## 14.4 Suggested endpoint ownership

Platform routes:
- /api/platform/organizations/*
- /api/platform/contracts/*
- /api/platform/features/*
- /api/platform/payment-config/*

Organization routes:
- /api/org/*
- /api/management/*
- /api/admin/*
- /api/operator/*
- /api/lib-operator/*
- /api/attendance/*

---

## 15) Engineering Backlog (Ticketized by Phase)

## Phase 1: Schema foundation

- ORG-101: Create enums for org, membership, contract, payment, device states.
- ORG-102: Add organization and organization_membership tables.
- ORG-103: Add platform_user_role table.
- ORG-104: Add contract, entitlement, payment_config, device, approval_request tables.
- ORG-105: Add organizationId to scoped existing tables.
- ORG-106: Convert global unique constraints to per-org composite constraints.
- ORG-107: Add migration checks and integrity SQL scripts.

Definition of done:
- Migrations run on clean DB and staging dump.
- No orphaned records.
- Composite uniqueness verified.

## Phase 2: Auth and context

- ORG-201: Add activeOrganizationId resolver and persistence.
- ORG-202: Build organization switcher API and UI.
- ORG-203: Replace global role reads with membership role resolver.
- ORG-204: Add session tests for multi-org users.

Definition of done:
- Same user can switch org and receive different role behavior.

## Phase 3: Guard and route hardening

- ORG-301: Implement shared requireAccess helper.
- ORG-302: Update app route-group layouts to use shared guard.
- ORG-303: Patch all organization APIs to include org scope filter.
- ORG-304: Patch gate/kiosk/attendance endpoints to device->org resolution.
- ORG-305: Add negative tests for cross-tenant access.

Definition of done:
- Cross-tenant read/write blocked in all tested paths.

## Phase 4: Owner console

- ORG-401: Build organization approval queue and actions.
- ORG-402: Build org and org-admin suspension controls.
- ORG-403: Build feature entitlement editor with hard lock option.
- ORG-404: Build global list views (all orgs, all org admins).
- ORG-405: Add owner audit timeline UI.

Definition of done:
- Owner can complete approve/suspend/feature-toggle flows end-to-end.

## Phase 5: Contract engine

- ORG-501: Implement contract state evaluator service.
- ORG-502: Implement entitlement resolver precedence (plan < contract < owner override).
- ORG-503: Add scheduled job for expiry/grace enforcement.
- ORG-504: Integrate contract checks into requireAccess.

Definition of done:
- Expired contract behavior auto-enforced without manual action.

## Phase 6: Razorpay per-org

- ORG-601: Implement payment config API for PLATFORM_MANAGED mode.
- ORG-602: Implement payment config API for ORG_MANAGED mode.
- ORG-603: Add verification workflow and webhook validation.
- ORG-604: Add key rotation and disable/rollback flow.

Definition of done:
- Payment config can be activated/deactivated safely per org.

## Phase 7: Data migration and compatibility

- ORG-701: Seed default organization from current production.
- ORG-702: Create memberships from legacy user role values.
- ORG-703: Backfill organizationId across legacy tables.
- ORG-704: Add temporary legacy-role adapter with deprecation log.

Definition of done:
- Existing production behavior unchanged for default org.

## Phase 8: Launch hardening

- ORG-801: Tenant isolation automated test suite.
- ORG-802: Security audit and query sampling for missing org filters.
- ORG-803: Observability dashboards and alerts for denied access reasons.
- ORG-804: Controlled rollout with feature flag and tenant cohorts.

Definition of done:
- Production rollout completed with no cross-tenant incidents.

---

## 16) Immediate Build Order (First 2 Weeks)

Week 1
- ORG-101 to ORG-107
- ORG-201
- ORG-301

Week 2
- ORG-202 to ORG-204
- ORG-302 to ORG-304
- ORG-701 to ORG-703 on staging clone

Rationale:
- This sequence de-risks security first (schema + guard + org scoping), then enables owner console and contract tooling on top of safe foundations.

---

## 17) Execution Log (Started)

Status date: 2026-03-18

Completed now:
- Added Phase 1 foundation tables in schema:
  - organization
  - organization_membership
  - platform_user_role
  - organization_approval_request
  - organization_contract
  - organization_feature_entitlement
  - organization_payment_config
  - organization_device
- Added initial relations for all new tables in schema.
- Implemented shared server guard scaffold in auth utilities:
  - requireAccess(options)
  - AccessDeniedError with machine-readable reason codes
  - active organization resolution from header/cookie
- Added first platform-owner APIs:
  - GET /api/platform/organizations
  - GET /api/platform/org-admins
- Pushed schema changes successfully with drizzle push.
- Added ORG-105 tenant scoping columns (initial nullable rollout) to:
  - child, temporary_rfid_access, menu_item, audit_log, book, book_copy,
    bulk_photo_upload, library_setting, app_setting
- Added ORG-106 per-org composite uniqueness groundwork:
  - child (organizationId, grNumber)
  - child (organizationId, rfidCardId)
  - temporary_rfid_access (organizationId, temporaryRfidCardId)
  - book_copy (organizationId, accessionNumber)
- Updated schema relations for organization-linked entities.
- Converted management accounts API cluster to org-aware access pilot:
  - app/api/management/accounts/route.ts
  - app/api/management/accounts/[id]/route.ts
  - Uses requireAccess(scope: organization) and organization_membership role scoping.
- Added ORG-703 idempotent backfill migration and validation scripts:
  - drizzle/0011_org_backfill.sql
  - drizzle/0011_org_backfill_validation.sql
  - Backfills organization_id fields and seeds ACTIVE memberships from legacy user roles.
- Executed ORG-703 backfill on configured database and validated:
  - null organization_id rows = 0 across scoped tables
  - users without ACTIVE membership = 0
- Completed ORG-106 constraint retirement:
  - Dropped legacy global unique constraints in DB via drizzle/0012_drop_legacy_global_uniques.sql
  - Updated schema to keep only per-org composite uniqueness for child RFIDs/GR numbers, temporary RFID, and book accession numbers.
- Began ORG-303 high-risk endpoint hardening:
  - Gate tap endpoint now requires organization context header (x-organization-id/x-org-id).
  - RFID resolution supports organization-scoped lookup to prevent cross-tenant card resolution.
- Extended ORG-303 hardening for kiosk/operator/menu APIs:
  - Kiosk order endpoint requires organization context and scopes RFID, siblings, app settings, and menu reads by organization.
  - Operator lookup endpoint requires organization context and scopes RFID/family wallet lookup by organization.
  - Public menu endpoint requires organization context and returns only org-scoped available items.
  - Admin menu CRUD and menu image upload now enforce requireAccess(scope: organization) and org ownership filters.
- Extended ORG-303 hardening for library read APIs:
  - Library search endpoint now requires organization context and filters book search by organization.
  - Library student lookup endpoint now requires organization context, uses org-scoped RFID resolution, and filters book/bookCopy joins by organization.
- Began ORG-302 route-group guard migration:
  - Converted protected layouts for admin, management, operator, lib-operator, and attendance groups to use requireAccess(scope: organization) with role checks from organization membership.

Next in execution queue:
- ORG-302 expansion: migrate remaining protected route groups to requireAccess.
- ORG-303 expansion: patch remaining high-risk endpoints (library issue/return/reissue and management library routes).
