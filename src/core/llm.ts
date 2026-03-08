import path from "node:path";
import OpenAI from "openai";
import type { CommitCoachConfig, CommitSuggestion, PullRequestSuggestion } from "./types.js";

interface HeuristicPrCopy {
  title: (branch: string, fileCount: number, base: string) => string;
  summaryHeading: string;
  summaryLine1: (reason: string) => string;
  summaryLine2: (area: string) => string;
  summaryLine3: (fileCount: number) => string;
  highlightsHeading: string;
  changesHeading: string;
  commitsHeading: string;
  testingHeading: string;
  testingLine1: string;
  testingLine2: string;
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
      summaryLine1: (reason) => `- ${reason} 관련 핵심 수정 사항을 반영했습니다.`,
      summaryLine2: (area) => `- 주요 변경 영역: ${area}`,
      summaryLine3: (fileCount) => `- 총 변경 파일: ${fileCount}개`,
      highlightsHeading: "## 변경 요약",
      changesHeading: "## 변경 파일",
      commitsHeading: "## 커밋",
      testingHeading: "## 테스트",
      testingLine1: "npm run test",
      testingLine2: "npm run typecheck && npm run build"
    };
  }

  return {
    title: (branch, fileCount, base) => `[${branch}] update ${fileCount} files against ${base}`,
    summaryHeading: "## Summary",
    summaryLine1: (reason) => `- Apply focused updates related to ${reason}.`,
    summaryLine2: (area) => `- Primary change area: ${area}.`,
    summaryLine3: (fileCount) => `- Total changed files: ${fileCount}.`,
    highlightsHeading: "## Change Highlights",
    changesHeading: "## Changed Files",
    commitsHeading: "## Commits",
    testingHeading: "## Testing",
    testingLine1: "npm run test",
    testingLine2: "npm run typecheck && npm run build"
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

function inferPrimaryArea(files: string[], language: CommitCoachConfig["language"]): string {
  const lower = files.join(" ").toLowerCase();

  if (/src\/app|app\//.test(lower)) {
    return language === "ko" ? "앱 라우팅/페이지" : "app routing/pages";
  }
  if (/src\/components|components\//.test(lower)) {
    return language === "ko" ? "UI 컴포넌트" : "UI components";
  }
  if (/src\/lib|lib\//.test(lower)) {
    return language === "ko" ? "도메인/비즈니스 로직" : "domain/business logic";
  }
  if (/test|spec|e2e/.test(lower)) {
    return language === "ko" ? "테스트 코드" : "tests";
  }

  return language === "ko" ? "전반적인 기능 영역" : "general feature area";
}

function toBulletList(items: string[], fallback: string): string[] {
  if (items.length === 0) {
    return [`- ${fallback}`];
  }

  return items.map((item) => `- ${item}`);
}

function toShortLiteral(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= 36) {
    return normalized;
  }

  return `${normalized.slice(0, 33)}...`;
}

