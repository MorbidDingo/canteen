# Feature Specification: Assignments & Notes

## Overview

This document outlines the goals, data model, access control, and UI/UX design for two new features:

1. **Assignments** — Permitted accounts post assignments with attachments; students submit their work.
2. **Notes** — Permitted accounts publish notes/resources in any format; accessible from the Library (Lib) section.

Both features support granular access control: content can be scoped to specific users, classes, or the entire organisation.

---

## 1. Assignments

### 1.1 Goal

Allow teachers or any general-account holder who has been explicitly permitted by a `MANAGEMENT`/`OWNER` user to create assignments. Students (accessed through a `PARENT` or `GENERAL` account) must submit their work by uploading a file in any format.

### 1.2 Roles & Permissions

| Action | Who |
|--------|-----|
| Create / edit / delete assignment | `MANAGEMENT`, `OWNER`, or any user with the `CAN_POST_ASSIGNMENTS` permission grant |
| View an assignment | Users explicitly listed in `assignmentAccess` (by user, class, or scope) |
| Submit a response | Students whose account or linked child is in the assignment's access list |
| View any submission | Only the original poster **and** the submitting student (strict two-party visibility) |
| Grant `CAN_POST_ASSIGNMENTS` | `MANAGEMENT` / `OWNER` only |

> **Permission grant table** (`assignmentPostPermission`): management stores a record per user granting them posting rights. This mirrors the pattern already used for notice targeting.

### 1.3 Data Model

```
assignment
  id                  uuid PK
  organizationId      → organization.id
  createdByUserId     → user.id
  title               text  NOT NULL
  description         text
  dueDate             timestamp
  attachments         jsonb   -- [{ name, url, mimeType, size }]  (S3 keys)
  createdAt           timestamp
  updatedAt           timestamp

assignmentAccess
  id                  uuid PK
  assignmentId        → assignment.id
  targetType          enum (ALL_STUDENTS, SPECIFIC_CLASS, SPECIFIC_USERS)
  targetClass         text?   -- class/grade identifier
  targetUserIds       text[]? -- array of user ids

assignmentSubmission
  id                  uuid PK
  assignmentId        → assignment.id
  submittedByUserId   → user.id   -- the student/child account holder
  attachments         jsonb   -- [{ name, url, mimeType, size }]  (S3 keys)
  submittedAt         timestamp
  updatedAt           timestamp

assignmentPostPermission
  id                  uuid PK
  organizationId      → organization.id
  userId              → user.id   -- who is permitted
  grantedByUserId     → user.id   -- who granted it
  createdAt           timestamp
```

### 1.4 File Storage

- Attachments uploaded to AWS S3 under key patterns:
  - `assignments/{assignmentId}/attachments/{filename}`
  - `assignments/{assignmentId}/submissions/{submissionId}/{filename}`
- Accepted formats: any (no server-side MIME restriction — validation is client-side UX only).
- Max size: 100 MB per file (configurable via `appSetting`).
- Pre-signed URLs for upload; signed download URLs with short TTL for secure access.

### 1.5 API Endpoints

#### Poster-side (teacher / permitted account)

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/assignments` | List assignments created by current user in their org |
| `POST` | `/api/assignments` | Create a new assignment |
| `GET`  | `/api/assignments/[id]` | Get assignment details |
| `PATCH`| `/api/assignments/[id]` | Edit assignment (title, description, dueDate, attachments) |
| `DELETE`| `/api/assignments/[id]` | Delete assignment and all associated submissions |
| `GET`  | `/api/assignments/[id]/submissions` | List all submissions (poster-only) |
| `GET`  | `/api/assignments/[id]/submissions/[subId]` | View one submission (poster or submitter only) |
| `POST` | `/api/assignments/upload` | Pre-sign S3 upload URL for attachment |

#### Student / recipient-side

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/assignments/inbox` | Assignments visible to current student |
| `GET`  | `/api/assignments/[id]` | View assignment details |
| `POST` | `/api/assignments/[id]/submit` | Upload submission |
| `PATCH`| `/api/assignments/[id]/submission` | Replace / update own submission |
| `GET`  | `/api/assignments/[id]/submission` | View own submission only |

