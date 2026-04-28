"use client";

import { X } from "lucide-react";
import { cn } from "@canto/ui/cn";
import { Input } from "@canto/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@canto/ui/select";
import { trpc } from "@/lib/trpc/client";
import { ChipSelect, WatchProviderInput } from "./folder-form-fields";
import type { RuleCondition } from "./folder-routing-rules-ui";
import {
  CONTENT_RATINGS,
  defaultValueForField,
  EMPTY_CONDITION,
  FIELD_OPTIONS,
  OPS_BY_FIELD,
  STATUS_OPTIONS,
  ruleInputCn,
} from "./folder-routing-rules-ui";

const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "pt", label: "Portuguese" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "it", label: "Italian" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "zh", label: "Chinese" },
  { value: "ru", label: "Russian" },
  { value: "ar", label: "Arabic" },
  { value: "hi", label: "Hindi" },
  { value: "nl", label: "Dutch" },
  { value: "pl", label: "Polish" },
  { value: "sv", label: "Swedish" },
  { value: "tr", label: "Turkish" },
  { value: "th", label: "Thai" },
];

/* -------------------------------------------------------------------------- */
/*  Value input — switches on field/op                                         */
/* -------------------------------------------------------------------------- */

type Option = { value: string; label: string };

interface ConditionValueInputProps {
  condition: RuleCondition;
  onChange: (c: RuleCondition) => void;
  genreOptions: Option[];
  countryOptions: Option[];
}

function ConditionValueInput({
  condition,
  onChange,
  genreOptions,
  countryOptions,
}: ConditionValueInputProps): React.JSX.Element {
  const setValue = (value: unknown): void =>
    onChange({ ...condition, value } as unknown as RuleCondition);

  const asArrayValue = (): string[] => {
    if (Array.isArray(condition.value)) return condition.value as string[];
    return condition.value ? [String(condition.value)] : [];
  };

  switch (condition.field) {
    case "type":
      return (
        <SimpleSelect
          value={String(condition.value)}
          options={TYPE_OPTIONS}
          onChange={setValue}
        />
      );
    case "originalLanguage":
      return (
        <SimpleSelect
          value={String(condition.value)}
          options={LANGUAGE_OPTIONS}
          onChange={setValue}
          renderLabel={(l) => `${l.label} (${l.value})`}
        />
      );
    case "contentRating":
      return condition.op === "in" ? (
        <ChipSelect
          value={asArrayValue()}
          onChange={setValue}
          options={CONTENT_RATINGS}
          placeholder="Select ratings..."
        />
      ) : (
        <SimpleSelect
          value={String(condition.value)}
          options={CONTENT_RATINGS}
          onChange={setValue}
        />
      );
    case "genre":
      return (
        <ChipSelect
          value={
            Array.isArray(condition.value)
              ? (condition.value as string[])
              : []
          }
          onChange={setValue}
          options={genreOptions}
          placeholder="Select genres..."
        />
      );
    case "originCountry":
      return (
        <ChipSelect
          value={
            Array.isArray(condition.value)
              ? (condition.value as string[])
              : []
          }
          onChange={setValue}
          options={countryOptions}
          placeholder="Select countries..."
        />
      );
    case "year":
    case "runtime":
    case "voteAverage":
      return (
        <NumberValueInput
          field={condition.field}
          value={
            typeof condition.value === "number" ? condition.value : undefined
          }
          onChange={setValue}
        />
      );
    case "status":
      return condition.op === "in" ? (
        <ChipSelect
          value={asArrayValue()}
          onChange={setValue}
          options={STATUS_OPTIONS}
          placeholder="Select statuses..."
        />
      ) : (
        <SimpleSelect
          value={String(condition.value)}
          options={STATUS_OPTIONS}
          onChange={setValue}
        />
      );
    case "watchProvider":
      return (
        <WatchProviderInput
          value={condition.value as { region: string; providers: number[] }}
          onChange={setValue}
        />
      );
    default:
      return (
        <Input
          value={
            Array.isArray(condition.value)
              ? (condition.value as unknown[]).join(", ")
              : String(condition.value)
          }
          onChange={(e) =>
            setValue(
              e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            )
          }
          placeholder="value"
          className={ruleInputCn}
        />
      );
  }
}

const TYPE_OPTIONS: Option[] = [
  { value: "movie", label: "Movie" },
  { value: "show", label: "Show" },
];

interface SimpleSelectProps {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  renderLabel?: (option: Option) => string;
}

