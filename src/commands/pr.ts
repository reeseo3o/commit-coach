import ora from "ora";
import { loadConfig } from "../core/config.js";
import { getPullRequestContext } from "../core/git.js";
import { buildHeuristicPrSuggestion, requestPrSuggestion } from "../core/llm.js";
import { buildPrPrompt } from "../core/prompt.js";

interface PrOptions {
  base?: string;
  lang?: "ko" | "en";
  verbose?: boolean;
}

export async function runPrCommand(options: PrOptions): Promise<void> {
  const cwd = process.cwd();
  const config = await loadConfig(cwd);
  const mergedConfig = {
    ...config,
    language: options.lang ?? config.language
  };

  const base = options.base ?? "main";
  const spinner = ora(
    mergedConfig.language === "ko"
      ? `${base} 기준 브랜치 diff를 분석하는 중...`
      : `Analyzing branch diff against ${base}...`
  ).start();

  try {
    const context = await getPullRequestContext(cwd, base);
    const prompt = buildPrPrompt({
      config: mergedConfig,
      branch: context.branch,
      base,
      files: context.files,
      commits: context.commits,
      diff: context.diff
    });

    let suggestion = buildHeuristicPrSuggestion(context.branch, base, context.files, mergedConfig);
    let source: "ai" | "heuristic" = "heuristic";

    try {
      suggestion = await requestPrSuggestion(prompt, mergedConfig);
      source = "ai";
    } catch {
      source = "heuristic";
    }

    if (options.verbose) {
      spinner.succeed(
        source === "ai"
          ? mergedConfig.language === "ko"
            ? "AI로 PR 제안을 생성했습니다."
            : "Generated PR suggestion with AI."
          : mergedConfig.language === "ko"
            ? "로컬 휴리스틱 fallback으로 PR 제안을 생성했습니다."
            : "Generated PR suggestion with local heuristic fallback."
      );
    } else {
      spinner.succeed(mergedConfig.language === "ko" ? "PR 제안을 생성했습니다." : "Generated PR suggestion.");
    }

    console.log(mergedConfig.language === "ko" ? `\n제목:\n${suggestion.title}\n` : `\nTitle:\n${suggestion.title}\n`);
    console.log(mergedConfig.language === "ko" ? `본문:\n${suggestion.body}\n` : `Body:\n${suggestion.body}\n`);
  } catch (error) {
    spinner.fail(
      error instanceof Error
        ? error.message
        : mergedConfig.language === "ko"
          ? "PR 내용 생성에 실패했습니다."
          : "Failed to generate PR content."
    );
    process.exitCode = 1;
  }
}
