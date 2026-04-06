export function isMissingRelationError(error: unknown, relation: string): boolean {
  const err = error as { code?: string; cause?: { code?: string; message?: string }; message?: string };
  if (err?.code === "42P01") return true;
  if (err?.cause?.code === "42P01") return true;

  const relationToken = `relation \"${relation}\" does not exist`;
  if (typeof err?.message === "string" && err.message.includes(relationToken)) return true;
  if (typeof err?.cause?.message === "string" && err.cause.message.includes(relationToken)) return true;

  return false;
}
