"use client";

import { Fragment } from "react";
import type { RoutingRules } from "./folder-routing-rules-ui";
import { describeCondition } from "./folder-routing-rules-ui";

interface FolderRulesPreviewProps {
  rules: RoutingRules;
}

export function FolderRulesPreview({
  rules,
}: FolderRulesPreviewProps): React.JSX.Element {
  if (rules.rules.length === 0) return <></>;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {rules.rules.map((rule, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-400">
              or
            </span>
          )}
          {rule.include.map((c, j) => (
            <span
              key={`i-${j}`}
              className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-300"
            >
              {describeCondition(c)}
            </span>
          ))}
          {rule.exclude && rule.exclude.length > 0 && (
            <>
              <span className="text-[11px] text-muted-foreground">except</span>
              {rule.exclude.map((c, j) => (
                <span
                  key={`e-${j}`}
                  className="rounded-md bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-300"
                >
                  {describeCondition(c)}
                </span>
              ))}
            </>
          )}
        </Fragment>
      ))}
    </div>
  );
}
