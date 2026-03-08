#!/usr/bin/env node
import { Command } from "commander";
import { runMsgCommand } from "./commands/msg.js";
import { runPrCommand } from "./commands/pr.js";
import chalk from "chalk";
import { runConfigInitCommand, runConfigSetCommand } from "./commands/config.js";
import { runHookInstallCommand } from "./commands/hook.js";
import { hasAnyUserConfig } from "./core/config.js";

const program = new Command();

program
  .name("commit-coach")
  .description("commit-coach: AI-powered commit/PR message helper")
  .option("--brand", "Show branded banner output", true)
  .option("--no-brand", "Hide branded banner output")
  .option("--theme <theme>", "Brand color theme (ocean|sunset|forest)")
  .version("0.1.0");

program.hook("preAction", async (thisCommand) => {
  const opts = thisCommand.opts<{ brand?: boolean; theme?: string }>();
  process.env.COMMIT_COACH_BRAND = opts.brand === false ? "0" : "1";
  if (opts.theme) {
    process.env.COMMIT_COACH_THEME = opts.theme;
  }

  const commandName = thisCommand.name();
  const skipOnboarding = process.env.COMMIT_COACH_SKIP_ONBOARDING === "1";
  const isHelpInvocation = process.argv.includes("-h") || process.argv.includes("--help");
  const needsConfig = new Set(["msg", "pr"]);

  if (!needsConfig.has(commandName) || skipOnboarding || isHelpInvocation) {
    return;
  }

  const hasUserConfig = await hasAnyUserConfig(process.cwd());
  if (!hasUserConfig) {
    console.log(chalk.yellow("설정이 없습니다. 먼저 'ccm init'을 실행해주세요."));
    console.log(chalk.dim("  $ ccm init\n"));
    process.exitCode = 1;
    process.exit();
  }
});

program
  .command("msg")
  .description("Generate commit message candidates from staged diff")
  .option("--lang <lang>", "Output language (ko|en)")
  .option("--style <style>", "Commit style (conventional|simple)")
  .option("--max <number>", "Max subject length")
  .option("--verbose", "Show generation source details")
  .action(runMsgCommand);

program
  .command("pr")
  .description("Generate PR title/body from branch diff")
  .option("--base <branch>", "Base branch", "main")
  .option("--lang <lang>", "Output language (ko|en)")
  .option("--verbose", "Show generation source details")
  .action(runPrCommand);

program
  .command("init")
  .description("Run first-time setup wizard")
  .option("-g, --global", "Use global config file (~/.commit-coach.json)")
  .option("--defaults", "Skip interactive setup and use defaults")
  .action(runConfigInitCommand);

program
  .command("config:init")
  .description("Create default .commit-coach.json (alias: init)")
  .option("-g, --global", "Use global config file (~/.commit-coach.json)")
  .option("--defaults", "Skip interactive setup and use defaults")
  .action(runConfigInitCommand);

program
  .command("config:set")
  .description("Set a config value in .commit-coach.json")
  .argument("<key>", "Config key (language|commitStyle|maxSubjectLength|scopes|model|brandTheme|mascotStyle)")
  .argument("<value>", "Config value")
  .option("-g, --global", "Use global config file (~/.commit-coach.json)")
  .action(runConfigSetCommand);

program
  .command("hook:install")
  .description("Install prepare-commit-msg hook")
  .action(runHookInstallCommand);

void program.parseAsync(process.argv);
