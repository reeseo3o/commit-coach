import chalk from "chalk";
import figlet from "figlet";
import gradient from "gradient-string";
import type { BrandTheme, MascotStyle } from "../core/types.js";

let isShown = false;

function centerText(text: string, width: number): string {
  if (text.length >= width) {
    return text.slice(0, width);
  }

  const left = Math.floor((width - text.length) / 2);
  const right = width - text.length - left;
  return `${" ".repeat(left)}${text}${" ".repeat(right)}`;
}

function repeat(char: string, count: number): string {
  return count > 0 ? char.repeat(count) : "";
}

function visibleLength(text: string): number {
  return text.replace(/\u001b\[[0-9;]*m/g, "").length;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clearPreviousLines(lineCount: number): void {
  if (lineCount <= 0) {
    return;
  }

  process.stdout.write(`\x1b[${lineCount}A`);
  for (let i = 0; i < lineCount; i += 1) {
    process.stdout.write("\x1b[2K\r");
    if (i < lineCount - 1) {
      process.stdout.write("\x1b[1B");
    }
  }
  process.stdout.write(`\x1b[${lineCount - 1}A`);
}

function revealLine(line: string, progress: number): string {
  if (progress >= 1) {
    return line;
  }

  let seen = 0;
  const total = [...line].filter((ch) => ch !== " ").length;
  const threshold = Math.floor(total * progress);

  return [...line]
    .map((ch) => {
      if (ch === " ") {
        return " ";
      }

      seen += 1;
      return seen <= threshold ? ch : ".";
    })
    .join("");
}

function resolveTheme(theme?: string): BrandTheme {
  if (theme === "ocean" || theme === "sunset" || theme === "forest") {
    return theme;
  }

  return "ocean";
}

function styleForTheme(theme: BrandTheme): [(line: string) => string, (line: string) => string] {
  switch (theme) {
    case "sunset":
      return [chalk.bold.hex("#B069FF"), chalk.bold.hex("#FF78C8")];
    case "forest":
      return [chalk.bold.hex("#2D6A4F"), chalk.bold.hex("#74C69D")];
    case "ocean":
    default:
      return [chalk.bold.hex("#7B61FF"), chalk.bold.hex("#5B7CFF")];
  }
}

function gradientForTheme(theme: BrandTheme): (text: string) => string {
  switch (theme) {
    case "sunset":
      return gradient(["#8F4DFF", "#C066FF", "#FF78C8"]);
    case "forest":
      return gradient(["#2b9348", "#55a630", "#80b918"]);
    case "ocean":
    default:
      return gradient(["#6A4CFF", "#7B61FF", "#5B7CFF"]);
  }
}

function mascotColorForTheme(theme: BrandTheme): string {
  switch (theme) {
    case "sunset":
      return "#FF86D3";
    case "forest":
      return "#B7E4C7";
    case "ocean":
    default:
      return "#D6A8FF";
  }
}

function renderFigletLogo(text: string, width: number): string[] {
  const output = figlet.textSync(text, {
    font: "ANSI Shadow",
    horizontalLayout: "fitted",
    verticalLayout: "fitted",
    width,
    whitespaceBreak: true
  });

  return output
    .split("\n")
    .map((line) => line.replace(/\s+$/g, ""))
    .filter((line) => line.trim().length > 0);
}

function renderMascotLines(mascotStyle: MascotStyle, width: number): string[] {
  if (mascotStyle !== "cat") {
    return [];
  }

  const mascot = [" /\\_/\\ ", "( o.o )", " > ^ < "];
  if (width < 14) {
    return ["/\\_/\\", "(o.o)", "> ^ <"];
  }

  return mascot.map((line) => centerText(line, width));
}

interface BrandRenderOptions {
  theme?: BrandTheme;
  mascotStyle?: MascotStyle;
}

export async function showBrand(options?: BrandRenderOptions): Promise<void> {
  if (isShown || !process.stdout.isTTY || process.env.COMMIT_COACH_BRAND === "0") {
    return;
  }

  isShown = true;
  const selected = resolveTheme(process.env.COMMIT_COACH_THEME ?? options?.theme);
  const mascotStyle = options?.mascotStyle ?? "cat";
  const [line1, line2] = styleForTheme(selected);
  const gradientLine = gradientForTheme(selected);
  const mascotColor = chalk.hex(mascotColorForTheme(selected));
  const columns = process.stdout.columns ?? 80;

  console.log("");

  if (columns >= 56) {
    const logoWidth = Math.max(48, columns - 8);
    const logoLines = renderFigletLogo("CCOACH", logoWidth);
    if (logoLines.length > 0) {
      const centeredLines = logoLines.map((raw) =>
        columns >= 72 ? centerText(raw, Math.min(columns - 2, Math.max(raw.length, logoWidth))) : raw
      );
      const infoLine = chalk.dim(centerText(`theme: ${selected} | setup wizard`, Math.min(columns - 2, 72)));
      const mascotLines = renderMascotLines(mascotStyle, Math.min(columns - 2, 72));

      const shouldAnimate = process.env.COMMIT_COACH_ANIMATE !== "0" && !process.env.CI;

      if (shouldAnimate) {
        const steps = [0.15, 0.35, 0.6, 0.85, 1];
        let rendered = 0;
        for (const step of steps) {
          if (rendered > 0) {
            clearPreviousLines(rendered);
          }

          const frameLines = centeredLines.map((line) => gradientLine(revealLine(line, step)));
          frameLines.forEach((line) => console.log(line));
          mascotLines.forEach((line) => console.log(mascotColor(line)));
          console.log(infoLine);
          rendered = frameLines.length + mascotLines.length + 1;

          if (step < 1) {
            await sleep(55);
          }
        }
      } else {
        centeredLines.forEach((line) => console.log(gradientLine(line)));
        mascotLines.forEach((line) => console.log(mascotColor(line)));
        console.log(infoLine);
      }

      console.log("");
      return;
    }

    const inner = Math.min(64, columns - 6);
    const border = chalk.dim(`+${repeat("=", inner)}+`);
    const title = line1(centerText("COMMIT-COACH", inner));
    const subtitle = line2(centerText("git diff assistant", inner));
    const meta = chalk.dim(centerText(`theme: ${selected}`, inner));
    const mascotLines = renderMascotLines(mascotStyle, inner);
    const shouldAnimate = process.env.COMMIT_COACH_ANIMATE !== "0" && !process.env.CI;
    if (shouldAnimate) {
      const frames = [
        [
          border,
          chalk.dim("|") + revealLine("COMMIT-COACH", 0.4).padEnd(inner, " ") + chalk.dim("|"),
          chalk.dim("|") + revealLine("git diff assistant", 0.2).padEnd(inner, " ") + chalk.dim("|"),
          chalk.dim("|") + " ".repeat(inner) + chalk.dim("|"),
          ...mascotLines.map(() => chalk.dim("|") + " ".repeat(inner) + chalk.dim("|")),
          border
        ],
        [
          border,
          chalk.dim("|") + revealLine("COMMIT-COACH", 0.8).padEnd(inner, " ") + chalk.dim("|"),
          chalk.dim("|") + revealLine("git diff assistant", 0.7).padEnd(inner, " ") + chalk.dim("|"),
          chalk.dim("|") + revealLine(`theme: ${selected}`, 0.6).padEnd(inner, " ") + chalk.dim("|"),
          ...mascotLines.map((line) => chalk.dim("|") + revealLine(line.trim(), 0.8).padEnd(inner, " ") + chalk.dim("|")),
          border
        ],
        [
          border,
          chalk.dim("|") + title + chalk.dim("|"),
          chalk.dim("|") + subtitle + chalk.dim("|"),
          chalk.dim("|") + meta + chalk.dim("|"),
          ...mascotLines.map((line) => chalk.dim("|") + mascotColor(line) + chalk.dim("|")),
          border
        ]
      ];

      let rendered = 0;
      for (let i = 0; i < frames.length; i += 1) {
        if (rendered > 0) {
          clearPreviousLines(rendered);
        }
        frames[i].forEach((line) => console.log(line));
        rendered = frames[i].length;
        if (i < frames.length - 1) {
          await sleep(60);
        }
      }
    } else {
      console.log(border);
      console.log(chalk.dim("|") + title + chalk.dim("|"));
      console.log(chalk.dim("|") + subtitle + chalk.dim("|"));
      console.log(chalk.dim("|") + meta + chalk.dim("|"));
      mascotLines.forEach((line) => console.log(chalk.dim("|") + mascotColor(line) + chalk.dim("|")));
      console.log(border);
    }

    console.log("");
    return;
  }

  console.log(line1("COMMIT-COACH"));
  const mascotLines = renderMascotLines(mascotStyle, 28);
  mascotLines.forEach((line) => console.log(mascotColor(line)));
  console.log(chalk.dim(`theme: ${selected}`));
  console.log("");
}
