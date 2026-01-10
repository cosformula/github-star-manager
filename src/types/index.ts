export interface StarredRepo {
  id: number;
  nodeId: string;
  name: string;
  fullName: string;
  description: string | null;
  url: string;
  homepage: string | null;
  language: string | null;
  topics: string[];
  stargazersCount: number;
  forksCount: number;
  updatedAt: string;
  pushedAt: string;
  archived: boolean;
  disabled: boolean;
}

export interface StarList {
  id: string;
  name: string;
  description: string | null;
  isPrivate: boolean;
  itemCount: number;
}

export interface PlanAction {
  type: "unstar" | "add_to_list" | "remove_from_list" | "create_list" | "delete_list";
  description: string;
  params: Record<string, string>;
}

export interface ExecutionPlan {
  summary: string;
  actions: PlanAction[];
  reasoning: string;
}

export interface RepoSuggestion {
  repo: StarredRepo;
  action: "keep" | "unstar" | "categorize";
  suggestedList?: string;
  reason: string;
}

export interface ListSuggestion {
  name: string;
  description: string;
  matchingRepos: string[]; // fullName[]
}

export interface AnalysisResult {
  suggestedLists: ListSuggestion[];
  repoSuggestions: RepoSuggestion[];
  staleRepos: StarredRepo[];
  archivedRepos: StarredRepo[];
}

// Preset cleanup criteria
export type UnstarCriteriaId =
  | "archived"      // Archived repos
  | "stale"         // Not updated for long time
  | "low_stars"     // Low star count
  | "deprecated"    // Deprecated or has replacement
  | "personal_fork" // Personal forks
  | "joke_meme";    // Joke/meme repos

export interface UnstarCriteria {
  id: UnstarCriteriaId;
  label: string;
  description: string;
  default: boolean;
  // Optional params, e.g., years for stale, threshold for low_stars
  params?: Record<string, number>;
}

export interface UnstarOptions {
  criteria: UnstarCriteriaId[];
  customCriteria?: string;    // User-defined criteria
  staleYears?: number;        // Years for stale condition, default 2
  lowStarsThreshold?: number; // Threshold for low_stars condition, default 100
}