#### Management (permission grants)

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/management/assignment-permissions` | List all posting-permission grants |
| `POST` | `/api/management/assignment-permissions` | Grant a user posting rights |
| `DELETE`| `/api/management/assignment-permissions/[id]` | Revoke posting rights |

### 1.6 UI / UX

**Poster view** (`/assignments` — accessible for MANAGEMENT, OWNER, permitted GENERAL accounts):
- Dashboard listing assignments they created with submission counts.
- Create/Edit form: title, rich-text description, due date, file upload (drag-and-drop), access control (scope selector: all / by class / by users).
- Submission inbox per assignment: list of submitters, download links.
- Delete action with confirmation.

**Student / parent view** (`/assignments` in the parent/general layout — new tab in both Canteen and Library modes, or a standalone route):
- Inbox of pending and submitted assignments.
- Assignment detail: description, attachment downloads, submission upload area.
- Submission status badge (Not submitted / Submitted / Overdue).
- Can re-upload to replace an existing submission until due date.

**Visibility rule enforced everywhere**: the API returns `403` when a user requests a submission that belongs to neither them nor the assignment's poster.

---

## 2. Notes (Library Resources)

### 2.1 Goal

Allow teachers or any general-account holder who has been explicitly permitted by `MANAGEMENT`/`OWNER` to publish notes and resource files. Notes are accessible through the **Library (Lib)** section of the parent/general account. The UI for the poster and the reader is identical except for the edit/delete/access controls visible only to the poster.

### 2.2 Roles & Permissions

| Action | Who |
|--------|-----|
| Create / edit / delete a note | `MANAGEMENT`, `OWNER`, or any user with the `CAN_POST_NOTES` permission grant |
| View a note | Users listed in `noteAccess` (by user, class, or scope) |
| Grant `CAN_POST_NOTES` | `MANAGEMENT` / `OWNER` only |

### 2.3 Data Model

```
note
  id                  uuid PK
  organizationId      → organization.id
  createdByUserId     → user.id
  title               text  NOT NULL
  body                text    -- plain text / Markdown / HTML content
  format              enum (PLAIN_TEXT, MARKDOWN, RICH_HTML)
  attachments         jsonb   -- [{ name, url, mimeType, size }]  (S3 keys)
  createdAt           timestamp
  updatedAt           timestamp

noteAccess
  id                  uuid PK
  noteId              → note.id
  targetType          enum (ALL_USERS, ALL_STUDENTS, SPECIFIC_CLASS, SPECIFIC_USERS)
  targetClass         text?
  targetUserIds       text[]?

notePostPermission
  id                  uuid PK
  organizationId      → organization.id
  userId              → user.id
  grantedByUserId     → user.id
  createdAt           timestamp
```

### 2.4 File Storage

- Attachments stored in S3 under `notes/{noteId}/attachments/{filename}`.
- Supported formats: `.txt`, `.md`, `.docx`, `.pdf`, images, and any other file type.
- Inline content (body field) supports plain text, Markdown, and rich HTML.

### 2.5 API Endpoints

#### Poster-side

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/notes` | List notes created by current user |
| `POST` | `/api/notes` | Create a new note |
| `GET`  | `/api/notes/[id]` | Get note details |
| `PATCH`| `/api/notes/[id]` | Edit note (title, body, format, attachments, access) |
| `DELETE`| `/api/notes/[id]` | Delete note |
| `POST` | `/api/notes/upload` | Pre-sign S3 upload URL |

#### Reader-side (parent / general)

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/notes/library` | Notes visible to current user |
| `GET`  | `/api/notes/[id]` | View note details (access-checked) |

#### Management

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/management/note-permissions` | List note-posting permissions |
| `POST` | `/api/management/note-permissions` | Grant a user note-posting rights |
| `DELETE`| `/api/management/note-permissions/[id]` | Revoke note-posting rights |

