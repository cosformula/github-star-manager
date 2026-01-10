import type { StarredRepo, StarList, ListSuggestion, RepoSuggestion, AnalysisResult, UnstarOptions, UnstarCriteriaId } from "./types";
import { Spinner } from "./spinner";

export interface ModelConfig {
  // Categorization suggestions - needs creativity, use smarter model
  categorization: string;
  // Unstar analysis - simple judgment, use cheaper model
  analysis: string;
}

const DEFAULT_MODELS: ModelConfig = {
  categorization: "xiaomi/mimo-v2-flash:free", // Free model
  analysis: "xiaomi/mimo-v2-flash:free",       // Free model
};

export class RepoAnalyzer {
  private apiKey: string;
  private models: ModelConfig;
  private baseUrl = "https://openrouter.ai/api/v1";
  private debugMode = false;
  private maxBatches = Infinity;

  // Token tracking
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

  getTokenStats(): { prompt: number; completion: number; total: number; calls: number } {
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
    // Use only existing lists, don't suggest new ones
    if (options.useExistingListsOnly && existingLists.length > 0) {
      console.log(`   Using existing ${existingLists.length} lists for categorization\n`);
      return existingLists.map((l) => ({
        name: l.name,
        description: l.description || "",
        matchingRepos: [],
      }));
    }

    const tokensBefore = this.totalTokens.total;
    const spinner = new Spinner("AI generating category suggestions");
    spinner.start();
    const suggestedLists = await this.suggestLists(repos, existingLists, options.shouldReorganize);
    const tokensUsed = this.totalTokens.total - tokensBefore;
    spinner.stop(`Category suggestions complete (${suggestedLists.length} lists) [${tokensUsed.toLocaleString()} tokens]`);

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
   * Analyze repos for unstar suggestions only (independent of categorization)
   */
  async analyzeForUnstar(
    repos: StarredRepo[],
    options: UnstarOptions,
    onProgress?: (processed: number) => void
  ): Promise<RepoSuggestion[]> {
    const results: RepoSuggestion[] = [];
    const batchSize = 50;

    for (let i = 0; i < repos.length; i += batchSize) {
      const batch = repos.slice(i, i + batchSize);
      const batchResults = await this.analyzeUnstarBatch(batch, options);

      for (const result of batchResults) {
        const repo = repos.find((r) => r.fullName === result.repo);
        if (repo) {
          results.push({ repo, action: "unstar", reason: result.reason });
        }
      }

      // Mark remaining repos as keep
      for (const repo of batch) {
        if (!batchResults.find((r) => r.repo === repo.fullName)) {
          results.push({ repo, action: "keep", reason: "No issues found" });
        }
      }

      onProgress?.(Math.min(i + batchSize, repos.length));
    }

    return results;
  }

  /**
   * Build unstar criteria prompt based on user-selected options
   */
  private buildUnstarCriteriaPrompt(options: UnstarOptions): { include: string; exclude: string } {
    const staleYears = options.staleYears ?? 2;
    const lowStarsThreshold = options.lowStarsThreshold ?? 100;

    const criteriaDescriptions: Record<UnstarCriteriaId, string> = {
      archived: "Archived repos (marked as archived by owner)",
      stale: `Stale repos (not updated in ${staleYears}+ years)`,
      low_stars: `Low popularity repos (< ${lowStarsThreshold} stars)`,
      deprecated: "Deprecated repos (has recommended replacement or marked deprecated)",
      personal_fork: "Personal forks (forks of other repos, especially outdated ones)",
      joke_meme: "Joke/meme repos (not meant for serious use)",
    };

    const includeCriteria = options.criteria
      .map((id) => `- ${criteriaDescriptions[id]}`)
      .join("\n");

    // Build exclusion criteria (some conditions not selected by user that should be preserved)
    const excludeItems: string[] = [];
    if (!options.criteria.includes("archived")) {
      excludeItems.push("- Archived but still useful repos (reference, learning)");
    }
    if (!options.criteria.includes("stale")) {
      excludeItems.push("- Old but classic/stable libraries");
    }
    if (!options.criteria.includes("low_stars")) {
      excludeItems.push("- Low star count but useful niche tools");
    }
    // Always preserve
    excludeItems.push("- Active learning resources");
    excludeItems.push("- Repos with high personal value (tools you actually use)");

    let customNote = "";
    if (options.customCriteria) {
      customNote = `\n\nAdditional user-specified criteria:\n${options.customCriteria}`;
    }

    return {
      include: includeCriteria + customNote,
      exclude: excludeItems.join("\n"),
    };
  }

  private async analyzeUnstarBatch(repos: StarredRepo[], options: UnstarOptions): Promise<Array<{ repo: string; reason: string }>> {
    const { include, exclude } = this.buildUnstarCriteriaPrompt(options);
    const staleYears = options.staleYears ?? 2;
    const lowStarsThreshold = options.lowStarsThreshold ?? 100;

    const prompt = `Analyze these GitHub repos and identify which ones should be UNSTARRED based on the criteria below.

UNSTAR criteria (repos matching ANY of these should be suggested for unstar):
${include}

Do NOT suggest unstar for:
${exclude}

Repos:
${repos.map((r) => {
  const age = this.getAge(r.pushedAt);
  const isFork = r.fullName.includes("/") && r.forksCount === 0 && r.stargazersCount < 10;
  return `- ${r.fullName} | ${r.description?.slice(0, 60) || "no desc"} | ⭐${r.stargazersCount} | ${age} | ${r.archived ? "ARCHIVED" : "active"}${isFork ? " | likely-fork" : ""}`;
}).join("\n")}

Return JSON with ONLY repos to unstar:
{ "unstar": [{ "repo": "owner/name", "reason": "brief reason" }] }

If none should be unstarred: { "unstar": [] }`;

    const parsed = await this.callLLMForJSON(prompt, this.models.analysis);
    return parsed?.unstar || [];
  }

  private async suggestLists(repos: StarredRepo[], existingLists: StarList[], shouldReorganize = false): Promise<ListSuggestion[]> {
    const languages = this.countBy(repos, (r) => r.language || "Unknown");
    const topics = this.countTopics(repos);

    // Stratified sampling: sample from different languages to ensure diversity
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

    const parsed = await this.callLLMForJSON(prompt, this.models.categorization);

    if (!parsed?.lists) return [];

    return parsed.lists.map((list: { name: string; description: string; keywords?: string[] }) => ({
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

    // Batch analyze with LLM: determine unstar and categorization simultaneously
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
    const batchSize = 30; // Smaller batch size since we're doing both classification and unstar

    let batchCount = 0;
    for (let i = 0; i < repos.length; i += batchSize) {
      // Limit batch count in debug mode
      if (this.debugMode && batchCount >= this.maxBatches) {
        // Mark remaining as keep
        for (let j = i; j < repos.length; j++) {
          const repo = repos[j];
          if (repo) {
            results.push({ repo: repo.fullName, action: "keep", reason: "[debug] skipped" });
          }
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
    // Use numbers instead of names for more stable parsing
    const numberedLists = listNames.map((name, i) => `${i + 1}. ${name}`).join("\n");

    // Add info about which lists each repo is already in
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

    const parsed = await this.callLLMForJSON(prompt, this.models.analysis);

    // Support both formats: { repos: [...] } or direct [...]
    const repoResults = Array.isArray(parsed) ? parsed : parsed?.repos;

    if (!repoResults || !Array.isArray(repoResults)) {
      console.error("   ⚠️ Parse error after retries, marking batch as keep");
      return repos.map((r) => ({ repo: r.fullName, action: "keep" as const, reason: "Parse error" }));
    }

    interface ClassifyResult {
      repo: string;
      action: "unstar" | "categorize" | "keep";
      list?: number | string;
      reason?: string;
    }

    return repoResults.map((r: ClassifyResult) => {
      if (r.action === "categorize") {
        const listIndex = typeof r.list === "number" ? r.list - 1 : parseInt(String(r.list)) - 1;
        if (listIndex >= 0 && listIndex < listNames.length) {
          return { repo: r.repo, action: "categorize" as const, list: listNames[listIndex], reason: r.reason || "" };
        } else {
          // Invalid list index
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

  // Stratified sampling: group by language, sample from each group to ensure diversity
  private stratifiedSample(repos: StarredRepo[], totalSamples: number): StarredRepo[] {
    const byLanguage: Record<string, StarredRepo[]> = {};

    for (const repo of repos) {
      const lang = repo.language || "Unknown";
      (byLanguage[lang] ||= []).push(repo);
    }

    // Sort by language count
    const sortedLangs = Object.entries(byLanguage)
      .sort(([, a], [, b]) => b.length - a.length);

    const samples: StarredRepo[] = [];
    const langCount = sortedLangs.length;

    // At least 1 per language, distribute remaining proportionally
    const minPerLang = 1;
    const remaining = totalSamples - Math.min(langCount, totalSamples);

    for (const [, langRepos] of sortedLangs) {
      if (samples.length >= totalSamples) break;

      // Calculate sample count proportionally
      const proportion = langRepos.length / repos.length;
      const count = Math.max(minPerLang, Math.round(proportion * remaining));
      const toTake = Math.min(count, langRepos.length, totalSamples - samples.length);

      // Random sampling
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

  private async callLLM(prompt: string, model: string, jsonMode = false): Promise<string> {
    const body: Record<string, unknown> = {
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 4096,
    };

    // Enable JSON mode if supported
    if (jsonMode) {
      body.response_format = { type: "json_object" };
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/github-star-manager",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter API error: ${error}`);
    }

    const data = await response.json() as {
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      choices?: Array<{ message?: { content?: string } }>;
    };

    // Track token usage
    if (data.usage) {
      const usage = data.usage;
      this.totalTokens.prompt += usage.prompt_tokens || 0;
      this.totalTokens.completion += usage.completion_tokens || 0;
      this.totalTokens.total += usage.total_tokens || 0;
      this.callCount++;
    }

    return data.choices?.[0]?.message?.content || "";
  }

  /**
   * Call LLM and parse JSON response with retry logic
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async callLLMForJSON(prompt: string, model: string, maxRetries = 3): Promise<any> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.callLLM(prompt, model, true);
        const parsed = this.parseJSON(response);
        if (parsed !== null) {
          return parsed;
        }
        // Parse failed, will retry
        if (attempt < maxRetries) {
          console.error(`   ⚠️ JSON parse failed, retrying (${attempt}/${maxRetries})...`);
        }
      } catch (error) {
        if (attempt >= maxRetries) {
          throw error;
        }
        console.error(`   ⚠️ LLM call failed, retrying (${attempt}/${maxRetries})...`);
      }
    }
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private parseJSON(text: string): any {
    try {
      // Try matching array format [...] first
      const arrayMatch = text.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        return JSON.parse(arrayMatch[0]);
      }
      // Then try matching object format {...}
      const objectMatch = text.match(/\{[\s\S]*\}/);
      return objectMatch ? JSON.parse(objectMatch[0]) : null;
    } catch {
      // Return null to trigger retry
      return null;
    }
  }
}
