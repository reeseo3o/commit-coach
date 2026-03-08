import type { CommitCoachConfig } from "./types.js";

interface CommitPromptInput {
  config: CommitCoachConfig;
  files: string[];
  diff: string;
}

interface PrPromptInput {
  config: CommitCoachConfig;
  branch: string;
  base: string;
  files: string[];
  commits: string[];
  diff: string;
}

function trimDiff(diff: string, maxChars = 8000): string {
  if (diff.length <= maxChars) {
    return diff;
  }

  return `${diff.slice(0, maxChars)}\n...<truncated>`;
}

export function buildCommitPrompt(input: CommitPromptInput): string {
  const { config, files, diff } = input;
  return [
    "You are a senior engineer writing commit messages.",
    `Language: ${config.language}`,
    `Style: ${config.commitStyle}`,
    `Max subject length: ${config.maxSubjectLength}`,
    `Allowed scopes: ${config.scopes.join(", ")}`,
    "Return JSON only with shape:",
    "{\"candidates\":[{\"type\":\"feat\",\"scope\":\"api\",\"subject\":\"...\",\"body\":\"...\"}]}",
    "Create exactly 3 candidates.",
    "Do not include markdown.",
    "Subject quality rules:",
    "- Prefer concrete action + concrete target from diff (function, prop, component, file-level behavior).",
    "- Avoid vague phrases like '핵심 동작 개선', '관련 업데이트', 'change set updates', or 'improve core behavior'.",
    "- If diff mostly removes code/props, prefer type 'refactor' unless it's clearly a bug fix.",
    "- Keep subject naturally readable for humans; never include meta comments about message quality.",
    `Changed files: ${files.join(", ") || "(none)"}`,
    "Diff:",
    trimDiff(diff)
  ].join("\n");
}

export function buildPrPrompt(input: PrPromptInput): string {
  const { config, branch, base, files, commits, diff } = input;

  return [
    "You are a senior engineer writing pull request summaries.",
    `Language: ${config.language}`,
    "Return JSON only with shape:",
    "{\"title\":\"...\",\"body\":\"## Summary\\n- ...\\n\\n## Testing\\n- ...\"}",
    "Keep title concise and body practical.",
    `Base branch: ${base}`,
    `Current branch: ${branch}`,
    `Changed files: ${files.join(", ") || "(none)"}`,
    `Commits:\n${commits.join("\n") || "(none)"}`,
    "Diff:",
    trimDiff(diff)
  ].join("\n");
}
