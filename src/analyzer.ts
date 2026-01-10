import type { StarredRepo, StarList, ListSuggestion, RepoSuggestion, AnalysisResult, UnstarOptions, UnstarCriteriaId } from "./types";
import { Spinner } from "./spinner";

export interface ModelConfig {
  // 分类建议 - 需要创意，用更聪明的模型
  categorization: string;
  // Unstar 分析 - 简单判断，用便宜的模型
  analysis: string;
}

const DEFAULT_MODELS: ModelConfig = {
  categorization: "xiaomi/mimo-v2-flash:free", // 免费模型
  analysis: "xiaomi/mimo-v2-flash:free",       // 免费模型
};

export class RepoAnalyzer {
  private apiKey: string;
  private models: ModelConfig;
  private baseUrl = "https://openrouter.ai/api/v1";
  private debugMode = false;
  private maxBatches = Infinity;

  // Token 统计
  private totalTokens = { prompt: 0, completion: 0, total: 0 };
  private callCount = 0;

  constructor(apiKey: string, models?: Partial<ModelConfig>) {
    this.apiKey = apiKey;
    this.models = { ...DEFAULT_MODELS, ...models };
  }

  setDebugMode(enabled: boolean, maxBatches = 2): void {
    this.debugMode = enabled;
    this.maxBatches = maxBatches;
  }

  getTokenStats() {
    return { ...this.totalTokens, calls: this.callCount };
  }

  /**
   * Stage 1: Generate list suggestions (or use existing lists)
   * Returns suggested lists without categorizing repos yet
   */
  async generateListSuggestions(
    repos: StarredRepo[],
    existingLists: StarList[],
    options: { shouldReorganize?: boolean; useExistingListsOnly?: boolean } = {}
  ): Promise<ListSuggestion[]> {
    // 只用现有 lists，不建议新的
    if (options.useExistingListsOnly && existingLists.length > 0) {
      console.log(`   使用现有 ${existingLists.length} 个 lists 进行分类\n`);
      return existingLists.map((l) => ({
        name: l.name,
        description: l.description || "",
        matchingRepos: [],
      }));
    }

    const tokensBefore = this.totalTokens.total;
    const spinner = new Spinner("AI 正在生成分类建议");
    spinner.start();
    const suggestedLists = await this.suggestLists(repos, existingLists, options.shouldReorganize);
    const tokensUsed = this.totalTokens.total - tokensBefore;
    spinner.stop(`分类建议完成 (${suggestedLists.length} 个列表) [${tokensUsed.toLocaleString()} tokens]`);

    return suggestedLists;
  }

  /**
   * Stage 2: Categorize repos into the finalized lists
   * Call this after user has confirmed/modified the lists
   * @param existingRepoLists - Map of repo fullName -> list names it's already in
   */
  async categorizeRepos(
    repos: StarredRepo[],
    finalizedLists: ListSuggestion[],
    existingRepoLists: Map<string, string[]> = new Map(),
    onProgress?: (progress: number, total: number, tokens: number, eta: string) => void
  ): Promise<RepoSuggestion[]> {
    const tokensBefore = this.totalTokens.total;
    const startTime = Date.now();

    const repoSuggestions = await this.analyzeRepos(repos, finalizedLists, existingRepoLists, (progress) => {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = progress / elapsed;
      const remaining = repos.length - progress;
      const eta = rate > 0 ? Math.ceil(remaining / rate) : 0;
      const etaStr = eta > 60 ? `${Math.floor(eta / 60)}m${eta % 60}s` : `${eta}s`;
      const tokens = this.totalTokens.total - tokensBefore;
      onProgress?.(progress, repos.length, tokens, etaStr);
    });

    return repoSuggestions;
  }

