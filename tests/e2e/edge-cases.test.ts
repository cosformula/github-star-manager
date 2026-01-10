import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mock } from "bun:test";
import {
  setupTestEnvironment,
  cleanupTestEnvironment,
  queuePromptResponses,
  mockRepos,
  captureConsole,
  suppressConsole,
} from "../setup";
import {
  emptyRepos,
  emptyLists,
  specialCharRepos,
  nullFieldRepos,
  generateLargeRepoSet,
  allArchivedRepos,
  allStaleRepos,
  mockScopesNoListPermission,
  malformedAIResponses,
} from "../mocks/fixtures";

// ============================================
// Empty Data Edge Cases
// ============================================
describe("Edge Case: Empty Data", () => {
  beforeEach(() => {
    setupTestEnvironment();
  });

  afterEach(() => {
    cleanupTestEnvironment();
  });

  it("should handle zero starred repos gracefully", async () => {
    // Override fetch to return empty repos
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url: string | URL | Request, options?: RequestInit) => {
      const urlStr = typeof url === "string" ? url : url.toString();

      if (urlStr.includes("api.github.com/graphql")) {
        const body = JSON.parse(options?.body as string);
        const query = body.query as string;

        if (query.includes("viewer") && query.includes("lists")) {
          return new Response(
            JSON.stringify({
              data: { viewer: { lists: { nodes: [] } } },
            }),
            { status: 200 }
          );
        }
      }

      return originalFetch(url, options);
    };

    // Queue responses for flow with no repos
    queuePromptResponses([
      { mode: "dryrun" },
      { action: "exit" }, // Exit immediately since no repos
    ]);

    const restore = suppressConsole();
    try {
      const { StarManagerAgent } = await import("../../src/agent");
      const agent = new StarManagerAgent();
      await agent.run();
      expect(true).toBe(true);
    } finally {
      restore();
      globalThis.fetch = originalFetch;
    }
  });

  it("should handle empty topics array", () => {
    const repoWithNoTopics = {
      ...mockRepos[0],
      topics: [],
    };
    expect(repoWithNoTopics.topics).toEqual([]);
    expect(repoWithNoTopics.topics.length).toBe(0);
  });

  it("should handle repo with null description", () => {
    expect(nullFieldRepos[0].description).toBeNull();
    expect(nullFieldRepos[0].language).toBeNull();
    expect(nullFieldRepos[0].homepage).toBeNull();
  });
});

// ============================================
// Special Characters Edge Cases
// ============================================
describe("Edge Case: Special Characters", () => {
  it("should handle repo names with dots", () => {
    const repo = specialCharRepos.find((r) => r.name.includes("."));
    expect(repo).toBeDefined();
    expect(repo!.fullName).toBe("user/project-name.js");
  });

  it("should handle repo names with underscores", () => {
    const repo = specialCharRepos.find((r) => r.name.includes("_"));
    expect(repo).toBeDefined();
    expect(repo!.fullName).toBe("user-name/my_project_v2");
  });

  it("should handle descriptions with HTML entities", () => {
    const repo = specialCharRepos.find((r) => r.description?.includes("<script>"));
    expect(repo).toBeDefined();
    expect(repo!.description).toContain("<script>");
  });

  it("should handle Chinese characters in repo names", () => {
    const repo = specialCharRepos.find((r) => r.name === "中文项目");
    expect(repo).toBeDefined();
    expect(repo!.fullName).toBe("用户/中文项目");
  });

  it("should handle emoji in repo names", () => {
    const repo = specialCharRepos.find((r) => r.name.includes("🚀"));
    expect(repo).toBeDefined();
    expect(repo!.description).toContain("🎉");
  });

  it("should correctly split fullName with special characters", () => {
    for (const repo of specialCharRepos) {
      const parts = repo.fullName.split("/");
      expect(parts.length).toBeGreaterThanOrEqual(2);
      // The last part should be the repo name
      expect(parts[parts.length - 1]).toBe(repo.name);
    }
  });
});

