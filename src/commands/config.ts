import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import chalk from "chalk";
import ora from "ora";
import { initConfig, setConfigValue, supportedConfigKeys, PROVIDER_PRESETS } from "../core/config.js";
import type { CommitCoachConfig } from "../core/types.js";
import { listModels } from "../core/llm.js";
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

async function askModelFromProvider(
  rl: ReturnType<typeof createInterface>,
  partialConfig: Partial<CommitCoachConfig>,
  defaultModel: string
): Promise<string> {
  const spinner = ora("Fetching available models...").start();

  try {
    const config = { ...partialConfig, model: "" } as CommitCoachConfig;
    const models = await listModels(config);
    spinner.stop();

    if (models.length === 0) {
      console.log(chalk.yellow("No models found. Enter model name manually."));
      const manual = (await rl.question(`Model (${defaultModel}): `)).trim();
      return manual || defaultModel;
    }

    console.log(chalk.dim(`\nAvailable models (${models.length}):\n`));
    const displayModels = models.slice(0, 20);
    displayModels.forEach((m, i) => {
      const marker = m === defaultModel ? chalk.green(" ← default") : "";
      console.log(chalk.dim(`  ${i + 1}. ${m}${marker}`));
    });
    if (models.length > 20) {
      console.log(chalk.dim(`  ... and ${models.length - 20} more`));
    }
    console.log("");

    const answer = (await rl.question(`Select model number or type name (${defaultModel}): `)).trim();

    if (!answer) return defaultModel;
    const num = Number(answer);
    if (Number.isInteger(num) && num >= 1 && num <= displayModels.length) {
      return displayModels[num - 1];
    }
    return answer;
  } catch {
    spinner.stop();
    console.log(chalk.yellow("Could not fetch models. Enter model name manually."));
    const manual = (await rl.question(`Model (${defaultModel}): `)).trim();
    return manual || defaultModel;
  }
}

async function runInitWizard(): Promise<{ global: boolean; values: Partial<CommitCoachConfig> }> {
  const rl = createInterface({ input, output });

  try {
    const presetNames = Object.keys(PROVIDER_PRESETS);

    console.log(chalk.bold("\nSetup wizard"));
    console.log(chalk.dim("Configure once, then use ccm msg directly.\n"));

    // 1. Scope
    const scopeAnswer = await askChoice(rl, "Save config where? [l/g]", ["l", "g"], "l");
    const global = scopeAnswer === "g" || scopeAnswer === "global";

    // 2. Provider
    console.log(chalk.dim(`\nAvailable providers: ${presetNames.join(", ")}, or type a custom name`));
    const providerAnswer = (await rl.question(`Provider (openai): `)).trim().toLowerCase() || "openai";
    const preset = PROVIDER_PRESETS[providerAnswer];
    const defaultModel = preset?.defaultModel ?? "gpt-4.1-mini";

    // 3. baseURL (custom provider only)
    let baseURL: string | undefined = preset?.baseURL;
    if (!preset) {
      const urlAnswer = (await rl.question("Base URL (required for custom provider): ")).trim();
      if (!urlAnswer) {
        console.log(chalk.red("baseURL is required for custom providers."));
        throw new Error("baseURL is required");
      }
      baseURL = urlAnswer;
    }

    // 4. API key (skip for ollama)
    let apiKey: string | undefined;
    if (providerAnswer === "ollama") {
      console.log(chalk.dim("\nOllama runs locally — no API key needed."));
    } else {
      apiKey = (await rl.question("API key (Enter to skip): ")).trim() || undefined;
    }

    // 5. Model selection (fetch from provider)
    const partialConfig: Partial<CommitCoachConfig> = {
      provider: providerAnswer,
      ...(baseURL ? { baseURL } : {}),
      ...(apiKey ? { apiKey } : {})
    };
    const model = await askModelFromProvider(rl, partialConfig, defaultModel);

    // 6. Language
    const languageAnswer = await askChoice(rl, "Default language? [ko/en]", ["ko", "en"], "ko");
    const language = languageAnswer === "en" ? "en" : "ko";

    // Summary
    console.log("");
    console.log(chalk.dim("Summary"));
    console.log(chalk.dim(`- scope: ${global ? "global" : "local"}`));
    console.log(chalk.dim(`- provider: ${providerAnswer}`));
    console.log(chalk.dim(`- model: ${model}`));
    console.log(chalk.dim(`- API key: ${apiKey ? "configured" : "skipped"}`));
    console.log(chalk.dim(`- language: ${language}\n`));

    return {
      global,
      values: {
        language,
        provider: providerAnswer,
        model,
        ...(baseURL ? { baseURL } : {}),
        ...(apiKey ? { apiKey } : {})
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
