"use client";

import { useEffect, useState } from "react";
import { Sparkles, RefreshCw, Loader2, Megaphone } from "lucide-react";
import { toast } from "sonner";
import type { Game, TournamentCommentary } from "@/lib/types";
import { isCommentaryStale, totalNonExcludedGameCount } from "@/lib/commentary";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/** Compact relative timestamp, e.g. "just now", "5m ago", "3h ago", "2d ago". */
function relativeTime(iso: string, now: number): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const secs = Math.max(0, Math.round((now - then) / 1000));
  if (secs < 45) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return new Date(iso).toLocaleDateString();
}

export function Commentary({
  games,
  commentary,
  loading,
  onRefresh,
}: {
  games: Game[];
  commentary: TournamentCommentary | null;
  loading: boolean;
  onRefresh: () => Promise<void>;
}) {
  const [generating, setGenerating] = useState(false);
  // Locally generated content shows immediately even before the refresh
  // round-trip lands.
  const [localContent, setLocalContent] = useState<string | null>(null);

  // "Now" reference for the relative timestamp; ticks every 30s so it ages.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const totalGameCount = totalNonExcludedGameCount(games);
  const content = localContent ?? commentary?.content ?? null;
  const hasContent = content !== null;
  // Staleness is a fallback indicator: shown only against the persisted row, and
  // only when we haven't just regenerated locally.
  const stale =
    localContent === null && isCommentaryStale(commentary, totalGameCount);

  async function regenerate() {
    setGenerating(true);
    try {
      const res = await fetch("/api/commentary", { method: "POST" });
      if (!res.ok) {
        let message = "Failed to generate commentary.";
        try {
          const body = (await res.json()) as { error?: string };
          if (body?.error) message = body.error;
        } catch {
          // non-JSON error body; keep default message
        }
        toast.error(message);
        return;
      }
      const body = (await res.json()) as { content?: string };
      setLocalContent(body.content ?? "");
      toast.success("Fresh tournament take!");
      // Pull the persisted row + updated games_at_generation into shared state.
      await onRefresh();
    } catch {
      toast.error("Network error while generating commentary.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-bold">Commentary</h1>
        <p className="text-sm text-muted-foreground">
          A running, AI-generated take on the whole tournament. Updates itself
          whenever a new game is logged.
        </p>
      </header>

      {loading ? (
        <p className="py-12 text-center text-muted-foreground">Loading…</p>
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Megaphone className="size-4" />
              Tournament buzz
            </CardTitle>
            {hasContent && (
              <Button
                size="sm"
                variant="outline"
                onClick={regenerate}
                disabled={generating}
              >
                {generating ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                {generating ? "Refreshing…" : "Refresh"}
              </Button>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {hasContent ? (
              <>
                <p className="text-sm leading-relaxed">{content}</p>
                {commentary?.generated_at && localContent === null && (
                  <p className="text-xs text-muted-foreground">
                    Updated {relativeTime(commentary.generated_at, now)}
                  </p>
                )}
                {stale && (
                  <p className="text-xs font-medium text-amber-600">
                    Games have changed since this was written — Refresh for the
                    latest.
                  </p>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <p className="text-sm text-muted-foreground">
                  {totalGameCount === 0
                    ? "No games yet — play some rounds and the commentary will write itself."
                    : "No commentary yet. Seed the first take to get the buzz going."}
                </p>
                <Button
                  onClick={regenerate}
                  disabled={generating || totalGameCount === 0}
                >
                  {generating ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Sparkles className="size-4" />
                  )}
                  {generating ? "Generating…" : "Generate"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
