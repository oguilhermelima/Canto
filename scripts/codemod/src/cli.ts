export async function runCli(_args: readonly string[]): Promise<void> {
  console.error(
    "codemod: scaffold only. Subcommands are implemented in Phase 3.",
  );
  process.exitCode = 1;
}
