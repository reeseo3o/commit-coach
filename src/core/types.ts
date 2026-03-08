export type CommitStyle = "conventional" | "simple";
export type BrandTheme = "ocean" | "sunset" | "forest";
export type MascotStyle = "cat" | "none";

export interface CommitCoachConfig {
  language: "ko" | "en";
  commitStyle: CommitStyle;
  maxSubjectLength: number;
  scopes: string[];
  model: string;
  brandTheme: BrandTheme;
  mascotStyle: MascotStyle;
  apiKey?: string;
}

export interface CommitSuggestion {
  subject: string;
  body: string;
  type: string;
  scope?: string;
}

export interface PullRequestSuggestion {
  title: string;
  body: string;
}