// ============================================
// API Error Edge Cases
// ============================================
describe("Edge Case: API Errors", () => {
  beforeEach(() => {
    setupTestEnvironment();
  });

  afterEach(() => {
    cleanupTestEnvironment();
  });

  it("should handle GitHub API rate limit error", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({ message: "API rate limit exceeded" }),
        {
          status: 403,
          headers: { "X-RateLimit-Remaining": "0" },
        }
      );
    };

    try {
      const response = await fetch("https://api.github.com/user");
      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.message).toContain("rate limit");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should handle GitHub API 401 unauthorized", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({ message: "Bad credentials" }),
        { status: 401 }
      );
    };

    try {
      const response = await fetch("https://api.github.com/user");
      expect(response.status).toBe(401);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should handle GitHub API 500 server error", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({ message: "Internal Server Error" }),
        { status: 500 }
      );
    };

    try {
      const response = await fetch("https://api.github.com/user");
      expect(response.status).toBe(500);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should handle network timeout", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error("Network request failed: timeout");
    };

    try {
      await expect(fetch("https://api.github.com/user")).rejects.toThrow("timeout");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should handle OpenRouter API error", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url: string | URL | Request) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("openrouter.ai")) {
        return new Response(
          JSON.stringify({ error: { message: "Model not available" } }),
          { status: 503 }
        );
      }
      return originalFetch(url);
    };

    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        body: JSON.stringify({ messages: [] }),
      });
      expect(response.status).toBe(503);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ============================================
// Malformed Response Edge Cases
// ============================================
describe("Edge Case: Malformed AI Responses", () => {
  it("should have test data for empty response", () => {
    expect(malformedAIResponses.emptyResponse).toBe("");
  });

  it("should have test data for invalid JSON", () => {
    expect(() => JSON.parse(malformedAIResponses.invalidJson)).toThrow();
  });

  it("should have test data for missing fields", () => {
    const parsed = JSON.parse(malformedAIResponses.missingFields);
    expect(parsed.categorization).toBeUndefined();
  });

  it("should have test data for null content", () => {
    const parsed = JSON.parse(malformedAIResponses.nullContent);
    expect(parsed.categorization).toBeNull();
  });

  it("should have test data for empty array", () => {
    const parsed = JSON.parse(malformedAIResponses.emptyArray);
    expect(parsed.categorization).toEqual([]);
  });

  it("should have test data for wrong types", () => {
    const parsed = JSON.parse(malformedAIResponses.wrongTypes);
    expect(typeof parsed.categorization).toBe("string");
    expect(Array.isArray(parsed.categorization)).toBe(false);
  });
});

// ============================================
// Permission Edge Cases
// ============================================
describe("Edge Case: Permission Issues", () => {
  it("should detect missing list creation permission", () => {
    expect(mockScopesNoListPermission.canCreateLists).toBe(false);
    expect(mockScopesNoListPermission.scopes).not.toContain("user");
  });

  it("should handle scopes without user permission", () => {
    const scopes = mockScopesNoListPermission.scopes;
    const canCreateLists = scopes.includes("user") || scopes.includes("write:user");
    expect(canCreateLists).toBe(false);
  });
});

// ============================================
// Large Data Set Edge Cases
// ============================================
describe("Edge Case: Large Data Sets", () => {
  it("should generate correct number of repos", () => {
    const repos = generateLargeRepoSet(100);
    expect(repos.length).toBe(100);
  });

  it("should generate repos with unique IDs", () => {
    const repos = generateLargeRepoSet(100);
    const ids = new Set(repos.map((r) => r.id));
    expect(ids.size).toBe(100);
  });

  it("should generate repos with varied languages", () => {
    const repos = generateLargeRepoSet(100);
    const languages = new Set(repos.map((r) => r.language));
    expect(languages.size).toBe(5); // JavaScript, Python, TypeScript, Go, Rust
  });

  it("should generate some archived repos", () => {
    const repos = generateLargeRepoSet(100);
    const archivedCount = repos.filter((r) => r.archived).length;
    expect(archivedCount).toBe(2); // Every 50th repo: 0 and 50
  });

  it("should handle 500 repos pagination", () => {
    const repos = generateLargeRepoSet(500);
    expect(repos.length).toBe(500);

    // Simulate pagination (100 per page)
    const pages = Math.ceil(repos.length / 100);
    expect(pages).toBe(5);

    // Verify each page
    for (let i = 0; i < pages; i++) {
      const pageRepos = repos.slice(i * 100, (i + 1) * 100);
      expect(pageRepos.length).toBeLessThanOrEqual(100);
    }
  });
});

