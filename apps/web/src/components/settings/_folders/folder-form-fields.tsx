"use client";

import { useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import { cn } from "@canto/ui/cn";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@canto/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@canto/ui/select";
import { trpc } from "@/lib/trpc/client";
import { ruleInputCn } from "./folder-routing-rules-ui";

/* -------------------------------------------------------------------------- */
/*  Multi-select chip input                                                    */
/* -------------------------------------------------------------------------- */

interface ChipSelectProps {
  value: string[];
  onChange: (value: string[]) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
}

export function ChipSelect({
  value,
  onChange,
  options,
  placeholder,
}: ChipSelectProps): React.JSX.Element {
  const [open, setOpen] = useState(false);

  const toggle = (v: string): void => {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  };

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <div
          role="button"
          tabIndex={0}
          className={cn(
            "flex min-h-[40px] w-full cursor-pointer items-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-left text-sm transition-colors hover:bg-accent/80",
            value.length === 0 && "text-muted-foreground",
          )}
        >
          {value.length === 0 ? (
            <span>{placeholder ?? "Select..."}</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {value.map((v) => (
                <span
                  key={v}
                  className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                >
                  {options.find((o) => o.value === v)?.label ?? v}
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle(v);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.stopPropagation();
                        toggle(v);
                      }
                    }}
                    className="hover:text-destructive transition-colors cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[240px] p-0"
        onWheel={(e) => e.stopPropagation()}
      >
        <div
          className="max-h-[240px] overflow-y-auto p-1.5"
          onWheel={(e) => {
            e.stopPropagation();
            e.currentTarget.scrollTop += e.deltaY;
          }}
        >
          {options.map((opt) => {
            const selected = value.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggle(opt.value)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                  selected
                    ? "bg-primary/5 text-foreground"
                    : "text-foreground hover:bg-accent",
                )}
              >
                <div
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-muted-foreground",
                  )}
                >
                  {selected && <Check className="h-2.5 w-2.5" />}
                </div>
                {opt.label}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* -------------------------------------------------------------------------- */
/*  Watch provider input (region + providers)                                 */
/* -------------------------------------------------------------------------- */

interface WatchProviderInputProps {
  value: { region: string; providers: number[] };
  onChange: (v: { region: string; providers: number[] }) => void;
}

export function WatchProviderInput({
  value,
  onChange,
}: WatchProviderInputProps): React.JSX.Element {
  const { data: regionsRaw } = trpc.provider.filterOptions.useQuery(
    { type: "regions" },
    { staleTime: Infinity, gcTime: 24 * 60 * 60 * 1000 },
  );
  const { data: movieProvidersRaw } = trpc.provider.filterOptions.useQuery(
    { type: "watchProviders", mediaType: "movie", region: value.region },
    { staleTime: Infinity, gcTime: 24 * 60 * 60 * 1000, enabled: !!value.region },
  );
  const { data: showProvidersRaw } = trpc.provider.filterOptions.useQuery(
    { type: "watchProviders", mediaType: "show", region: value.region },
    { staleTime: Infinity, gcTime: 24 * 60 * 60 * 1000, enabled: !!value.region },
  );

  const regionOptions = useMemo(() => {
    const list = (regionsRaw ?? []) as Array<{
      code: string;
      englishName: string;
    }>;
    return list
      .map((r) => ({ value: r.code, label: `${r.englishName} (${r.code})` }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [regionsRaw]);

  const providerOptions = useMemo(() => {
    const map = new Map<number, { value: string; label: string }>();
    const pushAll = (list: unknown): void => {
      for (const p of (list ?? []) as Array<{
        providerId: number;
        providerName: string;
      }>) {
        if (!map.has(p.providerId)) {
          map.set(p.providerId, {
            value: String(p.providerId),
            label: p.providerName,
          });
        }
      }
    };
    pushAll(movieProvidersRaw);
    pushAll(showProvidersRaw);
    return Array.from(map.values()).sort((a, b) =>
      a.label.localeCompare(b.label),
    );
  }, [movieProvidersRaw, showProvidersRaw]);

  return (
    <div className="flex w-full flex-col gap-2">
      <Select
        value={value.region}
        onValueChange={(region) => onChange({ region, providers: [] })}
      >
        <SelectTrigger className={cn(ruleInputCn, "w-full")}>
          <SelectValue placeholder="Region" />
        </SelectTrigger>
        <SelectContent>
          {regionOptions.map((r) => (
            <SelectItem key={r.value} value={r.value}>
              {r.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <ChipSelect
        value={value.providers.map(String)}
        onChange={(v) =>
          onChange({ region: value.region, providers: v.map(Number) })
        }
        options={providerOptions}
        placeholder={
          value.region ? "Select streaming services..." : "Pick a region first"
        }
      />
    </div>
  );
}
