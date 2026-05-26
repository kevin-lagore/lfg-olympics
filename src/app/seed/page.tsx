"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const SEED_PLAYERS = Array.from({ length: 13 }, (_, i) => `Player ${i + 1}`);
const SEED_ACTIVITIES: { name: string; supports_doubles: boolean }[] = [
  { name: "Cornhole", supports_doubles: true },
  { name: "Badminton", supports_doubles: true },
];

export default function SeedPage() {
  const [log, setLog] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const append = (line: string) => setLog((l) => [...l, line]);

  async function seed() {
    setRunning(true);
    setLog([]);
    try {
      // Players: idempotent by name (insert only those not already present).
      const { data: existingPlayers, error: pErr } = await supabase
        .from("players")
        .select("name");
      if (pErr) throw pErr;
      const haveNames = new Set((existingPlayers ?? []).map((p) => p.name));
      const toAddPlayers = SEED_PLAYERS.filter((n) => !haveNames.has(n));
      if (toAddPlayers.length > 0) {
        const { error } = await supabase
          .from("players")
          .insert(toAddPlayers.map((name) => ({ name })));
        if (error) throw error;
      }
      append(
        `Players: ${toAddPlayers.length} added, ${SEED_PLAYERS.length - toAddPlayers.length} already present.`,
      );

      // Activities: name is unique, so upsert on name is idempotent.
      const { data: existingActs, error: aErr } = await supabase
        .from("activities")
        .select("name");
      if (aErr) throw aErr;
      const haveActs = new Set((existingActs ?? []).map((a) => a.name));
      const toAddActs = SEED_ACTIVITIES.filter((a) => !haveActs.has(a.name));
      if (toAddActs.length > 0) {
        const { error } = await supabase.from("activities").insert(toAddActs);
        if (error) throw error;
      }
      append(
        `Activities: ${toAddActs.length} added, ${SEED_ACTIVITIES.length - toAddActs.length} already present.`,
      );

      append("Done. Open the home page to see the leaderboard.");
    } catch (e) {
      append(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-[480px] flex-1 px-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle>Seed data</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Inserts 13 placeholder players (Player 1–13) and 2 doubles-capable
            activities (Cornhole, Badminton). Safe to run repeatedly — it skips
            anything that already exists.
          </p>
          <Button onClick={seed} disabled={running}>
            {running ? "Seeding…" : "Run seed"}
          </Button>
          {log.length > 0 && (
            <pre className="whitespace-pre-wrap rounded-lg bg-muted p-3 text-xs">
              {log.join("\n")}
            </pre>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
