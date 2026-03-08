import test from "node:test";
import assert from "node:assert/strict";
import { buildCommitPrompt, buildPrPrompt } from "./prompt.js";
import type { CommitCoachConfig } from "./types.js";

const config: CommitCoachConfig = {
  language: "ko",
  commitStyle: "conventional",
  maxSubjectLength: 72,
  scopes: ["core", "api", "web", "docs"],
  model: "gpt-4.1-mini",
  brandTheme: "ocean",
  mascotStyle: "cat"
};

test("buildCommitPrompt includes language, style, files, and diff", () => {
  const prompt = buildCommitPrompt({
    config,
    files: ["src/cli.ts"],
    diff: "diff --git a/src/cli.ts b/src/cli.ts"
  });

  assert.match(prompt, /Language: ko/);
  assert.match(prompt, /Style: conventional/);
  assert.match(prompt, /Changed files: src\/cli.ts/);
  assert.match(prompt, /Diff:/);
});

test("buildPrPrompt includes base, branch, commits, and diff", () => {
  const prompt = buildPrPrompt({
    config,
    branch: "feat/x",
    base: "main",
    files: ["src/a.ts"],
    commits: ["abc123 feat: add x"],
    diff: "diff --git a/src/a.ts b/src/a.ts"
  });

  assert.match(prompt, /Base branch: main/);
  assert.match(prompt, /Current branch: feat\/x/);
  assert.match(prompt, /abc123 feat: add x/);
  assert.match(prompt, /Diff:/);
});
