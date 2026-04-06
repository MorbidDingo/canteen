import Image from "next/image";
import { cn } from "@/lib/utils";

/** Original logo dimensions used to preserve the aspect ratio. */
const LOGO_WIDTH = 534;
const LOGO_HEIGHT = 310;
const LOGO_ASPECT_RATIO = LOGO_WIDTH / LOGO_HEIGHT;

interface CerteLogoProps {
  size?: number;
  className?: string;
  priority?: boolean;
}

/**
 * certe logo rendered from the brand image with transparent background.
 * The size prop controls the height; width scales proportionally.
 */
export function CerteLogo({ size = 40, className, priority = false }: CerteLogoProps) {
  return (
    <Image
      src="/logo-512.png"
      alt="certe logo"
      width={Math.round(size * LOGO_ASPECT_RATIO)}
      height={size}
      className={cn("shrink-0", className)}
      priority={priority}
    />
  );
}

/**
 * The certe wordmark in a bold geometric sans treatment.
 * When showPlus is true, a small "+" superscript is shown.
 */
export function CerteWordmark({ className, showPlus, white }: { className?: string; showPlus?: boolean; white?: boolean }) {
  return (
    <span
      className={cn(
        "font-sans font-black tracking-[-0.06em] leading-none select-none",
        white
          ? "text-white"
          : "bg-gradient-to-r from-[#e8a230] via-[#d4891a] to-[#b87314] bg-clip-text text-transparent",
        className,
      )}
    >
      Certe
      {showPlus && (
        <sup className={cn(
          "ml-[1px] text-[0.92em] font-black",
          white
            ? "text-white/80"
            : "bg-gradient-to-r from-[#f5c862] via-[#e8a230] to-[#d4891a] bg-clip-text text-transparent",
        )}>
          +
        </sup>
      )}
    </span>
  );
}
