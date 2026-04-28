"use client";

import { useEffect, useState } from "react";
import { Button } from "@canto/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@canto/ui/dialog";
import { RuleCard } from "./folder-rule-card";
import type {
  RoutingRules,
  UIRule,
  UIRules,
} from "./folder-routing-rules-ui";
import {
  cloneCondition,
  EMPTY_RULE,
  randomId,
  rulesToUI,
  uiToRules,
} from "./folder-routing-rules-ui";

/* -------------------------------------------------------------------------- */
/*  Rules editor                                                               */
/* -------------------------------------------------------------------------- */

interface RulesEditorProps {
  value: UIRules;
  onChange: (next: UIRules) => void;
}

function RulesEditor({ value, onChange }: RulesEditorProps): React.JSX.Element {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  const toggleCollapse = (id: string): void => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const updateRule = (idx: number, next: UIRule): void => {
    const rules = [...value.rules];
    rules[idx] = next;
    onChange({ rules });
  };

  const removeRule = (idx: number): void => {
    const removed = value.rules[idx];
    const rules = value.rules.filter((_, i) => i !== idx);
    if (removed) {
      setCollapsedIds((prev) => {
        if (!prev.has(removed.id)) return prev;
        const next = new Set(prev);
        next.delete(removed.id);
        return next;
      });
    }
    onChange({ rules: rules.length === 0 ? [EMPTY_RULE()] : rules });
  };

  const duplicateRule = (idx: number): void => {
    const original = value.rules[idx];
    if (!original) return;
    const clone: UIRule = {
      id: randomId(),
      include: original.include.map(cloneCondition),
      exclude: original.exclude.map(cloneCondition),
    };
    const rules = [...value.rules];
    rules.splice(idx + 1, 0, clone);
    onChange({ rules });
  };

  const addRule = (): void => {
    onChange({ rules: [...value.rules, EMPTY_RULE()] });
  };

  return (
    <div className="space-y-4">
      {value.rules.map((r, i) => (
        <div key={r.id} className="space-y-4">
          {i > 0 && (
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border/30" />
              <span className="rounded-md bg-amber-500/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-400">
                or
              </span>
              <div className="h-px flex-1 bg-border/30" />
            </div>
          )}
          <RuleCard
            rule={r}
            index={i}
            total={value.rules.length}
            collapsed={collapsedIds.has(r.id)}
            onChange={(n) => updateRule(i, n)}
            onRemove={() => removeRule(i)}
            onDuplicate={() => duplicateRule(i)}
            onToggleCollapse={() => toggleCollapse(r.id)}
          />
        </div>
      ))}
      <button
        type="button"
        onClick={addRule}
        className="w-full rounded-xl border border-dashed border-border/60 bg-muted/5 px-4 py-3 text-sm text-muted-foreground hover:border-primary/40 hover:bg-primary/[0.03] hover:text-foreground transition-colors"
      >
        + Add another rule
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Rules editor dialog                                                        */
/* -------------------------------------------------------------------------- */

interface RulesEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rules: RoutingRules | null;
  onSave: (rules: RoutingRules | null) => void;
}

export function RulesEditorDialog({
  open,
  onOpenChange,
  rules,
  onSave,
}: RulesEditorDialogProps): React.JSX.Element {
  const [draft, setDraft] = useState<UIRules>(() => rulesToUI(rules));

  useEffect(() => {
    if (open) setDraft(rulesToUI(rules));
  }, [open, rules]);

  const hasAny = draft.rules.some(
    (r) => r.include.length > 0 || r.exclude.length > 0,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85vh] max-h-[780px] max-w-2xl flex-col gap-0 p-0">
        <DialogHeader bar>
          <DialogTitle>Auto-routing Rules</DialogTitle>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Route a download here when any rule matches. Each rule: include
            conditions (all required) and optional exclude conditions.
          </p>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <RulesEditor value={draft} onChange={setDraft} />
        </div>

        <div className="flex shrink-0 items-center justify-between border-t border-border px-6 py-4">
          <Button
            variant="ghost"
            className="rounded-xl text-muted-foreground"
            onClick={() => {
              onSave(null);
              onOpenChange(false);
            }}
          >
            Clear rules
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              className="rounded-xl"
              onClick={() => {
                onSave(hasAny ? uiToRules(draft) : null);
                onOpenChange(false);
              }}
            >
              Save rules
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
