import ora from "ora";
import { loadConfig } from "../core/config.js";
import { getStagedDiffContext } from "../core/git.js";
import { buildHeuristicCommitSuggestions, requestCommitSuggestions } from "../core/llm.js";
import { buildCommitPrompt } from "../core/prompt.js";

interface MsgOptions {
  lang?: "ko" | "en";
  max?: string;
  style?: "conventional" | "simple";
  verbose?: boolean;
}

export async function runMsgCommand(options: MsgOptions): Promise<void> {
  const cwd = process.cwd();
  const config = await loadConfig(cwd);
  const mergedConfig = {
    ...config,
    language: options.lang ?? config.language,
    commitStyle: options.style ?? config.commitStyle,
    maxSubjectLength: options.max ? Number(options.max) : config.maxSubjectLength
  };

  const spinner = ora(
    mergedConfig.language === "ko" ? "staged diff를 분석하는 중..." : "Analyzing staged diff..."
  ).start();

  try {
    const context = await getStagedDiffContext(cwd);
    if (!context.diff.trim()) {
      spinner.warn(
        mergedConfig.language === "ko"
          ? "staged 변경사항이 없습니다. 먼저 파일을 stage 해주세요."
          : "No staged changes found. Stage files first."
      );
      return;
    }

    const prompt = buildCommitPrompt({
      config: mergedConfig,
      files: context.files,
      diff: context.diff
    });

    let suggestions = buildHeuristicCommitSuggestions(context.files, context.diff, mergedConfig);
    let source: "ai" | "heuristic" = "heuristic";

    try {
      suggestions = await requestCommitSuggestions(prompt, mergedConfig);
      source = "ai";
    } catch {
      source = "heuristic";
    }

    if (options.verbose) {
      spinner.succeed(
        source === "ai"
          ? mergedConfig.language === "ko"
            ? "AI로 커밋 제안을 생성했습니다."
            : "Generated commit suggestions with AI."
          : mergedConfig.language === "ko"
            ? "로컬 휴리스틱 fallback으로 커밋 제안을 생성했습니다."
            : "Generated commit suggestions with local heuristic fallback."
      );
    } else {
      spinner.succeed(mergedConfig.language === "ko" ? "커밋 제안을 생성했습니다." : "Generated commit suggestion.");
    }

    const top = suggestions[0];
    if (!top) {
      throw new Error(mergedConfig.language === "ko" ? "커밋 후보를 생성하지 못했습니다." : "No commit suggestion generated.");
    }

    console.log(mergedConfig.language === "ko" ? "\n추천 커밋 메시지:\n" : "\nRecommended commit message:\n");
    console.log(`${top.subject}\n`);

    if (options.verbose) {
      console.log(mergedConfig.language === "ko" ? "상세 설명:\n" : "Details:\n");
      console.log(`${top.body}\n`);
    }
  } catch (error) {
    spinner.fail(
      error instanceof Error
        ? error.message
        : mergedConfig.language === "ko"
          ? "커밋 메시지 생성에 실패했습니다."
          : "Failed to generate commit messages."
    );
    process.exitCode = 1;
  }
}
