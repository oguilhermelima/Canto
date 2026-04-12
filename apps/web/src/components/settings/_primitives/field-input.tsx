"use client";

import type { ReactNode } from "react";

import { Input } from "@canto/ui/input";
import { PasswordInput } from "@canto/ui/password-input";
import { Switch } from "@canto/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@canto/ui/select";
import { cn } from "@canto/ui/cn";
import type {
  SettingInputType,
  SettingSelectOption,
} from "@canto/db/settings-registry";

export interface FieldInputProps {
  inputType: SettingInputType;
  value: unknown;
  onChange: (value: unknown) => void;
  options?: readonly SettingSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Pure presentational input that switches on the registry's `inputType`.
 * Holds no state and has no tRPC coupling — wrap it with `<SettingField>`
 * for the persisted-setting path, or use it standalone in custom forms.
 */
export function FieldInput({
  inputType,
  value,
  onChange,
  options,
  placeholder,
  disabled,
  className,
}: FieldInputProps): ReactNode {
  switch (inputType) {
    case "text":
    case "url":
      return (
        <Input
          variant="ghost"
          type={inputType === "url" ? "url" : "text"}
          value={typeof value === "string" ? value : ""}
          placeholder={placeholder}
          disabled={disabled}
          className={className}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "password":
      return (
        <PasswordInput
          variant="ghost"
          value={typeof value === "string" ? value : ""}
          placeholder={placeholder}
          disabled={disabled}
          className={className}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "number":
      return (
        <Input
          variant="ghost"
          type="number"
          value={typeof value === "number" ? String(value) : ""}
          placeholder={placeholder}
          disabled={disabled}
          className={className}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "") {
              onChange(null);
              return;
            }
            const parsed = Number(raw);
            onChange(Number.isNaN(parsed) ? null : parsed);
          }}
        />
      );

    case "boolean":
      return (
        <Switch
          checked={value === true}
          disabled={disabled}
          className={className}
          onCheckedChange={onChange}
        />
      );

    case "select":
      return (
        <Select
          value={typeof value === "string" ? value : ""}
          disabled={disabled}
          onValueChange={onChange}
        >
          <SelectTrigger
            className={cn(
              "h-10 rounded-xl border-none bg-accent text-sm text-foreground/80 focus:ring-0 focus:ring-offset-0",
              className,
            )}
          >
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {(options ?? []).map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    default: {
      const _exhaustive: never = inputType;
      return _exhaustive;
    }
  }
}
