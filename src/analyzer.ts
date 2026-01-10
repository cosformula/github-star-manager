import type { StarredRepo, StarList, ListSuggestion, RepoSuggestion, AnalysisResult } from "./types";

export class RepoAnalyzer {
  private apiKey: string;
  private model: string;
  private baseUrl = "https://openrouter.ai/api/v1";

  constructor(apiKey: string, model = "anthropic/claude-3-5-haiku") {
    this.apiKey = apiKey;
    this.model = model;
  }

  async analyze(repos: StarredRepo[], existingLists: StarList[]): Promise<AnalysisResult> {
    const now = new Date();
    const twoYearsAgo = new Date(now);
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

    const staleRepos = repos.filter((r) => new Date(r.pushedAt) < twoYearsAgo);
    const archivedRepos = repos.filter((r) => r.archived);

    const suggestedLists = await this.suggestLists(repos, existingLists);
    const repoSuggestions = await this.suggestRepoActions(repos, suggestedLists, staleRepos, archivedRepos);

    return { suggestedLists, repoSuggestions, staleRepos, archivedRepos };
  }

  private async suggestLists(repos: StarredRepo[], existingLists: StarList[]): Promise<ListSuggestion[]> {
    const languages = this.countBy(repos, (r) => r.language || "Unknown");
    const topics = this.countTopics(repos);

    const prompt = `Analyze these GitHub starred repos and suggest good list categories.

Existing lists: ${existingLists.map((l) => l.name).join(", ") || "None"}

Stats:
- Total repos: ${repos.length}
- Top languages: ${Object.entries(languages).slice(0, 10).map(([l, c]) => `${l}(${c})`).join(", ")}
- Top topics: ${Object.entries(topics).slice(0, 15).map(([t, c]) => `${t}(${c})`).join(", ")}

Sample repos (first 30):
${repos.slice(0, 30).map((r) => `- ${r.fullName}: ${r.description?.slice(0, 60) || "no desc"} [${r.language || "?"}] topics:${r.topics.slice(0, 3).join(",")}`).join("\n")}

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

    const response = await this.callLLM(prompt);
    const parsed = this.parseJSON(response);

    if (!parsed?.lists) return [];

    return parsed.lists.map((list: any) => ({
      name: list.name,
      description: list.description,
      matchingRepos: this.matchReposToList(repos, list.keywords || []),
    }));
  }

  private async suggestRepoActions(
    repos: StarredRepo[],
    suggestedLists: ListSuggestion[],
    staleRepos: StarredRepo[],
    archivedRepos: StarredRepo[]
  ): Promise<RepoSuggestion[]> {
    const suggestions: RepoSuggestion[] = [];

    for (const repo of archivedRepos) {
      suggestions.push({ repo, action: "unstar", reason: "Repository is archived" });
    }

    const staleNotArchived = staleRepos.filter((r) => !r.archived);
    if (staleNotArchived.length > 0) {
      const staleSuggestions = await this.analyzeStaleRepos(staleNotArchived);
      suggestions.push(...staleSuggestions);
    }

    const processedIds = new Set(suggestions.map((s) => s.repo.id));
    const remaining = repos.filter((r) => !processedIds.has(r.id));

    for (const repo of remaining) {
      const matchedList = this.findBestList(repo, suggestedLists);
      if (matchedList) {
        suggestions.push({ repo, action: "categorize", suggestedList: matchedList, reason: `Matches "${matchedList}"` });
      } else {
        suggestions.push({ repo, action: "keep", reason: "No specific category" });
      }
    }

    return suggestions;
  }

  private async analyzeStaleRepos(repos: StarredRepo[]): Promise<RepoSuggestion[]> {
    if (repos.length === 0) return [];

    const prompt = `These GitHub repos haven't been updated in 2+ years. Suggest whether to keep or unstar each.

Repos:
${repos.slice(0, 50).map((r) => `- ${r.fullName}: ${r.description?.slice(0, 80) || "no desc"} [${r.language}] stars:${r.stargazersCount} lastPush:${r.pushedAt.split("T")[0]}`).join("\n")}

Consider:
- High star count = likely still useful reference
- Some tools are "done" and don't need updates
- Learning resources may still be valuable

Return JSON:
{
  "suggestions": [
    { "repo": "owner/name", "action": "keep" | "unstar", "reason": "brief reason" }
  ]
}`;

    const response = await this.callLLM(prompt);
    const parsed = this.parseJSON(response);

    if (!parsed?.suggestions) return [];

    return parsed.suggestions
      .map((s: any) => {
        const repo = repos.find((r) => r.fullName === s.repo);
        if (!repo) return null;
        return { repo, action: s.action as "keep" | "unstar", reason: s.reason };
      })
      .filter(Boolean) as RepoSuggestion[];
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

  private findBestList(repo: StarredRepo, lists: ListSuggestion[]): string | undefined {
    for (const list of lists) {
      if (list.matchingRepos.includes(repo.fullName)) return list.name;
    }
    return undefined;
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

  private async callLLM(prompt: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/github-star-manager",
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter API error: ${error}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "";
  }

  private parseJSON(text: string): any {
    try {
      const match = text.match(/\{[\s\S]*\}/);
      return match ? JSON.parse(match[0]) : null;
    } catch {
      return null;
    }
  }
}
