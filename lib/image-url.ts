export function sanitizeImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  // Legacy local uploads are not reliable on stateless hosts (e.g. DigitalOcean App Platform).
  if (url.startsWith("/uploads/")) return null;

  return url;
}
