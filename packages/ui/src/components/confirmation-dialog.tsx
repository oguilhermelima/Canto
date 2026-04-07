"use client";

import { useState } from "react";
import { cn } from "../lib/utils";
import { Button } from "./button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./dialog";

export interface CheckboxOption {
  id: string;
  label: string;
  description?: string;
  defaultChecked?: boolean;
}

export interface ConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  body?: React.ReactNode;
  checkboxes?: CheckboxOption[];
  onConfirm: (checkboxValues: Record<string, boolean>) => void;
  confirmLabel?: string;
  variant?: "default" | "danger";
  loading?: boolean;
  className?: string;
}

export function ConfirmationDialog({
  open,
  onOpenChange,
  title,
  description,
  body,
  checkboxes,
  onConfirm,
  confirmLabel = "Confirm",
  variant = "default",
  loading = false,
  className,
}: ConfirmationDialogProps): React.JSX.Element {
  const buildDefaults = (): Record<string, boolean> => {
    const defaults: Record<string, boolean> = {};
    for (const cb of checkboxes ?? []) {
      defaults[cb.id] = cb.defaultChecked ?? false;
    }
    return defaults;
  };

  const [values, setValues] = useState<Record<string, boolean>>(buildDefaults);

  const handleOpenChange = (nextOpen: boolean): void => {
    if (!nextOpen) {
      setValues(buildDefaults());
    }
    onOpenChange(nextOpen);
  };

  const hasBody = body != null || (checkboxes != null && checkboxes.length > 0);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(
          "max-w-md gap-0 overflow-hidden rounded-2xl border-border bg-background p-0 [&>button:last-child]:hidden",
          className,
        )}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
            {description ? (
              <DialogDescription className="mt-0.5 text-sm text-muted-foreground">
                {description}
              </DialogDescription>
            ) : (
              <DialogDescription className="sr-only">{title}</DialogDescription>
            )}
          </div>
          <button
            onClick={() => handleOpenChange(false)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-muted transition-colors hover:bg-muted/80"
          >
            <span className="text-lg leading-none text-foreground">
              &times;
            </span>
          </button>
        </div>

        {hasBody && (
          <div className="flex flex-col gap-3 p-5">
            {body}
            {checkboxes?.map((cb) => (
              <label
                key={cb.id}
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 transition-colors hover:bg-muted/50"
              >
                <input
                  type="checkbox"
                  checked={values[cb.id] ?? false}
                  onChange={(e) =>
                    setValues((prev) => ({
                      ...prev,
                      [cb.id]: e.target.checked,
                    }))
                  }
                  className="mt-0.5 rounded border-border"
                />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {cb.label}
                  </p>
                  {cb.description && (
                    <p className="text-xs text-muted-foreground">
                      {cb.description}
                    </p>
                  )}
                </div>
              </label>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className={
              variant === "danger"
                ? "bg-red-500 text-white hover:bg-red-600"
                : undefined
            }
            disabled={loading}
            onClick={() => onConfirm(values)}
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
