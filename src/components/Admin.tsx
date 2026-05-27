"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Minus, EyeOff } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { computeRatings, STARTING_RATING } from "@/lib/elo";
import type { Adjustment, Game, Player } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PlayerAvatar } from "@/components/PlayerAvatar";

const NONE = "__none__";

/**
 * Secret Admin surface (revealed via a long-press on the title). Two jobs:
 *  1. Rename players + flip their active flag (UPDATE players).
 *  2. Log manual point adjustments (INSERT adjustments) — an EVENT type folded
 *     into the rating replay (CLAUDE.md §2/§3), never a stored rating.
 * All writes go through the existing realtime/refresh path so every client
 * (and the leaderboard) converges.
 */
export function Admin({
  players,
  games,
  adjustments,
  loading,
  onRefresh,
  onHideAdmin,
}: {
  players: Player[];
  games: Game[];
  adjustments: Adjustment[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  /** Hide the Admin tab (turns off the localStorage reveal flag). */
  onHideAdmin: () => void;
}) {
  // Current computed ratings (incl. adjustments) so each row can show a score.
  const ratings = useMemo(
    () => computeRatings(games, players, adjustments),
    [games, players, adjustments],
  );

  // Players sorted: active first, then by name, for a stable admin list.
  const sortedPlayers = useMemo(() => {
    return [...players].sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [players]);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold tracking-tight">
          <span aria-hidden="true">⚙️</span> Admin
        </h1>
        <Button variant="outline" size="sm" onClick={onHideAdmin}>
          <EyeOff className="size-3.5" /> Hide admin
        </Button>
      </header>

      <p className="rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">
        Secret family-admin tools. Adjustments are logged events that fold into
        the rankings — fully reversible from History.
      </p>

      {/* --- Manual point adjustment ------------------------------------- */}
      <AdjustmentForm players={players} onRefresh={onRefresh} />

      {/* --- Players: rename + active toggle ----------------------------- */}
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Players
        </h2>
        {loading ? (
          <p className="py-8 text-center text-muted-foreground">Loading…</p>
        ) : sortedPlayers.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">
            No players yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {sortedPlayers.map((p) => (
              <PlayerRow
                key={p.id}
                player={p}
                rating={ratings.get(p.id)?.rating ?? STARTING_RATING}
                onRefresh={onRefresh}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function PlayerRow({
  player,
  rating,
  onRefresh,
}: {
  player: Player;
  rating: number;
  onRefresh: () => Promise<void>;
}) {
  const [togglingActive, setTogglingActive] = useState(false);

  async function toggleActive(next: boolean) {
    setTogglingActive(true);
    try {
      const { error } = await supabase
        .from("players")
        .update({ active: next })
        .eq("id", player.id);
      if (error) {
        toast.error(`Could not update: ${error.message}`);
        return;
      }
      toast.success(next ? `${player.name} is active` : `${player.name} hidden`);
      await onRefresh();
    } finally {
      setTogglingActive(false);
    }
  }

  return (
    <li
      className={cnRow(player.active)}
    >
      <PlayerAvatar name={player.name} seed={player.id} size="md" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{player.name}</p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {Math.round(rating)} pts
          {!player.active && " · inactive"}
        </p>
      </div>

      <RenamePlayerDialog player={player} onRefresh={onRefresh} />

      <label className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
        Active
        <Switch
          checked={player.active}
          disabled={togglingActive}
          onCheckedChange={toggleActive}
          aria-label={`Toggle ${player.name} active`}
        />
      </label>
    </li>
  );
}

function cnRow(active: boolean): string {
  return [
    "flex items-center gap-3 rounded-2xl border-2 border-transparent bg-card p-3 shadow-sm ring-1 ring-border",
    active ? "" : "opacity-60",
  ].join(" ");
}

function RenamePlayerDialog({
  player,
  onRefresh,
}: {
  player: Player;
  onRefresh: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(player.name);
  const [saving, setSaving] = useState(false);

  function onOpenChange(next: boolean) {
    if (next) setName(player.name);
    setOpen(next);
  }

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Name can't be empty.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("players")
        .update({ name: trimmed })
        .eq("id", player.id);
      if (error) {
        toast.error(`Could not rename: ${error.message}`);
        return;
      }
      toast.success(`Renamed to ${trimmed}`);
      setOpen(false);
      await onRefresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onOpenChange(true)}
        aria-label={`Rename ${player.name}`}
      >
        <Pencil className="size-3.5" /> Edit
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename player</DialogTitle>
          <DialogDescription>
            Changes the display name everywhere. Ratings are unaffected.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`rename-${player.id}`}>Name</Label>
          <Input
            id={`rename-${player.id}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
            onKeyDown={(e) => {
              if (e.key === "Enter") void save();
            }}
          />
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={saving}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdjustmentForm({
  players,
  onRefresh,
}: {
  players: Player[];
  onRefresh: () => Promise<void>;
}) {
  const [playerId, setPlayerId] = useState("");
  const [deltaText, setDeltaText] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Active first, then alphabetical, for the dropdown.
  const options = useMemo(() => {
    return [...players].sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [players]);

  const nameOf = useMemo(
    () => new Map(players.map((p) => [p.id, p.name])),
    [players],
  );

  async function submit() {
    if (!playerId) {
      toast.error("Pick a player.");
      return;
    }
    const delta = Number(deltaText);
    if (!deltaText.trim() || !Number.isFinite(delta) || delta === 0) {
      toast.error("Enter a non-zero points delta (e.g. +5 or -3).");
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from("adjustments").insert({
        player_id: playerId,
        delta,
        reason: reason.trim() || null,
      });
      if (error) {
        toast.error(`Could not adjust: ${error.message}`);
        return;
      }
      const name = nameOf.get(playerId) ?? "Player";
      const signed = `${delta > 0 ? "+" : "−"}${Math.abs(delta)}`;
      toast.success(`Adjusted — ${name} ${signed}`);
      // Reset (keep player selected for quick repeat adjustments).
      setDeltaText("");
      setReason("");
      await onRefresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border-2 border-transparent bg-card p-4 shadow-sm ring-1 ring-border">
      <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
        Add points
      </h2>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="adj-player">Player</Label>
        <Select
          value={playerId || NONE}
          onValueChange={(v) => setPlayerId(v === NONE ? "" : v)}
        >
          <SelectTrigger id="adj-player" className="h-12 w-full text-base">
            <SelectValue placeholder="Pick a player" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Pick a player</SelectItem>
            {options.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
                {!p.active ? " (inactive)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="adj-delta">Points (e.g. +5 or -3)</Label>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Make negative"
            onClick={() => {
              const n = Number(deltaText);
              if (Number.isFinite(n) && deltaText.trim())
                setDeltaText(String(-Math.abs(n)));
              else setDeltaText("-");
            }}
          >
            <Minus className="size-4" />
          </Button>
          <Input
            id="adj-delta"
            type="number"
            inputMode="decimal"
            step="any"
            placeholder="5"
            value={deltaText}
            onChange={(e) => setDeltaText(e.target.value)}
            className="h-12 flex-1 text-base"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Make positive"
            onClick={() => {
              const n = Number(deltaText);
              if (Number.isFinite(n) && deltaText.trim())
                setDeltaText(String(Math.abs(n)));
            }}
          >
            <Plus className="size-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="adj-reason">Reason (optional)</Label>
        <Input
          id="adj-reason"
          placeholder="e.g. bonus for hosting"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          autoComplete="off"
          className="h-12 text-base"
        />
      </div>

      <Button
        className="h-12 text-base font-bold"
        onClick={submit}
        disabled={submitting}
      >
        Apply adjustment
      </Button>
    </section>
  );
}
