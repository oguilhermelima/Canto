#!/usr/bin/env tsx
import { runCli } from "../src/cli.ts";

await runCli(process.argv.slice(2));
