"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { motion } from "@/components/ui/motion";
import { Sparkles, BookOpen, ExternalLink, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface BookRecommendation {
  bookId: string;
  title: string;
  author: string;
  category: string;
  coverImageUrl: string | null;
  availableCopies: number;
  reasons: string[];
}

export function LibraryRecommendations({ childId }: { childId?: string }) {
  const [recs, setRecs] = useState<BookRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [requestingId, setRequestingId] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/library/recommendations")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.recommendations) {
          setRecs(data.recommendations.slice(0, 4));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleRequest = async (bookId: string) => {
    if (!childId) {
      router.push(`/library-showcase?bookId=${encodeURIComponent(bookId)}`);
      return;
    }
    setRequestingId(bookId);
    try {
      const res = await fetch("/api/library/app-issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ childId, bookId }),
      });
      if (res.ok) {
        toast.success("Issue request queued. Confirm at library kiosk.");
      } else {
        // Fall back to navigating to the showcase page
        router.push(`/library-showcase?bookId=${encodeURIComponent(bookId)}`);
      }
    } catch {
      router.push(`/library-showcase?bookId=${encodeURIComponent(bookId)}`);
    } finally {
      setRequestingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        <span className="text-[12px] text-muted-foreground">Loading suggestions…</span>
      </div>
    );
  }

  if (recs.length === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <span className="text-[13px] font-semibold">Suggested for You</span>
      </div>
      <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-none">
        {recs.map((rec) => (
          <BookRecCard
            key={rec.bookId}
            rec={rec}
            isRequesting={requestingId === rec.bookId}
            onView={() => router.push(`/library-showcase?bookId=${encodeURIComponent(rec.bookId)}`)}
            onRequest={() => handleRequest(rec.bookId)}
          />
        ))}
      </div>
    </div>
  );
}

function BookRecCard({
  rec,
  isRequesting,
  onView,
  onRequest,
}: {
  rec: BookRecommendation;
  isRequesting: boolean;
  onView: () => void;
  onRequest: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="flex shrink-0 w-[160px] flex-col rounded-2xl border border-border/60 bg-background/80 p-3 backdrop-blur"
    >
      {/* Cover thumbnail */}
      <div className="h-[80px] w-full overflow-hidden rounded-xl border border-border/50 bg-muted mb-2 flex items-center justify-center">
        {rec.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={rec.coverImageUrl}
            alt={rec.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <BookOpen className="h-6 w-6 text-muted-foreground/40" />
        )}
      </div>

      <span className="text-[13px] font-semibold leading-tight line-clamp-2">
        {rec.title}
      </span>
      <span className="mt-0.5 text-[11px] text-muted-foreground truncate">
        {rec.author}
      </span>
      <span className="text-[10px] text-muted-foreground/70 truncate">
        {rec.category}
      </span>
      {rec.reasons.length > 0 && (
        <span className="mt-1 text-[10px] text-muted-foreground/80 line-clamp-1">
          {rec.reasons[0]}
        </span>
      )}

      <div className="mt-2 flex gap-1.5">
        <Button
          size="xs"
          variant="outline"
          className="flex-1 gap-1 rounded-lg text-[11px]"
          onClick={onView}
        >
          <ExternalLink className="h-3 w-3" />
          View
        </Button>
        <Button
          size="xs"
          variant="default"
          className="flex-1 gap-1 rounded-lg text-[11px]"
          disabled={isRequesting || rec.availableCopies === 0}
          onClick={onRequest}
        >
          {isRequesting ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : rec.availableCopies === 0 ? (
            "Out"
          ) : (
            "Request"
          )}
        </Button>
      </div>
    </motion.div>
  );
}
