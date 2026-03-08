import path from "node:path";
import OpenAI from "openai";
import type { CommitCoachConfig, CommitSuggestion, PullRequestSuggestion } from "./types.js";

interface HeuristicPrCopy {
  title: (branch: string, fileCount: number, base: string) => string;
  summaryHeading: string;
  summaryLine1: string;
  summaryLine2: (fileCount: number) => string;
  testingHeading: string;
  testingLine: string;
}

interface ReasonHint {
  regex: RegExp;
  en: string;
  ko: string;
}

interface DiffSignals {
  addedLines: string[];
  removedLines: string[];
}

function getHeuristicPrCopy(language: CommitCoachConfig["language"]): HeuristicPrCopy {
  if (language === "ko") {
    return {
      title: (branch, fileCount, base) => `[${branch}] ${base} 대비 ${fileCount}개 파일 변경`,
      summaryHeading: "## 요약",
      summaryLine1: "- 브랜치 diff를 기반으로 구현 변경 사항을 반영했습니다.",
      summaryLine2: (fileCount) => `- 핵심 변경 파일 ${fileCount}개를 업데이트했습니다.`,
      testingHeading: "## 테스트",
      testingLine: "- 병합 전에 프로젝트 검증을 로컬에서 실행하세요."
    };
  }

  return {
    title: (branch, fileCount, base) => `[${branch}] update ${fileCount} files against ${base}`,
    summaryHeading: "## Summary",
    summaryLine1: "- Update implementation based on branch diff.",
    summaryLine2: (fileCount) => `- Touch ${fileCount} files with focused changes.`,
    testingHeading: "## Testing",
    testingLine: "- Run project checks locally before merge."
  };
}

function collectDiffSignals(diff: string): DiffSignals {
  const addedLines: string[] = [];
  const removedLines: string[] = [];

  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ ") || line.startsWith("--- ")) {
      continue;
    }

    if (line.startsWith("+")) {
      addedLines.push(line.slice(1));
    }

    if (line.startsWith("-")) {
      removedLines.push(line.slice(1));
    }
  }

  return { addedLines, removedLines };
}

function heuristicType(files: string[], diff: string, signals: DiffSignals): string {
  if (files.some((file) => file.includes("test") || file.endsWith(".spec.ts"))) {
    return "test";
  }

  if (files.length > 0 && files.every((file) => file.toLowerCase().endsWith(".md"))) {
    return "docs";
  }

  if (files.some((file) => ["package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock"].includes(file))) {
    return "chore";
  }

  if (
    signals.removedLines.length >= 2 &&
    signals.removedLines.length > signals.addedLines.length * 1.2 &&
    /unused|cleanup|remove|scroll|button|legacy|deprecated|dead/i.test(diff)
  ) {
    return "refactor";
  }

  if (signals.removedLines.length > Math.max(8, signals.addedLines.length * 1.5)) {
    return "refactor";
  }

  if (/fix|bug|error|undefined|compat/i.test(diff)) {
    return "fix";
  }

  if (/refactor|cleanup|rename/i.test(diff)) {
    return "refactor";
  }

  return "feat";
}

function heuristicScope(files: string[], scopes: string[]): string | undefined {
  const lowerFiles = files.join(" ").toLowerCase();
  return scopes.find((scope) => lowerFiles.includes(scope.toLowerCase()));
}

function getFocus(files: string[], language: CommitCoachConfig["language"]): string {
  if (files.length === 0) {
    return language === "ko" ? "변경사항" : "change set";
  }

  const prioritized = files.filter(
    (file) => ![".commit-coach.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock"].includes(path.basename(file))
  );

  const focusFiles = prioritized.length > 0 ? prioritized : files;

  const first = path.basename(focusFiles[0]);
  if (focusFiles.length === 1) {
    return first;
  }

  return language === "ko"
    ? `${first} 외 ${focusFiles.length - 1}개 파일`
    : `${first} and ${focusFiles.length - 1} more files`;
}

