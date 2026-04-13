"use client";

import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { Check, Monitor, Sun, Moon } from "lucide-react";
import { cn } from "@canto/ui/cn";
import { SettingsSection } from "~/components/settings/shared";

const themeOptions = [
  {
    value: "light",
    label: "Light",
    description: "Clean and bright interface",
    icon: Sun,
    preview: { bg: "#ffffff", sidebar: "#f5f5f5", accent: "#e5e5e5", fg: "#0a0a0a", border: "#e5e5e5" },
  },
  {
    value: "dark",
    label: "Dark",
    description: "Easy on the eyes",
    icon: Moon,
    preview: { bg: "#0a0a0a", sidebar: "#111111", accent: "#1c1c1c", fg: "#fafafa", border: "#262626" },
  },
  {
    value: "system",
    label: "System",
    description: "Follow your OS setting",
    icon: Monitor,
    preview: null,
  },
] as const;

/** Tiny interface mockup rendered in the theme's colors. */
function ThemePreview({
  colors,
}: {
  colors: { bg: string; sidebar: string; accent: string; fg: string; border: string };
}): React.JSX.Element {
  return (
    <div
      className="flex aspect-[16/10] w-full overflow-hidden rounded-xl border"
      style={{ background: colors.bg, borderColor: colors.border }}
    >
      {/* Sidebar */}
      <div className="flex w-[30%] shrink-0 flex-col gap-[5px] p-2 pt-3" style={{ background: colors.sidebar }}>
        <div className="h-[4px] w-full rounded-full" style={{ background: colors.fg, opacity: 0.12 }} />
        <div className="h-[4px] w-3/4 rounded-full" style={{ background: colors.fg, opacity: 0.08 }} />
        <div className="h-[4px] w-1/2 rounded-full" style={{ background: colors.fg, opacity: 0.08 }} />
      </div>
      {/* Content */}
      <div className="flex flex-1 flex-col gap-1.5 p-2 pt-3">
        <div className="h-[5px] w-2/3 rounded-full" style={{ background: colors.fg, opacity: 0.15 }} />
        <div className="flex gap-1 pt-0.5">
          <div className="h-[14px] w-[14px] rounded-[3px]" style={{ background: colors.accent }} />
          <div className="h-[14px] w-[14px] rounded-[3px]" style={{ background: colors.accent }} />
          <div className="h-[14px] w-[14px] rounded-[3px]" style={{ background: colors.accent }} />
        </div>
      </div>
    </div>
  );
}

/** System preview shows a split light/dark mockup. */
function SystemPreview(): React.JSX.Element {
  return (
    <div className="relative flex aspect-[16/10] w-full overflow-hidden rounded-xl border border-[#888]">
      {/* Light half */}
      <div className="flex w-1/2 flex-col" style={{ background: "#ffffff" }}>
        <div className="flex flex-1 flex-col gap-[5px] p-2 pt-3" style={{ background: "#f5f5f5" }}>
          <div className="h-[4px] w-full rounded-full" style={{ background: "#0a0a0a", opacity: 0.12 }} />
          <div className="h-[4px] w-3/4 rounded-full" style={{ background: "#0a0a0a", opacity: 0.08 }} />
        </div>
      </div>
      {/* Dark half */}
      <div className="flex w-1/2 flex-col" style={{ background: "#0a0a0a" }}>
        <div className="flex flex-1 flex-col gap-[5px] p-2 pt-3" style={{ background: "#111111" }}>
          <div className="h-[4px] w-full rounded-full" style={{ background: "#fafafa", opacity: 0.12 }} />
          <div className="h-[4px] w-3/4 rounded-full" style={{ background: "#fafafa", opacity: 0.08 }} />
        </div>
      </div>
    </div>
  );
}

export function AppearanceSection(): React.JSX.Element {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <SettingsSection title="Appearance" description="Choose a theme for the interface.">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {themeOptions.map(({ value, label, description: desc, icon: Icon, preview }) => {
          const selected = mounted && theme === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setTheme(value)}
              className={cn(
                "relative flex flex-col gap-3 rounded-2xl border p-3 text-left transition-all",
                selected
                  ? "border-foreground/20 bg-accent ring-1 ring-foreground/10"
                  : "border-border/50 bg-muted/20 hover:bg-accent/50",
              )}
            >
              {selected && (
                <div className="absolute right-2.5 top-2.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-foreground">
                  <Check className="h-3 w-3 text-background" />
                </div>
              )}
              {preview ? <ThemePreview colors={preview} /> : <SystemPreview />}
              <div className="flex items-center gap-2 px-0.5">
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <span className="block text-sm font-medium text-foreground">{label}</span>
                  <span className="block text-xs text-muted-foreground">{desc}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </SettingsSection>
  );
}
