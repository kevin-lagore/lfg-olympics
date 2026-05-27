"use client";

import { Trophy, History, MessageSquare, Plus, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Navigable tabs (V6, CLAUDE.md §5/§6): three nav tabs by default, plus a hidden
 * "admin" tab revealed via a long-press on the title. "Record" is NOT a tab —
 * it's the raised central action button rendered separately below.
 */
export type TabKey = "ranks" | "history" | "commentary" | "admin";

const TABS: { key: TabKey; label: string; Icon: typeof Trophy }[] = [
  { key: "ranks", label: "Ranks & Stats", Icon: Trophy },
  { key: "history", label: "History", Icon: History },
  { key: "commentary", label: "Buzz", Icon: MessageSquare },
];

const ADMIN_TAB = { key: "admin" as const, label: "Admin", Icon: Settings };

export function BottomTabBar({
  active,
  onChange,
  onRecord,
  adminRevealed,
}: {
  active: TabKey;
  onChange: (key: TabKey) => void;
  /** Opens the Record Result modal (View 2 is no longer a tab). */
  onRecord: () => void;
  /** When true, the secret Admin tab is shown after the Buzz tab. */
  adminRevealed: boolean;
}) {
  // Two nav tabs left of the Record button, the rest to the right, so the raised
  // + button stays visually centred. The Admin tab (when revealed) joins the
  // right group: 2 left + 2 right.
  const tabs = adminRevealed ? [...TABS, ADMIN_TAB] : TABS;
  const left = tabs.slice(0, 2);
  const right = tabs.slice(2);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t-2 border-primary/10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <ul className="relative mx-auto flex max-w-[480px] items-stretch">
        {left.map((t) => (
          <TabButton
            key={t.key}
            label={t.label}
            Icon={t.Icon}
            active={active === t.key}
            onClick={() => onChange(t.key)}
          />
        ))}

        {/* Central raised Record action button */}
        <li className="flex w-20 shrink-0 items-start justify-center">
          <button
            type="button"
            onClick={onRecord}
            aria-label="Record a result"
            className={cn(
              "lfg-press lfg-wiggle -mt-6 flex size-16 flex-col items-center justify-center gap-0.5",
              "rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-background",
              "transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40",
            )}
          >
            <Plus className="size-7" strokeWidth={3} />
            <span className="text-[0.6rem] font-bold leading-none">Record</span>
          </button>
        </li>

        {right.map((t) => (
          <TabButton
            key={t.key}
            label={t.label}
            Icon={t.Icon}
            active={active === t.key}
            onClick={() => onChange(t.key)}
          />
        ))}
      </ul>
    </nav>
  );
}

function TabButton({
  label,
  Icon,
  active,
  onClick,
}: {
  label: string;
  Icon: typeof Trophy;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <li className="flex-1">
      <button
        type="button"
        onClick={onClick}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex h-16 w-full flex-col items-center justify-center gap-1 px-1 text-[0.7rem] font-semibold transition-colors",
          active
            ? "text-primary"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Icon className={cn("size-5 transition-transform", active && "scale-110")} />
        <span className="truncate">{label}</span>
      </button>
    </li>
  );
}
