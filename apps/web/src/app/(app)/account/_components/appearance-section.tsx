"use client";

import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { Monitor, Sun, Moon } from "lucide-react";
import { cn } from "@canto/ui/cn";
import { SettingsSection } from "~/components/settings/shared";

const themeOptions = [
  { value: "light", label: "Light", description: "Clean and bright interface", icon: Sun },
  { value: "dark", label: "Dark", description: "Easy on the eyes", icon: Moon },
  { value: "system", label: "System", description: "Follow your OS setting", icon: Monitor },
] as const;

export function AppearanceSection(): React.JSX.Element {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <SettingsSection title="Appearance" description="Choose a theme for the interface.">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {themeOptions.map(({ value, label, description: desc, icon: Icon }) => (
          <button
            key={value}
            type="button"
            onClick={() => setTheme(value)}
            className={cn(
              "flex flex-col items-center gap-2.5 rounded-xl border p-5 transition-all",
              mounted && theme === value
                ? "border-primary bg-primary/5 text-foreground ring-1 ring-primary/20"
                : "border-border/60 text-muted-foreground hover:border-foreground/20 hover:text-foreground",
            )}
          >
            <Icon className="h-5 w-5" />
            <div className="text-center">
              <span className="block text-sm font-medium">{label}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{desc}</span>
            </div>
          </button>
        ))}
      </div>
    </SettingsSection>
  );
}
