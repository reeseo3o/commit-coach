import test from "node:test";
import assert from "node:assert/strict";
import { buildHeuristicCommitSuggestions, buildHeuristicPrSuggestion } from "./llm.js";
import type { CommitCoachConfig } from "./types.js";

const config: CommitCoachConfig = {
  language: "en",
  commitStyle: "conventional",
  maxSubjectLength: 72,
  scopes: ["core", "api", "web", "docs"],
  model: "gpt-4.1-mini",
  brandTheme: "ocean",
  mascotStyle: "cat"
};

const koConfig: CommitCoachConfig = {
  ...config,
  language: "ko"
};

test("buildHeuristicCommitSuggestions returns three candidates", () => {
  const suggestions = buildHeuristicCommitSuggestions(["src/app.ts"], "+export const x = 1", config);
  assert.equal(suggestions.length, 3);
  assert.ok(suggestions.every((item) => item.subject.length <= config.maxSubjectLength));
});

test("buildHeuristicCommitSuggestions uses docs type for markdown files", () => {
  const suggestions = buildHeuristicCommitSuggestions(["README.md"], "+docs", config);
  assert.ok(suggestions.every((item) => item.type === "docs"));
});

test("buildHeuristicCommitSuggestions returns Korean copy when language is ko", () => {
  const suggestions = buildHeuristicCommitSuggestions(
    ["src/app/layout.tsx"],
    "+export const metadata = {}",
    koConfig
  );
  assert.match(suggestions[0].subject, /metadata 처리/);
  assert.match(suggestions[0].body, /metadata 처리/);
});

test("buildHeuristicCommitSuggestions can infer fix type from compatibility diff", () => {
  const suggestions = buildHeuristicCommitSuggestions(
    ["src/app/layout.tsx"],
    "+// Next.js compatibility fix",
    config
  );
  assert.match(suggestions[0].subject, /^fix/);
});

test("buildHeuristicCommitSuggestions can produce concrete removal subject for component cleanup", () => {
  const diff = [
    "diff --git a/src/components/ContentRow.tsx b/src/components/ContentRow.tsx",
    "--- a/src/components/ContentRow.tsx",
    "+++ b/src/components/ContentRow.tsx",
    "-const scrollButton = () => null;",
    "-<button onClick={scrollButton}>scroll</button>",
    "+return <div>content</div>;"
  ].join("\n");

  const suggestions = buildHeuristicCommitSuggestions(["src/components/ContentRow.tsx"], diff, config);
  assert.match(suggestions[0].subject, /^refactor:/);
  assert.match(suggestions[0].subject, /remove unused scroll button from ContentRow component/);
});

test("buildHeuristicCommitSuggestions avoids sticky single-file removal title on multi-file diffs", () => {
  const diff = [
    "diff --git a/src/components/ContentRow.tsx b/src/components/ContentRow.tsx",
    "--- a/src/components/ContentRow.tsx",
    "+++ b/src/components/ContentRow.tsx",
    "-const scrollButton = () => null;",
    "-<button onClick={scrollButton}>scroll</button>",
    "+return <div>content</div>;",
    "diff --git a/src/app/layout.tsx b/src/app/layout.tsx",
    "--- a/src/app/layout.tsx",
    "+++ b/src/app/layout.tsx",
    "+export const metadata = {}"
  ].join("\n");

  const suggestions = buildHeuristicCommitSuggestions(
    ["src/components/ContentRow.tsx", "src/app/layout.tsx"],
    diff,
    config
  );

  assert.doesNotMatch(suggestions[0].subject, /remove unused scroll button from ContentRow component/);
  assert.match(suggestions[0].subject, /remove unused code in|update .* for metadata handling/);
});

test("buildHeuristicCommitSuggestions does not infer Next.js reason from app path alone", () => {
  const diff = [
    "diff --git a/src/app/page.tsx b/src/app/page.tsx",
    "--- a/src/app/page.tsx",
    "+++ b/src/app/page.tsx",
    "+const footerText = 'updated';"
  ].join("\n");

  const suggestions = buildHeuristicCommitSuggestions(["src/app/page.tsx"], diff, config);
  assert.doesNotMatch(suggestions[0].subject, /Next\.js compatibility/);
});

test("buildHeuristicPrSuggestion includes branch and file count", () => {
  const suggestion = buildHeuristicPrSuggestion("feat/test", "main", ["a.ts", "b.ts"], config);
  assert.equal(suggestion.title, "[feat/test] update 2 files against main");
  assert.match(suggestion.body, /## Summary/);
  assert.match(suggestion.body, /## Testing/);
});

test("buildHeuristicPrSuggestion returns Korean copy when language is ko", () => {
  const suggestion = buildHeuristicPrSuggestion("feat/test", "main", ["a.ts", "b.ts"], koConfig);
  assert.match(suggestion.title, /main 대비 2개 파일 변경/);
  assert.match(suggestion.body, /## 요약/);
  assert.match(suggestion.body, /## 테스트/);
});
