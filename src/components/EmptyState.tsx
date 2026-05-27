"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Consistent empty / placeholder block used across all five views (CLAUDE.md
 * §5 polish: empty states). Centered icon + title + optional hint and action.
 */
export function EmptyState({
  icon,
  title,
  hint,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 py-12 text-center",
        className,
      )}
    >
      {icon && <div className="text-muted-foreground/60">{icon}</div>}
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      {hint && (
        <p className="max-w-xs text-xs text-muted-foreground/80">{hint}</p>
      )}
      {action}
    </div>
  );
}