function extractChangeHighlights(diff: string, language: CommitCoachConfig["language"]): string[] {
  const highlights: string[] = [];
  const added = diff
    .split("\n")
    .filter((line) => line.startsWith("+") && !line.startsWith("+++ "))
    .map((line) => line.slice(1).trim())
    .filter((line) => line.length > 0);

  const removed = diff
    .split("\n")
    .filter((line) => line.startsWith("-") && !line.startsWith("--- "))
    .map((line) => line.slice(1).trim())
    .filter((line) => line.length > 0);

  type HighlightSource = "add" | "remove";
  interface HighlightPattern {
    regex: RegExp;
    source?: HighlightSource;
    ko: (match: RegExpMatchArray, source: HighlightSource) => string;
    en: (match: RegExpMatchArray, source: HighlightSource) => string;
  }

  const patterns: HighlightPattern[] = [
    {
      regex: /^export const metadata\s*=\s*(.+)$/,
      source: "add",
      ko: () => "metadata export 구성을 업데이트했습니다.",
      en: () => "Updated metadata export configuration."
    },
    {
      regex: /^const\s+([A-Za-z0-9_]+)\s*=\s*["'`]([^"'`]+)["'`]/,
      source: "add",
      ko: (match) => `\`${match[1]}\` 값을 \`${toShortLiteral(match[2])}\`(으)로 업데이트했습니다.`,
      en: (match) => `Updated \`${match[1]}\` value to \`${toShortLiteral(match[2])}\`.`
    },
    {
      regex: /^([A-Za-z0-9_.]+)\s*=\s*["'`]([^"'`]+)["'`];?$/,
      source: "add",
      ko: (match) => `\`${match[1]}\` 값을 \`${toShortLiteral(match[2])}\`(으)로 설정했습니다.`,
      en: (match) => `Set \`${match[1]}\` to \`${toShortLiteral(match[2])}\`.`
    },
    {
      regex: /^const\s+([A-Za-z0-9_]+)\s*=.+$/,
      source: "add",
      ko: (match) => `\`${match[1]}\` 상수 선언/동작을 추가 또는 수정했습니다.`,
      en: (match) => `Added or updated \`${match[1]}\` constant behavior.`
    },
    {
      regex: /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(/,
      source: "add",
      ko: (match) => `\`${match[1]}\` 함수 구현을 추가 또는 갱신했습니다.`,
      en: (match) => `Added or updated \`${match[1]}\` function implementation.`
    },
    {
      regex: /<([A-Z][A-Za-z0-9]+)(\s|>)/,
      source: "remove",
      ko: (match) => `\`${match[1]}\` 컴포넌트 렌더링을 제거했습니다.`,
      en: (match) => `Removed \`${match[1]}\` component rendering.`
    },
    {
      regex: /^const\s+([A-Za-z0-9_]+)\s*=.+$/,
      source: "remove",
      ko: (match) => `\`${match[1]}\` 상수 선언을 제거했습니다.`,
      en: (match) => `Removed \`${match[1]}\` constant declaration.`
    },
    {
      regex: /^import\s+.+\s+from\s+['\"](.+)['\"];?$/,
      source: "add",
      ko: (match) => `\`${match[1]}\` import 의존성을 추가 또는 교체했습니다.`,
      en: (match) => `Added or replaced import dependency \`${match[1]}\`.`
    }
  ];

  const candidates: Array<{ line: string; source: HighlightSource }> = [
    ...removed.map((line) => ({ line, source: "remove" as const })),
    ...added.map((line) => ({ line, source: "add" as const }))
  ];

  for (const candidate of candidates) {
    for (const pattern of patterns) {
      if (pattern.source && pattern.source !== candidate.source) {
        continue;
      }

      const match = candidate.line.match(pattern.regex);
      if (!match) {
        continue;
      }

      const message = language === "ko" ? pattern.ko(match, candidate.source) : pattern.en(match, candidate.source);
      if (!highlights.includes(message)) {
        highlights.push(message);
      }
      break;
    }

    if (highlights.length >= 4) {
      break;
    }
  }

  if (highlights.length > 0) {
    return highlights;
  }

  return [
    language === "ko"
      ? `총 +${added.length}/-${removed.length} 라인 변경을 반영했습니다.`
      : `Applied diff with +${added.length}/-${removed.length} line changes.`
  ];
}

function isNumericDiffFallback(highlights: string[]): boolean {
  if (highlights.length !== 1) {
    return false;
  }

  return /^(총 \+\d+\/-\d+ 라인 변경을 반영했습니다\.|Applied diff with \+\d+\/-\d+ line changes\.)$/.test(highlights[0]);
}

function extractCommitSubjects(commits: string[]): string[] {
  return commits
    .filter((commit) => !/^\w+\s+Merge\s+/i.test(commit))
    .map((commit) => commit.replace(/^\w+\s+/, "").trim())
    .filter((subject) => subject.length > 0);
}

function buildCommitHighlights(subjects: string[], language: CommitCoachConfig["language"]): string[] {
  if (language === "ko") {
    return subjects.slice(0, 2).map((subject) => `\`${subject}\` 변경을 반영했습니다.`);
  }

  return subjects.slice(0, 2).map((subject) => `Included change: \`${subject}\`.`);
}

interface FileDiffChunk {
  file: string;
  addedLines: string[];
  removedLines: string[];
}

const MAX_FILE_HIGHLIGHT_DETAILS = 3;

function parseDiffByFile(diff: string, files: string[]): FileDiffChunk[] {
  const lines = diff.split("\n");
  const chunks: FileDiffChunk[] = [];
  let current: FileDiffChunk | undefined;

  const pushCurrent = () => {
    if (!current) {
      return;
    }

    chunks.push(current);
  };

  for (const rawLine of lines) {
    const diffHeader = rawLine.match(/^diff --git a\/(.+) b\/(.+)$/);
    if (diffHeader) {
      pushCurrent();
      current = {
        file: diffHeader[2],
        addedLines: [],
        removedLines: []
      };
      continue;
    }

    if (!current) {
      continue;
    }

    if (rawLine.startsWith("+") && !rawLine.startsWith("+++ ")) {
      current.addedLines.push(rawLine.slice(1).trim());
    }

    if (rawLine.startsWith("-") && !rawLine.startsWith("--- ")) {
      current.removedLines.push(rawLine.slice(1).trim());
    }
  }

  pushCurrent();

  if (chunks.length > 0) {
    return chunks;
  }

  const signals = collectDiffSignals(diff);
  const fallbackFile = files[0] ?? "changed-file";
  return [
    {
      file: fallbackFile,
      addedLines: signals.addedLines.map((line) => line.trim()).filter((line) => line.length > 0),
      removedLines: signals.removedLines.map((line) => line.trim()).filter((line) => line.length > 0)
    }
  ];
}

function uniquePush(target: string[], value: string): void {
  if (!target.includes(value)) {
    target.push(value);
  }
}

function describeFileChanges(chunk: FileDiffChunk, language: CommitCoachConfig["language"]): string[] {
  const removedDetails: string[] = [];
  const modifiedDetails: string[] = [];
  const addedDetails: string[] = [];

  const removedComponents = new Set<string>();
  for (const line of chunk.removedLines) {
    const match = line.match(/<([A-Z][A-Za-z0-9]+)(\s|>|\/)/);
    if (match) {
      removedComponents.add(match[1]);
    }
  }

  for (const name of [...removedComponents].slice(0, 2)) {
    uniquePush(removedDetails, language === "ko" ? `${name} 제거` : `remove ${name}`);
  }

  const changedLiterals = new Set<string>();
  for (const line of chunk.addedLines) {
    const literalMatch =
      line.match(/^const\s+([A-Za-z0-9_]+)\s*=\s*["'`]([^"'`]+)["'`]/) ??
      line.match(/^([A-Za-z0-9_.]+)\s*=\s*["'`]([^"'`]+)["'`];?$/);
    if (literalMatch) {
      changedLiterals.add(literalMatch[1]);
    }
  }

  for (const variableName of [...changedLiterals].slice(0, 2)) {
    if (/text$/i.test(variableName)) {
      uniquePush(modifiedDetails, language === "ko" ? `${variableName} 텍스트 변경` : `update ${variableName} text`);
      continue;
    }

    uniquePush(modifiedDetails, language === "ko" ? `${variableName} 값 변경` : `update ${variableName} value`);
  }

  const hasMetadataUpdate = chunk.addedLines.some((line) => /^export const metadata\b/.test(line));
  if (hasMetadataUpdate) {
    uniquePush(addedDetails, language === "ko" ? "metadata 구성 변경" : "update metadata config");
  }

  const details = [...removedDetails, ...modifiedDetails, ...addedDetails];
  return details.slice(0, MAX_FILE_HIGHLIGHT_DETAILS);
}

function extractDetailsFromCommitSubject(subject: string, language: CommitCoachConfig["language"]): string[] {
  const details: string[] = [];

  const removeComponentMatch = subject.match(/remove\s+unused\s+([A-Za-z0-9_]+)\s+components?/i);
  if (removeComponentMatch) {
    uniquePush(details, language === "ko" ? `${removeComponentMatch[1]} 제거` : `remove ${removeComponentMatch[1]}`);
  }

  const updateTextMatch = subject.match(/update\s+([A-Za-z0-9_]+)\s+text/i);
  if (updateTextMatch) {
    uniquePush(details, language === "ko" ? `${updateTextMatch[1]} 텍스트 변경` : `update ${updateTextMatch[1]} text`);
  }

  return details;
}

function extractFileLevelHighlights(
  diff: string,
  files: string[],
  commitSubjects: string[],
  language: CommitCoachConfig["language"]
): string[] {
  const chunks = parseDiffByFile(diff, files);
  const highlights: string[] = [];
  const commitDetails = commitSubjects.length > 0 ? extractDetailsFromCommitSubject(commitSubjects[0], language) : [];

  for (const chunk of chunks) {
    const details = describeFileChanges(chunk, language);
    if (files.length === 1 && details.length < 2 && commitDetails.length > 0) {
      for (const detail of commitDetails) {
        uniquePush(details, detail);
        if (details.length >= MAX_FILE_HIGHLIGHT_DETAILS) {
          break;
        }
      }
    }

    if (details.length === 0) {
      continue;
    }

    highlights.push(`${chunk.file}: ${details.slice(0, MAX_FILE_HIGHLIGHT_DETAILS).join(", ")}`);
    if (highlights.length >= 4) {
      break;
    }
  }

  if (highlights.length === 0 && files.length === 1 && commitDetails.length > 0) {
    if (commitDetails.length > 0) {
      highlights.push(`${files[0]}: ${commitDetails.slice(0, MAX_FILE_HIGHLIGHT_DETAILS).join(", ")}`);
    }
  }

  return highlights;
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
  commits: string[],
  diff: string,
  config: CommitCoachConfig
): PullRequestSuggestion {
  const copy = getHeuristicPrCopy(config.language);
  const area = inferPrimaryArea(files, config.language);
  const signals = collectDiffSignals(diff);
  const reasonSource = [...signals.addedLines, ...signals.removedLines].join("\n");
  const reason = getReason(reasonSource, config.language);

  const fileBullets = toBulletList(
    files.slice(0, 6).map((file) => `\`${file}\``),
    config.language === "ko" ? "변경 파일 없음" : "No changed files"
  );

  const nonMergeCommits = commits.filter((commit) => !/^\w+\s+Merge\s+/i.test(commit));
  const commitSubjects = extractCommitSubjects(commits);
  const commitBullets = toBulletList(
    nonMergeCommits.slice(0, 5),
    config.language === "ko" ? "커밋 정보 없음" : "No commit entries"
  );

  const fileLevelHighlights = extractFileLevelHighlights(diff, files, commitSubjects, config.language);
  const diffHighlights = extractChangeHighlights(diff, config.language);
  const highlights =
    fileLevelHighlights.length > 0
      ? fileLevelHighlights
      : isNumericDiffFallback(diffHighlights)
        ? [...buildCommitHighlights(commitSubjects, config.language), ...diffHighlights]
        : diffHighlights;

  const highlightBullets = toBulletList(highlights, config.language === "ko" ? "핵심 변경 요약 없음" : "No highlight items");

  return {
    title: copy.title(branch, files.length, base),
    body: [
      copy.summaryHeading,
      copy.summaryLine1(reason),
      copy.summaryLine2(area),
      copy.summaryLine3(files.length),
      "",
      copy.highlightsHeading,
      ...highlightBullets,
      "",
      copy.changesHeading,
      ...fileBullets,
      "",
      copy.commitsHeading,
      ...commitBullets,
      "",
      copy.testingHeading,
      `- ${copy.testingLine1}`,
      `- ${copy.testingLine2}`
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

function getClient(config: CommitCoachConfig): OpenAI {
  const apiKey = config.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey && config.provider !== "ollama") {
    throw new Error("API key is missing. Run 'ccm config:set apiKey <key>' or set the OPENAI_API_KEY environment variable.");
  }

  const clientOptions: { apiKey: string; baseURL?: string } = {
    apiKey: apiKey ?? "ollama"
  };

  if (config.baseURL) {
    clientOptions.baseURL = config.baseURL;
  }

  return new OpenAI(clientOptions);
}

export async function requestCommitSuggestions(
  prompt: string,
  config: CommitCoachConfig
): Promise<CommitSuggestion[]> {
  const client = getClient(config);
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
  const client = getClient(config);
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

export async function listModels(config: CommitCoachConfig): Promise<string[]> {
  const client = getClient(config);
  const response = await client.models.list();
  return response.data.map((m) => m.id).sort();
}
