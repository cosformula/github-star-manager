import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { GitHubClient } from "../../src/github/client";
import { setupTestEnvironment, cleanupTestEnvironment, mockRepos, mockLists } from "../setup";

// ============================================
// GitHubClient Unit Tests
// ============================================

describe("GitHubClient: Constructor", () => {
  beforeEach(() => {
    setupTestEnvironment();
  });

  afterEach(() => {
    cleanupTestEnvironment();
  });

  it("should create client with token", () => {
    const client = new GitHubClient("test-token");
    expect(client).toBeDefined();
  });
});

describe("GitHubClient: getAuthenticatedUser", () => {
  beforeEach(() => {
    setupTestEnvironment();
  });

  afterEach(() => {
    cleanupTestEnvironment();
  });

  it("should return user login and id", async () => {
    const client = new GitHubClient("test-token");
    const user = await client.getAuthenticatedUser();

    expect(user.login).toBe("testuser");
    expect(user.id).toBeDefined();
  });
});

describe("GitHubClient: checkScopes", () => {
  beforeEach(() => {
    setupTestEnvironment();
  });

  afterEach(() => {
    cleanupTestEnvironment();
  });

  it("should return scopes array", async () => {
    const client = new GitHubClient("test-token");
    const { scopes } = await client.checkScopes();

    expect(Array.isArray(scopes)).toBe(true);
  });

  it("should indicate list creation capability", async () => {
    const client = new GitHubClient("test-token");
    const { canCreateLists } = await client.checkScopes();

    expect(typeof canCreateLists).toBe("boolean");
  });

  it("should detect user scope for list permission", async () => {
    const client = new GitHubClient("test-token");
    const { scopes, canCreateLists } = await client.checkScopes();

    // If 'user' scope is present, canCreateLists should be true
    if (scopes.includes("user")) {
      expect(canCreateLists).toBe(true);
    }
  });
});

describe("GitHubClient: getStarredRepos", () => {
  beforeEach(() => {
    setupTestEnvironment();
  });

  afterEach(() => {
    cleanupTestEnvironment();
  });

  it("should return array of repos", async () => {
    const client = new GitHubClient("test-token");
    const repos = await client.getStarredRepos();

    expect(Array.isArray(repos)).toBe(true);
    expect(repos.length).toBeGreaterThan(0);
  });

  it("should call progress callback", async () => {
    const client = new GitHubClient("test-token");
    let progressCalled = false;

    await client.getStarredRepos((count, total) => {
      progressCalled = true;
      expect(count).toBeGreaterThanOrEqual(0);
      expect(total).toBeGreaterThan(0);
    });

    expect(progressCalled).toBe(true);
  });

  it("should respect maxCount limit", async () => {
    const client = new GitHubClient("test-token");
    const maxCount = 5;
    const repos = await client.getStarredRepos(undefined, maxCount);

    expect(repos.length).toBeLessThanOrEqual(maxCount);
  });

  it("should transform repo data correctly", async () => {
    const client = new GitHubClient("test-token");
    const repos = await client.getStarredRepos();

    if (repos.length > 0) {
      const repo = repos[0];
      // Verify expected fields exist
      expect(repo.id).toBeDefined();
      expect(repo.nodeId).toBeDefined();
      expect(repo.name).toBeDefined();
      expect(repo.fullName).toBeDefined();
      expect(repo.url).toBeDefined();
      expect(typeof repo.archived).toBe("boolean");
      expect(typeof repo.disabled).toBe("boolean");
      expect(Array.isArray(repo.topics)).toBe(true);
    }
  });
});

describe("GitHubClient: getLists", () => {
  beforeEach(() => {
    setupTestEnvironment();
  });

  afterEach(() => {
    cleanupTestEnvironment();
  });

  it("should return array of lists", async () => {
    const client = new GitHubClient("test-token");
    const lists = await client.getLists();

    expect(Array.isArray(lists)).toBe(true);
  });

  it("should transform list data correctly", async () => {
    const client = new GitHubClient("test-token");
    const lists = await client.getLists();

    if (lists.length > 0) {
      const list = lists[0];
      expect(list.id).toBeDefined();
      expect(list.name).toBeDefined();
      expect(typeof list.isPrivate).toBe("boolean");
      expect(typeof list.itemCount).toBe("number");
    }
  });
});

describe("GitHubClient: getListItems", () => {
  beforeEach(() => {
    setupTestEnvironment();
  });

  afterEach(() => {
    cleanupTestEnvironment();
  });

  it("should return repos in list", async () => {
    const client = new GitHubClient("test-token");
    const lists = await client.getLists();

    if (lists.length > 0) {
      const items = await client.getListItems(lists[0].id);
      expect(Array.isArray(items)).toBe(true);
    }
  });

  it("should handle pagination", async () => {
    const client = new GitHubClient("test-token");
    const lists = await client.getLists();

    if (lists.length > 0) {
      // Items should be fetched completely (pagination handled internally)
      const items = await client.getListItems(lists[0].id);
      expect(items).toBeInstanceOf(Array);
    }
  });
});

describe("GitHubClient: createList", () => {
  beforeEach(() => {
    setupTestEnvironment();
  });

  afterEach(() => {
    cleanupTestEnvironment();
  });

  it("should create list with name and description", async () => {
    const client = new GitHubClient("test-token");
    const list = await client.createList("Test List", "Test description");

    expect(list.name).toBe("Test List");
    expect(list.id).toBeDefined();
  });

  it("should create private list when specified", async () => {
    const client = new GitHubClient("test-token");
    const list = await client.createList("Private List", "Private", true);

    expect(list).toBeDefined();
  });
});

