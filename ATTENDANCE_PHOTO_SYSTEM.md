# Attendance & Photo Upload System Documentation

## Overview

This system adds:
1. **Photo Management** - Student photo uploading by Management
2. **Attendance Tracking** - New ATTENDANCE role to track student entry/exit
3. **Bulk Photo Upload** - Process multiple photos with step-by-step status
4. **Management Dashboard** - View attendance insights and real-time presence

---

## Features

### 1. ATTENDANCE User Role

New user role added to the system:
- Can access all attendance and gate log data
- Can perform bulk photo uploads
- Read-only access (cannot modify presence data directly)
- Dedicated to tracking and reporting

Create ATTENDANCE users via management panel with role = "ATTENDANCE"

### 2. Photo Upload Mechanisms

#### Single Photo Upload

**Endpoint:** `POST /api/photos/upload`

Upload a single photo for a student.

```bash
curl -X POST http://localhost:3000/api/photos/upload \
  -F "file=@student_photo.jpg" \
  -F "childId=abc123xyz"
```

**Request:**
```
FormData:
- file: File (image/* type)
- childId: string (UUID)
```

**Response (200):**
```json
{
  "success": true,
  "photoUrl": "https://cloudinary.com/...",
  "message": "Photo uploaded successfully"
}
```

#### Bulk Photo Upload (Step-wise)

**Step 1: Initialize Upload**

`POST /api/photos/bulk-upload/start`

Initialize a bulk photo session and validate the file structure.

```bash
curl -X POST http://localhost:3000/api/photos/bulk-upload/start \
  -F "file=@photos.json" \
  -F "userId=user-id-here"
```

**Request:**
```
FormData:
- file: File (application/json)
- userId: string (user ID)
```

**Response (200):**
```json
{
  "success": true,
  "bulkUploadId": "e4d7f5c6-d8e9-4b1c-a5d6-e7f8c9a0b1c2",
  "totalFiles": 45,
  "message": "Bulk upload initialized",
  "nextStep": "Ready to process"
}
```

**Step 2: Process Photos**

`POST /api/photos/bulk-upload/[id]/process`

Send the file with photos in base64 format to process them all.

```bash
curl -X POST http://localhost:3000/api/photos/bulk-upload/e4d7f5c6-d8e9-4b1c-a5d6-e7f8c9a0b1c2/process \
  -F "file=@photos_with_data.json"
```

**Step 3: Monitor Progress**

`GET /api/photos/bulk-upload/[id]/status`

Poll this endpoint to track processing progress.

```bash
curl http://localhost:3000/api/photos/bulk-upload/e4d7f5c6-d8e9-4b1c-a5d6-e7f8c9a0b1c2/status
```

**Response (200):**
```json
{
  "id": "e4d7f5c6-d8e9-4b1c-a5d6-e7f8c9a0b1c2",
  "fileName": "photos.json",
  "totalFiles": 45,
  "processedFiles": 23,
  "failedFiles": 1,
  "status": "PROCESSING",
  "currentStep": "PHOTO_PROCESSING",
  "progress": {
    "percentage": 51,
    "processed": 23,
    "failed": 1,
    "remaining": 21
  },
  "createdAt": "2024-01-15T10:30:00Z"
}
```

### 3. Bulk Upload File Format

#### JSON Format (Recommended)

Two approaches:

**Approach A: Base64 Encoded Photos**

```json
{
  "photos": [
    {
      "grNumber": "12001",
      "fileName": "john_doe.jpg",
      "base64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCA..."
    },
    {
      "grNumber": "12002",
      "fileName": "jane_smith.jpg",
      "base64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCA..."
    }
  ]
}
```

**Approach B: Manifest Only (Pre-upload)**

```json
{
  "photos": [
    {
      "grNumber": "12001",
      "fileName": "john_doe.jpg"
    },
    {
      "grNumber": "12002",
      "fileName": "jane_smith.jpg"
    }
  ]
}
```

### Processing Steps

The bulk upload goes through these steps:

