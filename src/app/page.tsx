"use client";

import { useState } from "react";
import { toast } from "sonner";
import { BottomTabBar, type TabKey } from "@/components/BottomTabBar";
import { RanksAndStats } from "@/components/RanksAndStats";
import { RecordResult } from "@/components/RecordResult";
import { History } from "@/components/History";
import { Commentary } from "@/components/Commentary";
import { Admin } from "@/components/Admin";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useOlympicsData } from "@/lib/useOlympicsData";
import { useAdminRevealed } from "@/lib/useAdminRevealed";

export default function Home() {
  const [tab, setTab] = useState<TabKey>("ranks");
  const [recordOpen, setRecordOpen] = useState(false);
  const { revealed: adminRevealed, reveal, hide } = useAdminRevealed();
  const {
    players,
    activities,
    games,
    adjustments,
    commentary,
    loading,
    error,
    refresh,
    regenerating,
    regenerateCommentary,
  } = useOlympicsData();

  // If Admin gets hidden while it's the active tab, fall back to Ranks. Derived
  // during render (no setState-in-effect) so the view is always consistent.
  const effectiveTab: TabKey =
    tab === "admin" && !adminRevealed ? "ranks" : tab;

  // Long-press on the title reveals the hidden Admin tab (and jumps to it).
  function handleRevealAdmin() {
    if (adminRevealed) return;
    reveal();
    setTab("admin");
    toast.success("Admin unlocked");
  }

  function handleHideAdmin() {
    hide();
    setTab("ranks");
    toast("Admin hidden");
  }

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

        {effectiveTab === "ranks" && (
          <RanksAndStats
            players={players}
            activities={activities}
            games={games}
            adjustments={adjustments}
            loading={loading}
            onRefresh={refresh}
            onRevealAdmin={handleRevealAdmin}
          />
        )}
        {effectiveTab === "history" && (
          <History
            players={players}
            activities={activities}
            games={games}
            adjustments={adjustments}
            loading={loading}
            onRefresh={refresh}
          />
        )}
        {effectiveTab === "commentary" && (
          <Commentary
            games={games}
            commentary={commentary}
            loading={loading}
            onRefresh={refresh}
            regenerating={regenerating}
          />
        )}
        {effectiveTab === "admin" && adminRevealed && (
          <Admin
            players={players}
            games={games}
            adjustments={adjustments}
            loading={loading}
            onRefresh={refresh}
            onHideAdmin={handleHideAdmin}
          />
        )}
      </main>

      <BottomTabBar
        active={effectiveTab}
        onChange={setTab}
        onRecord={() => setRecordOpen(true)}
        adminRevealed={adminRevealed}
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
            adjustments={adjustments}
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