  /**
   * Get basic repo stats (stale, archived)
   */
  getRepoStats(repos: StarredRepo[]): { staleRepos: StarredRepo[]; archivedRepos: StarredRepo[] } {
    const now = new Date();
    const twoYearsAgo = new Date(now);
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

    return {
      staleRepos: repos.filter((r) => new Date(r.pushedAt) < twoYearsAgo),
      archivedRepos: repos.filter((r) => r.archived),
    };
  }

  /**
   * Legacy method for backwards compatibility
   * @deprecated Use generateListSuggestions() + categorizeRepos() instead
   */
  async analyze(
    repos: StarredRepo[],
    existingLists: StarList[],
    options: { shouldReorganize?: boolean; unstarOnly?: boolean; useExistingListsOnly?: boolean } = {}
  ): Promise<AnalysisResult> {
    const { staleRepos, archivedRepos } = this.getRepoStats(repos);

    // 如果只需要 unstar 分析，跳过分类
    if (options.unstarOnly) {
      const spinner = new Spinner("AI 正在分析 unstar 建议");
      spinner.start();
      const repoSuggestions = await this.analyzeForUnstar(repos, (progress) => {
        spinner.update(`AI 正在分析 (${progress}/${repos.length})`);
      });
      spinner.stop(`分析完成 (${repoSuggestions.filter((s) => s.action === "unstar").length} 个 unstar 建议)`);

      return { suggestedLists: [], repoSuggestions, staleRepos, archivedRepos };
    }

    // Stage 1: List suggestions
    const suggestedLists = await this.generateListSuggestions(repos, existingLists, options);

    // Stage 2: Categorize repos (legacy method doesn't have existing repo lists info)
    const spinner = new Spinner("AI 正在分类每个 repo");
    spinner.start();
    const repoSuggestions = await this.categorizeRepos(repos, suggestedLists, new Map(), (progress, total, tokens, eta) => {
      spinner.update(`AI 正在分类 (${progress}/${total}) [${tokens.toLocaleString()} tokens] ETA: ${eta}`);
    });
    spinner.stop(`分类完成 (${repoSuggestions.length} 个建议)`);

    return { suggestedLists, repoSuggestions, staleRepos, archivedRepos };
  }

  /**
   * Analyze repos for unstar suggestions only (independent of categorization)
   */
  async analyzeForUnstar(
    repos: StarredRepo[],
    onProgress?: (processed: number) => void
  ): Promise<RepoSuggestion[]> {
    const results: RepoSuggestion[] = [];
    const batchSize = 50;

    for (let i = 0; i < repos.length; i += batchSize) {
      const batch = repos.slice(i, i + batchSize);
      const batchResults = await this.analyzeUnstarBatch(batch);

      for (const result of batchResults) {
        const repo = repos.find((r) => r.fullName === result.repo);
        if (repo) {
          results.push({ repo, action: "unstar", reason: result.reason });
        }
      }

      // 剩余的标记为 keep
      for (const repo of batch) {
        if (!batchResults.find((r) => r.repo === repo.fullName)) {
          results.push({ repo, action: "keep", reason: "No issues found" });
        }
      }

      onProgress?.(Math.min(i + batchSize, repos.length));
    }

    return results;
  }

  private async analyzeUnstarBatch(repos: StarredRepo[]): Promise<Array<{ repo: string; reason: string }>> {
    const prompt = `Analyze these GitHub repos and identify which ones should be UNSTARRED.

Be CONSERVATIVE! Only suggest unstar for repos that are clearly not useful:
- Deprecated with a recommended replacement
- Joke/meme repos
- Broken/abandoned with no value
- Outdated personal forks

Do NOT suggest unstar for:
- Archived but still useful repos
- Old but classic/stable libraries
- Learning resources
- High star count (10k+) repos

Repos:
${repos.map((r) => {
  const age = this.getAge(r.pushedAt);
  return `- ${r.fullName} | ${r.description?.slice(0, 60) || "no desc"} | ⭐${r.stargazersCount} | ${age} | ${r.archived ? "ARCHIVED" : "active"}`;
}).join("\n")}

Return JSON with ONLY repos to unstar:
{ "unstar": [{ "repo": "owner/name", "reason": "brief reason" }] }

If none should be unstarred: { "unstar": [] }`;

    const response = await this.callLLM(prompt, this.models.analysis);
    const parsed = this.parseJSON(response);
    return parsed?.unstar || [];
  }

