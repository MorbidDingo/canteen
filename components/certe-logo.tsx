import { cn } from "@/lib/utils";

interface CerteLogoProps {
  size?: number;
  className?: string;
}

/**
 * Minimalistic, premium certe logo.
 * A shield-inspired monogram mark with the "c" letterform,
 * rendered in orange-gold gradient for a luxurious yet clean feel.
 */
export function CerteLogo({ size = 40, className }: CerteLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-label="certe logo"
    >
      <defs>
        <linearGradient id="certe-grad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#e8a230" />
          <stop offset="50%" stopColor="#d4891a" />
          <stop offset="100%" stopColor="#b87314" />
        </linearGradient>
        <linearGradient id="certe-shine" x1="8" y1="4" x2="40" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#f5c862" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#d4891a" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Shield / rounded-square base */}
      <rect x="2" y="2" width="44" height="44" rx="14" fill="url(#certe-grad)" />
      <rect x="2" y="2" width="44" height="44" rx="14" fill="url(#certe-shine)" />
      {/* "c" letterform – clean, geometric, centered */}
      <path
        d="M28.5 16.5C26.8 15.4 24.8 14.8 22.8 14.8C17.1 14.8 12.5 19 12.5 24.2C12.5 29.4 17.1 33.6 22.8 33.6C24.8 33.6 26.8 33 28.5 31.9"
        stroke="white"
        strokeWidth="3.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

/**
 * The certe wordmark — lowercase "certe" with premium orange-gold styling.
 * Use this wherever the brand name should appear as styled text.
 */
export function CerteWordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "font-semibold tracking-tight bg-gradient-to-r from-[#e8a230] via-[#d4891a] to-[#b87314] bg-clip-text text-transparent",
        className,
      )}
    >
      certe
    </span>
  );
}
