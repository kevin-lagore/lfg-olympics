"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { UserPlus, PlusSquare } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { computeRatings } from "@/lib/elo";
import type { Activity, Game, Player } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const NONE = "__none__";

function PlayerSelect({
  players,
  value,
  onChange,
  placeholder,
}: {
  players: Player[];
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? "" : v)}>
      <SelectTrigger className="h-12 w-full text-base">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{placeholder}</SelectItem>
        {players.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function RecordResult({
  players,
  activities,
  games,
  onRefresh,
  onGameLogged,
}: {
  players: Player[];
  activities: Activity[];
  games: Game[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  /**
   * Called after a successful game insert. Fires the unified-commentary
   * regeneration (POST) centrally and, once it resolves, refetches so the fresh
   * commentary lands in shared state — while exposing a shared "regenerating"
   * flag the Commentary view shows as "updating…". Non-blocking: returns
   * immediately so the success toast and the instant leaderboard/history refresh
   * are never delayed (CLAUDE.md §5 View 5).
   */
  onGameLogged: () => void;
}) {
  const activePlayers = useMemo(
    () => players.filter((p) => p.active),
    [players],
  );

  const [isDoubles, setIsDoubles] = useState(false);
  const [activityId, setActivityId] = useState("");
  // singles: a, b ; doubles: t1a,t1b vs t2a,t2b
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [t1a, setT1a] = useState("");
  const [t1b, setT1b] = useState("");
  const [t2a, setT2a] = useState("");
  const [t2b, setT2b] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const selectedActivity = activities.find((x) => x.id === activityId) ?? null;
  const doublesAllowed = selectedActivity?.supports_doubles ?? true;

  // If the selected activity does not support doubles, force singles.
  useEffect(() => {
    if (selectedActivity && !selectedActivity.supports_doubles && isDoubles) {
      setIsDoubles(false);
    }
  }, [selectedActivity, isDoubles]);

  const playerName = (id: string) =>
    players.find((p) => p.id === id)?.name ?? "?";

  const clearForm = () => {
    setA("");
    setB("");
    setT1a("");
    setT1b("");
    setT2a("");
    setT2b("");
  };

  function validate(): { winners: string[]; losers: string[] } | string {
    if (!activityId) return "Pick an activity.";
    if (isDoubles) {
      const ids = [t1a, t1b, t2a, t2b];
      if (ids.some((x) => !x)) return "Pick all four players.";
      if (new Set(ids).size !== 4) return "No duplicate players in a game.";
      return { winners: [t1a, t1b], losers: [t2a, t2b] };
    }
    if (!a || !b) return "Pick both players.";
    if (a === b) return "No duplicate players in a game.";
    return { winners: [a], losers: [b] };
  }

  async function submit(winnerSide: "left" | "right") {
    const v = validate();
    if (typeof v === "string") {
      toast.error(v);
      return;
    }
    // v.winners is the "left" side by construction; flip if the right side won.
    let winner_ids = v.winners;
    let loser_ids = v.losers;
    if (winnerSide === "right") {
      [winner_ids, loser_ids] = [loser_ids, winner_ids];
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from("games").insert({
        activity_id: activityId,
        is_doubles: isDoubles,
        winner_ids,
        loser_ids,
      });
      if (error) {
        toast.error(`Could not record: ${error.message}`);
        return;
      }

      // Primary regeneration trigger (CLAUDE.md §5 View 5): after a successful
      // game insert, fire a background regeneration of the unified tournament
      // commentary. This is centralized in the shared data layer so it raises a
      // shared "updating…" flag for the Commentary view AND refetches once the
      // new row is written (~3s later) — so the commentary updates automatically
      // with no manual refresh. Non-blocking: never delays the toast or the
      // instant leaderboard/history refresh below; errors quiet-fail.
      onGameLogged();

      // Compute the winner's delta for the toast by replaying with the new game
      // appended (optimistic — realtime will refresh shortly anyway).
      const provisional: Game = {
        id: "provisional",
        activity_id: activityId,
        is_doubles: isDoubles,
        winner_ids,
        loser_ids,
        played_at: new Date().toISOString(),
        excluded: false,
        created_at: new Date().toISOString(),
      };
      const ratings = computeRatings([...games, provisional], players);
      const headWinner = winner_ids[0];
      const change = ratings.get(headWinner)?.lastChange ?? 0;
      const label = isDoubles
        ? winnerSide === "right"
          ? "Team 2"
          : "Team 1"
        : playerName(headWinner);
      const sign = change >= 0 ? "+" : "−";
      toast.success(`Recorded — ${label} ${sign}${Math.abs(Math.round(change))}`);

      clearForm();
      await onRefresh();
    } finally {
      setSubmitting(false);
    }
  }

  const leftLabel = isDoubles ? "Team 1 won" : `${playerName(a) === "?" ? "Player 1" : playerName(a)} won`;
  const rightLabel = isDoubles ? "Team 2 won" : `${playerName(b) === "?" ? "Player 2" : playerName(b)} won`;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Record Result</h1>
        <div className="flex gap-2">
          <AddPlayerModal onAdded={onRefresh} />
          <AddActivityModal onAdded={onRefresh} />
        </div>
      </header>

      <div className="flex items-center justify-between rounded-xl border bg-card p-3">
        <Label htmlFor="doubles" className="text-base">
          Doubles?
        </Label>
        <Switch
          id="doubles"
          checked={isDoubles}
          disabled={!doublesAllowed}
          onCheckedChange={setIsDoubles}
        />
      </div>
      {!doublesAllowed && (
        <p className="-mt-3 text-xs text-muted-foreground">
          {selectedActivity?.name} is singles-only.
        </p>
      )}

      <div className="flex flex-col gap-2">
        <Label>Activity</Label>
        <Select value={activityId || NONE} onValueChange={(v) => setActivityId(v === NONE ? "" : v)}>
          <SelectTrigger className="h-12 w-full text-base">
            <SelectValue placeholder="Pick an activity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Pick an activity</SelectItem>
            {activities.map((act) => (
              <SelectItem key={act.id} value={act.id}>
                {act.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isDoubles ? (
        <div className="grid grid-cols-1 gap-4">
          <div className="flex flex-col gap-2 rounded-xl border p-3">
            <Label className="text-sm font-semibold">Team 1</Label>
            <PlayerSelect players={activePlayers} value={t1a} onChange={setT1a} placeholder="Player" />
            <PlayerSelect players={activePlayers} value={t1b} onChange={setT1b} placeholder="Player" />
          </div>
          <div className="flex flex-col gap-2 rounded-xl border p-3">
            <Label className="text-sm font-semibold">Team 2</Label>
            <PlayerSelect players={activePlayers} value={t2a} onChange={setT2a} placeholder="Player" />
            <PlayerSelect players={activePlayers} value={t2b} onChange={setT2b} placeholder="Player" />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          <div className="flex flex-col gap-2">
            <Label className="text-sm">Player 1</Label>
            <PlayerSelect players={activePlayers} value={a} onChange={setA} placeholder="Player 1" />
          </div>
          <div className="flex flex-col gap-2">
            <Label className="text-sm">Player 2</Label>
            <PlayerSelect players={activePlayers} value={b} onChange={setB} placeholder="Player 2" />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 pt-1">
        <Button
          className="h-14 text-base"
          disabled={submitting}
          onClick={() => submit("left")}
        >
          {leftLabel}
        </Button>
        <Button
          className="h-14 text-base"
          variant="secondary"
          disabled={submitting}
          onClick={() => submit("right")}
        >
          {rightLabel}
        </Button>
      </div>
    </div>
  );
}

function AddPlayerModal({ onAdded }: { onAdded: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Enter a name.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("players").insert({ name: trimmed });
      if (error) {
        toast.error(`Could not add player: ${error.message}`);
        return;
      }
      toast.success(`Added ${trimmed}`);
      setName("");
      setOpen(false);
      await onAdded();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <UserPlus className="size-4" /> Player
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add player</DialogTitle>
          <DialogDescription>
            Names need not be unique. Added players are permanent until deactivated.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="player-name">Name</Label>
          <Input
            id="player-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Tom B"
            onKeyDown={(e) => e.key === "Enter" && save()}
          />
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={saving}>
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddActivityModal({ onAdded }: { onAdded: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [singlesOnly, setSinglesOnly] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Enter an activity name.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("activities").insert({
        name: trimmed,
        supports_doubles: !singlesOnly,
      });
      if (error) {
        toast.error(`Could not add activity: ${error.message}`);
        return;
      }
      toast.success(`Added ${trimmed}`);
      setName("");
      setSinglesOnly(false);
      setOpen(false);
      await onAdded();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <PlusSquare className="size-4" /> Activity
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add activity</DialogTitle>
          <DialogDescription>Activity names must be unique.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="activity-name">Name</Label>
            <Input
              id="activity-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Spikeball"
              onKeyDown={(e) => e.key === "Enter" && save()}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label htmlFor="singles-only">Singles only</Label>
            <Switch
              id="singles-only"
              checked={singlesOnly}
              onCheckedChange={setSinglesOnly}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={saving}>
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