const reasonHints: ReasonHint[] = [
  { regex: /metadata/i, en: "metadata handling", ko: "metadata 처리" },
  { regex: /next(\.js)?|next\/|use client|use server|server component/i, en: "Next.js compatibility", ko: "Next.js 호환성" },
  { regex: /auth|token|session/i, en: "auth flow", ko: "인증 흐름" },
  { regex: /\/api\/|route\(|route\.ts|router\.|fetch\(|axios|endpoint/i, en: "API behavior", ko: "API 동작" },
  { regex: /type|interface|tsconfig/i, en: "type safety", ko: "타입 안정성" },
  { regex: /lint|eslint|prettier/i, en: "lint rules", ko: "lint 규칙" },
  { regex: /i18n|locale|lang/i, en: "localization", ko: "현지화" },
  { regex: /performance|memo|cache|optimi/i, en: "performance", ko: "성능" }
];

function getReason(diff: string, language: CommitCoachConfig["language"]): string {
  const hint = reasonHints.find((item) => item.regex.test(diff));
  if (!hint) {
    return language === "ko" ? "핵심 동작" : "core behavior";
  }

  return language === "ko" ? hint.ko : hint.en;
}

function splitIdentifier(token: string): string[] {
  return token
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[^a-zA-Z0-9]+/)
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 1);
}

function extractTerms(lines: string[]): string[] {
  const terms: string[] = [];

  for (const line of lines) {
    const lineTerms = splitIdentifier(line);
    for (const term of lineTerms) {
      if (["const", "let", "var", "return", "from", "true", "false", "null", "undefined", "className"].includes(term)) {
        continue;
      }
      terms.push(term);
    }
  }

  return terms;
}

function topTerms(terms: string[], excluded: Set<string>, count: number): string[] {
  const freq = new Map<string, number>();
  for (const term of terms) {
    if (excluded.has(term)) {
      continue;
    }
    freq.set(term, (freq.get(term) ?? 0) + 1);
  }

  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([term]) => term);
}

function getComponentName(files: string[]): string | undefined {
  const componentFile = files.find((file) => /[A-Z][a-zA-Z0-9]+\.(tsx|jsx)$/.test(path.basename(file)));
  if (!componentFile) {
    return undefined;
  }

  return path.basename(componentFile).replace(/\.(tsx|jsx)$/, "");
}

function buildPrimarySubject(
  type: string,
  suffix: string,
  files: string[],
  diff: string,
  signals: DiffSignals,
  reason: string,
  language: CommitCoachConfig["language"]
): string {
  const componentName = getComponentName(files);
  const addedTerms = extractTerms(signals.addedLines);
  const removedTerms = extractTerms(signals.removedLines);
  const removedOnly = new Set(removedTerms.filter((term) => !addedTerms.includes(term)));
  const removedFocus = topTerms(removedTerms, new Set(addedTerms), 3);
  const addedFocus = topTerms(addedTerms, new Set(), 3);

  const isRemoval = signals.removedLines.length > signals.addedLines.length;
  const isMultiFile = files.length > 1;
  const removalWords = removedFocus.length > 0 ? removedFocus.join(" ") : (language === "ko" ? "불필요 코드" : "unused code");
  const addedWords = addedFocus.length > 0 ? addedFocus.join(" ") : (language === "ko" ? "핵심 로직" : "core logic");

  if (isMultiFile) {
    if (isRemoval) {
      return language === "ko"
        ? `${type}${suffix}: ${getFocus(files, language)}에서 불필요 코드 정리`
        : `${type}${suffix}: remove unused code in ${getFocus(files, language)}`;
    }

    return language === "ko"
      ? `${type}${suffix}: ${reason} 관련 ${getFocus(files, language)} 업데이트`
      : `${type}${suffix}: update ${getFocus(files, language)} for ${reason}`;
  }

  if (isRemoval && componentName && removedOnly.has("scroll") && removedOnly.has("button")) {
    return language === "ko"
      ? `${type}${suffix}: ${componentName} 컴포넌트에서 사용하지 않는 scroll button 제거`
      : `${type}${suffix}: remove unused scroll button from ${componentName} component`;
  }

  if (isRemoval) {
    return language === "ko"
      ? `${type}${suffix}: ${removalWords} 관련 정리`
      : `${type}${suffix}: remove unused ${removalWords}`;
  }

  if (componentName) {
    return language === "ko"
      ? `${type}${suffix}: ${componentName} 컴포넌트 ${reason} 개선`
      : `${type}${suffix}: improve ${reason} in ${componentName} component`;
  }

  if (/metadata/i.test(diff)) {
    return language === "ko"
      ? `${type}${suffix}: metadata 처리 로직 개선`
      : `${type}${suffix}: improve metadata handling`;
  }

  return language === "ko" ? `${type}${suffix}: ${addedWords} 관련 업데이트` : `${type}${suffix}: update ${addedWords}`;
}

