import { resolve } from "node:path";

import type { CodemodPlan } from "./plan/schema.ts";
import { loadPlan, defaultPlanPath } from "./plan/load.ts";

export interface CodemodContextInit {
  repoRoot: string;
  planPath?: string;
  dry: boolean;
  apply: boolean;
  yes: boolean;
}

export interface CodemodContext {
  readonly repoRoot: string;
  readonly planPath: string;
  readonly plan: CodemodPlan;
  readonly dry: boolean;
  readonly apply: boolean;
  readonly yes: boolean;
}

export function createContext(init: CodemodContextInit): CodemodContext {
  const repoRoot = resolve(init.repoRoot);
  const planPath = init.planPath ? resolve(init.planPath) : defaultPlanPath();
  const plan = loadPlan(planPath);
  return { repoRoot, planPath, plan, dry: init.dry, apply: init.apply, yes: init.yes };
}
