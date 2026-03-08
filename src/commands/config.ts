import { select, input, password } from "@inquirer/prompts";
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

async function askModelFromProvider(
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
      return await input({ message: "Model", default: defaultModel });
    }

    const displayModels = models.slice(0, 30);
    const choices = displayModels.map((m) => ({
      name: m === defaultModel ? `${m} ${chalk.green("← default")}` : m,
      value: m
    }));

    if (models.length > 30) {
      choices.push({ name: chalk.dim(`... and ${models.length - 30} more (type to enter manually)`), value: "__manual__" });
    }
    choices.push({ name: chalk.dim("Enter model name manually"), value: "__manual__" });

    const selected = await select({
      message: "Model",
      choices,
      default: defaultModel
    });

    if (selected === "__manual__") {
      return await input({ message: "Model name", default: defaultModel });
    }

    return selected;
  } catch {
    spinner.stop();
    console.log(chalk.yellow("Could not fetch models. Enter model name manually."));
    return await input({ message: "Model", default: defaultModel });
  }
}

async function runInitWizard(): Promise<{ global: boolean; values: Partial<CommitCoachConfig> }> {
  const presetNames = Object.keys(PROVIDER_PRESETS);

  console.log(chalk.bold("\nSetup wizard"));
  console.log(chalk.dim("Configure once, then use ccm msg directly.\n"));

  // 1. Scope
  const scope = await select({
    message: "Save config where?",
    choices: [
      { name: "Local (.commit-coach.json)", value: "local" },
      { name: "Global (~/.commit-coach.json)", value: "global" }
    ],
    default: "local"
  });
  const global = scope === "global";

  // 2. Provider
  const providerChoices = presetNames.map((name) => ({
    name,
    value: name
  }));
  providerChoices.push({ name: chalk.dim("Custom (enter baseURL)"), value: "__custom__" });

  const providerAnswer = await select({
    message: "Provider",
    choices: providerChoices,
    default: "openai"
  });

  let provider: string;
  let baseURL: string | undefined;
  let defaultModel: string;

  if (providerAnswer === "__custom__") {
    provider = await input({ message: "Provider name" });
    baseURL = await input({ message: "Base URL (OpenAI-compatible)" });
    if (!baseURL) {
      console.log(chalk.red("baseURL is required for custom providers."));
      throw new Error("baseURL is required");
    }
    defaultModel = "gpt-4.1-mini";
  } else {
    provider = providerAnswer;
    const preset = PROVIDER_PRESETS[provider];
    baseURL = preset?.baseURL;
    defaultModel = preset?.defaultModel ?? "gpt-4.1-mini";
  }

  // 3. API key (skip for ollama)
  let apiKey: string | undefined;
  if (provider === "ollama") {
    console.log(chalk.dim("Ollama runs locally — no API key needed."));
  } else {
    apiKey = await password({ message: "API key (Enter to skip)", mask: "*" }) || undefined;
  }

  // 4. Model selection (fetch from provider)
  const partialConfig: Partial<CommitCoachConfig> = {
    provider,
    ...(baseURL ? { baseURL } : {}),
    ...(apiKey ? { apiKey } : {})
  };
  const model = await askModelFromProvider(partialConfig, defaultModel);

  // 5. Language
  const language = await select({
    message: "Default language",
    choices: [
      { name: "한국어 (ko)", value: "ko" as const },
      { name: "English (en)", value: "en" as const }
    ],
    default: "ko"
  });

  // Summary
  console.log("");
  console.log(chalk.dim("Summary"));
  console.log(chalk.dim(`- scope: ${global ? "global" : "local"}`));
  console.log(chalk.dim(`- provider: ${provider}`));
  console.log(chalk.dim(`- model: ${model}`));
  console.log(chalk.dim(`- API key: ${apiKey ? "configured" : "skipped"}`));
  console.log(chalk.dim(`- language: ${language}\n`));

  return {
    global,
    values: {
      language,
      provider,
      model,
      ...(baseURL ? { baseURL } : {}),
      ...(apiKey ? { apiKey } : {})
    }
  };
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
