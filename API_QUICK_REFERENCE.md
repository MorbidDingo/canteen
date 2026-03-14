# API Quick Reference

## Photo Upload APIs

### Single Photo Upload
```
POST /api/photos/upload
FormData: { file, childId }
Response: { success, photoUrl, message }
Roles: MANAGEMENT, ATTENDANCE
```

### Bulk Upload - Start
```
POST /api/photos/bulk-upload/start
FormData: { file (JSON), userId }
Response: { success, bulkUploadId, totalFiles, nextStep }
Roles: MANAGEMENT, ATTENDANCE
```

### Bulk Upload - Process
```
POST /api/photos/bulk-upload/[id]/process
FormData: { file (JSON with base64) }
Response: { success, bulkUploadId, message, totalPhotos }
Roles: MANAGEMENT, ATTENDANCE
```

### Bulk Upload - Status
```
GET /api/photos/bulk-upload/[id]/status
Query: (none)
Response: { id, fileName, status, currentStep, progress {...}, ... }
Roles: MANAGEMENT, ATTENDANCE
```

## Attendance APIs

### Get Attendance Data
```
GET /api/attendance
Query: ?childId=X | ?grNumber=X | ?date=YYYY-MM-DD | ?status=INSIDE|OUTSIDE
Response: { success, count, data: [{childId, name, presenceStatus, logs[...], ...}] }
Roles: MANAGEMENT, ATTENDANCE
```

### Management Dashboard
```
GET /api/management/attendance-dashboard
Query: ?date=YYYY-MM-DD (default: today)
Response: { summary, studentsInside, dailyAttendance, classWiseBreakdown, anomalies, ... }
Roles: MANAGEMENT
```

## Database Roles

User role enum now includes:
- PARENT
- ADMIN
- OPERATOR
- MANAGEMENT
- LIB_OPERATOR
- **ATTENDANCE** (new)

## Key Fields Added

### child table
- `presence_status` (INSIDE | OUTSIDE) - Current location status
- `last_gate_tap_at` (timestamp) - When they last tapped the card

### gateLog table (enhanced)
- `is_valid` (boolean) - Whether tap was valid
- `anomaly_reason` (text) - Reason if invalid

### New Tables
- `bulk_photo_upload` - Bulk upload sessions
- `photo_upload_batch` - Individual photos in batch

## Processing Steps

1. FILE_RECEIVED → File validated
2. FILE_VALIDATION → Structure checked
3. STRUCTURE_CHECK → GR numbers verified
4. PHOTO_PROCESSING → Photos uploaded to Cloudinary
5. DATABASE_UPDATE → Child records updated
6. COMPLETED → Success (or FAILED → Error)

## File Format (JSON)

```json
{
  "photos": [
    {
      "grNumber": "12001",
      "fileName": "photo.jpg",
      "base64": "iVBORw0KGgo..."
    }
  ]
}
```

## Status Codes

- **200** - Success
- **202** - Accepted with caution (anomaly detected)
- **400** - Bad request (invalid file, missing fields)
- **403** - Unauthorized (wrong role)
- **404** - Not found (student, upload session)
- **429** - Too fast (cooldown violation)
- **500** - Server error

## Utility Functions

See `lib/attendance-utils.ts`:
- getStudentAttendanceToday(childId)
- getStudentTotalTimeInside(childId, date?)
- isStudentCurrentlyInside(childId)
- getStudentsInsideWithDuration()
- getEarliestArrivals(limit)
- getBulkUploadHistory(userId, limit)
- formatSeconds(seconds)

## Configuration

Set these environment variables:
```env
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

## TODO - Auth Implementation

Currently all endpoints have commented-out auth checks. Add for production:

```typescript
const session = await auth();
if (!session?.user || !['MANAGEMENT', 'ATTENDANCE'].includes(session.user.role)) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
}
```

## Example Usage

### Upload single photo
```bash
curl -X POST http://localhost:3000/api/photos/upload \
  -F "file=@photo.jpg" \
  -F "childId=uuid123"
```

### Start bulk upload
```bash
curl -X POST http://localhost:3000/api/photos/bulk-upload/start \
  -F "file=@photos.json" \
  -F "userId=user-uuid"
```

### Check status
```bash
curl http://localhost:3000/api/photos/bulk-upload/bulk-id/status
```

### Get attendance
```bash
curl "http://localhost:3000/api/attendance?date=2024-01-15&status=INSIDE"
```

### View dashboard
```bash
curl "http://localhost:3000/api/management/attendance-dashboard?date=2024-01-15"
```