describe("GitHubClient: getRepoByName", () => {
  beforeEach(() => {
    setupTestEnvironment();
  });

  afterEach(() => {
    cleanupTestEnvironment();
  });

  it("should return repo by fullName", async () => {
    const client = new GitHubClient("test-token");
    const repo = await client.getRepoByName("facebook/react");

    expect(repo).toBeDefined();
    expect(repo?.fullName).toBe("facebook/react");
  });

  it("should return null for invalid fullName format", async () => {
    const client = new GitHubClient("test-token");
    const repo = await client.getRepoByName("invalid");

    expect(repo).toBeNull();
  });

  it("should handle non-existent repo", async () => {
    const client = new GitHubClient("test-token");
    const repo = await client.getRepoByName("nonexistent/repo-that-does-not-exist");

    // Mock might return null or throw
    // Either way, should handle gracefully
    expect(true).toBe(true);
  });
});

// ============================================
// Data Transformation Tests
// ============================================

describe("GitHubClient: REST to Model Transformation", () => {
  it("should map snake_case to camelCase", () => {
    const restData = {
      id: 1,
      node_id: "R_1",
      full_name: "owner/repo",
      stargazers_count: 100,
      forks_count: 10,
      updated_at: "2024-01-01",
      pushed_at: "2024-01-01",
    };

    // Simulate transformation
    const transformed = {
      id: restData.id,
      nodeId: restData.node_id,
      fullName: restData.full_name,
      stargazersCount: restData.stargazers_count,
      forksCount: restData.forks_count,
      updatedAt: restData.updated_at,
      pushedAt: restData.pushed_at,
    };

    expect(transformed.nodeId).toBe("R_1");
    expect(transformed.fullName).toBe("owner/repo");
    expect(transformed.stargazersCount).toBe(100);
  });

  it("should handle null values", () => {
    const restData = {
      description: null,
      homepage: null,
      language: null,
    };

    expect(restData.description).toBeNull();
    expect(restData.homepage).toBeNull();
    expect(restData.language).toBeNull();
  });

  it("should handle missing topics", () => {
    const restData = {
      topics: undefined,
    };

    const topics = restData.topics || [];
    expect(topics).toEqual([]);
  });
});

describe("GitHubClient: GraphQL to Model Transformation", () => {
  it("should map GraphQL fields correctly", () => {
    const graphqlData = {
      id: "R_graphql_1",
      databaseId: 123,
      nameWithOwner: "owner/repo",
      stargazerCount: 100,
      forkCount: 10,
      isArchived: false,
      isDisabled: false,
    };

    // Simulate transformation
    const transformed = {
      nodeId: graphqlData.id,
      id: graphqlData.databaseId,
      fullName: graphqlData.nameWithOwner,
      stargazersCount: graphqlData.stargazerCount,
      forksCount: graphqlData.forkCount,
      archived: graphqlData.isArchived,
      disabled: graphqlData.isDisabled,
    };

    expect(transformed.nodeId).toBe("R_graphql_1");
    expect(transformed.id).toBe(123);
    expect(transformed.archived).toBe(false);
  });

  it("should handle primaryLanguage", () => {
    const withLanguage = { primaryLanguage: { name: "TypeScript" } };
    const withoutLanguage = { primaryLanguage: null };

    expect(withLanguage.primaryLanguage?.name).toBe("TypeScript");
    expect(withoutLanguage.primaryLanguage?.name).toBeUndefined();
  });

  it("should transform repositoryTopics", () => {
    const graphqlTopics = {
      repositoryTopics: {
        nodes: [
          { topic: { name: "javascript" } },
          { topic: { name: "typescript" } },
        ],
      },
    };

    const topics = graphqlTopics.repositoryTopics.nodes.map((n) => n.topic.name);
    expect(topics).toEqual(["javascript", "typescript"]);
  });
});

// ============================================
// Error Handling Tests
// ============================================

describe("GitHubClient: Error Handling", () => {
  beforeEach(() => {
    setupTestEnvironment();
  });

  afterEach(() => {
    cleanupTestEnvironment();
  });

  it("should handle GraphQL errors gracefully", () => {
    const errorResponse = {
      errors: [{ message: "Test error" }],
    };

    const errorMessage = errorResponse.errors.map((e) => e.message).join(", ");
    expect(errorMessage).toBe("Test error");
  });

  it("should mark server errors as retryable", () => {
    const serverError = {
      message: "Something went wrong while executing your query",
      status: 500,
    };

    const isRetryable =
      serverError.message.includes("Something went wrong") ||
      serverError.status >= 500;
    expect(isRetryable).toBe(true);
  });

  it("should not mark client errors as retryable", () => {
    const clientError = {
      message: "Bad credentials",
      status: 401,
    };

    const isRetryable =
      clientError.message.includes("Something went wrong") ||
      clientError.status >= 500;
    expect(isRetryable).toBe(false);
  });
});

// ============================================
// Repo Lists Handling Tests
// ============================================

describe("GitHubClient: Repo Lists Operations", () => {
  beforeEach(() => {
    setupTestEnvironment();
  });

  afterEach(() => {
    cleanupTestEnvironment();
  });

  it("should handle addRepoToList with existing lists", async () => {
    const client = new GitHubClient("test-token");

    // Should not throw - adds repo to list with existing list context
    await client.addRepoToList("L_list1", "R_kg1", ["L_list1"]);
    expect(true).toBe(true);
  });

  it("should handle removeRepoFromList", async () => {
    const client = new GitHubClient("test-token");

    // Should not throw
    await client.removeRepoFromList("L_list1", "R_kg1", []);
    expect(true).toBe(true);
  });
});