function SimpleSelect({
  value,
  options,
  onChange,
  renderLabel,
}: SimpleSelectProps): React.JSX.Element {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={cn(ruleInputCn, "w-full")}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {renderLabel ? renderLabel(o) : o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface NumberValueInputProps {
  field: "year" | "runtime" | "voteAverage";
  value: number | undefined;
  onChange: (value: number) => void;
}

function NumberValueInput({
  field,
  value,
  onChange,
}: NumberValueInputProps): React.JSX.Element {
  const placeholder =
    field === "year" ? "2024" : field === "runtime" ? "60" : "7.0";
  return (
    <Input
      type="number"
      step={field === "voteAverage" ? "0.1" : "1"}
      min={0}
      max={field === "voteAverage" ? 10 : undefined}
      value={value ?? ""}
      onChange={(e) => {
        const raw = e.target.value;
        const num = raw === "" ? 0 : Number(raw);
        if (Number.isNaN(num)) return;
        onChange(num);
      }}
      placeholder={placeholder}
      className={ruleInputCn}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*  Single condition row                                                       */
/* -------------------------------------------------------------------------- */

interface ConditionEditorProps {
  condition: RuleCondition;
  onChange: (c: RuleCondition) => void;
  onRemove: () => void;
  showHints?: boolean;
}

export function ConditionEditor({
  condition,
  onChange,
  onRemove,
  showHints = true,
}: ConditionEditorProps): React.JSX.Element {
  const ops = OPS_BY_FIELD[condition.field] ?? [];

  // Fetch dynamic data
  const { data: movieGenres } = trpc.provider.genres.useQuery({ type: "movie" });
  const { data: showGenres } = trpc.provider.genres.useQuery({ type: "show" });
  const { data: regions } = trpc.provider.filterOptions.useQuery({
    type: "regions",
  });

  const genreOptions = [
    ...new Map(
      [...(movieGenres ?? []), ...(showGenres ?? [])].map((g) => [
        g.name,
        { value: g.name, label: g.name },
      ]),
    ).values(),
  ].sort((a, b) => a.label.localeCompare(b.label));

  const countryOptions = (
    (regions ?? []) as Array<{ code: string; englishName: string }>
  )
    .map((r) => ({ value: r.code, label: `${r.englishName} (${r.code})` }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const handleFieldChange = (field: string): void => {
    const newOps = OPS_BY_FIELD[field];
    const op = newOps?.[0]?.value ?? "eq";
    const value = defaultValueForField(field);
    onChange({ field, op, value } as unknown as RuleCondition);
  };

  return (
    <>
      <div className="flex items-start gap-2">
        {/* Field selector */}
        <Select value={condition.field} onValueChange={handleFieldChange}>
          <SelectTrigger className={cn(ruleInputCn, "w-[160px] shrink-0")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FIELD_OPTIONS.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Operator */}
        {ops.length > 1 ? (
          <Select
            value={condition.op}
            onValueChange={(op) =>
              onChange({ ...condition, op } as unknown as RuleCondition)
            }
          >
            <SelectTrigger className={cn(ruleInputCn, "w-[130px] shrink-0")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ops.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="shrink-0 text-sm text-muted-foreground px-2 h-10 flex items-center">
            {ops[0]?.label ?? "is"}
          </span>
        )}

        {/* Value */}
        <div className="flex-1 min-w-0">
          <ConditionValueInput
            condition={condition}
            onChange={onChange}
            genreOptions={genreOptions}
            countryOptions={countryOptions}
          />
        </div>

        {/* Remove */}
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 rounded-lg p-2.5 text-muted-foreground hover:text-destructive hover:bg-accent transition-colors mt-0.5"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {/* Inline hint for operators that need clarification */}
      {showHints && condition.field === "genre" && (
        <p className="text-sm text-muted-foreground pl-[172px] pt-0.5">
          {condition.op === "contains_all"
            ? "The media must have every selected genre."
            : condition.op === "not_contains_any"
              ? "The media must not have any of the selected genres."
              : "The media can have any of the selected genres."}
        </p>
      )}
      {showHints && condition.field === "originCountry" && (
        <p className="text-sm text-muted-foreground pl-[172px] pt-0.5">
          {condition.op === "not_contains_any"
            ? "The media must not be from any of these countries."
            : "The media must be from at least one of these countries."}
        </p>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Condition block (AND-group with colored left bar)                          */
/* -------------------------------------------------------------------------- */

interface ConditionBlockProps {
  conditions: RuleCondition[];
  accent: "emerald" | "red";
  onChange: (next: RuleCondition[]) => void;
}

export function ConditionBlock({
  conditions,
  accent,
  onChange,
}: ConditionBlockProps): React.JSX.Element {
  const updateCondition = (i: number, c: RuleCondition): void => {
    const next = [...conditions];
    next[i] = c;
    onChange(next);
  };
  const removeCondition = (i: number): void => {
    onChange(conditions.filter((_, j) => j !== i));
  };
  const addCondition = (): void => {
    onChange([...conditions, EMPTY_CONDITION()]);
  };

  const accentCn =
    accent === "emerald"
      ? "border-l-emerald-500/40 bg-emerald-500/[0.03]"
      : "border-l-red-500/40 bg-red-500/[0.03]";

  return (
    <div
      className={cn(
        "rounded-xl border border-border border-l-[3px] p-3.5 space-y-2",
        accentCn,
      )}
    >
      {conditions.map((c, i) => (
        <ConditionEditor
          key={i}
          condition={c}
          onChange={(c) => updateCondition(i, c)}
          onRemove={() => removeCondition(i)}
          showHints={accent === "emerald"}
        />
      ))}
      <button
        type="button"
        onClick={addCondition}
        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        + Add condition
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Empty-state dashed button to seed the first condition                      */
/* -------------------------------------------------------------------------- */

interface EmptyBlockButtonProps {
  accent: "emerald" | "red";
  label: string;
  onClick: () => void;
}

export function EmptyBlockButton({
  accent,
  label,
  onClick,
}: EmptyBlockButtonProps): React.JSX.Element {
  const accentCn =
    accent === "emerald"
      ? "border-emerald-500/25 bg-emerald-500/[0.02] hover:border-emerald-500/50"
      : "border-red-500/25 bg-red-500/[0.02] hover:border-red-500/50";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-xl border border-dashed px-4 py-3 text-left text-sm text-muted-foreground hover:text-foreground transition-colors",
        accentCn,
      )}
    >
      {label}
    </button>
  );
}
