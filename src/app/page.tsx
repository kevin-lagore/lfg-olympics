"use client";

import { useState } from "react";
import { BottomTabBar, type TabKey } from "@/components/BottomTabBar";
import { RanksAndStats } from "@/components/RanksAndStats";
import { RecordResult } from "@/components/RecordResult";
import { History } from "@/components/History";
import { Commentary } from "@/components/Commentary";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useOlympicsData } from "@/lib/useOlympicsData";

export default function Home() {
  const [tab, setTab] = useState<TabKey>("ranks");
  const [recordOpen, setRecordOpen] = useState(false);
  const {
    players,
    activities,
    games,
    commentary,
    loading,
    error,
    refresh,
    regenerating,
    regenerateCommentary,
  } = useOlympicsData();

  return (
    <>
      <main className="mx-auto w-full max-w-[480px] flex-1 px-4 pb-24 pt-4">
        {error && (
          <div className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            <div className="min-w-0">
              <p className="font-medium">Couldn&apos;t load the latest data.</p>
              <p className="mt-0.5 break-words text-xs text-red-600/90">
                {error}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void refresh()}
              className="shrink-0 rounded-md border border-red-300 bg-white px-2.5 py-1 text-xs font-medium text-red-700 transition-colors hover:bg-red-100"
            >
              Retry
            </button>
          </div>
        )}

        {tab === "ranks" && (
          <RanksAndStats
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
        {tab === "commentary" && (
          <Commentary
            games={games}
            commentary={commentary}
            loading={loading}
            onRefresh={refresh}
            regenerating={regenerating}
          />
        )}
      </main>

      <BottomTabBar
        active={tab}
        onChange={setTab}
        onRecord={() => setRecordOpen(true)}
      />

      {/* Record Result is no longer a tab — it opens here as a modal (CLAUDE.md
          §5 View 2). The success toast, realtime refresh, and fire-and-forget
          commentary regeneration all fire exactly as before; onRecorded just
          closes the modal. */}
      <Dialog open={recordOpen} onOpenChange={setRecordOpen}>
        <DialogContent className="max-h-[88vh] gap-4 overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-extrabold">
              <span aria-hidden="true">📝</span> Record a result
            </DialogTitle>
          </DialogHeader>
          <RecordResult
            players={players}
            activities={activities}
            games={games}
            loading={loading}
            onRefresh={refresh}
            onGameLogged={regenerateCommentary}
            onRecorded={() => setRecordOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
