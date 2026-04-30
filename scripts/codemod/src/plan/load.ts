import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { planSchema  } from "./schema.ts";
import type {CodemodPlan} from "./schema.ts";

export function loadPlan(planPath: string): CodemodPlan {
  const absolutePath = resolve(planPath);
  const raw = readFileSync(absolutePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  const result = planSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid plan at ${absolutePath}:\n${issues}`);
  }
  return result.data;
}

export function defaultPlanPath(): string {
  return resolve(import.meta.dirname, "sample.json");
}
