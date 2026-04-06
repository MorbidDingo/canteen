import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { user, parentMessagingPreference } from "@/lib/db/schema";
import { getSession } from "@/lib/auth-server";

// GET /api/messaging/preferences — Get parent's messaging preferences
export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user || (session.user.role !== "PARENT" && session.user.role !== "GENERAL")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parentId = session.user.id;

    // Try to get existing preference record
    let pref = await db
      .select()
      .from(parentMessagingPreference)
      .where(eq(parentMessagingPreference.parentId, parentId))
      .limit(1);

    if (pref.length === 0) {
      // Create default preference record if not exists
      const now = new Date();
      await db.insert(parentMessagingPreference).values({
        parentId,
        phoneNumber: session.user.phone || null,
        preferredChannel: "BOTH" as const,
        fallbackEnabled: true,
        gateNotificationsEnabled: true,
        orderNotificationsEnabled: true,
        spendingNotificationsEnabled: true,
        cardNotificationsEnabled: true,
        blockedNotificationsEnabled: true,
        consentGivenAt: null,
        updatedAt: now,
      });

      pref = await db
        .select()
        .from(parentMessagingPreference)
        .where(eq(parentMessagingPreference.parentId, parentId))
        .limit(1);
    }

    return NextResponse.json({
      preferences: pref[0] || {},
    });
  } catch (error) {
    console.error("Failed to get messaging preferences:", error);
    return NextResponse.json(
      { error: "Failed to get preferences" },
      { status: 500 }
    );
  }
}

// POST /api/messaging/preferences — Update parent's messaging preferences
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || (session.user.role !== "PARENT" && session.user.role !== "GENERAL")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      phoneNumber,
      preferredChannel,
      fallbackEnabled,
      gateNotificationsEnabled,
      orderNotificationsEnabled,
      spendingNotificationsEnabled,
      cardNotificationsEnabled,
      blockedNotificationsEnabled,
      consentGiven,
    } = body;

    const parentId = session.user.id;

    // Validate phone number if provided
    if (phoneNumber) {
      const cleaned = phoneNumber.replace(/[\s\-\(\)]/g, "");
      if (!/^(\+91|91)?[6-9]\d{9}$/.test(cleaned)) {
        return NextResponse.json(
          { error: "Invalid phone number format" },
          { status: 400 }
        );
      }
    }

    // Validate preferred channel
    if (
      preferredChannel &&
      !["WHATSAPP", "SMS", "BOTH"].includes(preferredChannel)
    ) {
      return NextResponse.json(
        { error: "Invalid preferred channel" },
        { status: 400 }
      );
    }

    const now = new Date();

    // Get existing preference or create new
    const existing = await db
      .select()
      .from(parentMessagingPreference)
      .where(eq(parentMessagingPreference.parentId, parentId))
      .limit(1);

    if (existing.length === 0) {
      // Create new preference
      await db.insert(parentMessagingPreference).values({
        parentId,
        phoneNumber: phoneNumber || session.user.phone || null,
        preferredChannel,
        fallbackEnabled:
          fallbackEnabled !== undefined ? fallbackEnabled : true,
        gateNotificationsEnabled:
          gateNotificationsEnabled !== undefined
            ? gateNotificationsEnabled
            : true,
        orderNotificationsEnabled:
          orderNotificationsEnabled !== undefined
            ? orderNotificationsEnabled
            : true,
        spendingNotificationsEnabled:
          spendingNotificationsEnabled !== undefined
            ? spendingNotificationsEnabled
            : true,
        cardNotificationsEnabled:
          cardNotificationsEnabled !== undefined
            ? cardNotificationsEnabled
            : true,
        blockedNotificationsEnabled:
          blockedNotificationsEnabled !== undefined
            ? blockedNotificationsEnabled
            : true,
        consentGivenAt: consentGiven ? now : null,
        updatedAt: now,
      });
    } else {
      // Update existing preference
      await db
        .update(parentMessagingPreference)
        .set({
          phoneNumber: phoneNumber || existing[0].phoneNumber,
          preferredChannel: preferredChannel || existing[0].preferredChannel,
          fallbackEnabled:
            fallbackEnabled !== undefined
              ? fallbackEnabled
              : existing[0].fallbackEnabled,
          gateNotificationsEnabled:
            gateNotificationsEnabled !== undefined
              ? gateNotificationsEnabled
              : existing[0].gateNotificationsEnabled,
          orderNotificationsEnabled:
            orderNotificationsEnabled !== undefined
              ? orderNotificationsEnabled
              : existing[0].orderNotificationsEnabled,
          spendingNotificationsEnabled:
            spendingNotificationsEnabled !== undefined
              ? spendingNotificationsEnabled
              : existing[0].spendingNotificationsEnabled,
          cardNotificationsEnabled:
            cardNotificationsEnabled !== undefined
              ? cardNotificationsEnabled
              : existing[0].cardNotificationsEnabled,
          blockedNotificationsEnabled:
            blockedNotificationsEnabled !== undefined
              ? blockedNotificationsEnabled
              : existing[0].blockedNotificationsEnabled,
          consentGivenAt: consentGiven ? (existing[0].consentGivenAt || now) : existing[0].consentGivenAt,
          updatedAt: now,
        })
        .where(eq(parentMessagingPreference.parentId, parentId));
    }

    // Also update user phone if provided
    if (phoneNumber) {
      await db
        .update(user)
        .set({ phone: phoneNumber, updatedAt: now })
        .where(eq(user.id, parentId));
    }

    // Return updated preferences
    const updated = await db
      .select()
      .from(parentMessagingPreference)
      .where(eq(parentMessagingPreference.parentId, parentId))
      .limit(1);

    return NextResponse.json({
      success: true,
      preferences: updated[0],
    });
  } catch (error) {
    console.error("Failed to update messaging preferences:", error);
    return NextResponse.json(
      { error: "Failed to update preferences" },
      { status: 500 }
    );
  }
}
