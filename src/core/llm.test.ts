import test from "node:test";
import assert from "node:assert/strict";
import {
  buildHeuristicCommitSuggestions,
  buildHeuristicPrSuggestion,
  hasConfiguredApiKey,
  isRateLimitError
} from "./llm.js";
import type { CommitCoachConfig } from "./types.js";

const config: CommitCoachConfig = {
  language: "en",
  commitStyle: "conventional",
  maxSubjectLength: 72,
  scopes: ["core", "api", "web", "docs"],
  model: "gpt-4.1-mini",
  provider: "openai",
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
  const suggestion = buildHeuristicPrSuggestion(
    "feat/test",
    "main",
    ["src/app/page.tsx", "src/components/Hero.tsx"],
    ["abc123 feat: update page", "def456 refactor: clean hero"],
    "+export const metadata = {}",
    config
  );
  assert.equal(suggestion.title, "[feat/test] update 2 files against main");
  assert.match(suggestion.body, /## Summary/);
  assert.match(suggestion.body, /## Changed Files/);
  assert.match(suggestion.body, /## Commits/);
  assert.match(suggestion.body, /## Testing/);
});

test("buildHeuristicPrSuggestion returns Korean copy when language is ko", () => {
  const suggestion = buildHeuristicPrSuggestion(
    "feat/test",
    "main",
    ["src/app/page.tsx", "src/components/Hero.tsx"],
    ["abc123 feat: update page", "def456 refactor: clean hero"],
    "+export const metadata = {}",
    koConfig
  );
  assert.match(suggestion.title, /main 대비 2개 파일 변경/);
  assert.match(suggestion.body, /## 요약/);
  assert.match(suggestion.body, /## 변경 파일/);
  assert.match(suggestion.body, /## 커밋/);
  assert.match(suggestion.body, /## 테스트/);
});

test("buildHeuristicPrSuggestion includes file-level concrete details", () => {
  const diff = [
    "diff --git a/src/app/page.tsx b/src/app/page.tsx",
    "--- a/src/app/page.tsx",
    "+++ b/src/app/page.tsx",
    "-<ContentRow title=\"Trending\" />",
    "+const footerText = 'Updated footer copy';"
  ].join("\n");

  const suggestion = buildHeuristicPrSuggestion(
    "fix/pr-detail",
    "main",
    ["src/app/page.tsx"],
    ["abc123 refactor: remove unused content row"],
    diff,
    config
  );

  assert.match(suggestion.body, /src\/app\/page\.tsx: remove ContentRow, update footerText text/);
});

test("buildHeuristicPrSuggestion falls back to numeric diff line summary", () => {
  const diff = [
    "diff --git a/src/app/page.tsx b/src/app/page.tsx",
    "--- a/src/app/page.tsx",
    "+++ b/src/app/page.tsx",
    "+}"
  ].join("\n");

  const suggestion = buildHeuristicPrSuggestion(
    "fix/pr-detail",
    "main",
    ["src/app/page.tsx"],
    ["abc123 chore: tiny update"],
    diff,
    config
  );

  assert.match(suggestion.body, /Included change: `chore: tiny update`\./);
  assert.match(suggestion.body, /Applied diff with \+1\/-0 line changes\./);
});

test("buildHeuristicPrSuggestion includes Korean file-level details", () => {
  const diff = [
    "diff --git a/src/app/page.tsx b/src/app/page.tsx",
    "--- a/src/app/page.tsx",
    "+++ b/src/app/page.tsx",
    "-<ContentRow title=\"Trending\" />",
    "+const footerText = 'Updated footer copy';"
  ].join("\n");

  const suggestion = buildHeuristicPrSuggestion(
    "fix/pr-detail",
    "main",
    ["src/app/page.tsx"],
    ["abc123 refactor: remove unused content row"],
    diff,
    koConfig
  );

  assert.match(suggestion.body, /src\/app\/page\.tsx: ContentRow 제거, footerText 텍스트 변경/);
});

test("buildHeuristicPrSuggestion derives Korean file-level details from commit subject when diff is sparse", () => {
  const diff = [
    "diff --git a/src/app/page.tsx b/src/app/page.tsx",
    "--- a/src/app/page.tsx",
    "+++ b/src/app/page.tsx",
    "+const footerText = 'Updated';"
  ].join("\n");

  const suggestion = buildHeuristicPrSuggestion(
    "fix/pr-detail",
    "main",
    ["src/app/page.tsx"],
    ["abc123 refactor: Remove unused ContentRow components and update footer text"],
    diff,
    koConfig
  );

  assert.match(suggestion.body, /src\/app\/page\.tsx:/);
  assert.match(suggestion.body, /ContentRow 제거/);
  assert.match(suggestion.body, /footer 텍스트 변경/);
});

test("buildHeuristicPrSuggestion keeps file-level detail order and caps points", () => {
  const diff = [
    "diff --git a/src/app/page.tsx b/src/app/page.tsx",
    "--- a/src/app/page.tsx",
    "+++ b/src/app/page.tsx",
    "-<ContentRow title=\"Trending\" />",
    "+const footerText = 'Updated footer';",
    "+const heroTitle = 'Hero';",
    "+export const metadata = {}"
  ].join("\n");

  const suggestion = buildHeuristicPrSuggestion(
    "fix/pr-detail",
    "main",
    ["src/app/page.tsx"],
    ["abc123 refactor: Remove unused ContentRow components and update footer text"],
    diff,
    koConfig
  );

  assert.match(suggestion.body, /src\/app\/page\.tsx: ContentRow 제거, footerText 텍스트 변경, heroTitle 값 변경/);
  assert.doesNotMatch(suggestion.body, /metadata 구성 변경/);
});

test("hasConfiguredApiKey returns false for non-ollama without key", () => {
  assert.equal(hasConfiguredApiKey(config, {}), false);
});

test("hasConfiguredApiKey returns true for ollama without key", () => {
  assert.equal(hasConfiguredApiKey({ ...config, provider: "ollama" }, {}), true);
});

test("hasConfiguredApiKey returns true when apiKey exists", () => {
  assert.equal(hasConfiguredApiKey({ ...config, apiKey: "sk-test" }, {}), true);
});

test("isRateLimitError detects status 429 and rate limit codes", () => {
  assert.equal(isRateLimitError({ status: 429 }), true);
  assert.equal(isRateLimitError({ code: "rate_limit_exceeded" }), true);
  assert.equal(isRateLimitError(new Error("Rate limit reached")), true);
  assert.equal(isRateLimitError(new Error("Network failure")), false);
});

test("buildHeuristicCommitSuggestions filters meta feedback words from subject", () => {
  const diff = [
    "diff --git a/src/app/page.tsx b/src/app/page.tsx",
    "--- a/src/app/page.tsx",
    "+++ b/src/app/page.tsx",
    "+const imageSrc = '/hero.png';",
    "+const backdrop = true;",
    "+const recommendedCommitQuality = '추천되는 커밋 메시지 퀄리티';"
  ].join("\n");

  const suggestions = buildHeuristicCommitSuggestions(["src/app/page.tsx"], diff, koConfig);

  assert.doesNotMatch(suggestions[0].subject, /추천되는|커밋 메시지|퀄리티|quality/i);
  assert.match(suggestions[0].subject, /^feat:/);
});

test("buildHeuristicCommitSuggestions marks removed JSX priority prop as refactor with concrete token", () => {
  const diff = [
    "diff --git a/src/components/Hero.tsx b/src/components/Hero.tsx",
    "--- a/src/components/Hero.tsx",
    "+++ b/src/components/Hero.tsx",
    "-      <Image src={heroImage} alt=\"hero\" priority />",
    "+      <Image src={heroImage} alt=\"hero\" />"
  ].join("\n");

  const suggestions = buildHeuristicCommitSuggestions(["src/components/Hero.tsx"], diff, koConfig);

  assert.match(suggestions[0].subject, /^refactor:/);
  assert.match(suggestions[0].subject, /priority/);
  assert.doesNotMatch(suggestions[0].subject, /핵심 동작 개선/);
});

test("buildHeuristicCommitSuggestions detects commented-out JSX attribute as removal", () => {
  const diff = [
    "diff --git a/src/components/Hero.tsx b/src/components/Hero.tsx",
    "--- a/src/components/Hero.tsx",
    "+++ b/src/components/Hero.tsx",
    "-          <Image src={heroImage} alt={title} fill className=\"object-cover\" priority />",
    "+          <Image src={heroImage} alt={title} fill className=\"object-cover\" // priority",
    "+          />"
  ].join("\n");

  const suggestions = buildHeuristicCommitSuggestions(["src/components/Hero.tsx"], diff, koConfig);

  assert.match(suggestions[0].subject, /^refactor:/);
  assert.match(suggestions[0].subject, /Hero 컴포넌트에서 priority 속성 제거/);
});

test("buildHeuristicCommitSuggestions detects commented-out standalone JSX prop line", () => {
  const diff = [
    "diff --git a/src/components/Hero.tsx b/src/components/Hero.tsx",
    "--- a/src/components/Hero.tsx",
    "+++ b/src/components/Hero.tsx",
    "-          priority",
    "+          // priority"
  ].join("\n");

  const suggestions = buildHeuristicCommitSuggestions(["src/components/Hero.tsx"], diff, koConfig);

  assert.match(suggestions[0].subject, /^refactor:/);
  assert.match(suggestions[0].subject, /Hero 컴포넌트에서 priority 속성 제거/);
});
