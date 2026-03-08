import { simpleGit, type SimpleGit } from "simple-git";

export interface StagedDiffContext {
  branch: string;
  files: string[];
  diff: string;
}

export interface PullRequestContext {
  branch: string;
  base: string;
  files: string[];
  diff: string;
  commits: string[];
}

function createGit(cwd: string): SimpleGit {
  return simpleGit({ baseDir: cwd, binary: "git", maxConcurrentProcesses: 6 });
}

export async function getStagedDiffContext(cwd: string): Promise<StagedDiffContext> {
  const git = createGit(cwd);
  const isRepo = await git.checkIsRepo();

  if (!isRepo) {
    throw new Error("현재 경로는 git 저장소가 아닙니다.");
  }

  const [branchInfo, filesRaw, diff] = await Promise.all([
    git.branchLocal(),
    git.raw(["diff", "--staged", "--name-only"]),
    git.diff(["--staged"])
  ]);

  const files = filesRaw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return {
    branch: branchInfo.current,
    files,
    diff
  };
}

export async function getPullRequestContext(cwd: string, base: string): Promise<PullRequestContext> {
  const git = createGit(cwd);
  const isRepo = await git.checkIsRepo();

  if (!isRepo) {
    throw new Error("현재 경로는 git 저장소가 아닙니다.");
  }

  const branchInfo = await git.branchLocal();
  const branch = branchInfo.current;
  const range = `${base}...${branch}`;

  const [filesRaw, diff, logRaw] = await Promise.all([
    git.raw(["diff", "--name-only", range]),
    git.diff([range]),
    git.raw(["log", "--oneline", range])
  ]);

  const files = filesRaw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const commits = logRaw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return {
    branch,
    base,
    files,
    diff,
    commits
  };
}
