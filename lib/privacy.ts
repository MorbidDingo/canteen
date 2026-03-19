export function maskName(value: string | null | undefined): string {
  const input = (value ?? "").trim();
  if (!input) return "";

  const parts = input.split(/\s+/).filter(Boolean);
  return parts
    .map((part) => {
      if (part.length <= 2) return `${part[0] ?? ""}*`;
      return `${part[0]}${"*".repeat(Math.max(1, part.length - 2))}${part[part.length - 1]}`;
    })
    .join(" ");
}

export function maskEmail(value: string | null | undefined): string {
  const input = (value ?? "").trim().toLowerCase();
  if (!input.includes("@")) return "";
  const [local, domain] = input.split("@");
  if (!local || !domain) return "";

  const localMasked = local.length <= 2
    ? `${local[0] ?? ""}*`
    : `${local[0]}${"*".repeat(local.length - 2)}${local[local.length - 1]}`;

  const domainParts = domain.split(".");
  const root = domainParts[0] ?? "";
  const tld = domainParts.slice(1).join(".");
  const rootMasked = root.length <= 2
    ? `${root[0] ?? ""}*`
    : `${root[0]}${"*".repeat(Math.max(1, root.length - 2))}${root[root.length - 1]}`;

  return `${localMasked}@${rootMasked}${tld ? `.${tld}` : ""}`;
}

export function maskPhone(value: string | null | undefined): string {
  const input = (value ?? "").replace(/\s+/g, "");
  if (!input) return "";
  if (input.length <= 4) return "*".repeat(input.length);
  return `${"*".repeat(input.length - 4)}${input.slice(-4)}`;
}

export function maskIdentifier(value: string | null | undefined): string | null {
  const input = (value ?? "").trim();
  if (!input) return null;
  if (input.length <= 4) return `${input[0] ?? ""}${"*".repeat(Math.max(0, input.length - 1))}`;
  return `${input.slice(0, 2)}${"*".repeat(input.length - 4)}${input.slice(-2)}`;
}
