import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { messagingLog, user, child } from "@/lib/db/schema";

// ─── Types ──────────────────────────────────────────────

export type MessagingType = "WHATSAPP" | "SMS" | "FAILED";

export interface SendMessageInput {
  parentId: string;
  childId?: string;
  phoneNumber: string;
  notificationType: string;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface MessagingResponse {
  success: boolean;
  type: MessagingType;
  messageId?: string;
  error?: string;
  logs?: {
    whatsappAttempt?: { success: boolean; error?: string; response?: unknown };
    smsAttempt?: { success: boolean; error?: string; response?: unknown };
  };
}

// ─── Configuration ──────────────────────────────────────

const MESSAGING_ENABLED = process.env.MESSAGING_ENABLED !== "false";
const WHATSAPP_ENABLED = process.env.WHATSAPP_ENABLED !== "false";
const SMS_ENABLED = process.env.SMS_ENABLED !== "false";
const DEBUG_MODE = process.env.MESSAGING_DEBUG === "true";

const WHATSAPP_CONFIG = {
  businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
  accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
  apiVersion: "v18.0",
};

const SMS_CONFIG = {
  provider: process.env.SMS_PROVIDER || "msg91",
  msg91ApiKey: process.env.MSG91_API_KEY,
  msg91DltTemplateId: process.env.MSG91_DLT_TEMPLATE_ID,
};

// ─── Utility Functions ──────────────────────────────────

/**
 * Validates Indian phone number format
 * Accepts: 10-digit number (auto-adds +91) or full +919xxxxxxxxx
 */
function normalizePhoneNumber(phone: string): string | null {
  if (!phone) return null;

  // Remove spaces, dashes, parentheses
  let cleaned = phone.replace(/[\s\-\(\)]/g, "");

  // If it has +91 prefix, return as-is
  if (cleaned.startsWith("+91")) {
    return cleaned;
  }

  // If it starts with 91 (without +), add +
  if (cleaned.startsWith("91") && cleaned.length === 12) {
    return "+" + cleaned;
  }

  // If it's 10 digits, add +91 prefix
  if (/^[6-9]\d{9}$/.test(cleaned)) {
    return "+91" + cleaned;
  }

  return null; // Invalid format
}

/**
 * Logs a messaging attempt to the database
 */
async function logMessagingAttempt(input: {
  parentId: string;
  childId?: string;
  phoneNumber: string;
  type: MessagingType;
  notificationType: string;
  messageContent: string;
  serviceResponse?: string;
  failureReason?: string;
}): Promise<void> {
  try {
    await db.insert(messagingLog).values({
      parentId: input.parentId,
      childId: input.childId || null,
      phoneNumber: input.phoneNumber,
      type: input.type,
      notificationType: input.notificationType,
      messageContent: input.messageContent,
      serviceResponse: input.serviceResponse || null,
      failureReason: input.failureReason || null,
      sentAt: new Date(),
      deliveredAt: null,
      createdAt: new Date(),
    });
  } catch (error) {
    console.error("Failed to log messaging attempt:", error);
    // Don't fail if logging fails - messaging should still succeed
  }
}

// ─── WhatsApp Integration ────────────────────────────────

interface WhatsAppTemplateParams {
  [key: string]: string;
}

/**
 * WhatsApp template message definitions
 * Maps notification types to WhatsApp template names
 */
const WHATSAPP_TEMPLATES: Record<string, { name: string; paramCount: number }> = {
  GATE_ENTRY: { name: "entry_notification", paramCount: 2 },
  GATE_EXIT: { name: "exit_notification", paramCount: 2 },
  KIOSK_ORDER_GIVEN: { name: "order_placed", paramCount: 2 },
  KIOSK_ORDER_PREPARING: { name: "order_preparing", paramCount: 1 },
  KIOSK_ORDER_SERVED: { name: "order_served", paramCount: 1 },
  KIOSK_PREORDER_TAKEN: { name: "order_placed", paramCount: 2 },
  WALLET_TOPUP: { name: "wallet_topup", paramCount: 2 },
  TEMPORARY_CARD_ISSUED: { name: "temporary_card_issued", paramCount: 3 },
  PERMANENT_CARD_ISSUED: { name: "permanent_card_issued", paramCount: 1 },
  BLOCKED_FOOD_ATTEMPT: { name: "blocked_attempt", paramCount: 2 },
  BLOCKED_BOOK_ATTEMPT: { name: "blocked_attempt", paramCount: 2 },
};

async function sendWhatsAppTemplate(
  phoneNumber: string,
  notificationType: string,
  params: WhatsAppTemplateParams,
): Promise<{ success: boolean; messageId?: string; error?: string; response?: unknown }> {
  try {
    if (!WHATSAPP_ENABLED || !WHATSAPP_CONFIG.accessToken) {
      return { success: false, error: "WhatsApp not configured" };
    }

    const template = WHATSAPP_TEMPLATES[notificationType];
    if (!template) {
      return { success: false, error: `No WhatsApp template for ${notificationType}` };
    }

    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    if (!normalizedPhone) {
      return { success: false, error: "Invalid phone number format" };
    }

    // Build parameter array for template
    const paramArray = [];
    for (let i = 0; i < template.paramCount; i++) {
      const key = `param${i + 1}`;
      paramArray.push({ type: "text", text: params[key] || "" });
    }

    const url = `https://graph.instagram.com/${WHATSAPP_CONFIG.apiVersion}/${WHATSAPP_CONFIG.phoneNumberId}/messages`;

    const payload = {
      messaging_product: "whatsapp",
      to: normalizedPhone.replace("+", ""),
      type: "template",
      template: {
        name: template.name,
        language: { code: "en_US" },
        components: [
          {
            type: "body",
            parameters: paramArray,
          },
        ],
      },
    };

    if (DEBUG_MODE) {
      console.log("[WhatsApp] Sending template:", template.name, "to", normalizedPhone);
      console.log("[WhatsApp] Payload:", JSON.stringify(payload, null, 2));
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_CONFIG.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const responseData = await response.json();

    if (!response.ok) {
      const errorMsg = (responseData as Record<string, unknown>)?.error
        ? JSON.stringify((responseData as Record<string, unknown>).error)
        : responseData.message || "WhatsApp API error";
      return {
        success: false,
        error: errorMsg,
        response: responseData,
      };
    }

    return {
      success: true,
      messageId: ((responseData as Record<string, any>)?.messages?.[0]?.id as string) || "",
      response: responseData,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMsg };
  }
}

// ─── SMS Integration (MSG91) ────────────────────────────

async function sendMsg91Sms(
  phoneNumber: string,
  message: string,
): Promise<{ success: boolean; messageId?: string; error?: string; response?: unknown }> {
  try {
    if (!SMS_ENABLED || !SMS_CONFIG.msg91ApiKey) {
      return { success: false, error: "MSG91 SMS not configured" };
    }

    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    if (!normalizedPhone) {
      return { success: false, error: "Invalid phone number format" };
    }

    // MSG91 expects phone without +
    const phoneForApi = normalizedPhone.replace("+", "");

    const url = "https://api.msg91.com/apiv5/flow/";

    // Limit message to 160 characters for SMS
    const smsMessage = message.substring(0, 160);

    const payload = {
      route: "4", // India route for bulk SMS
      sender: "CANTEEN", // Sender ID - should be registered with MSG91
      mobiles: phoneForApi,
      message: smsMessage,
    };

    if (DEBUG_MODE) {
      console.log("[MSG91] Sending SMS to", normalizedPhone);
      console.log("[MSG91] Message:", smsMessage);
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        authkey: SMS_CONFIG.msg91ApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const responseData = await response.json();

    if (!response.ok || (responseData as Record<string, unknown>)?.type === "error") {
      const errorMsg = ((responseData as Record<string, any>)?.message as string) || "MSG91 API error";
      return {
        success: false,
        error: errorMsg,
        response: responseData,
      };
    }

    return {
      success: true,
      messageId: (responseData as Record<string, unknown>)?.request_id as string,
      response: responseData,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMsg };
  }
}

// ─── Main Send Message Function ──────────────────────────

/**
 * Send a message via WhatsApp (preferred) with SMS fallback
 * Strategy: Try WhatsApp first, if it fails, send SMS as fallback
 */
export async function sendMessage(input: SendMessageInput): Promise<MessagingResponse> {
  if (!MESSAGING_ENABLED) {
    return { success: false, type: "FAILED", error: "Messaging is disabled" };
  }

  try {
    // Normalize phone number once
    const normalizedPhone = normalizePhoneNumber(input.phoneNumber);
    if (!normalizedPhone) {
      await logMessagingAttempt({
        parentId: input.parentId,
        childId: input.childId,
        phoneNumber: input.phoneNumber,
        type: "FAILED",
        notificationType: input.notificationType,
        messageContent: input.message,
        failureReason: "Invalid phone number format",
      });
      return {
        success: false,
        type: "FAILED",
        error: "Invalid phone number format",
      };
    }

    const logs: MessagingResponse["logs"] = {};

    // Try WhatsApp first
    if (WHATSAPP_ENABLED) {
      const whatsappParams: WhatsAppTemplateParams = {
        param1: input.metadata?.childName as string || "Student",
        param2: input.metadata?.time as string || new Date().toLocaleTimeString(),
        param3: input.metadata?.amount as string || "",
      };

      const whatsappResult = await sendWhatsAppTemplate(
        normalizedPhone,
        input.notificationType,
        whatsappParams,
      );

      logs.whatsappAttempt = {
        success: whatsappResult.success,
        error: whatsappResult.error,
      };

      if (whatsappResult.success && whatsappResult.messageId) {
        await logMessagingAttempt({
          parentId: input.parentId,
          childId: input.childId,
          phoneNumber: normalizedPhone,
          type: "WHATSAPP",
          notificationType: input.notificationType,
          messageContent: input.message,
          serviceResponse: whatsappResult.messageId,
        });

        return {
          success: true,
          type: "WHATSAPP",
          messageId: whatsappResult.messageId,
          logs,
        };
      }
    }

    // Fallback to SMS if WhatsApp failed
    if (SMS_ENABLED && SMS_CONFIG.provider === "msg91") {
      const smsResult = await sendMsg91Sms(normalizedPhone, input.message);

      logs.smsAttempt = {
        success: smsResult.success,
        error: smsResult.error,
      };

      if (smsResult.success && smsResult.messageId) {
        await logMessagingAttempt({
          parentId: input.parentId,
          childId: input.childId,
          phoneNumber: normalizedPhone,
          type: "SMS",
          notificationType: input.notificationType,
          messageContent: input.message,
          serviceResponse: smsResult.messageId,
        });

        return {
          success: true,
          type: "SMS",
          messageId: smsResult.messageId,
          logs,
        };
      }

      // Both failed
      await logMessagingAttempt({
        parentId: input.parentId,
        childId: input.childId,
        phoneNumber: normalizedPhone,
        type: "FAILED",
        notificationType: input.notificationType,
        messageContent: input.message,
        failureReason: `WhatsApp: ${logs.whatsappAttempt?.error || 'unknown'} | SMS: ${smsResult.error}`,
      });

      return {
        success: false,
        type: "FAILED",
        error: `WhatsApp failed, SMS fallback also failed: ${smsResult.error}`,
        logs,
      };
    }

    // No SMS configured, WhatsApp failed
    await logMessagingAttempt({
      parentId: input.parentId,
      childId: input.childId,
      phoneNumber: normalizedPhone,
      type: "FAILED",
      notificationType: input.notificationType,
      messageContent: input.message,
      failureReason: `WhatsApp: ${logs.whatsappAttempt?.error || 'unknown'} | SMS: not configured`,
    });

    return {
      success: false,
      type: "FAILED",
      error: "WhatsApp failed and SMS not configured",
      logs,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    await logMessagingAttempt({
      parentId: input.parentId,
      childId: input.childId,
      phoneNumber: input.phoneNumber,
      type: "FAILED",
      notificationType: input.notificationType,
      messageContent: input.message,
      failureReason: errorMsg,
    });

    return {
      success: false,
      type: "FAILED",
      error: errorMsg,
    };
  }
}

/**
 * Send a message directly (without going through parent notifications)
 * Used for direct messaging to parents
 */
export async function sendDirectMessage(
  parentId: string,
  phoneNumber: string,
  notificationType: string,
  title: string,
  message: string,
  childId?: string,
  metadata?: Record<string, unknown>,
): Promise<MessagingResponse> {
  return sendMessage({
    parentId,
    childId,
    phoneNumber,
    notificationType,
    title,
    message,
    metadata,
  });
}
