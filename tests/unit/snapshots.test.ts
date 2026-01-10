import { describe, it, expect } from "bun:test";
import { mockRepos, mockLists, mockSuggestedLists } from "../mocks/fixtures";
import type { PlanAction, ExecutionPlan, RepoSuggestion, ListSuggestion } from "../../src/types";

// ============================================
// Snapshot Tests - Verify output structure stability
// ============================================

describe("Snapshot: StarredRepo Structure", () => {
  it("should have consistent repo structure", () => {
    const repo = mockRepos[0];

    // Verify all expected fields exist
    const expectedFields = [
      "id",
      "nodeId",
      "name",
      "fullName",
      "description",
      "url",
      "homepage",
      "language",
      "topics",
      "stargazersCount",
      "forksCount",
      "updatedAt",
      "pushedAt",
      "archived",
      "disabled",
    ];

    for (const field of expectedFields) {
      expect(repo).toHaveProperty(field);
    }
  });

  it("should match expected repo shape", () => {
    const repo = mockRepos[0];

    expect(typeof repo.id).toBe("number");
    expect(typeof repo.nodeId).toBe("string");
    expect(typeof repo.name).toBe("string");
    expect(typeof repo.fullName).toBe("string");
    expect(typeof repo.url).toBe("string");
    expect(Array.isArray(repo.topics)).toBe(true);
    expect(typeof repo.stargazersCount).toBe("number");
    expect(typeof repo.forksCount).toBe("number");
    expect(typeof repo.archived).toBe("boolean");
    expect(typeof repo.disabled).toBe("boolean");
  });
});

describe("Snapshot: StarList Structure", () => {
  it("should have consistent list structure", () => {
    const list = mockLists[0];

    const expectedFields = ["id", "name", "description", "isPrivate", "itemCount"];

    for (const field of expectedFields) {
      expect(list).toHaveProperty(field);
    }
  });

  it("should match expected list shape", () => {
    const list = mockLists[0];

    expect(typeof list.id).toBe("string");
    expect(typeof list.name).toBe("string");
    expect(typeof list.isPrivate).toBe("boolean");
    expect(typeof list.itemCount).toBe("number");
  });
});

describe("Snapshot: ListSuggestion Structure", () => {
  it("should have consistent suggestion structure", () => {
    const suggestion = mockSuggestedLists[0];

    expect(suggestion).toHaveProperty("name");
    expect(suggestion).toHaveProperty("description");
    expect(suggestion).toHaveProperty("matchingRepos");
  });

  it("should have matchingRepos as array of strings", () => {
    const suggestion = mockSuggestedLists[0];

    expect(Array.isArray(suggestion.matchingRepos)).toBe(true);
    if (suggestion.matchingRepos.length > 0) {
      expect(typeof suggestion.matchingRepos[0]).toBe("string");
    }
  });
});

describe("Snapshot: PlanAction Structure", () => {
  it("should have correct create_list action structure", () => {
    const action: PlanAction = {
      type: "create_list",
      description: "Create list 'Frontend'",
      params: { name: "Frontend", description: "Frontend tools" },
    };

    expect(action.type).toBe("create_list");
    expect(action.params.name).toBeDefined();
  });

  it("should have correct add_to_list action structure", () => {
    const action: PlanAction = {
      type: "add_to_list",
      description: "Add repo to list",
      params: { list_name: "Frontend", repo_full_name: "facebook/react" },
    };

    expect(action.type).toBe("add_to_list");
    expect(action.params.list_name).toBeDefined();
    expect(action.params.repo_full_name).toBeDefined();
  });

  it("should have correct unstar action structure", () => {
    const action: PlanAction = {
      type: "unstar",
      description: "Unstar deprecated repo",
      params: { repo_full_name: "old/deprecated" },
    };

    expect(action.type).toBe("unstar");
    expect(action.params.repo_full_name).toBeDefined();
  });
});

describe("Snapshot: ExecutionPlan Structure", () => {
  it("should have all required fields", () => {
    const plan: ExecutionPlan = {
      summary: "Create 2 lists, categorize 10 repos",
      actions: [],
      reasoning: "Based on analysis",
    };

    expect(plan).toHaveProperty("summary");
    expect(plan).toHaveProperty("actions");
    expect(plan).toHaveProperty("reasoning");
  });

  it("should have actions as array", () => {
    const plan: ExecutionPlan = {
      summary: "Test",
      actions: [
        { type: "create_list", description: "Test", params: { name: "Test" } },
      ],
      reasoning: "Test",
    };

    expect(Array.isArray(plan.actions)).toBe(true);
  });
});

describe("Snapshot: RepoSuggestion Structure", () => {
  it("should have correct categorize suggestion structure", () => {
    const suggestion: RepoSuggestion = {
      repo: mockRepos[0],
      action: "categorize",
      suggestedList: "Frontend",
      reason: "React framework",
    };

    expect(suggestion.action).toBe("categorize");
    expect(suggestion.suggestedList).toBeDefined();
    expect(suggestion.repo).toBeDefined();
  });

  it("should have correct unstar suggestion structure", () => {
    const suggestion: RepoSuggestion = {
      repo: mockRepos[0],
      action: "unstar",
      reason: "Deprecated",
    };

    expect(suggestion.action).toBe("unstar");
    expect(suggestion.suggestedList).toBeUndefined();
  });

  it("should have correct keep suggestion structure", () => {
    const suggestion: RepoSuggestion = {
      repo: mockRepos[0],
      action: "keep",
      reason: "No category found",
    };

    expect(suggestion.action).toBe("keep");
  });
});

