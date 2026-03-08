import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import type { CommitCoachConfig } from "./types.js";

const CONFIG_FILE = ".commit-coach.json";

export interface ProviderPreset {
  baseURL?: string;
  defaultModel: string;
}

export const PROVIDER_PRESETS: Record<string, ProviderPreset> = {
  openai: { defaultModel: "gpt-4.1-mini" },
  groq: { baseURL: "https://api.groq.com/openai/v1", defaultModel: "llama-3.3-70b-versatile" },
  ollama: { baseURL: "http://localhost:11434/v1", defaultModel: "llama3.2" },
  gemini: { baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/", defaultModel: "gemini-2.0-flash" },
  deepseek: { baseURL: "https://api.deepseek.com/v1", defaultModel: "deepseek-chat" },
  mistral: { baseURL: "https://api.mistral.ai/v1", defaultModel: "mistral-small-latest" },
  openrouter: { baseURL: "https://openrouter.ai/api/v1", defaultModel: "openai/gpt-4.1-mini" },
};

const configSchema = z.object({
  language: z.enum(["ko", "en"]).default("ko"),
  commitStyle: z.enum(["conventional", "simple"]).default("conventional"),
  maxSubjectLength: z.number().int().min(30).max(120).default(72),
  scopes: z.array(z.string()).default(["core", "api", "web", "docs"]),
  model: z.string().min(1).default("gpt-4.1-mini"),
  provider: z.string().min(1).default("openai"),
  baseURL: z.string().url().optional(),
  brandTheme: z.enum(["ocean", "sunset", "forest"]).default("ocean"),
  mascotStyle: z.enum(["cat", "none"]).default("cat"),
  apiKey: z.string().min(1).optional()
});

type ConfigKey = keyof CommitCoachConfig;

interface ConfigScopeOptions {
  global?: boolean;
}

interface ConfigInitOptions extends ConfigScopeOptions {
  values?: Partial<CommitCoachConfig>;
}

function getLocalConfigPath(cwd: string): string {
  return path.join(cwd, CONFIG_FILE);
}

function getGlobalConfigPath(): string {
  return path.join(process.env.COMMIT_COACH_HOME ?? os.homedir(), CONFIG_FILE);
}

function getConfigPath(cwd: string, options?: ConfigScopeOptions): string {
  if (options?.global) {
    return getGlobalConfigPath();
  }

  return getLocalConfigPath(cwd);
}

async function readConfigObject(configPath: string): Promise<Partial<CommitCoachConfig> | undefined> {
  try {
    const raw = await readFile(configPath, "utf8");
    return JSON.parse(raw) as Partial<CommitCoachConfig>;
  } catch {
    return undefined;
  }
}

function parseConfigValue(key: ConfigKey, rawValue: string): CommitCoachConfig[ConfigKey] {
  switch (key) {
    case "language": {
      if (rawValue !== "ko" && rawValue !== "en") {
        throw new Error("language must be 'ko' or 'en'");
      }
      return rawValue;
    }
    case "commitStyle": {
      if (rawValue !== "conventional" && rawValue !== "simple") {
        throw new Error("commitStyle must be 'conventional' or 'simple'");
      }
      return rawValue;
    }
    case "maxSubjectLength": {
      const value = Number(rawValue);
      if (!Number.isInteger(value) || value < 30 || value > 120) {
        throw new Error("maxSubjectLength must be an integer between 30 and 120");
      }
      return value;
    }
    case "scopes": {
      const scopes = rawValue
        .split(",")
        .map((scope) => scope.trim())
        .filter((scope) => scope.length > 0);

      if (scopes.length === 0) {
        throw new Error("scopes must contain at least one value (comma-separated)");
      }

      return scopes;
    }
    case "model": {
      if (rawValue.trim().length === 0) {
        throw new Error("model must be a non-empty string");
      }
      return rawValue.trim();
    }
    case "brandTheme": {
      if (rawValue !== "ocean" && rawValue !== "sunset" && rawValue !== "forest") {
        throw new Error("brandTheme must be 'ocean', 'sunset', or 'forest'");
      }
      return rawValue;
    }
    case "mascotStyle": {
      if (rawValue !== "cat" && rawValue !== "none") {
        throw new Error("mascotStyle must be 'cat' or 'none'");
      }
      return rawValue;
    }
    case "apiKey": {
      if (rawValue.trim().length === 0) {
        throw new Error("apiKey must be a non-empty string");
      }
      return rawValue.trim();
    }
    case "provider": {
      if (rawValue.trim().length === 0) {
        throw new Error("provider must be a non-empty string");
      }
      return rawValue.trim();
    }
    case "baseURL": {
      if (rawValue.trim().length === 0) {
        throw new Error("baseURL must be a non-empty string");
      }
      return rawValue.trim();
    }
  }
}

export const defaultConfig: CommitCoachConfig = {
  language: "ko",
  commitStyle: "conventional",
  maxSubjectLength: 72,
  scopes: ["core", "api", "web", "docs"],
  model: "gpt-4.1-mini",
  provider: "openai",
  brandTheme: "ocean",
  mascotStyle: "cat"
};

export async function loadConfig(cwd: string): Promise<CommitCoachConfig> {
  const [globalConfig, localConfig] = await Promise.all([
    readConfigObject(getGlobalConfigPath()),
    readConfigObject(getLocalConfigPath(cwd))
  ]);

  return configSchema.parse({
    ...defaultConfig,
    ...(globalConfig ?? {}),
    ...(localConfig ?? {})
  });
}

export async function hasAnyUserConfig(cwd: string): Promise<boolean> {
  const [globalConfig, localConfig] = await Promise.all([
    readConfigObject(getGlobalConfigPath()),
    readConfigObject(getLocalConfigPath(cwd))
  ]);

  return Boolean(globalConfig || localConfig);
}

export async function initConfig(cwd: string, options?: ConfigInitOptions): Promise<string> {
  const configPath = getConfigPath(cwd, options);
  const next = configSchema.parse({
    ...defaultConfig,
    ...(options?.values ?? {})
  });
  const content = JSON.stringify(next, null, 2) + "\n";
  await writeFile(configPath, content, "utf8");
  return configPath;
}

export async function setConfigValue(
  cwd: string,
  key: ConfigKey,
  rawValue: string,
  options?: ConfigScopeOptions
): Promise<string> {
  const configPath = getConfigPath(cwd, options);
  const current = options?.global ? configSchema.parse({ ...defaultConfig, ...(await readConfigObject(configPath)) }) : await loadConfig(cwd);
  const parsedValue = parseConfigValue(key, rawValue);
  const next = configSchema.parse({
    ...current,
    [key]: parsedValue
  });

  const content = JSON.stringify(next, null, 2) + "\n";
  await writeFile(configPath, content, "utf8");
  return configPath;
}

export const supportedConfigKeys: ConfigKey[] = [
  "language",
  "commitStyle",
  "maxSubjectLength",
  "scopes",
  "model",
  "brandTheme",
  "mascotStyle",
  "apiKey",
  "provider",
  "baseURL"
];
