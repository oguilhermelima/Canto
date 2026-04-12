"use client";

import type { ReactNode } from "react";

import { cn } from "@canto/ui/cn";
import {
  SETTINGS_REGISTRY
  
} from "@canto/db/settings-registry";
import type {SettingKey} from "@canto/db/settings-registry";

import { SettingField } from "./setting-field";

export interface SettingsGroupFormProps {
  /**
   * Group prefix to match against each registry entry's `group` field.
   * A key is included when its group equals the prefix OR starts with
   * `${prefix}.` (so nested sub-groups are included by default).
   */
  groupPrefix: string;
  /** Keys to skip (e.g. a field rendered elsewhere in a custom layout). */
  exclude?: readonly SettingKey[];
  /** Extra className on the outer wrapper. */
  className?: string;
}

/**
 * Iterates the settings registry and renders a `<SettingField>` per
 * visible key that matches the given group prefix. Hidden keys (those
 * marked `hidden: true` in the registry) are always skipped. The key
 * order is the declaration order of `SETTINGS_REGISTRY`.
 */
export function SettingsGroupForm({
  groupPrefix,
  exclude,
  className,
}: SettingsGroupFormProps): ReactNode {
  const excludeSet = new Set(exclude ?? []);
  const keys = (Object.keys(SETTINGS_REGISTRY) as SettingKey[]).filter(
    (key) => {
      if (excludeSet.has(key)) return false;
      const def = SETTINGS_REGISTRY[key];
      if (def.hidden) return false;
      return (
        def.group === groupPrefix || def.group.startsWith(`${groupPrefix}.`)
      );
    },
  );

  if (keys.length === 0) return null;

  return (
    <div className={cn("space-y-5", className)}>
      {keys.map((key) => (
        <SettingField key={key} settingKey={key} />
      ))}
    </div>
  );
}