// ============================================
// Output Format Snapshots
// ============================================

describe("Snapshot: Plan Summary Format", () => {
  it("should generate correct summary format", () => {
    const createCount = 3;
    const addCount = 50;
    const unstarCount = 5;

    const parts: string[] = [];
    if (createCount > 0) parts.push(`创建 ${createCount} 个 lists`);
    if (addCount > 0) parts.push(`分类 ${addCount} 个 repos`);
    if (unstarCount > 0) parts.push(`unstar ${unstarCount} 个 repos`);

    const summary = parts.join(", ");

    expect(summary).toBe("创建 3 个 lists, 分类 50 个 repos, unstar 5 个 repos");
  });

  it("should handle empty plan", () => {
    const parts: string[] = [];
    const summary = parts.length > 0 ? parts.join(", ") : "No actions";

    expect(summary).toBe("No actions");
  });
});

describe("Snapshot: Grouped Actions Format", () => {
  it("should group actions by type correctly", () => {
    const actions: PlanAction[] = [
      { type: "create_list", description: "A", params: { name: "A" } },
      { type: "create_list", description: "B", params: { name: "B" } },
      { type: "add_to_list", description: "C", params: { list_name: "A", repo_full_name: "x/y" } },
      { type: "unstar", description: "D", params: { repo_full_name: "a/b" } },
    ];

    const grouped: Record<string, PlanAction[]> = {};
    for (const action of actions) {
      (grouped[action.type] ||= []).push(action);
    }

    expect(grouped["create_list"]?.length).toBe(2);
    expect(grouped["add_to_list"]?.length).toBe(1);
    expect(grouped["unstar"]?.length).toBe(1);
  });
});

// ============================================
// AI Response Format Snapshots
// ============================================

describe("Snapshot: AI List Suggestion Response", () => {
  it("should parse list suggestion response correctly", () => {
    const response = JSON.stringify({
      lists: [
        { name: "Frontend", description: "Frontend tools", keywords: ["react", "vue"] },
        { name: "Backend", description: "Backend tools", keywords: ["express", "node"] },
      ],
    });

    const parsed = JSON.parse(response);

    expect(parsed.lists).toBeInstanceOf(Array);
    expect(parsed.lists[0].name).toBe("Frontend");
    expect(parsed.lists[0].keywords).toBeInstanceOf(Array);
  });
});

describe("Snapshot: AI Categorization Response", () => {
  it("should parse categorization response correctly", () => {
    const response = JSON.stringify([
      { repo: "facebook/react", action: "categorize", list: 1 },
      { repo: "old/deprecated", action: "unstar" },
      { repo: "misc/tool", action: "keep" },
    ]);

    const parsed = JSON.parse(response);

    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].action).toBe("categorize");
    expect(parsed[1].action).toBe("unstar");
    expect(parsed[2].action).toBe("keep");
  });

  it("should handle repos format wrapper", () => {
    const response = JSON.stringify({
      repos: [
        { repo: "facebook/react", action: "categorize", list: 1 },
      ],
    });

    const parsed = JSON.parse(response);
    const repos = Array.isArray(parsed) ? parsed : parsed.repos;

    expect(Array.isArray(repos)).toBe(true);
  });
});

describe("Snapshot: AI Unstar Response", () => {
  it("should parse unstar response correctly", () => {
    const response = JSON.stringify({
      unstar: [
        { repo: "old/deprecated", reason: "No longer maintained" },
        { repo: "joke/repo", reason: "Joke repository" },
      ],
    });

    const parsed = JSON.parse(response);

    expect(parsed.unstar).toBeInstanceOf(Array);
    expect(parsed.unstar[0].repo).toBe("old/deprecated");
    expect(parsed.unstar[0].reason).toBeDefined();
  });

  it("should handle empty unstar response", () => {
    const response = JSON.stringify({ unstar: [] });
    const parsed = JSON.parse(response);

    expect(parsed.unstar).toEqual([]);
  });
});

// ============================================
// Backup Data Format Snapshots
// ============================================

describe("Snapshot: Backup Data Format", () => {
  it("should have correct backup structure", () => {
    const backup = {
      version: 1,
      timestamp: new Date().toISOString(),
      user: "testuser",
      stars: ["facebook/react", "vuejs/vue"],
      lists: [
        {
          name: "Frontend",
          description: "Frontend tools",
          repos: ["facebook/react"],
        },
      ],
    };

    expect(backup.version).toBe(1);
    expect(backup.user).toBeDefined();
    expect(Array.isArray(backup.stars)).toBe(true);
    expect(Array.isArray(backup.lists)).toBe(true);
    expect(backup.lists[0].name).toBeDefined();
    expect(Array.isArray(backup.lists[0].repos)).toBe(true);
  });
});

// ============================================
// Console Output Format Tests
// ============================================

describe("Snapshot: Progress Output Format", () => {
  it("should format ETA correctly for seconds", () => {
    const eta = 45;
    const etaStr = eta > 60 ? `${Math.floor(eta / 60)}m${eta % 60}s` : `${eta}s`;
    expect(etaStr).toBe("45s");
  });

  it("should format ETA correctly for minutes", () => {
    const eta = 125;
    const etaStr = eta > 60 ? `${Math.floor(eta / 60)}m${eta % 60}s` : `${eta}s`;
    expect(etaStr).toBe("2m5s");
  });

  it("should format token count with locale string", () => {
    const tokens = 12345;
    const formatted = tokens.toLocaleString();
    expect(formatted).toMatch(/12[,.]?345/); // Handle different locales
  });
});