function buildCommitBodies(
  fileCount: number,
  reason: string,
  language: CommitCoachConfig["language"]
): [string, string, string] {
  if (language === "ko") {
    return [
      `스테이징된 변경 ${fileCount}개 파일을 기준으로 ${reason} 관련 수정을 반영했습니다.`,
      `${reason} 중심으로 변경 범위를 정리해 리뷰 포인트를 명확히 했습니다.`,
      `${reason}에 영향을 주는 부분을 우선 반영하고 기존 흐름을 유지했습니다.`
    ];
  }

  return [
    `Reflect staged changes across ${fileCount} file(s) with focus on ${reason}.`,
    `Keep this change set reviewable by organizing updates around ${reason}.`,
    `Prioritize ${reason}-related updates while preserving existing workflow behavior.`
  ];
}

export function buildHeuristicCommitSuggestions(
  files: string[],
  diff: string,
  config: CommitCoachConfig
): CommitSuggestion[] {
  const signals = collectDiffSignals(diff);
  const type = heuristicType(files, diff, signals);
  const scope = heuristicScope(files, config.scopes);
  const suffix = scope ? `(${scope})` : "";
  const focus = getFocus(files, config.language);
  const reasonSource = [...signals.addedLines, ...signals.removedLines].join("\n");
  const reason = getReason(reasonSource, config.language);
  const [firstBody, secondBody, thirdBody] = buildCommitBodies(files.length, reason, config.language);

  const firstSubject = buildPrimarySubject(type, suffix, files, diff, signals, reason, config.language);
  const secondSubject =
    config.language === "ko" ? `${type}${suffix}: ${focus} 변경사항 정리` : `${type}${suffix}: refine ${focus} changes`;
  const thirdSubject =
    config.language === "ko" ? `${type}${suffix}: ${focus} 동작 개선` : `${type}${suffix}: improve ${focus} behavior`;

  return [
    {
      type,
      scope,
      subject: firstSubject,
      body: firstBody
    },
    {
      type,
      scope,
      subject: secondSubject,
      body: secondBody
    },
    {
      type,
      scope,
      subject: thirdSubject,
      body: thirdBody
    }
  ].map((item) => ({
    ...item,
    subject: item.subject.slice(0, config.maxSubjectLength)
  }));
}

export function buildHeuristicPrSuggestion(
  branch: string,
  base: string,
  files: string[],
  config: CommitCoachConfig
): PullRequestSuggestion {
  const copy = getHeuristicPrCopy(config.language);

  return {
    title: copy.title(branch, files.length, base),
    body: [
      copy.summaryHeading,
      copy.summaryLine1,
      copy.summaryLine2(files.length),
      "",
      copy.testingHeading,
      copy.testingLine
    ].join("\n")
  };
}

function parseJson<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("LLM 응답을 JSON으로 파싱하지 못했습니다.");
  }
}

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing");
  }

  return new OpenAI({ apiKey });
}

export async function requestCommitSuggestions(
  prompt: string,
  config: CommitCoachConfig
): Promise<CommitSuggestion[]> {
  const client = getClient();
  const response = await client.responses.create({
    model: config.model,
    input: prompt,
    temperature: 0.2
  });

  const text = response.output_text;
  const parsed = parseJson<{ candidates: CommitSuggestion[] }>(text);

  if (!Array.isArray(parsed.candidates) || parsed.candidates.length === 0) {
    throw new Error("LLM에서 유효한 커밋 후보를 받지 못했습니다.");
  }

  return parsed.candidates.slice(0, 3);
}

export async function requestPrSuggestion(
  prompt: string,
  config: CommitCoachConfig
): Promise<PullRequestSuggestion> {
  const client = getClient();
  const response = await client.responses.create({
    model: config.model,
    input: prompt,
    temperature: 0.2
  });

  const text = response.output_text;
  const parsed = parseJson<PullRequestSuggestion>(text);

  if (!parsed.title || !parsed.body) {
    throw new Error("LLM에서 유효한 PR 제안을 받지 못했습니다.");
  }

  return parsed;
}
