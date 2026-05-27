"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * A little "How scoring works" chip that sits next to the Score chart heading
 * (CLAUDE.md §5 View 1). Opens a playful, plain-English explainer dialog — no
 * Elo jargon, no formulas. The dialog reuses the shadcn Dialog, whose entrance
 * animation already snaps under prefers-reduced-motion (see globals.css).
 */
export function ScoringInfo() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="How scoring works"
        className="lfg-press ml-auto inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[0.65rem] font-bold text-muted-foreground transition-colors hover:text-foreground"
      >
        <span aria-hidden="true">ℹ️</span> How scoring works
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              <span aria-hidden="true">🏅</span> How the score works
            </DialogTitle>
            <DialogDescription>
              No spreadsheets, no maths degree required. Here&apos;s the gist:
            </DialogDescription>
          </DialogHeader>
          <ul className="flex flex-col gap-2.5 text-sm text-foreground/90">
            <li className="flex gap-2">
              <span aria-hidden="true">🎬</span>
              <span>
                Everyone starts on the same score (100). Clean slate, may the
                best lawn-warrior win.
              </span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden="true">📈</span>
              <span>
                Win a game and your score climbs. Lose and it dips. Simple.
              </span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden="true">🎯</span>
              <span>
                Beating someone ranked above you is worth a lot. Beating someone
                way below you? Barely a blip — no bullying the bottom of the
                table for points.
              </span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden="true">🚀</span>
              <span>
                Pull off an upset against a higher-ranked rival and you bag a
                bonus. Comebacks are 100% real around here.
              </span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden="true">🤝</span>
              <span>
                In doubles, both teammates take the full swing — win together,
                cry together.
              </span>
            </li>
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
