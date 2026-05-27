"use client";

import { useState } from "react";
import { BottomTabBar, type TabKey } from "@/components/BottomTabBar";
import { Leaderboard } from "@/components/Leaderboard";
import { RecordResult } from "@/components/RecordResult";
import { History } from "@/components/History";
import { ActivityStats } from "@/components/ActivityStats";
import { Commentary } from "@/components/Commentary";
import { useOlympicsData } from "@/lib/useOlympicsData";

export default function Home() {
  const [tab, setTab] = useState<TabKey>("leaderboard");
  const { players, activities, games, commentary, loading, error, refresh } =
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
        {tab === "stats" && (
          <ActivityStats
            players={players}
            activities={activities}
            games={games}
            loading={loading}
          />
        )}
        {tab === "commentary" && (
          <Commentary
            activities={activities}
            games={games}
            commentary={commentary}
            loading={loading}
            onRefresh={refresh}
          />
        )}
      </main>

      <BottomTabBar active={tab} onChange={setTab} />
    </>
  );
}