  private async suggestLists(repos: StarredRepo[], existingLists: StarList[], shouldReorganize = false): Promise<ListSuggestion[]> {
    const languages = this.countBy(repos, (r) => r.language || "Unknown");
    const topics = this.countTopics(repos);

    // 分层抽样：从不同语言中抽取样本，确保多样性
    const sampleRepos = this.stratifiedSample(repos, 60);

    const existingListsInfo = existingLists.length > 0
      ? `Existing lists:\n${existingLists.map((l) => `- "${l.name}" (${l.itemCount} repos): ${l.description || "no description"}`).join("\n")}`
      : "Existing lists: None";

    const reorganizeInstructions = shouldReorganize
      ? `\n\nIMPORTANT: User wants to REORGANIZE their lists. Consider:
- Are any existing lists too broad and should be split?
- Are any lists too small and should be merged?
- Are the existing categories still relevant?
- Suggest better organization if the current structure isn't optimal.
- You can suggest keeping good existing lists, renaming them, or creating entirely new ones.`
      : `\n\nNote: User has existing lists. Only suggest NEW categories that don't overlap with existing ones.`;

    const prompt = `Analyze these GitHub starred repos and suggest good list categories.

${existingListsInfo}
${reorganizeInstructions}

Stats:
- Total repos: ${repos.length}
- Top languages: ${Object.entries(languages).slice(0, 10).map(([l, c]) => `${l}(${c})`).join(", ")}
- Top topics: ${Object.entries(topics).slice(0, 20).map(([t, c]) => `${t}(${c})`).join(", ")}

Sample repos (stratified by language, ${sampleRepos.length} total):
${sampleRepos.map((r) => `- ${r.fullName}: ${r.description?.slice(0, 60) || "no desc"} [${r.language || "?"}] topics:${r.topics.slice(0, 3).join(",")}`).join("\n")}

Suggest 5-8 meaningful list categories. Consider:
- Grouping by purpose (tools, libraries, learning, etc.)
- Grouping by domain (web, AI/ML, devops, etc.)
- Don't just group by language unless it makes sense

Return JSON only:
{
  "lists": [
    { "name": "List Name", "description": "What goes here", "keywords": ["keyword1", "keyword2"] }
  ]
}`;

    const response = await this.callLLM(prompt, this.models.categorization);
    const parsed = this.parseJSON(response);

    if (!parsed?.lists) return [];

    return parsed.lists.map((list: any) => ({
      name: list.name,
      description: list.description,
      matchingRepos: this.matchReposToList(repos, list.keywords || []),
    }));
  }

  private async analyzeRepos(
    repos: StarredRepo[],
    suggestedLists: ListSuggestion[],
    existingRepoLists: Map<string, string[]>,
    onProgress?: (processed: number) => void
  ): Promise<RepoSuggestion[]> {
    const listNames = suggestedLists.map((l) => l.name);

    // 用 LLM 批量分析：同时判断 unstar 和分类
    const batchResults = await this.classifyReposBatch(repos, listNames, existingRepoLists, onProgress);

    const suggestions: RepoSuggestion[] = [];

    for (const result of batchResults) {
      const repo = repos.find((r) => r.fullName === result.repo);
      if (!repo) continue;

      if (result.action === "unstar") {
        suggestions.push({ repo, action: "unstar", reason: result.reason });
      } else if (result.list) {
        suggestions.push({
          repo,
          action: "categorize",
          suggestedList: result.list,
          reason: result.reason || `Belongs to "${result.list}"`,
        });
      } else {
        suggestions.push({ repo, action: "keep", reason: result.reason || "No specific category" });
      }
    }

    return suggestions;
  }

