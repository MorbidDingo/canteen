# Plan: SMS/WhatsApp Messaging Service Integration

## TL;DR
**Recommended Approach**: WhatsApp Business Cloud API (Meta) + SMS fallback via MSG91 (Indian alternative). 

**Why this combo**:
- WhatsApp: Free tier available (1000 template messages/month free on Meta's platform), better engagement for parents
- SMS fallback: MSG91 is ₹0.15-0.40 per SMS (no minimums, pay-as-you-go), specifically designed for Indian market
- Extremely cost-effective: WhatsApp mostly free tier, SMS ultra-cheap; perfect for school deployments
- Easy integration: Both have simple REST APIs, minimal setup
- Time-critical capable: Both services support instant delivery (WhatsApp <1 sec, SMS 1-3 sec)
- **Bonus**: MSG91 also offers WhatsApp gateway if you prefer a single vendor for both channels

**Architecture**: Create a new messaging service layer that wraps both APIs with failover logic. Integrate at existing notification trigger points (`notifyParentForChild` function and gate events).

---

## Steps

### Phase 1: Setup & Infrastructure (Parallel)

1. **Verify phone number data collection**
   - Check if parent registration flow (login/register pages) collects phone numbers
   - If missing, add phone field to parent profile/settings page
   - Migration: script to populate `user.phone` from existing data if available
   - *Status*: Ready to start
   - *Depends on*: None

2. **Choose and provision messaging services**
   - **Option A (Recommended)**: WhatsApp Business Cloud API (Meta) + MSG91 SMS
     - Sign up for [Meta WhatsApp Business Cloud](https://developers.facebook.com/docs/whatsapp/cloud-api/get-started)
     - Create WhatsApp Business Account, get Access Token, Template IDs
     - Create [MSG91](https://msg91.com) account (₹0.15-0.40 per SMS, pay-as-you-go, Indian market optimized)
     - Get MSG91 API credentials (API Key from dashboard)
   - **Option B (Alternative - Single Vendor)**: MSG91 for both WhatsApp + SMS
     - MSG91 also offers WhatsApp messaging gateway
     - Single API provider, simpler to manage
     - Check MSG91 WhatsApp pricing for your expected volume
   - *Parallel with step 1*

3. **Environment variables & secrets management**
   - Add to `.env.local`:
     ```
     WHATSAPP_BUSINESS_ACCOUNT_ID=<from Meta>
     WHATSAPP_ACCESS_TOKEN=<from Meta>
     WHATSAPP_PHONE_NUMBER_ID=<from Meta>
     SMS_PROVIDER=msg91  # Indian SMS provider
     MSG91_API_KEY=<your API key from MSG91>
     MSG91_DLT_TEMPLATE_ID=<for compliance, optional>
     ```
   - Add to `.env.example` (without values) for documentation
   - *Depends on step 2*

### Phase 2: Implement Messaging Service (Core Logic)

4. **Create WhatsApp message templates**
   - Create template definitions in Meta dashboard for each notification type:
     - `entry_notification`: "{{child_name}} entered at {{time}}"
     - `exit_notification`: "{{child_name}} exited at {{time}}"
     - `wallet_topup`: "{{child_name}}'s wallet topped up with ₹{{amount}}"
     - `temporary_card_issued`: "Temporary card {{card_id}} issued for {{duration}}"
     - `permanent_card_issued`: "New card issued for {{child_name}}"
     - `order_placed`: "Order placed for {{child_name}}, ₹{{amount}}"
     - `blocked_attempt`: "Purchase attempt blocked for {{child_name}} - {{reason}}"
   - Document template IDs in code comments or constants file (`lib/constants.ts`)
   - *Depends on step 2*

5. **Build messaging service layer** (`lib/messaging-service.ts`)
   - Create `sendMessage()` function with proper typing
   - Implement WhatsApp integration:
     - `sendWhatsAppTemplate()` - send templated messages via Meta API
     - Handle API responses, rate limiting, error handling
   - Implement SMS integration (MSG91 - Indian provider):
     - `sendSMS()` - send plain text SMS via MSG91 REST API
     - MSG91 endpoint: `https://api.msg91.com/apiv5/flow/`
     - Router selection for India-specific optimization
     - Handle API responses, delivery reports, character limits
   - Implement failover logic: 
     - Try WhatsApp first (preferred channel, mostly free)
     - If WhatsApp fails (network/invalid number), fallback to MSG91 SMS
     - Log both attempts (success/failure) to database
   - Add message queuing/retry logic (optional but recommended for reliability)
   - *Depends on step 3*

6. **Create database schema update** (Drizzle migration)
   - New table: `messaging_log` to track all sent messages:
     ```sql
     messaging_log (
       id: UUID (primary key),
       parentId: text (references user.id),
       childId: text (references child.id),
       type: enum (WHATSAPP, SMS, FAILED),
       notificationType: text (e.g., GATE_ENTRY, KIOSK_ORDER_GIVEN),
       messageContent: text (full message sent),
       phoneNumber: text (parent phone number used),
       serviceResponse: jsonb (API response for debugging),
       sentAt: timestamp,
       deliveredAt: timestamp (null until delivery confirmed),
       failureReason: text (error message if failed),
       createdAt: timestamp
     )
     ```
   - Rationale: Audit trail, delivery verification, debugging, analytics
   - *Depends on step 5* (loosely - can be done in parallel)

### Phase 3: Integration with Existing Notification System

7. **Modify `notifyParentForChild()` function**
   - Location: `lib/parent-notifications.ts` (lines 24-74)
   - After creating parentNotification record, call messaging service:
     ```typescript
     try {
       await sendMessage({
         parentId,
         childId,
         phoneNumber: parentPhoneNumber, // fetch from user table
         type: input.type,  // GATE_ENTRY, KIOSK_ORDER_GIVEN, etc.
         title: input.title,
         message: input.message,
         metadata: input.metadata
       });
     } catch (error) {
       console.error('Failed to send message:', error);
       // Don't fail the notification creation if messaging fails
     }
     ```
   - Wrap in try-catch (don't fail the notification creation if SMS fails)
   - Fetch parent's phone number from `user` table by `parentId`
   - *Depends on step 5*

8. **Add messaging to gate entry/exit endpoint**
   - Location: `app/api/gate/tap/route.ts` (lines 185-195)
   - This already calls `notifyParentForChild()` - no change needed, will auto-trigger SMS/WhatsApp
   - Verify timing: gate messages should be instant (WhatsApp has sub-second latency)
   - *No code changes needed - already integrated by step 7*

9. **Add messaging to wallet top-up endpoint**
   - Location: `app/api/wallet/topup/route.ts`
   - After successful Razorpay payment completion (in webhook handler):
     - Extract transaction amount and child info
     - Call `notifyParentForChild()` or custom `sendMessage()` with top-up details
     - Message: "₹{amount} added to {child_name}'s wallet"
   - *Depends on step 5*

10. **Add messaging to card issuance endpoints**
    - Location: `app/api/operator/temporary-cards/route.ts` (POST handler, after creation)
    - Location: `app/api/operator/guest-cards/route.ts` (POST handler, after creation)
    - Add SMS/WhatsApp notification after successful temporary/permanent card creation
    - Message: "Temporary card issued: {cardId}. Valid for {duration} hours."
    - Fetch parent's phone from child → parent lookup
    - *Depends on step 5*

11. **Add messaging to kiosk order endpoints**
    - Location: Find in `app/api/kiosk/` or order-related endpoints
    - Trigger messages for: PLACED, PREPARING, SERVED, BLOCKED
    - Reuse `notifyParentForChild()` notifications (already integrated by step 7)
    - *Depends on step 7*

### Phase 4: Configuration & Settings for Parents (Optional but Recommended)

12. **Add messaging preferences UI**
    - Location: `app/(parent)/settings/` page
    - Allow parents to:
      - Verify/update phone number (with validation for Indian phone format)
      - Choose notification channel: WhatsApp only, SMS only, or Both with preference order
      - Toggle notifications by type (gate, orders, spending, blocked, etc.)
      - Opt-in/opt-out of all messaging
    - Store preferences in new `parent_messaging_preference` table:
      ```sql
      parent_messaging_preference (
        id: UUID,
        parentId: text (unique),
        phoneNumber: text,
        preferredChannel: enum (WHATSAPP, SMS, BOTH),
        fallbackEnabled: boolean (default true),
        gateNotificationsEnabled: boolean,
        orderNotificationsEnabled: boolean,
        spendingNotificationsEnabled: boolean,
        cardNotificationsEnabled: boolean,
        blockedNotificationsEnabled: boolean,
        consentGivenAt: timestamp,
        updatedAt: timestamp
      )
      ```
    - *Depends on step 5* (after core messaging works)

13. **Add management dashboard for messaging**
    - Location: `app/(management)/management/` or new section `messaging-logs`
    - View message delivery status:
      - Filter by parent, child, type, date range
      - Show sent/delivered/failed counts
      - Sort by status, timestamp
    - View failed messages and reasons
    - Manually resend failed messages (with re-attempt button)
    - Analytics:
      - Messages sent/delivered/failed by type
      - Success rate by time period
      - SMS vs WhatsApp delivery comparison
    - *Depends on step 6* (messaging_log table)

---

## Relevant Files

| File | Purpose |
|------|---------|
| `lib/parent-notifications.ts` | Existing notification trigger; modify to call messaging service |
| `lib/db/schema.ts` | Add `messaging_log` and `parent_messaging_preference` tables; `user.phone` already exists |
| `app/api/gate/tap/route.ts` | Gate entry/exit events, already calls `notifyParentForChild` |
| `app/api/wallet/topup/route.ts` | Wallet top-up endpoint - add notification on success |
| `app/api/operator/temporary-cards/route.ts` | Temporary card creation - add notification |
| `app/api/operator/guest-cards/route.ts` | Guest card creation - add notification |
| `lib/messaging-service.ts` | **NEW** - Core messaging service layer |
| `app/(parent)/settings/` | Parent settings page - add phone & notification preferences |
| `lib/constants.ts` | WhatsApp template IDs and SMS constants |

---

## Verification Checklist

1. **Unit tests** for messaging service (mock API calls)
   - Test WhatsApp template formatting
   - Test SMS character limits (160 chars)
   - Test failover logic (WhatsApp fails → SMS succeeds)
   - Test phone number validation

2. **Integration test**: Send test messages to your own phone via both channels
   - WhatsApp template delivery
   - SMS delivery via MSG91
   - Failover when WhatsApp fails

3. **Gate flow**: Tap RFID at gate
   - Verify WhatsApp arrives within 1-2 seconds
   - Verify SMS arrives within 2-5 seconds (if fallback triggered)

4. **Wallet flow**: Top up wallet via Razorpay
   - Verify message received with correct amount
   - Verify child name is correct

5. **Card flow**: Issue temporary/permanent card
   - Verify message with card ID received
   - Verify expiry/validity details correct

6. **Messaging log**: Check database
   - Verify all messages logged in `messaging_log` table
   - Verify correct status (WHATSAPP, SMS, FAILED)
   - Verify delivery timestamps when available

7. **Parent preferences**: Update settings
   - Disable WhatsApp, verify SMS sent instead
   - Opt-out of notifications, verify nothing sent
   - Update phone number, verify new number receives message

---

## Implementation Order (Recommended)

**Week 1:**
1. Setup: Provision Meta WhatsApp Business Account + MSG91 account
2. Create WhatsApp templates in Meta dashboard
3. Build messaging service layer (`lib/messaging-service.ts`)
4. Create Drizzle migration for `messaging_log` table

**Week 2:**
5. Integrate messaging into `notifyParentForChild()` function
6. Test gate flow end-to-end
7. Test wallet top-up flow
8. Add messaging to card issuance endpoints

**Week 3:**
9. Add messaging to kiosk order endpoints
10. Create parent messaging preferences table
11. Build parent settings UI for phone number + preferences
12. Build management dashboard for messaging analytics

---

## Decisions

- **Service combo**: Meta WhatsApp Business API (1000 free template messages/month) + MSG91 SMS (₹0.15-0.40 per SMS, pay-as-you-go)
  - Rationale: WhatsApp covers 90% of parent notifications (free tier), MSG91 as fallback is dirt cheap for Indian market with zero minimums
  - Alternative option: Use MSG91 for both channels if you prefer single vendor (simpler, but slightly higher WhatsApp costs)

- **Failover strategy**: WhatsApp first (preferred), SMS on failure - not simultaneous to avoid double notifications

- **Phone Field**: Use existing `user.phone` field; collection/validation happens at parent registration/settings

- **Scope - Included**: 
  - Gate entry/exit
  - Wallet top-up
  - Card issuance (temporary + permanent)
  - Kiosk order status
  - Blocked attempts

- **Scope - Excluded**: 
  - Push notifications (separate feature, not in this iteration)
  - Email notifications (already handled separately)
  - WhatsApp Web automation (too complex for initial version)

---

## Cost Breakdown

| Service | Monthly Cost (Typical Usage) | Notes |
|---------|--------------------------------|-------|
| **WhatsApp Business API** | Free (1000 msgs) → ₹0.30-0.50/msg after | Template messages cheaper than conversation messages |
| **MSG91 SMS** | ₹0.15-0.40 per SMS (pay-as-you-go) | No monthly minimums, Indian market rates |
| **Database** | Already included | Just adds to existing DB tables |
| **Total (Small School)** | ~₹500-1500/month | ~1000x WhatsApp + 20x SMS fallback assumed |

---

## Further Considerations

### 1. Phone Number Validation & Storage
- **Question**: Should phone numbers be validated (e.g., prefix +91 for India) on entry?
- **Recommendation**: Add phone validation utility in `lib/utils.ts`:
  - Accept: 10-digit Indian numbers (validate with regex: `/^[6-9]\d{9}$/`)
  - Convert to: `+91{number}` for API calls
  - Store in DB: `+91{number}` format for consistency
  - Handle invalid gracefully: skip messaging, log warning, still send in-app notification

### 2. Message Rate Limiting & Time Windows
- **Question**: Any restrictions on message frequency (e.g., no more than 1 gate message per hour per parent)?
- **Recommendation**: For MVP, send every message. Later, add optional rate limiting in parent preferences if spam concerns arise.

### 3. Compliance & Consent
- **Question**: Is explicit opt-in consent required for messaging (legal requirement in some Indian regions)?
- **Recommendation**: Add checkbox "I consent to receive SMS/WhatsApp notifications" during parent registration/settings update. Store `consentGivenAt` timestamp in `parent_messaging_preference` table. Important for TSRAI (Telecom Regulatory Authority of India) compliance.

### 4. Testing & Debugging
- **Recommendation**: 
  - Create test phone number for development (your personal number)
  - Log all API requests/responses in `messageaing_log` for debugging
  - Add optional `DEBUG_MESSAGING=true` env flag to bypass rate limits and template requirements in dev mode

### 5. Delivery Reports & Webhooks (Future)
- **Optional enhancement**: MSG91 and Meta both support delivery status webhooks
  - Set up webhook endpoints to update `deliveredAt` timestamp in `messaging_log`
  - Enables real-time delivery status in admin dashboard
  - Implement in Phase 2 if needed

---

## MSG91 Setup Quick Reference

1. Go to [msg91.com](https://msg91.com)
2. Sign up (email verification)
3. Dashboard → Settings → API → Get API Key
4. Add sender ID (for SMS display name) - request "School Name" or "CANTEEN"
5. Test API with curl:
   ```bash
   curl -X POST "https://api.msg91.com/apiv5/flow/" \
     -H "authkey: YOUR_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{
       "route": "4",
       "sender": "YOUR_SENDER_ID",
       "mobiles": "919876543210",
       "message": "Test message"
     }'