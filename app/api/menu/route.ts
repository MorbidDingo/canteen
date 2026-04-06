import { db } from "@/lib/db";
import { menuItem, discount, canteen } from "@/lib/db/schema";
import { eq, and, isNull, or } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeImageUrl } from "@/lib/image-url";

function applyDiscount(price: number, type: string, value: number): number {
  if (type === "PERCENTAGE") return Math.round((price * (1 - value / 100)) * 100) / 100;
  return Math.max(0, Math.round((price - value) * 100) / 100);
}

export async function GET(request: NextRequest) {
  try {
    const organizationId =
      request.headers.get("x-organization-id")?.trim() ||
      request.headers.get("x-org-id")?.trim() ||
      request.cookies.get("activeOrganizationId")?.value?.trim();

    if (!organizationId) {
      return NextResponse.json({ error: "Organization context is required" }, { status: 400 });
    }

    const canteenId =
      request.nextUrl.searchParams.get("canteenId")?.trim() || null;

    // Build filter: org-scoped + optional canteen filter
    const conditions = [
      eq(menuItem.organizationId, organizationId),
    ];
    if (canteenId) {
      // When filtering by canteen, include items assigned to that canteen + unassigned items
      conditions.push(or(eq(menuItem.canteenId, canteenId), isNull(menuItem.canteenId))!);
    }

    const orgCanteens = await db
      .select({
        id: canteen.id,
        name: canteen.name,
        location: canteen.location,
        status: canteen.status,
      })
      .from(canteen)
      .where(eq(canteen.organizationId, organizationId));

    const activeCanteens = orgCanteens.filter((c) => c.status === "ACTIVE");
    const selectedCanteen = canteenId
      ? orgCanteens.find((c) => c.id === canteenId) ?? null
      : null;
    const selectedCanteenClosed = Boolean(
      selectedCanteen && selectedCanteen.status !== "ACTIVE",
    );

    if (selectedCanteenClosed) {
      return NextResponse.json({
        items: [],
        canteens: activeCanteens,
        selectedCanteenId: canteenId,
        selectedCanteenClosed,
        selectedCanteenName: selectedCanteen?.name ?? null,
      });
    }

    const itemConditions = [...conditions];
    itemConditions.push(or(isNull(menuItem.canteenId), eq(canteen.status, "ACTIVE"))!);

    const items = await db
      .select({
        item: menuItem,
        canteenName: canteen.name,
        canteenLocation: canteen.location,
      })
      .from(menuItem)
      .leftJoin(canteen, eq(menuItem.canteenId, canteen.id))
      .where(and(...itemConditions));

    // Fetch active discounts
    const activeDiscounts = await db
      .select()
      .from(discount)
      .where(eq(discount.active, true));

    const discountMap = new Map(
      activeDiscounts.map((d) => [d.menuItemId, d])
    );

    const now = new Date();
    const filterCanteen = canteenId ? activeCanteens.find((c) => c.id === canteenId) ?? null : null;
    const enriched = items.map(({ item, canteenName, canteenLocation }) => {
      const d = discountMap.get(item.id);
      let discountedPrice = null;
      let discountInfo = null;
      if (
        d &&
        (!d.startDate || d.startDate <= now) &&
        (!d.endDate || d.endDate >= now)
      ) {
        discountedPrice = applyDiscount(item.price, d.type, d.value);
        discountInfo = { type: d.type, value: d.value, mode: d.mode };
      }
      return {
        ...item,
        canteenId: item.canteenId ?? filterCanteen?.id ?? null,
        canteenName: canteenName ?? filterCanteen?.name ?? null,
        canteenLocation: canteenLocation ?? filterCanteen?.location ?? null,
        imageUrl: sanitizeImageUrl(item.imageUrl),
        videoUrl: item.videoUrl ?? null,
        additionalImages: (() => {
          if (!item.additionalImages) return [];
          try { return (JSON.parse(item.additionalImages) as string[]).map(sanitizeImageUrl); }
          catch { return []; }
        })(),
        discountedPrice,
        discountInfo,
      };
    });

    return NextResponse.json({
      items: enriched,
      canteens: activeCanteens,
      selectedCanteenId: canteenId,
      selectedCanteenClosed: false,
      selectedCanteenName: selectedCanteen?.name ?? null,
      hasActiveCanteens: activeCanteens.length > 0,
      activeCanteenCount: activeCanteens.length,
      totalCanteenCount: orgCanteens.length,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch menu items" },
      { status: 500 },
    );
  }
}
