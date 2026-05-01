"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@canto/ui/button";
import { Input } from "@canto/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@canto/ui/select";
import {
  
  
  
  DEFAULT_FORMAT_ROW,
  QUALITY_OPTIONS,
  SOURCE_OPTIONS
} from "./download-profile-defaults";
import type {AllowedFormat, Quality, Source} from "./download-profile-defaults";

interface DownloadProfileFormatsFieldProps {
  value: AllowedFormat[];
  onChange: (v: AllowedFormat[]) => void;
}

export function DownloadProfileFormatsField({
  value,
  onChange,
}: DownloadProfileFormatsFieldProps): React.JSX.Element {
  const updateRow = (i: number, patch: Partial<AllowedFormat>): void => {
    const current = value[i];
    if (!current) return;
    const next = [...value];
    next[i] = { ...current, ...patch };
    onChange(next);
  };

  const removeRow = (i: number): void => {
    onChange(value.filter((_, idx) => idx !== i));
  };

  const addRow = (): void => {
    onChange([...value, { ...DEFAULT_FORMAT_ROW }]);
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label className="text-xs font-medium text-muted-foreground">
          Allowed formats
        </label>
        <Button variant="ghost" size="sm" onClick={addRow}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add format
        </Button>
      </div>
      <div className="space-y-2">
        {value.map((row, i) => (
          <div
            key={i}
            className="grid grid-cols-[1fr_1fr_auto_auto] items-center gap-2 rounded-xl bg-muted/30 p-2"
          >
            <Select
              value={row.quality}
              onValueChange={(v) => updateRow(i, { quality: v as Quality })}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {QUALITY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={row.source}
              onValueChange={(v) => updateRow(i, { source: v as Source })}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              min={0}
              max={100}
              value={row.weight}
              onChange={(e) =>
                updateRow(i, {
                  weight: Math.max(
                    0,
                    Math.min(100, parseInt(e.target.value, 10) || 0),
                  ),
                })
              }
              className="h-9 w-20 tabular-nums"
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => removeRow(i)}
              disabled={value.length === 1}
              aria-label="Remove format"
            >
              <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Higher weight = stronger preference. Recommended: 30 baseline, 45 top
        preference.
      </p>
    </div>
  );
}
