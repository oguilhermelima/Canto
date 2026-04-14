"use client";

import Link from "next/link";
import { cn } from "@canto/ui/cn";
import { ChevronRight } from "lucide-react";
import { MANAGE_SECTIONS, type ManageSectionGroup } from "./manage-config";

/* ─── Desktop Sidebar ─── */

function SidebarGroup({ group, activeSection }: { group: ManageSectionGroup; activeSection: string }): React.JSX.Element {
  return (
    <div>
      <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {group.groupLabel}
      </p>
      <div className="space-y-0.5">
        {group.items.map((item) => {
          const active = activeSection === item.key;
          const Icon = item.icon;
          return (
            <Link
              key={item.key}
              href={`/manage?section=${item.key}`}
              scroll={false}
              replace
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function ManageSidebar({ activeSection }: { activeSection: string }): React.JSX.Element {
  return (
    <nav className="hidden md:block">
      <div className="sticky top-24 space-y-6">
        {MANAGE_SECTIONS.map((group) => (
          <SidebarGroup key={group.groupLabel} group={group} activeSection={activeSection} />
        ))}
      </div>
    </nav>
  );
}

/* ─── Mobile List ─── */

export function ManageMobileList(): React.JSX.Element {
  return (
    <div className="space-y-6 md:hidden">
      {MANAGE_SECTIONS.map((group) => (
        <div key={group.groupLabel}>
          <p className="mb-2 px-1 text-xs font-semibold text-muted-foreground">
            {group.groupLabel}
          </p>
          <div className="overflow-hidden rounded-2xl border border-border/40">
            {group.items.map((item, i) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.key}
                  href={`/manage?section=${item.key}`}
                  className={cn(
                    "flex items-center gap-3.5 px-4 py-3.5 transition-colors active:bg-muted/50",
                    i > 0 && "border-t border-border/40",
                  )}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted/60">
                    <Icon className="h-4 w-4 text-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
