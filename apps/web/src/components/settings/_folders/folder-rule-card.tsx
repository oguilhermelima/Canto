"use client";

import { ChevronDown, Copy, Trash2 } from "lucide-react";
import { cn } from "@canto/ui/cn";
import { AnimatedCollapse } from "./folder-animated-collapse";
import {
  ConditionBlock,
  EmptyBlockButton,
} from "./folder-condition-editor";
import type { UIRule } from "./folder-routing-rules-ui";
import { describeCondition, EMPTY_CONDITION } from "./folder-routing-rules-ui";

/* -------------------------------------------------------------------------- */
/*  Compact chip row summarizing a rule for the collapsed state                */
/* -------------------------------------------------------------------------- */

interface RuleSummaryProps {
  rule: UIRule;
}

function RuleSummary({ rule }: RuleSummaryProps): React.JSX.Element {
  const hasInclude = rule.include.length > 0;
  const hasExclude = rule.exclude.length > 0;

  if (!hasInclude && !hasExclude) {
    return (
      <span className="truncate text-sm italic text-muted-foreground">
        Empty rule
      </span>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
      {rule.include.map((c, i) => (
        <span
          key={`i-${i}`}
          className="shrink-0 rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-300"
        >
          {describeCondition(c)}
        </span>
      ))}
      {hasExclude && (
        <>
          <span className="shrink-0 text-xs text-muted-foreground">except</span>
          {rule.exclude.map((c, i) => (
            <span
              key={`e-${i}`}
              className="shrink-0 rounded-md bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-300"
            >
              {describeCondition(c)}
            </span>
          ))}
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  One rule = Include (required) + Exclude (optional)                         */
/* -------------------------------------------------------------------------- */

interface RuleCardProps {
  rule: UIRule;
  index: number;
  total: number;
  collapsed: boolean;
  onChange: (next: UIRule) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onToggleCollapse: () => void;
}

export function RuleCard({
  rule,
  index,
  total,
  collapsed,
  onChange,
  onRemove,
  onDuplicate,
  onToggleCollapse,
}: RuleCardProps): React.JSX.Element {
  return (
    <div className="rounded-2xl border border-border bg-muted/10 p-5">
      {/* Rule header */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
          aria-expanded={!collapsed}
        >
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              collapsed && "-rotate-90",
            )}
          />
          <span className="shrink-0 rounded-md bg-primary/10 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-primary">
            Rule {index + 1}
          </span>
          {collapsed && (
            <div className="min-w-0 flex-1 overflow-hidden">
              <RuleSummary rule={rule} />
            </div>
          )}
        </button>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={onDuplicate}
            title="Duplicate this rule"
            className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <Copy className="h-4 w-4" />
          </button>
          {total > 1 && (
            <button
              type="button"
              onClick={onRemove}
              title="Remove this rule"
              className="rounded-lg p-1.5 text-muted-foreground hover:text-destructive hover:bg-accent transition-colors"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Collapsible body */}
      <AnimatedCollapse open={!collapsed}>
        <div className="space-y-4 pt-4">
          {/* Include */}
          <div className="space-y-2">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
              Include — all must match
            </h4>
            {rule.include.length === 0 ? (
              <EmptyBlockButton
                accent="emerald"
                label="+ Add the first include condition"
                onClick={() =>
                  onChange({ ...rule, include: [EMPTY_CONDITION()] })
                }
              />
            ) : (
              <ConditionBlock
                conditions={rule.include}
                accent="emerald"
                onChange={(c) => onChange({ ...rule, include: c })}
              />
            )}
          </div>

          {/* Exclude */}
          <div className="space-y-2">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-red-400">
              Exclude — all must match
              <span className="ml-1.5 font-normal normal-case tracking-normal text-muted-foreground">
                (optional)
              </span>
            </h4>
            {rule.exclude.length === 0 ? (
              <EmptyBlockButton
                accent="red"
                label="+ Add an exclusion"
                onClick={() =>
                  onChange({ ...rule, exclude: [EMPTY_CONDITION()] })
                }
              />
            ) : (
              <ConditionBlock
                conditions={rule.exclude}
                accent="red"
                onChange={(c) => onChange({ ...rule, exclude: c })}
              />
            )}
          </div>
        </div>
      </AnimatedCollapse>
    </div>
  );
}