1. **FILE_RECEIVED** - File validated as valid JSON/ZIP
2. **FILE_VALIDATION** - File structure checked
3. **STRUCTURE_CHECK** - GR numbers matched to students in database
4. **PHOTO_PROCESSING** - Each photo uploaded to Cloudinary
5. **DATABASE_UPDATE** - Child records updated with photo URLs
6. **COMPLETED** - All photos processed

If any step fails, status becomes **FAILED** with error details.

---

## Attendance Tracking

### Get Attendance Data

**Endpoint:** `GET /api/attendance`

Query student presence and tap history.

```bash
# Get all students currently inside
curl http://localhost:3000/api/attendance?status=INSIDE

# Get specific student's data for a date
curl http://localhost:3000/api/attendance?grNumber=12001&date=2024-01-15

# Get date range
curl http://localhost:3000/api/attendance?startDate=2024-01-01&endDate=2024-01-31
```

**Query Parameters:**
- `childId` - Filter by child UUID
- `grNumber` - Filter by GR number
- `date` - Specific date (YYYY-MM-DD)
- `startDate` - Range start (YYYY-MM-DD)
- `endDate` - Range end (YYYY-MM-DD)
- `status` - Filter by presence status (INSIDE/OUTSIDE)

**Response (200):**
```json
{
  "success": true,
  "count": 1,
  "data": [
    {
      "childId": "child-uuid",
      "name": "John Doe",
      "grNumber": "12001",
      "className": "10-A",
      "section": "A",
      "image": "https://...",
      "presenceStatus": "INSIDE",
      "lastGateTapAt": "2024-01-15T10:35:00Z",
      "timeInsideSeconds": 3600,
      "timeInsideFormatted": "1h 0m",
      "logs": [
        {
          "id": "log-uuid",
          "direction": "ENTRY",
          "tappedAt": "2024-01-15T09:35:00Z",
          "isValid": true,
          "anomalyReason": null
        },
        {
          "id": "log-uuid2",
          "direction": "EXIT",
          "tappedAt": "2024-01-15T13:35:00Z",
          "isValid": true,
          "anomalyReason": null
        }
      ]
    }
  ]
}
```

### Management Attendance Dashboard

**Endpoint:** `GET /api/management/attendance-dashboard`

Real-time attendance insights for management.

```bash
# Today's attendance
curl http://localhost:3000/api/management/attendance-dashboard

# Specific date
curl http://localhost:3000/api/management/attendance-dashboard?date=2024-01-15
```

**Response (200):**
```json
{
  "success": true,
  "date": "2024-01-15",
  "summary": {
    "totalStudents": 500,
    "currentlyInside": 342,
    "currentlyOutside": 158,
    "insidePercentage": 68
  },
  "studentsInside": [
    {
      "id": "uuid",
      "name": "John Doe",
      "grNumber": "12001",
      "className": "10-A",
      "section": "A",
      "lastTapAt": "2024-01-15T10:35:00Z"
    }
  ],
  "dailyAttendance": [
    {
      "childId": "uuid",
      "name": "John Doe",
      "grNumber": "12001",
      "className": "10-A",
      "arrivedAt": "2024-01-15T09:35:00Z",
      "leftAt": null,
      "entries": 1,
      "exits": 0,
      "present": true
    }
  ],
  "classWiseBreakdown": [
    {
      "className": "10-A",
      "inside": 45,
      "outside": 5,
      "total": 50,
      "attendancePercentage": 90
    }
  ],
  "recentActivity": [
    {
      "childId": "uuid",
      "childName": "John Doe",
      "direction": "ENTRY",
      "tappedAt": "2024-01-15T10:35:00Z",
      "isValid": true
    }
  ],
  "anomalies": [
    {
      "childId": "uuid",
      "childName": "Jane Smith",
      "direction": "ENTRY",
      "tappedAt": "2024-01-15T09:15:00Z",
      "reason": "Duplicate ENTRY detected"
    }
  ]
}
```

---

## Database Schema

### New Tables

#### bulk_photo_upload

Tracks bulk upload sessions.

