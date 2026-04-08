"use client";

import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  motion,
  AnimatePresence,
  type HTMLMotionProps,
  type Variants,
  PanInfo,
} from "framer-motion";
import { cn } from "@/lib/utils";

// ─── Spring Presets ─────────────────────────────────────────
export const spring = {
  snappy: { type: "spring" as const, stiffness: 400, damping: 30 },
  gentle: { type: "spring" as const, stiffness: 200, damping: 25 },
  bouncy: { type: "spring" as const, stiffness: 300, damping: 20, mass: 0.8 },
};

// ─── Variant Presets ────────────────────────────────────────
export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: spring.gentle },
  exit: { opacity: 0, y: -8, transition: { duration: 0.15 } },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: spring.snappy },
  exit: { opacity: 0, scale: 0.95, transition: { duration: 0.12 } },
};

export const slideFromRight: Variants = {
  hidden: { opacity: 0, x: "30%" },
  visible: { opacity: 1, x: 0, transition: spring.snappy },
  exit: { opacity: 0, x: "-15%", transition: { duration: 0.2 } },
};

export const slideFromBottom: Variants = {
  hidden: { opacity: 0, y: "100%" },
  visible: { opacity: 1, y: 0, transition: spring.gentle },
  exit: { opacity: 0, y: "100%", transition: { duration: 0.25 } },
};

const staggerChildren: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0.02 },
  },
};

const staggerItem: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: spring.gentle },
};

// ─── MotionPage — iOS push-style page transitions ──────────
export function MotionPage({
  children,
  className,
  ...props
}: HTMLMotionProps<"div"> & { children: React.ReactNode }) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      exit="exit"
      variants={fadeInUp}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

// ─── MotionList — staggered spring children ─────────────────
export function MotionList({
  children,
  className,
  ...props
}: HTMLMotionProps<"div"> & { children: React.ReactNode }) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={staggerChildren}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function MotionItem({
  children,
  className,
  ...props
}: HTMLMotionProps<"div"> & { children: React.ReactNode }) {
  return (
    <motion.div variants={staggerItem} className={className} {...props}>
      {children}
    </motion.div>
  );
}

// ─── MotionCard — scale-on-press tactile feedback ───────────
export const MotionCard = forwardRef<
  HTMLDivElement,
  HTMLMotionProps<"div"> & { children: React.ReactNode }
>(function MotionCard({ children, className, ...props }, ref) {
  return (
    <motion.div
      ref={ref}
      whileTap={{ scale: 0.97 }}
      transition={spring.snappy}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
});

// ─── BottomSheet — iOS-style drag-to-dismiss with snap points ─
interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Height snap points as viewport percentage, e.g. [50, 90] */
  snapPoints?: number[];
  className?: string;
  /** When true, children control their own scroll & layout (no wrapper padding/scroll) */
  bare?: boolean;
}

export function BottomSheet({
  open,
  onClose,
  children,
  snapPoints = [92],
  className,
  bare = false,
}: BottomSheetProps) {
  const normalizedSnapPoints = useMemo(() => {
    const cleaned = Array.from(
      new Set(
        snapPoints
          .map((point) => Number(point))
          .filter((point) => Number.isFinite(point))
          .map((point) => Math.min(95, Math.max(35, point))),
      ),
    ).sort((a, b) => a - b);

    const base = cleaned.length > 0 ? cleaned : [60];
    if (base.length === 1) {
      const min = base[0];
      const autoMax = Math.min(92, Math.max(min + 20, 80));
      return [min, autoMax];
    }
    return base;
  }, [snapPoints]);
  const minSnap = normalizedSnapPoints[0];
  const maxSnap = normalizedSnapPoints[normalizedSnapPoints.length - 1];
  const [currentSnap, setCurrentSnap] = useState(minSnap);
  const touchStartYRef = useRef<number | null>(null);
  const hasExpandedFromScrollRef = useRef(false);

  // Lock body scroll when sheet is open to prevent background scrolling
  useEffect(() => {
    if (!open) return;
    const scrollY = window.scrollY;
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.left = "";
      document.body.style.right = "";
      document.body.style.overflow = "";
      window.scrollTo(0, scrollY);
    };
  }, [open]);

  const handleClose = useCallback(() => {
    setCurrentSnap(minSnap);
    hasExpandedFromScrollRef.current = false;
    onClose();
  }, [minSnap, onClose]);

  const handleDragEnd = useCallback(
    (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      if (info.offset.y < -70 && currentSnap < maxSnap) {
        setCurrentSnap(maxSnap);
        hasExpandedFromScrollRef.current = true;
        return;
      }
      if (info.offset.y > 100 && currentSnap > minSnap) {
        setCurrentSnap(minSnap);
        hasExpandedFromScrollRef.current = false;
        return;
      }
      if (info.velocity.y > 500 || info.offset.y > 150) {
        handleClose();
      }
    },
    [currentSnap, handleClose, maxSnap, minSnap],
  );

  const expandToMaxOnScrollIntent = useCallback(() => {
    if (hasExpandedFromScrollRef.current || currentSnap >= maxSnap) return false;
    setCurrentSnap(maxSnap);
    hasExpandedFromScrollRef.current = true;
    return true;
  }, [currentSnap, maxSnap]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[60] bg-black/15 backdrop-blur-[2px]"
            onClick={handleClose}
          />
          {/* Sheet */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{
              type: "spring",
              damping: 28,
              stiffness: 300,
            }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.25 }}
            onDragEnd={handleDragEnd}
              className={cn(
                "fixed inset-x-0 bottom-0 z-[60] flex flex-col overflow-y rounded-t-3xl",
              "bg-background/95 backdrop-blur-2xl backdrop-saturate-[1.8]",
              "border-t border-border/60",
              "shadow-[0_-8px_50px_rgba(0,0,0,0.15)] dark:shadow-[0_-8px_50px_rgba(0,0,0,0.5)]",
              "dark:bg-background/90 dark:border-white/[0.08]",
                className,
              )}
              style={{ height: `${currentSnap}dvh` }}
            >
            {/* Drag handle — 40×4px pill */}
            <div className="flex justify-center mt-2 pb-1 cursor-grab active:cursor-grabbing shrink-0">
              <div className="h-1 w-10 rounded-full bg-muted/40" />
            </div>
            {bare ? (
              <div className="flex flex-1 flex-col min-h-0 overflow-hidden">{children}</div>
            ) : (
                <div
                  className="flex-1 overflow-y-auto overscroll-contain touch-pan-y px-5 pb-[max(1rem,calc(env(safe-area-inset-bottom)+0.75rem))]"
                  style={{ maxHeight: `calc(${currentSnap}dvh - 2.5rem)` }}
                  onWheelCapture={(event) => {
                    if (event.deltaY <= 0) return;
                    if (expandToMaxOnScrollIntent()) {
                      event.preventDefault();
                      event.stopPropagation();
                    }
                  }}
                  onTouchStart={(event) => {
                    touchStartYRef.current = event.touches[0]?.clientY ?? null;
                  }}
                  onTouchMove={(event) => {
                    if (touchStartYRef.current === null) return;
                    const currentY = event.touches[0]?.clientY ?? touchStartYRef.current;
                    const delta = touchStartYRef.current - currentY;
                    if (delta > 12 && expandToMaxOnScrollIntent()) {
                      event.preventDefault();
                      event.stopPropagation();
                    }
                  }}
                  onTouchEnd={() => {
                    touchStartYRef.current = null;
                  }}
                >
                  {children}
                </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── Re-exports for convenience ─────────────────────────────
export { AnimatePresence, motion };
