import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import chalk from "chalk";
import ora from "ora";
import { initConfig, setConfigValue, supportedConfigKeys } from "../core/config.js";
import type { BrandTheme, CommitCoachConfig, MascotStyle } from "../core/types.js";
import { showBrand } from "../ui/brand.js";

interface ConfigCommandOptions {
  global?: boolean;
  defaults?: boolean;
}

async function askChoice(
  rl: ReturnType<typeof createInterface>,
  question: string,
  options: string[],
  fallback: string
): Promise<string> {
  const normalized = new Set(options.map((item) => item.toLowerCase()));

  while (true) {
    const answer = (await rl.question(`${question} (${fallback}): `)).trim().toLowerCase();
    const value = answer.length > 0 ? answer : fallback;

    if (normalized.has(value)) {
      return value;
    }

    console.log(chalk.yellow(`Please enter one of: ${options.join(", ")}`));
  }
}

async function runInitWizard(): Promise<{ global: boolean; values: Partial<CommitCoachConfig> }> {
  const rl = createInterface({ input, output });

  try {
    console.log(chalk.bold("\nSetup wizard"));
    console.log(chalk.dim("Choose defaults once, then use ccm msg directly.\n"));
    console.log(chalk.dim("Options:"));
    console.log(chalk.dim("- scope: l(local) / g(global)"));
    console.log(chalk.dim("- language: ko / en"));
    console.log(chalk.dim("- theme: ocean / sunset / forest\n"));
    console.log(chalk.dim("- mascot: cat / none\n"));

    const scopeAnswer = await askChoice(rl, "Save config where? [l/g]", ["l", "g"], "l");
    const global = scopeAnswer === "g" || scopeAnswer === "global";

    const languageAnswer = await askChoice(rl, "Default language? [ko/en]", ["ko", "en"], "ko");
    const language = languageAnswer === "en" ? "en" : "ko";

    const themeAnswer = await askChoice(
      rl,
      "Brand theme? [ocean/sunset/forest]",
      ["ocean", "sunset", "forest"],
      "ocean"
    );
    const brandTheme: BrandTheme =
      themeAnswer === "sunset" || themeAnswer === "forest" || themeAnswer === "ocean" ? themeAnswer : "ocean";

    const mascotAnswer = await askChoice(rl, "Mascot style? [cat/none]", ["cat", "none"], "cat");
    const mascotStyle: MascotStyle = mascotAnswer === "none" ? "none" : "cat";

    console.log("");
    console.log(chalk.dim("Summary"));
    console.log(chalk.dim(`- scope: ${global ? "global" : "local"}`));
    console.log(chalk.dim(`- language: ${language}`));
    console.log(chalk.dim(`- theme: ${brandTheme}`));
    console.log(chalk.dim(`- mascot: ${mascotStyle}\n`));

    return {
      global,
      values: {
        language,
        brandTheme,
        mascotStyle
      }
    };
  } finally {
    rl.close();
  }
}

export async function runConfigInitCommand(options: ConfigCommandOptions): Promise<void> {
  await showBrand();
  let scopeGlobal = Boolean(options.global);
  let values: Partial<CommitCoachConfig> | undefined;

  if (!options.defaults && options.global === undefined && process.stdin.isTTY && process.stdout.isTTY) {
    const wizard = await runInitWizard();
    scopeGlobal = wizard.global;
    values = wizard.values;
  }

  const spinner = ora(scopeGlobal ? "Creating global config ~/.commit-coach.json..." : "Creating .commit-coach.json...").start();

  try {
    const filePath = await initConfig(process.cwd(), { global: scopeGlobal, values });
    spinner.succeed(`Created config at ${filePath}`);
  } catch (error) {
    spinner.fail(error instanceof Error ? error.message : "Failed to write config file.");
    process.exitCode = 1;
  }
}

export async function runConfigSetCommand(key: string, value: string, options: ConfigCommandOptions): Promise<void> {
  await showBrand();
  const spinner = ora(
    options.global ? `Updating global config key '${key}'...` : `Updating config key '${key}'...`
  ).start();

  try {
    if (!supportedConfigKeys.includes(key as (typeof supportedConfigKeys)[number])) {
      throw new Error(`Unsupported key '${key}'. Supported keys: ${supportedConfigKeys.join(", ")}`);
    }

    const filePath = await setConfigValue(process.cwd(), key as (typeof supportedConfigKeys)[number], value, {
      global: options.global
    });
    spinner.succeed(`Updated ${key} in ${filePath}`);
  } catch (error) {
    spinner.fail(error instanceof Error ? error.message : "Failed to update config file.");
    process.exitCode = 1;
  }
}
