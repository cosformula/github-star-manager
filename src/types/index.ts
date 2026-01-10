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

// 预设的清理条件
export type UnstarCriteriaId =
  | "archived"      // 已归档
  | "stale"         // 长期未更新
  | "low_stars"     // 低星数
  | "deprecated"    // 已废弃/有替代品
  | "personal_fork" // 个人 fork
  | "joke_meme";    // 玩笑/meme 仓库

export interface UnstarCriteria {
  id: UnstarCriteriaId;
  label: string;
  description: string;
  default: boolean;
  // 可选参数，如 stale 的年数、low_stars 的阈值
  params?: Record<string, number>;
}

export interface UnstarOptions {
  criteria: UnstarCriteriaId[];
  customCriteria?: string;  // 用户自定义条件
  staleYears?: number;      // stale 条件的年数，默认 2
  lowStarsThreshold?: number; // low_stars 条件的阈值，默认 100
}
