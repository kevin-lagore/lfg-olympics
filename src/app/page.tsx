"use client";

import { useState } from "react";
import { BottomTabBar, type TabKey } from "@/components/BottomTabBar";
import { Leaderboard } from "@/components/Leaderboard";
import { RecordResult } from "@/components/RecordResult";
import { History } from "@/components/History";
import { useOlympicsData } from "@/lib/useOlympicsData";

function ComingSoon({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-24 text-center">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-muted-foreground">Coming soon.</p>
    </div>
  );
}

export default function Home() {
  const [tab, setTab] = useState<TabKey>("leaderboard");
  const { players, activities, games, loading, error, refresh } =
    useOlympicsData();

  return (
    <>
      <main className="mx-auto w-full max-w-[480px] flex-1 px-4 pb-24 pt-4">
        {error && (
          <p className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}

        {tab === "leaderboard" && (
          <Leaderboard
            players={players}
            activities={activities}
            games={games}
            loading={loading}
            onRefresh={refresh}
          />
        )}
        {tab === "record" && (
          <RecordResult
            players={players}
            activities={activities}
            games={games}
            loading={loading}
            onRefresh={refresh}
          />
        )}
        {tab === "history" && (
          <History
            players={players}
            activities={activities}
            games={games}
            loading={loading}
            onRefresh={refresh}
          />
        )}
        {tab === "stats" && <ComingSoon title="Per-activity Stats" />}
        {tab === "commentary" && <ComingSoon title="Commentary" />}
      </main>

      <BottomTabBar active={tab} onChange={setTab} />
    </>
  );
}