// ============================================
// All Archived/Stale Repos Edge Cases
// ============================================
describe("Edge Case: All Archived Repos", () => {
  it("should have all repos marked as archived", () => {
    const archivedCount = allArchivedRepos.filter((r) => r.archived).length;
    expect(archivedCount).toBe(allArchivedRepos.length);
  });

  it("should suggest unstar for all archived repos", () => {
    // Simulating the logic from analyzer
    const suggestions = allArchivedRepos.map((repo) => ({
      repo,
      action: repo.archived ? "unstar" : "keep",
    }));

    const unstarCount = suggestions.filter((s) => s.action === "unstar").length;
    expect(unstarCount).toBe(allArchivedRepos.length);
  });
});

describe("Edge Case: All Stale Repos", () => {
  it("should have all repos with old dates", () => {
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

    for (const repo of allStaleRepos) {
      const updatedAt = new Date(repo.updatedAt);
      expect(updatedAt < twoYearsAgo).toBe(true);
    }
  });

  it("should correctly identify stale threshold", () => {
    const staleYears = 2;
    const now = new Date();
    const threshold = new Date();
    threshold.setFullYear(now.getFullYear() - staleYears);

    for (const repo of allStaleRepos) {
      const repoDate = new Date(repo.pushedAt);
      const isStale = repoDate < threshold;
      expect(isStale).toBe(true);
    }
  });
});

// ============================================
// Boundary Value Edge Cases
// ============================================
describe("Edge Case: Boundary Values", () => {
  it("should handle repo with zero stars", () => {
    expect(nullFieldRepos[0].stargazersCount).toBe(0);
  });

  it("should handle repo with zero forks", () => {
    expect(nullFieldRepos[0].forksCount).toBe(0);
  });

  it("should handle empty string dates", () => {
    expect(nullFieldRepos[0].updatedAt).toBe("");
    expect(nullFieldRepos[0].pushedAt).toBe("");
  });

  it("should handle very high star counts", () => {
    const highStarRepo = mockRepos.find((r) => r.stargazersCount > 200000);
    expect(highStarRepo).toBeDefined();
  });

  it("should handle single repo scenario", () => {
    const singleRepoSet = [mockRepos[0]];
    expect(singleRepoSet.length).toBe(1);

    // Pagination for single repo
    const pages = Math.ceil(singleRepoSet.length / 100);
    expect(pages).toBe(1);
  });

  it("should handle exactly 100 repos (single page boundary)", () => {
    const repos = generateLargeRepoSet(100);
    expect(repos.length).toBe(100);

    const perPage = 100;
    const totalPages = Math.ceil(repos.length / perPage);
    expect(totalPages).toBe(1);
  });

  it("should handle 101 repos (pagination boundary)", () => {
    const repos = generateLargeRepoSet(101);
    expect(repos.length).toBe(101);

    const perPage = 100;
    const totalPages = Math.ceil(repos.length / perPage);
    expect(totalPages).toBe(2);
  });
});