### 2.6 UI / UX

The notes UI is intentionally **identical** for poster and reader — the difference is a set of action controls (edit, delete, manage access) rendered only when the viewer is the creator.

**Notes section in Library** (`/library-notes` — new tab in Library mode alongside Showcase / Reader / History):
- Feed/grid of notes accessible to the current user.
- Each card: title, format badge, snippet or attachment list, author, date.
- Detail view: rendered body (Markdown/HTML rendered client-side, plain text with white-space), downloadable attachments.

**Create / Edit note** (poster only — same page, toggled by edit mode):
- Format selector: Plain Text / Markdown / Rich Text (prose editor).
- File attachment area: drag-and-drop, multi-file.
- Access control: scope picker identical to assignment access.
- Save / Publish / Discard actions.
- Delete button (with confirmation) visible only to poster.

---

## 3. Shared Access Control Design

Both assignments and notes use the same `targetType` enum and targeting approach already established by `managementNotice`:

```
targetType: ALL_STUDENTS | ALL_USERS | SPECIFIC_CLASS | SPECIFIC_USERS
targetClass: "Grade 5A"   (when targetType = SPECIFIC_CLASS)
targetUserIds: ["uid1", "uid2"]  (when targetType = SPECIFIC_USERS)
```

The server always resolves access server-side before returning content or allowing submissions. The client never receives IDs of users who are not in the resolved access set.

---

## 4. Database Migrations

New migrations to be created in order:

1. `0029_assignment_post_permissions.sql` — `assignmentPostPermission`, `notePostPermission` tables.
2. `0030_assignments.sql` — `assignment`, `assignmentAccess`, `assignmentSubmission` tables.
3. `0031_notes.sql` — `note`, `noteAccess` tables.

Each migration includes appropriate indexes on `organizationId`, `createdByUserId`, and foreign keys.

---

## 5. Feature Flag

Both features are gated behind a new organisation feature entitlement:

```
ASSIGNMENTS_NOTES
```

Management enables this per-org at `/management/settings`. The `requireAccess` calls in all API routes will include `requiredFeature: "ASSIGNMENTS_NOTES"`.

---

## 6. Navigation Changes

### Parent / General layout

- Add **Assignments** tab: visible when `ASSIGNMENTS_NOTES` feature is enabled.
  - Icon: `IoDocumentText` (react-icons/io5) — active/inactive distinguished by text colour.
  - Route: `/assignments`
  - Available in both Canteen and Library modes (it is a cross-cutting academic feature).

- Add **Notes** sub-tab inside Library mode (alongside Showcase / Reader / History):
  - Icon: `IoBookmark` (react-icons/io5).
  - Route: `/library-notes`

### Management layout

- Add **Academics** section to management nav:
  - Assignment Permissions → `/management/assignment-permissions`
  - Note Permissions → `/management/note-permissions`

### Poster (GENERAL / permitted accounts)

- Both the assignments dashboard (`/assignments/manage`) and notes editor (`/library-notes/manage`) are conditionally rendered when the user has the respective permission grant.

---

## 7. Submission Visibility Guarantee

A strict rule is enforced at the API layer for assignment submissions:

```
canViewSubmission(requestingUser, submission, assignment):
  return requestingUser.id === assignment.createdByUserId
      || requestingUser.id === submission.submittedByUserId
```

No other role — including `MANAGEMENT` — can access the content of a submission. Management can only see aggregate counts (e.g., "12 of 30 students submitted") without viewing the uploaded files.

---

## 8. Out of Scope (Future Work)

- Grading / rubric scoring for submissions.
- Comments / feedback threads on assignments.
- Versioning of notes.
- Calendar integration for assignment due dates.
- Push notifications for new assignments / approaching deadlines.
- AI-assisted note summarisation.
