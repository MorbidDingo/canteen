# Gate Entry/Exit Logic Improvements

## Overview
Upgraded the gate tap system from simple toggle logic to state-validation-based approach with anomaly detection.

---

## Key Improvements

### 1. **Presence Status Tracking**
- **New field**: `child.presenceStatus` (INSIDE | OUTSIDE)
- Directly reflects student's current location
- Eliminates ambiguity from toggle-based logic
- Quick query to determine who's currently in school

### 2. **Validated Direction Logic**
Instead of blindly toggling, the system now validates:
- ✅ If student is OUTSIDE → next tap must be ENTRY
- ✅ If student is INSIDE → next tap must be EXIT
- ❌ Prevents invalid state transitions

**Old Logic (Fragile):**
```typescript
// Just toggle - no validation!
const direction = lastLog?.direction === "ENTRY" ? "EXIT" : "ENTRY";
```

**New Logic (Robust):**
```typescript
// Based on actual presence status
const expectedDirection = 
  student.presenceStatus === "OUTSIDE" ? "ENTRY" : "EXIT";
```

### 3. **Anomaly Detection & Logging**
New gateLog fields:
- `is_valid` (boolean) - flags suspicious patterns
- `anomaly_reason` (text) - explains what went wrong

**Detected Anomalies:**
- Duplicate taps (ENTRY → ENTRY without EXIT)
- Recovery from previous invalid state
- Impossible patterns

Example response with warning:
```json
{
  "student": { ... },
  "direction": "EXIT",
  "presenceStatus": "OUTSIDE",
  "warning": "Duplicate ENTRY detected — last tap was ENTRY at 2:34 PM",
  "statusCode": 202
}
```

### 4. **Improved Cooldown Handling**
- Cooldown now tracked on child record (`lastGateTapAt`)
- Prevents accidental rapid re-taps
- Returns precise wait time

### 5. **State Consistency**
After each valid tap:
1. Gate log is recorded with validation flags
2. Child's presence status is updated
3. Last tap timestamp is refreshed

---

## Database Changes

### Schema Updates

**child table:**
```sql
ALTER TABLE child ADD COLUMN presence_status TEXT DEFAULT 'OUTSIDE' NOT NULL;
ALTER TABLE child ADD COLUMN last_gate_tap_at TIMESTAMP;
```

**gate_log table:**
```sql
ALTER TABLE gate_log ADD COLUMN is_valid BOOLEAN DEFAULT TRUE NOT NULL;
ALTER TABLE gate_log ADD COLUMN anomaly_reason TEXT;
```

---

## API Endpoint Behavior

### Successful Tap (200)
```json
{
  "student": { "id", "name", "grNumber", "className", "section", "image" },
  "direction": "ENTRY" | "EXIT",
  "presenceStatus": "INSIDE" | "OUTSIDE",
  "tappedAt": "ISO-8601-timestamp"
}
```

### Anomaly Detected (202 - Accepted with Caution)
Same as above + `warning` field explaining the anomaly

### Cooldown (429)
Student tapped too fast
```json
{
  "error": "Too fast — please wait before tapping again",
  "retryAfterMs": 2500
}
```

### Error Cases (400, 404, 500)
- Missing/invalid RFID card ID
- Card not registered to any student
- Server errors

---

## Benefits

| Issue | Solution |
|-------|----------|
| Impossible states | Validated based on presenceStatus |
| Can't determine if student is in | Query presenceStatus directly |
| Undetected data corruption | Anomalies logged with reasons |
| Accidental double-taps | Still recorded but flagged |
| No audit trail | Anomaly_reason explains what happened |
| Silent failures | Returns 202 with warning instead of 200 |

---

## Queries You Can Now Run

```sql
-- Who's currently inside?
SELECT name, gr_number, class_name 
FROM child 
WHERE presence_status = 'INSIDE';

-- Find suspicious patterns
SELECT * FROM gate_log 
WHERE is_valid = FALSE 
ORDER BY tapped_at DESC;

-- Daily entry/exit summary for a child
SELECT 
  DATE(tapped_at) as date,
  CASE WHEN direction = 'ENTRY' THEN COUNT(*) END as entries,
  CASE WHEN direction = 'EXIT' THEN COUNT(*) END as exits
FROM gate_log
WHERE child_id = 'xxx'
GROUP BY DATE(tapped_at), direction;
```

---

## Migration

Run migrations:
```bash
npx drizzle-kit push
```

The new fields have default values:
- `presence_status` defaults to 'OUTSIDE'
- `last_gate_tap_at` is NULL initially
- `is_valid` defaults to TRUE
- `anomaly_reason` is NULL for valid taps