```sql
CREATE TABLE "bulk_photo_upload" (
  "id" text PRIMARY KEY,
  "uploaded_by" text NOT NULL REFERENCES user(id),
  "file_name" text NOT NULL,
  "file_size" integer NOT NULL,
  "total_files" integer NOT NULL,
  "processed_files" integer DEFAULT 0,
  "failed_files" integer DEFAULT 0,
  "status" text DEFAULT 'UPLOADED',
  "current_step" text DEFAULT 'FILE_RECEIVED',
  "error_message" text,
  "metadata" text,
  "started_at" timestamp,
  "completed_at" timestamp,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL
);
```

#### photo_upload_batch

Individual photo records within a bulk upload.

```sql
CREATE TABLE "photo_upload_batch" (
  "id" text PRIMARY KEY,
  "bulk_upload_id" text NOT NULL REFERENCES bulk_photo_upload(id),
  "child_id" text NOT NULL REFERENCES child(id),
  "photo_url" text NOT NULL,
  "original_file_name" text,
  "file_size" integer,
  "upload_status" text DEFAULT 'PENDING',
  "error_reason" text,
  "processing_started_at" timestamp,
  "processing_completed_at" timestamp,
  "created_at" timestamp NOT NULL
);
```

#### child (fields added)

```sql
ALTER TABLE "child" ADD COLUMN "presence_status" text DEFAULT 'OUTSIDE';
ALTER TABLE "child" ADD COLUMN "last_gate_tap_at" timestamp;
```

### Schema Changes Summary

| Entity | Change |
|--------|--------|
| user | Added ATTENDANCE to role enum |
| child | Added presence_status (INSIDE/OUTSIDE) |
| child | Added last_gate_tap_at timestamp |
| bulkPhotoUpload | New table |
| photoUploadBatch | New table |

---

## Access Control

### Roles & Permissions

| Role | Upload Photos | View Attendance | View Dashboard |
|------|---|---|---|
| PARENT | ❌ Own child only | ❌ | ❌ |
| ADMIN | ✅ | ✅ | ✅ |
| OPERATOR | ❌ | ❌ | ❌ |
| MANAGEMENT | ✅ | ✅ | ✅ |
| LIB_OPERATOR | ❌ | ❌ | ❌ |
| **ATTENDANCE** | **✅** | **✅** | ❌ |

Currently, auth checks are commented out - implement them based on your auth system.

---

## Error Handling

### Common Errors

#### Invalid File Format
```json
{
  "error": "File must be ZIP or JSON"
}
```

#### Student Not Found
```json
{
  "error": "Students not found: 12001, 12002"
}
```

#### Duplicate Upload
```json
{
  "error": "Bulk upload is already processing"
}
```

#### Cloudinary Upload Failed
```json
{
  "error": "Cloudinary upload failed: [reason]"
}
```

---

## Utility Functions

See [lib/attendance-utils.ts](lib/attendance-utils.ts) for helper queries:

- `getStudentAttendanceToday(childId)`
- `getStudentTotalTimeInside(childId, date?)`
- `isStudentCurrentlyInside(childId)`
- `getStudentsInsideWithDuration()`
- `getEarliestArrivals(limit)`
- `getBulkUploadHistory(userId, limit)`
- `formatSeconds(seconds)`

---

## Implementation Notes

### Authentication

All endpoints need auth implementation. Add to each endpoint:

```typescript
const session = await auth();
if (!session?.user || !['MANAGEMENT', 'ATTENDANCE'].includes(session.user.role)) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
}
```

### Performance Considerations

1. **Gate Log Indexing** - Add index on `gateLog(childId, tappedAt)` for faster queries
2. **Bulk Processing** - Use a job queue (Bull, RabbitMQ) for large uploads
3. **Cloudinary Caching** - Photos are auto-optimized; leverage CDN caching
4. **Daily Archival** - Archive old gate logs to improve query performance

### Production Checklist

- [ ] Add authentication to all endpoints
- [ ] Set up Cloudinary credentials
- [ ] Implement proper error logging
- [ ] Add rate limiting to bulk endpoints
- [ ] Set up monitoring for failed uploads
- [ ] Create admin UI for bulk upload
- [ ] Add photo cleanup/optimization
- [ ] Backup bulk upload metadata
