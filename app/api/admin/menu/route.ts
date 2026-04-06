import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { menuItem, discount, canteen, organizationDevice } from "@/lib/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { sanitizeImageUrl } from "@/lib/image-url";
import { getUserAccessibleDeviceIds } from "@/lib/device-context";

// GET — list all menu items (including unavailable ones for admin)
export async function GET(request: NextRequest) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["ADMIN", "MANAGEMENT", "OPERATOR"],
    });
    const organizationId = access.activeOrganizationId!;

    let accessibleCanteenIds: string[] | null = null;
    if (access.membershipRole === "ADMIN") {
      const accessibleDeviceIds = await getUserAccessibleDeviceIds({
        organizationId,
        userId: access.actorUserId,
        allowedDeviceTypes: ["KIOSK"],
      });

      if (accessibleDeviceIds.length === 0) {
        return NextResponse.json({ items: [] });
      }

      const scopedRows = await db
        .select({ canteenId: organizationDevice.canteenId })
        .from(organizationDevice)
        .where(
          and(
            eq(organizationDevice.organizationId, organizationId),
            inArray(organizationDevice.id, accessibleDeviceIds),
          ),
        );

      accessibleCanteenIds = Array.from(
        new Set(
          scopedRows
            .map((row) => row.canteenId)
            .filter((value): value is string => Boolean(value && value.trim())),
        ),
      );

      if (accessibleCanteenIds.length === 0) {
        return NextResponse.json({ items: [] });
      }
    }

    const canteenId = request.nextUrl.searchParams.get("canteenId")?.trim() || null;

    if (canteenId && accessibleCanteenIds && !accessibleCanteenIds.includes(canteenId)) {
      return NextResponse.json({ error: "You are not assigned to this canteen" }, { status: 403 });
    }

    const whereConditions = [eq(menuItem.organizationId, organizationId)];
    if (accessibleCanteenIds) {
      whereConditions.push(inArray(menuItem.canteenId, accessibleCanteenIds));
    }
    if (canteenId) {
      whereConditions.push(eq(menuItem.canteenId, canteenId));
    }

    const items = await db
      .select({
        item: menuItem,
        canteenName: canteen.name,
        canteenLocation: canteen.location,
      })
      .from(menuItem)
      .leftJoin(canteen, eq(menuItem.canteenId, canteen.id))
      .where(and(...whereConditions))
      .orderBy(desc(menuItem.createdAt));

    // Join active discounts
    const activeDiscounts = await db
      .select()
      .from(discount)
      .where(eq(discount.active, true));

    const discountMap = new Map(
      activeDiscounts.map((d) => [d.menuItemId, d])
    );

    const now = new Date();
    const enriched = items.map(({ item, canteenName, canteenLocation }) => {
      const d = discountMap.get(item.id);
      let discountedPrice = null;
      let discountInfo = null;
      if (
        d &&
        (!d.startDate || d.startDate <= now) &&
        (!d.endDate || d.endDate >= now)
      ) {
        const applied =
          d.type === "PERCENTAGE"
            ? Math.round(item.price * (1 - d.value / 100) * 100) / 100
            : Math.max(0, Math.round((item.price - d.value) * 100) / 100);
        discountedPrice = applied;
        discountInfo = { id: d.id, type: d.type, value: d.value, mode: d.mode };
      }
      return {
        ...item,
        canteenName,
        canteenLocation,
        imageUrl: sanitizeImageUrl(item.imageUrl),
        discountedPrice,
        discountInfo,
      };
    });

    return NextResponse.json({ items: enriched });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Admin fetch menu error:", error);
    return NextResponse.json(
      { error: "Failed to fetch menu items" },
      { status: 500 }
    );
  }
}

const createMenuItemSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().max(500).optional(),
  price: z.number().positive("Price must be positive"),
  category: z.enum(["SNACKS", "MEALS", "DRINKS", "PACKED_FOOD"]),
  canteenId: z.string().min(1).nullable().optional(),
  imageUrl: z.string().optional().or(z.literal("")),
  videoUrl: z.string().optional().or(z.literal("")),
  additionalImages: z.string().optional().or(z.literal("")),
  available: z.boolean().default(true),
  availableUnits: z.number().int().min(0).nullable().optional(),
  subscribable: z.boolean().default(true),
});

// POST — create a new menu item
export async function POST(request: NextRequest) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["ADMIN", "MANAGEMENT", "OPERATOR"],
    });
    const organizationId = access.activeOrganizationId!;

    const body = await request.json();
    const parsed = createMenuItemSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid data", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    if (access.membershipRole === "ADMIN") {
      if (!data.canteenId) {
        return NextResponse.json({ error: "Assigned canteen is required for admin account" }, { status: 400 });
      }

      const accessibleDeviceIds = await getUserAccessibleDeviceIds({
        organizationId,
        userId: access.actorUserId,
        allowedDeviceTypes: ["KIOSK"],
      });

      if (accessibleDeviceIds.length === 0) {
        return NextResponse.json({ error: "No assigned canteen devices" }, { status: 403 });
      }

      const scopedRows = await db
        .select({ canteenId: organizationDevice.canteenId })
        .from(organizationDevice)
        .where(
          and(
            eq(organizationDevice.organizationId, organizationId),
            inArray(organizationDevice.id, accessibleDeviceIds),
          ),
        );

      const accessibleCanteenIds = new Set(
        scopedRows
          .map((row) => row.canteenId)
          .filter((value): value is string => Boolean(value && value.trim())),
      );

      if (!accessibleCanteenIds.has(data.canteenId)) {
        return NextResponse.json({ error: "You are not assigned to this canteen" }, { status: 403 });
      }
    }

    if (data.canteenId) {
      const [canteenRow] = await db
        .select({ id: canteen.id })
        .from(canteen)
        .where(
          and(
            eq(canteen.id, data.canteenId),
            eq(canteen.organizationId, organizationId),
          ),
        )
        .limit(1);

      if (!canteenRow) {
        return NextResponse.json({ error: "Invalid canteen selected" }, { status: 400 });
      }
    }

    const [created] = await db
      .insert(menuItem)
      .values({
        organizationId,
        canteenId: data.canteenId ?? null,
        name: data.name,
        description: data.description || null,
        price: data.price,
        category: data.category,
        imageUrl: data.imageUrl || null,
        videoUrl: data.videoUrl || null,
        additionalImages: data.additionalImages || null,
        available: data.available,
        availableUnits: data.availableUnits ?? 0,
        subscribable: data.subscribable,
      })
      .returning();

    if (access.session?.user) {
      logAudit({
        organizationId,
        userId: access.session.user.id,
        userRole: access.membershipRole || access.session.user.role,
        action: AUDIT_ACTIONS.MENU_ITEM_CREATED,
        details: {
          organizationId: access.activeOrganizationId,
          menuItemId: created.id,
          name: data.name,
          price: data.price,
          category: data.category,
        },
        request,
      });
    }

    return NextResponse.json({ item: created }, { status: 201 });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Create menu item error:", error);
    return NextResponse.json(
      { error: "Failed to create menu item" },
      { status: 500 }
    );
  }
}
