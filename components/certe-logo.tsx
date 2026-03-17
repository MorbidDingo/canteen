import Image from "next/image";
import { cn } from "@/lib/utils";

/** Original logo dimensions used to preserve the aspect ratio. */
const LOGO_WIDTH = 534;
const LOGO_HEIGHT = 310;
const LOGO_ASPECT_RATIO = LOGO_WIDTH / LOGO_HEIGHT;

interface CerteLogoProps {
  size?: number;
  className?: string;
}

/**
 * certe logo rendered from the brand image with transparent background.
 * The size prop controls the height; width scales proportionally.
 */
export function CerteLogo({ size = 40, className }: CerteLogoProps) {
  return (
    <Image
      src="/logo-512.png"
      alt="certe logo"
      width={Math.round(size * LOGO_ASPECT_RATIO)}
      height={size}
      className={cn("shrink-0", className)}
      priority
    />
  );
}

/**
 * The certe wordmark — lowercase "erte" with premium orange-gold styling.
 * Use this wherever the brand name should appear as styled text.
 * The icon already carries the "c" shape, so the text wordmark stays "erte".
 * When showPlus is true, a small "+" superscript is shown above the word.
 */
export function CerteWordmark({ className, showPlus }: { className?: string; showPlus?: boolean }) {
  return (
    <span
      className={cn(
        "font-semibold tracking-tight bg-gradient-to-r from-[#e8a230] via-[#d4891a] to-[#b87314] bg-clip-text text-transparent",
        className,
      )}
    >
      certe
      {showPlus && (
        <sup className="text-[0.55em] font-bold ml-[1px] bg-gradient-to-r from-[#f5c862] via-[#e8a230] to-[#d4891a] bg-clip-text text-transparent">
          +
        </sup>
      )}
    </span>
  );
}
