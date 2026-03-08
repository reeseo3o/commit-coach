import { chmod, writeFile } from "node:fs/promises";
import path from "node:path";
import ora from "ora";
import { showBrand } from "../ui/brand.js";

const HOOK_SCRIPT = `#!/usr/bin/env sh
# commit-coach hook template
# This hook prints recommendations before commit editing starts.
if command -v commit-coach >/dev/null 2>&1; then
  commit-coach msg || true
elif command -v ccoach >/dev/null 2>&1; then
  ccoach msg || true
elif command -v cc >/dev/null 2>&1; then
  cc msg || true
fi
`;

export async function runHookInstallCommand(): Promise<void> {
  await showBrand();
  const cwd = process.cwd();
  const hookPath = path.join(cwd, ".git", "hooks", "prepare-commit-msg");
  const spinner = ora("Installing git hook...").start();

  try {
    await writeFile(hookPath, HOOK_SCRIPT, "utf8");
    await chmod(hookPath, 0o755);
    spinner.succeed(`Installed hook at ${hookPath}`);
  } catch (error) {
    spinner.fail(error instanceof Error ? error.message : "Failed to install hook.");
    process.exitCode = 1;
  }
}
