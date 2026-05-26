"use client";

import { Trophy, PlusCircle, History, BarChart3, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

export type TabKey = "leaderboard" | "record" | "history" | "stats" | "commentary";

const TABS: { key: TabKey; label: string; Icon: typeof Trophy }[] = [
  { key: "leaderboard", label: "Ranks", Icon: Trophy },
  { key: "record", label: "Record", Icon: PlusCircle },
  { key: "history", label: "History", Icon: History },
  { key: "stats", label: "Stats", Icon: BarChart3 },
  { key: "commentary", label: "Buzz", Icon: MessageSquare },
];

export function BottomTabBar({
  active,
  onChange,
}: {
  active: TabKey;
  onChange: (key: TabKey) => void;
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <ul className="mx-auto flex max-w-[480px] items-stretch justify-around">
        {TABS.map(({ key, label, Icon }) => {
          const isActive = key === active;
          return (
            <li key={key} className="flex-1">
              <button
                type="button"
                onClick={() => onChange(key)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex h-16 w-full flex-col items-center justify-center gap-1 text-xs transition-colors",
                  isActive
                    ? "text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className={cn("size-5", isActive && "scale-110")} />
                <span>{label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
