import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { defaultConfig, hasAnyUserConfig, initConfig, loadConfig, setConfigValue } from "./config.js";

async function makeTempDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "commit-coach-"));
}

async function withGlobalHome<T>(homeDir: string, fn: () => Promise<T>): Promise<T> {
  const previousGlobalHome = process.env.COMMIT_COACH_HOME;
  process.env.COMMIT_COACH_HOME = homeDir;

  try {
    return await fn();
  } finally {
    if (previousGlobalHome === undefined) {
      delete process.env.COMMIT_COACH_HOME;
    } else {
      process.env.COMMIT_COACH_HOME = previousGlobalHome;
    }
  }
}

test("initConfig writes default config file", async () => {
  const tempDir = await makeTempDir();
  const configPath = await initConfig(tempDir);
  const raw = await readFile(configPath, "utf8");
  const parsed = JSON.parse(raw) as Record<string, unknown>;

  assert.equal(parsed.language, defaultConfig.language);
  assert.equal(parsed.commitStyle, defaultConfig.commitStyle);
  assert.equal(parsed.maxSubjectLength, defaultConfig.maxSubjectLength);
});

test("loadConfig returns defaults when file is missing", async () => {
  const tempDir = await makeTempDir();
  const config = await loadConfig(tempDir);
  assert.deepEqual(config, defaultConfig);
});

test("loadConfig returns defaults when file is invalid", async () => {
  const tempDir = await makeTempDir();
  const configPath = path.join(tempDir, ".commit-coach.json");
  await writeFile(configPath, "{invalid-json", "utf8");

  const config = await loadConfig(tempDir);
  assert.deepEqual(config, defaultConfig);
});

test("setConfigValue updates language persistently", async () => {
  const tempDir = await makeTempDir();
  await setConfigValue(tempDir, "language", "en");
  const config = await loadConfig(tempDir);

  assert.equal(config.language, "en");
});

test("setConfigValue parses comma-separated scopes", async () => {
  const tempDir = await makeTempDir();
  await setConfigValue(tempDir, "scopes", "ui,api,docs");
  const config = await loadConfig(tempDir);

  assert.deepEqual(config.scopes, ["ui", "api", "docs"]);
});

test("setConfigValue updates brand theme", async () => {
  const tempDir = await makeTempDir();
  await setConfigValue(tempDir, "brandTheme", "sunset");
  const config = await loadConfig(tempDir);

  assert.equal(config.brandTheme, "sunset");
});

test("setConfigValue updates mascot style", async () => {
  const tempDir = await makeTempDir();
  await setConfigValue(tempDir, "mascotStyle", "none");
  const config = await loadConfig(tempDir);

  assert.equal(config.mascotStyle, "none");
});

test("loadConfig falls back to global config when local is missing", async () => {
  const tempHome = await makeTempDir();
  const tempProject = await makeTempDir();

  await withGlobalHome(tempHome, async () => {
    await setConfigValue(tempProject, "language", "en", { global: true });
    const config = await loadConfig(tempProject);
    assert.equal(config.language, "en");
  });
});

test("local config overrides global config", async () => {
  const tempHome = await makeTempDir();
  const tempProject = await makeTempDir();

  await withGlobalHome(tempHome, async () => {
    await setConfigValue(tempProject, "language", "en", { global: true });
    await setConfigValue(tempProject, "language", "ko");
    const config = await loadConfig(tempProject);
    assert.equal(config.language, "ko");
  });
});

test("config:init can create global config file", async () => {
  const tempHome = await makeTempDir();

  await withGlobalHome(tempHome, async () => {
    const tempProject = await makeTempDir();
    const globalPath = await initConfig(tempProject, { global: true });
    const raw = await readFile(globalPath, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    assert.equal(parsed.language, "ko");
  });
});

test("initConfig applies provided initial values", async () => {
  const tempDir = await makeTempDir();
  const configPath = await initConfig(tempDir, {
    values: {
      language: "en",
      brandTheme: "forest",
      mascotStyle: "none"
    }
  });

  const raw = await readFile(configPath, "utf8");
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  assert.equal(parsed.language, "en");
  assert.equal(parsed.brandTheme, "forest");
  assert.equal(parsed.mascotStyle, "none");
});

test("hasAnyUserConfig is false when no config exists", async () => {
  const tempDir = await makeTempDir();
  const tempHome = await makeTempDir();
  await withGlobalHome(tempHome, async () => {
    const hasConfig = await hasAnyUserConfig(tempDir);
    assert.equal(hasConfig, false);
  });
});

test("hasAnyUserConfig is true when local config exists", async () => {
  const tempDir = await makeTempDir();
  await initConfig(tempDir);
  const hasConfig = await hasAnyUserConfig(tempDir);
  assert.equal(hasConfig, true);
});