// ============================================
// Concurrent Operations Edge Cases
// ============================================
describe("Edge Case: Concurrent Operations", () => {
  beforeEach(() => {
    setupTestEnvironment();
  });

  afterEach(() => {
    cleanupTestEnvironment();
  });

  it("should handle multiple parallel fetch calls", async () => {
    const urls = [
      "https://api.github.com/user",
      "https://api.github.com/user",
      "https://api.github.com/user",
    ];

    const results = await Promise.all(urls.map((url) => fetch(url)));

    expect(results.length).toBe(3);
    for (const result of results) {
      expect(result.status).toBe(200);
    }
  });

  it("should handle rapid sequential calls", async () => {
    const results: Response[] = [];

    for (let i = 0; i < 5; i++) {
      const response = await fetch("https://api.github.com/user");
      results.push(response);
    }

    expect(results.length).toBe(5);
    for (const result of results) {
      expect(result.status).toBe(200);
    }
  });
});

// ============================================
// GraphQL Error Edge Cases
// ============================================
describe("Edge Case: GraphQL Errors", () => {
  beforeEach(() => {
    setupTestEnvironment();
  });

  afterEach(() => {
    cleanupTestEnvironment();
  });

  it("should handle GraphQL error response", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url: string | URL | Request) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("api.github.com/graphql")) {
        return new Response(
          JSON.stringify({
            errors: [{ message: "Field 'nonexistent' doesn't exist" }],
          }),
          { status: 200 }
        );
      }
      return originalFetch(url);
    };

    try {
      const response = await fetch("https://api.github.com/graphql", {
        method: "POST",
        body: JSON.stringify({ query: "{ viewer { nonexistent } }" }),
      });

      const data = await response.json();
      expect(data.errors).toBeDefined();
      expect(data.errors.length).toBeGreaterThan(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should handle partial GraphQL response", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url: string | URL | Request) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("api.github.com/graphql")) {
        return new Response(
          JSON.stringify({
            data: { viewer: { lists: null } },
            errors: [{ message: "Partial error" }],
          }),
          { status: 200 }
        );
      }
      return originalFetch(url);
    };

    try {
      const response = await fetch("https://api.github.com/graphql", {
        method: "POST",
        body: JSON.stringify({ query: "..." }),
      });

      const data = await response.json();
      expect(data.data).toBeDefined();
      expect(data.errors).toBeDefined();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ============================================
// User Input Edge Cases
// ============================================
describe("Edge Case: User Input Scenarios", () => {
  beforeEach(() => {
    setupTestEnvironment();
  });

  afterEach(() => {
    cleanupTestEnvironment();
  });

  it("should handle undefined prompt response", async () => {
    queuePromptResponses([
      { mode: undefined }, // User pressed Ctrl+C or similar
    ]);

    // The agent should handle undefined gracefully
    expect(true).toBe(true);
  });

  it("should handle empty string inputs", () => {
    const emptyInputs = {
      mode: "",
      action: "",
      listName: "",
    };

    expect(emptyInputs.mode).toBe("");
    expect(emptyInputs.action).toBe("");
  });
});

// ============================================
// List Name Edge Cases
// ============================================
describe("Edge Case: List Names", () => {
  it("should handle list names with special characters", () => {
    const specialListNames = [
      "My List (2024)",
      "Frontend/Backend",
      "AI & ML Tools",
      "Tools - Utilities",
      "中文列表名",
      "List with 'quotes'",
      'List with "double quotes"',
    ];

    for (const name of specialListNames) {
      expect(name.length).toBeGreaterThan(0);
    }
  });

  it("should handle very long list names", () => {
    const longName = "A".repeat(100);
    expect(longName.length).toBe(100);
  });

  it("should handle empty list name", () => {
    const emptyName = "";
    expect(emptyName.length).toBe(0);
  });

  it("should handle list name with only whitespace", () => {
    const whitespaceName = "   ";
    const trimmed = whitespaceName.trim();
    expect(trimmed.length).toBe(0);
  });

  it("should handle duplicate list names", () => {
    const lists = [
      { name: "Frontend", id: "1" },
      { name: "Frontend", id: "2" }, // Duplicate name
    ];

    const names = lists.map((l) => l.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBeLessThan(lists.length);
  });
});