  private async classifyReposBatch(
    repos: StarredRepo[],
    listNames: string[],
    existingRepoLists: Map<string, string[]>,
    onProgress?: (processed: number) => void
  ): Promise<Array<{ repo: string; action: "unstar" | "categorize" | "keep"; list?: string; reason: string }>> {
    const results: Array<{ repo: string; action: "unstar" | "categorize" | "keep"; list?: string; reason: string }> = [];
    const batchSize = 30; // 每批少一点，因为现在要同时分类

    let batchCount = 0;
    for (let i = 0; i < repos.length; i += batchSize) {
      // Debug 模式下限制 batch 数量
      if (this.debugMode && batchCount >= this.maxBatches) {
        // 剩余的标记为 keep
        for (let j = i; j < repos.length; j++) {
          results.push({ repo: repos[j].fullName, action: "keep", reason: "[debug] skipped" });
        }
        onProgress?.(repos.length);
        break;
      }

      const batch = repos.slice(i, i + batchSize);
      const batchResults = await this.classifyBatch(batch, listNames, existingRepoLists);
      results.push(...batchResults);
      batchCount++;
      onProgress?.(Math.min(i + batchSize, repos.length));
    }

    return results;
  }

  private async classifyBatch(
    repos: StarredRepo[],
    listNames: string[],
    existingRepoLists: Map<string, string[]>
  ): Promise<Array<{ repo: string; action: "unstar" | "categorize" | "keep"; list?: string; reason: string }>> {
    // 使用编号而不是名字，更稳定
    const numberedLists = listNames.map((name, i) => `${i + 1}. ${name}`).join("\n");

    // 为每个 repo 添加已在哪些 lists 中的信息
    const repoLines = repos.map((r) => {
      const age = this.getAge(r.pushedAt);
      const existing = existingRepoLists.get(r.fullName);
      const inLists = existing && existing.length > 0 ? ` | IN:[${existing.join(", ")}]` : "";
      return `- ${r.fullName} | ${r.description?.slice(0, 70) || "no desc"} | ${r.language || "?"} | ⭐${r.stargazersCount} | ${age}${r.archived ? " | ARCHIVED" : ""}${inLists}`;
    }).join("\n");

    const prompt = `Classify these GitHub repos into lists.

Lists (use the NUMBER, not the name):
${numberedLists}

Actions:
- "categorize": assign to a NEW list (use list NUMBER 1-${listNames.length}). A repo can be in multiple lists.
- "keep": already well-categorized or doesn't fit any list
- "unstar": deprecated/joke/broken repos only (be conservative!)

Note: Repos marked with "IN:[...]" are already in those lists. You can add them to OTHER lists if appropriate, or mark as "keep" if they're already well-categorized.

Repos:
${repoLines}

Return JSON array:
[
  { "repo": "owner/name", "action": "categorize", "list": 1 },
  { "repo": "owner/name", "action": "keep" },
  { "repo": "owner/name", "action": "unstar" }
]`;

    const response = await this.callLLM(prompt, this.models.analysis);
    const parsed = this.parseJSON(response);

    // 支持两种格式: { repos: [...] } 或直接 [...]
    const repoResults = Array.isArray(parsed) ? parsed : parsed?.repos;

    if (!repoResults || !Array.isArray(repoResults)) {
      console.error("   ⚠️ Parse error, marking batch as keep");
      console.error("   Raw response:", response.slice(0, 500));
      return repos.map((r) => ({ repo: r.fullName, action: "keep" as const, reason: "Parse error" }));
    }

    return repoResults.map((r: any) => {
      if (r.action === "categorize") {
        const listIndex = typeof r.list === "number" ? r.list - 1 : parseInt(r.list) - 1;
        if (listIndex >= 0 && listIndex < listNames.length) {
          return { repo: r.repo, action: "categorize" as const, list: listNames[listIndex], reason: r.reason || "" };
        } else {
          // 无效的 list 编号
          return { repo: r.repo, action: "keep" as const, reason: `Invalid list index: ${r.list}` };
        }
      }
      return { repo: r.repo, action: r.action || "keep", reason: r.reason || "" };
    });
  }

