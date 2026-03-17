import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { child, temporaryRfidAccess } from "@/lib/db/schema";

export type ResolvedRfidChild = {
  child: {
    id: string;
    parentId: string;
    name: string;
    grNumber: string | null;
    className: string | null;
    section: string | null;
    image: string | null;
    presenceStatus: "INSIDE" | "OUTSIDE";
    lastGateTapAt: Date | null;
    permanentRfidCardId: string | null;
  };
  source: "PERMANENT" | "TEMPORARY";
  temporaryAccess?: {
    id: string;
    accessType: "STUDENT_TEMP" | "GUEST_TEMP";
    temporaryRfidCardId: string;
    validUntil: Date;
  };
};

export async function resolveChildByRfid(cardId: string): Promise<ResolvedRfidChild | null> {
  const trimmed = cardId.trim();
  if (!trimmed) return null;

  const [byPermanent] = await db
    .select({
      id: child.id,
      parentId: child.parentId,
      name: child.name,
      grNumber: child.grNumber,
      className: child.className,
      section: child.section,
      image: child.image,
      presenceStatus: child.presenceStatus,
      lastGateTapAt: child.lastGateTapAt,
      permanentRfidCardId: child.rfidCardId,
    })
    .from(child)
    .where(eq(child.rfidCardId, trimmed))
    .limit(1);

  if (byPermanent) {
    return {
      child: byPermanent,
      source: "PERMANENT",
    };
  }

  const [byTemporary] = await db
    .select({
      accessId: temporaryRfidAccess.id,
      accessType: temporaryRfidAccess.accessType,
      tempCardId: temporaryRfidAccess.temporaryRfidCardId,
      validFrom: temporaryRfidAccess.validFrom,
      validUntil: temporaryRfidAccess.validUntil,
      childId: child.id,
      parentId: child.parentId,
      name: child.name,
      grNumber: child.grNumber,
      className: child.className,
      section: child.section,
      image: child.image,
      presenceStatus: child.presenceStatus,
      lastGateTapAt: child.lastGateTapAt,
      permanentRfidCardId: child.rfidCardId,
    })
    .from(temporaryRfidAccess)
    .innerJoin(child, eq(child.id, temporaryRfidAccess.childId))
    .where(
      and(
        eq(temporaryRfidAccess.temporaryRfidCardId, trimmed),
        isNull(temporaryRfidAccess.revokedAt),
      ),
    )
    .limit(1);

  if (!byTemporary) return null;

  const now = new Date();
  if (byTemporary.validFrom > now || byTemporary.validUntil < now) {
    return null;
  }

  return {
    child: {
      id: byTemporary.childId,
      parentId: byTemporary.parentId,
      name: byTemporary.name,
      grNumber: byTemporary.grNumber,
      className: byTemporary.className,
      section: byTemporary.section,
      image: byTemporary.image,
      presenceStatus: byTemporary.presenceStatus,
      lastGateTapAt: byTemporary.lastGateTapAt,
      permanentRfidCardId: byTemporary.permanentRfidCardId,
    },
    source: "TEMPORARY",
    temporaryAccess: {
      id: byTemporary.accessId,
      accessType: byTemporary.accessType,
      temporaryRfidCardId: byTemporary.tempCardId,
      validUntil: byTemporary.validUntil,
    },
  };
}
