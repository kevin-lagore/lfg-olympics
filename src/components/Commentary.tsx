"use client";

import { useMemo, useState } from "react";
import { Sparkles, RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Activity, Commentary as CommentaryRow, Game } from "@/lib/types";
import { isCommentaryStale, nonExcludedGameCount } from "@/lib/commentary";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function Commentary({
  activities,
  games,
  commentary,
  loading,
  onRefresh,
}: {
  activities: Activity[];
  games: Game[];
  commentary: CommentaryRow[];
  loading: boolean;
  onRefresh: () => Promise<void>;
}) {
  const commentaryByActivity = useMemo(() => {
    const m = new Map<string, CommentaryRow>();
    for (const c of commentary) m.set(c.activity_id, c);
    return m;
  }, [commentary]);

  // Order activities by game count desc, then name (busiest first).
  const orderedActivities = useMemo(() => {
    const count = new Map<string, number>();
    for (const g of games) {
      if (g.excluded) continue;
      count.set(g.activity_id, (count.get(g.activity_id) ?? 0) + 1);
    }
    return [...activities].sort(
      (a, b) =>
        (count.get(b.id) ?? 0) - (count.get(a.id) ?? 0) ||
        a.name.localeCompare(b.name),
    );
  }, [activities, games]);

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-bold">Commentary</h1>
        <p className="text-sm text-muted-foreground">
          AI-generated takes on each activity. Generate when you&apos;re ready
          for some buzz.
        </p>
      </header>

      {loading ? (
        <p className="py-12 text-center text-muted-foreground">Loading…</p>
      ) : orderedActivities.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">
          No activities yet. Add one on the Record tab.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {orderedActivities.map((activity) => (
            <CommentaryCard
              key={activity.id}
              activity={activity}
              cached={commentaryByActivity.get(activity.id) ?? null}
              gameCount={nonExcludedGameCount(games, activity.id)}
              onRefresh={onRefresh}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function CommentaryCard({
  activity,
  cached,
  gameCount,
  onRefresh,
}: {
  activity: Activity;
  cached: CommentaryRow | null;
  gameCount: number;
  onRefresh: () => Promise<void>;
}) {
  const [generating, setGenerating] = useState(false);
  // Locally generated content shows immediately even before the realtime/refresh
  // round-trip lands.
  const [localContent, setLocalContent] = useState<string | null>(null);

  const content = localContent ?? cached?.content ?? null;
  const stale = isCommentaryStale(cached, gameCount);
  const hasContent = content !== null;

  async function generate() {
    setGenerating(true);
    try {
      const res = await fetch(
        `/api/commentary/${encodeURIComponent(activity.id)}`,
        { method: "POST" },
      );
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
      toast.success(`Fresh take on ${activity.name}!`);
      // Pull the cached row + updated games_at_generation into shared state.
      await onRefresh();
    } catch {
      toast.error("Network error while generating commentary.");
    } finally {
      setGenerating(false);
    }
  }

  const buttonLabel = generating
    ? "Generating…"
    : hasContent
      ? "Regenerate"
      : "Generate";

  return (
    <li className="list-none">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">{activity.name}</CardTitle>
          <Button
            size="sm"
            variant={hasContent ? "outline" : "default"}
            onClick={generate}
            disabled={generating || gameCount === 0}
          >
            {generating ? (
              <Loader2 className="size-4 animate-spin" />
            ) : hasContent ? (
              <RefreshCw className="size-4" />
            ) : (
              <Sparkles className="size-4" />
            )}
            {buttonLabel}
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {hasContent ? (
            <p className="text-sm leading-relaxed">{content}</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {gameCount === 0
                ? "No games yet — play some rounds, then generate."
                : "No commentary yet. Hit Generate for a hot take."}
            </p>
          )}
          {hasContent && stale && localContent === null && (
            <p className="text-xs font-medium text-amber-600">
              New games since this was written — Regenerate for the latest.
            </p>
          )}
        </CardContent>
      </Card>
    </li>
  );
}