  private getAge(pushedAt: string): string {
    const pushed = new Date(pushedAt);
    const now = new Date();
    const years = Math.floor((now.getTime() - pushed.getTime()) / (365 * 24 * 60 * 60 * 1000));
    if (years >= 2) return `${years}y old`;
    const months = Math.floor((now.getTime() - pushed.getTime()) / (30 * 24 * 60 * 60 * 1000));
    return `${months}m old`;
  }

  private matchReposToList(repos: StarredRepo[], keywords: string[]): string[] {
    const lowerKeywords = keywords.map((k) => k.toLowerCase());
    return repos
      .filter((r) => {
        const text = `${r.fullName} ${r.description || ""} ${r.topics.join(" ")} ${r.language || ""}`.toLowerCase();
        return lowerKeywords.some((k) => text.includes(k));
      })
      .map((r) => r.fullName);
  }

  // 分层抽样：按语言分组，每组抽取一定数量，确保多样性
  private stratifiedSample(repos: StarredRepo[], totalSamples: number): StarredRepo[] {
    const byLanguage: Record<string, StarredRepo[]> = {};

    for (const repo of repos) {
      const lang = repo.language || "Unknown";
      (byLanguage[lang] ||= []).push(repo);
    }

    // 按语言数量排序
    const sortedLangs = Object.entries(byLanguage)
      .sort(([, a], [, b]) => b.length - a.length);

    const samples: StarredRepo[] = [];
    const langCount = sortedLangs.length;

    // 每种语言至少抽1个，剩余按比例分配
    const minPerLang = 1;
    const remaining = totalSamples - Math.min(langCount, totalSamples);

    for (const [lang, langRepos] of sortedLangs) {
      if (samples.length >= totalSamples) break;

      // 按比例计算该语言应抽取的数量
      const proportion = langRepos.length / repos.length;
      const count = Math.max(minPerLang, Math.round(proportion * remaining));
      const toTake = Math.min(count, langRepos.length, totalSamples - samples.length);

      // 随机抽取
      const shuffled = [...langRepos].sort(() => Math.random() - 0.5);
      samples.push(...shuffled.slice(0, toTake));
    }

    return samples;
  }

  private countBy<T>(items: T[], fn: (item: T) => string): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const item of items) {
      const key = fn(item);
      counts[key] = (counts[key] || 0) + 1;
    }
    return Object.fromEntries(Object.entries(counts).sort(([, a], [, b]) => b - a));
  }

  private countTopics(repos: StarredRepo[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const repo of repos) {
      for (const topic of repo.topics) {
        counts[topic] = (counts[topic] || 0) + 1;
      }
    }
    return Object.fromEntries(Object.entries(counts).sort(([, a], [, b]) => b - a));
  }

  private async callLLM(prompt: string, model: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/github-star-manager",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter API error: ${error}`);
    }

    const data = await response.json();

    // 统计 tokens
    if (data.usage) {
      const usage = data.usage;
      this.totalTokens.prompt += usage.prompt_tokens || 0;
      this.totalTokens.completion += usage.completion_tokens || 0;
      this.totalTokens.total += usage.total_tokens || 0;
      this.callCount++;
    }

    return data.choices?.[0]?.message?.content || "";
  }

  private parseJSON(text: string): any {
    try {
      // 先尝试匹配数组格式 [...]
      const arrayMatch = text.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        return JSON.parse(arrayMatch[0]);
      }
      // 再尝试匹配对象格式 {...}
      const objectMatch = text.match(/\{[\s\S]*\}/);
      return objectMatch ? JSON.parse(objectMatch[0]) : null;
    } catch {
      return null;
    }
  }
}
