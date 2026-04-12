"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@canto/ui/button";
import { cn } from "@canto/ui/cn";
import {
  SETTINGS_REGISTRY,
  type SettingDef,
  type SettingKey,
} from "@canto/db/settings";
import type { z } from "zod";

import { trpc } from "~/lib/trpc/client";
import { FieldInput } from "./field-input";

/**
 * A stateful, registry-backed settings field.
 *
 * Reads the current value from `trpc.settings.getAll`, renders the input
 * primitive for the key's `inputType`, and persists changes via
 * `trpc.settings.setMany`. Booleans auto-save on toggle (standard UX);
 * other field types show a dirty flag + explicit Save button unless
 * `autoSave` is overridden.
 *
 * Intended to be used in two ways:
 *  - As the entire body of a settings row, inside `<SettingsGroupForm>`
 *  - Embedded inside a custom card (with `hideLabel`/`hideHelp`) when the
 *    surrounding UX already provides labeling and affordances
 */
export interface SettingFieldProps<K extends SettingKey> {
  settingKey: K;
  /** Hide the label (useful when embedding inside a custom card). */
  hideLabel?: boolean;
  /** Hide the inline help text. */
  hideHelp?: boolean;
  /** Auto-save on change instead of waiting for a Save click. Defaults to
   *  true for booleans, false otherwise. */
  autoSave?: boolean;
  /** Override the placeholder text. */
  placeholder?: string;
  /** Extra className on the outer wrapper. */
  className?: string;
}

export function SettingField<K extends SettingKey>({
  settingKey,
  hideLabel,
  hideHelp,
  autoSave,
  placeholder,
  className,
}: SettingFieldProps<K>): ReactNode {
  const def = SETTINGS_REGISTRY[settingKey] as SettingDef<z.ZodTypeAny>;

  const utils = trpc.useUtils();
  const { data: allSettings } = trpc.settings.getAll.useQuery();

  const setMany = trpc.settings.setMany.useMutation({
    onSuccess: () => {
      void utils.settings.getAll.invalidate();
      setDirty(false);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const storedValue = allSettings?.[settingKey];
  const [value, setValue] = useState<unknown>(undefined);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (storedValue !== undefined && storedValue !== null) {
      setValue(storedValue);
      setDirty(false);
      return;
    }
    if (def.default !== undefined) {
      setValue(def.default);
    }
  }, [storedValue, def.default]);

  const persist = (next: unknown): void => {
    setMany.mutate(
      { settings: [{ key: settingKey, value: next }] },
      {
        onSuccess: () => {
          toast.success(`${def.label} updated`);
        },
      },
    );
  };

  const autoSaveResolved = autoSave ?? def.inputType === "boolean";

  const handleChange = (next: unknown): void => {
    setValue(next);
    setDirty(true);
    if (autoSaveResolved) {
      persist(next);
    }
  };

  const handleSaveClick = (): void => {
    persist(value);
  };

  return (
    <div className={cn("space-y-1.5", className)}>
      {!hideLabel && (
        <div className="flex items-center justify-between gap-2">
          <label className="text-sm font-medium text-foreground">
            {def.label}
          </label>
          {def.deprecated && (
            <span
              className="rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-500"
              title={def.deprecated}
            >
              deprecated
            </span>
          )}
        </div>
      )}
      {!hideHelp && def.help && (
        <p className="text-xs text-muted-foreground">{def.help}</p>
      )}
      <div className="flex items-center gap-2">
        <div className={cn(def.inputType === "boolean" ? "" : "flex-1")}>
          <FieldInput
            inputType={def.inputType}
            value={value}
            onChange={handleChange}
            options={def.options}
            placeholder={placeholder}
            disabled={setMany.isPending}
          />
        </div>
        {!autoSaveResolved && dirty && (
          <Button
            type="button"
            size="sm"
            className="h-9 shrink-0 rounded-xl text-xs"
            onClick={handleSaveClick}
            disabled={setMany.isPending}
          >
            {setMany.isPending ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-1 h-3.5 w-3.5" />
            )}
            Save
          </Button>
        )}
      </div>
    </div>
  );
}
