export type BreakSlot = {
  name: string;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
};

export const DEFAULT_BREAK_SLOTS: BreakSlot[] = [
  { name: "Short Break", startTime: "10:30", endTime: "10:50" },
  { name: "Lunch Break", startTime: "12:30", endTime: "13:30" },
  { name: "High Tea", startTime: "15:30", endTime: "15:50" },
];

function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

export function timeToMinutes(value: string): number {
  const [hourStr, minuteStr] = value.split(":");
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  return hour * 60 + minute;
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function dedupeByName(slots: BreakSlot[]): BreakSlot[] {
  const out: BreakSlot[] = [];
  const seen = new Set<string>();
  for (const slot of slots) {
    const key = slot.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(slot);
  }
  return out;
}

function fallbackSlotByName(name: string, index: number): BreakSlot {
  const lower = name.toLowerCase();
  const direct =
    DEFAULT_BREAK_SLOTS.find((slot) => slot.name.toLowerCase() === lower) ??
    DEFAULT_BREAK_SLOTS.find((slot) => lower.includes(slot.name.toLowerCase().split(" ")[0]));
  if (direct) {
    return { ...direct, name };
  }
  const template = DEFAULT_BREAK_SLOTS[index % DEFAULT_BREAK_SLOTS.length];
  return { ...template, name };
}

function normalizeSlot(input: unknown, index: number): BreakSlot | null {
  if (typeof input === "string") {
    const name = normalizeName(input);
    if (!name) return null;
    return fallbackSlotByName(name, index);
  }

  if (!input || typeof input !== "object") return null;

  const record = input as Record<string, unknown>;
  const name = normalizeName(String(record.name ?? ""));
  const startTime = String(record.startTime ?? "");
  const endTime = String(record.endTime ?? "");
  if (!name || !isValidTime(startTime) || !isValidTime(endTime)) return null;
  if (timeToMinutes(endTime) <= timeToMinutes(startTime)) return null;
  return { name, startTime, endTime };
}

export function parseBreakSlots(raw: string | undefined): BreakSlot[] {
  if (!raw) return [...DEFAULT_BREAK_SLOTS];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...DEFAULT_BREAK_SLOTS];

    const normalized = parsed
      .map((entry, index) => normalizeSlot(entry, index))
      .filter((slot): slot is BreakSlot => Boolean(slot));

    const unique = dedupeByName(normalized);
    return unique.length > 0 ? unique : [...DEFAULT_BREAK_SLOTS];
  } catch {
    return [...DEFAULT_BREAK_SLOTS];
  }
}

export function serializeBreakSlots(slots: BreakSlot[]): string {
  return JSON.stringify(
    dedupeByName(slots)
      .map((slot) => ({
        name: normalizeName(slot.name),
        startTime: slot.startTime,
        endTime: slot.endTime,
      }))
      .filter(
        (slot) =>
          slot.name.length > 0 &&
          isValidTime(slot.startTime) &&
          isValidTime(slot.endTime) &&
          timeToMinutes(slot.endTime) > timeToMinutes(slot.startTime),
      ),
  );
}

export function breakNames(slots: BreakSlot[]): string[] {
  return slots.map((slot) => slot.name);
}

export function getCurrentTimeMinutesInZone(timeZone: string, now = new Date()): number {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = formatter.formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

export function getCurrentBreakSlot(
  slots: BreakSlot[],
  options?: { now?: Date; timeZone?: string },
): BreakSlot | null {
  const now = options?.now ?? new Date();
  const timeZone = options?.timeZone ?? "Asia/Kolkata";
  const minutesNow = getCurrentTimeMinutesInZone(timeZone, now);
  for (const slot of slots) {
    const start = timeToMinutes(slot.startTime);
    const end = timeToMinutes(slot.endTime);
    if (minutesNow >= start && minutesNow < end) {
      return slot;
    }
  }
  return null;
}

