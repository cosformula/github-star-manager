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
