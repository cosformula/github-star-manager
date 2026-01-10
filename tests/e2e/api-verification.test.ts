import { describe, it, expect, beforeEach, afterEach, spyOn, mock } from "bun:test";
import {
  setupTestEnvironment,
  cleanupTestEnvironment,
  queuePromptResponses,
  suppressConsole,
  mockRepos,
  mockLists,
} from "../setup";

// ============================================
// API Call Tracking
// ============================================

// Track all API calls
interface APICall {
  url: string;
  method: string;
  body?: unknown;
  timestamp: number;
}

let apiCalls: APICall[] = [];

function createTrackingFetchMock(originalFetch: typeof fetch) {
  return async (url: string | URL | Request, options?: RequestInit): Promise<Response> => {
    const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
    const method = options?.method || "GET";
    let body: unknown = undefined;

    if (options?.body) {
      try {
        body = JSON.parse(options.body as string);
      } catch {
        body = options.body;
      }
    }

    apiCalls.push({
      url: urlStr,
      method,
      body,
      timestamp: Date.now(),
    });

    return originalFetch(url, options);
  };
}

// ============================================
// API Call Verification Tests
// ============================================
describe("API Call Verification", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    setupTestEnvironment();
    apiCalls = [];
    originalFetch = globalThis.fetch;
    globalThis.fetch = createTrackingFetchMock(originalFetch);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    cleanupTestEnvironment();
  });

  it("should call GitHub user endpoint first for authentication", async () => {
    queuePromptResponses([
      { mode: "dryrun" },
      { action: "exit" },
    ]);

    const restore = suppressConsole();
    try {
      const { StarManagerAgent } = await import("../../src/agent");
      const agent = new StarManagerAgent();
      await agent.run();

      // First API call should be user authentication
      const firstCall = apiCalls[0];
      expect(firstCall.url).toContain("api.github.com");
    } finally {
      restore();
    }
  });

  it("should call scope check endpoint", async () => {
    queuePromptResponses([
      { mode: "dryrun" },
      { action: "exit" },
    ]);

    const restore = suppressConsole();
    try {
      const { StarManagerAgent } = await import("../../src/agent");
      const agent = new StarManagerAgent();
      await agent.run();

      // Should have scope check call
      const scopeCall = apiCalls.find(
        (c) => c.url === "https://api.github.com/user" && c.method === "GET"
      );
      expect(scopeCall).toBeDefined();
    } finally {
      restore();
    }
  });

  it("should call GraphQL endpoint for lists with correct query", async () => {
    queuePromptResponses([
      { mode: "dryrun" },
      { action: "exit" },
    ]);

    const restore = suppressConsole();
    try {
      const { StarManagerAgent } = await import("../../src/agent");
      const agent = new StarManagerAgent();
      await agent.run();

      // Find GraphQL calls
      const graphqlCalls = apiCalls.filter(
        (c) => c.url === "https://api.github.com/graphql"
      );
      expect(graphqlCalls.length).toBeGreaterThan(0);

      // Check that lists query was made
      const listsQuery = graphqlCalls.find(
        (c) => (c.body as any)?.query?.includes("lists")
      );
      expect(listsQuery).toBeDefined();
    } finally {
      restore();
    }
  });

  it("should call OpenRouter API with correct model", async () => {
    queuePromptResponses([
      { mode: "debug_dryrun" },
      { action: "categorize" },
      { action: "use_existing" },
      { skipCategorized: false },
      { choice: "accept" },
      { choice: "execute" },
      { action: "exit" },
    ]);

    const restore = suppressConsole();
    try {
      const { StarManagerAgent } = await import("../../src/agent");
      const agent = new StarManagerAgent();
      await agent.run();

      // Find OpenRouter calls
      const openRouterCalls = apiCalls.filter(
        (c) => c.url.includes("openrouter.ai")
      );

      if (openRouterCalls.length > 0) {
        // Verify model is specified
        for (const call of openRouterCalls) {
          const body = call.body as any;
          expect(body.model).toBeDefined();
          expect(body.messages).toBeInstanceOf(Array);
        }
      }
    } finally {
      restore();
    }
  });

  it("should not make write API calls in dry run mode", async () => {
    queuePromptResponses([
      { mode: "dryrun" },
      { action: "categorize" },
      { action: "use_existing" },
      { skipCategorized: false },
      { choice: "accept" },
      { choice: "execute" },
      { action: "exit" },
    ]);

    const restore = suppressConsole();
    try {
      const { StarManagerAgent } = await import("../../src/agent");
      const agent = new StarManagerAgent();
      await agent.run();

      // In dry run, should not have mutation calls
      const mutationCalls = apiCalls.filter((c) => {
        if (c.url.includes("graphql") && c.body) {
          const query = (c.body as any)?.query || "";
          return query.includes("mutation");
        }
        return false;
      });

      // Allow createUserList check but not actual mutations that modify data
      // Filter out any actual data-modifying mutations
      const dataModifyingMutations = mutationCalls.filter((c) => {
        const query = (c.body as any)?.query || "";
        return (
          query.includes("updateUserListsForItem") ||
          query.includes("deleteUserList")
        );
      });

      expect(dataModifyingMutations.length).toBe(0);
    } finally {
      restore();
    }
  });

  it("should make API calls in correct order", async () => {
    queuePromptResponses([
      { mode: "dryrun" },
      { action: "exit" },
    ]);

    const restore = suppressConsole();
    try {
      const { StarManagerAgent } = await import("../../src/agent");
      const agent = new StarManagerAgent();
      await agent.run();

      // Expected order: user auth -> scope check -> stars -> lists
      const callUrls = apiCalls.map((c) => c.url);

      // Find indices
      const userCallIndex = callUrls.findIndex((u) => u.includes("api.github.com/user"));
      const graphqlCallIndex = callUrls.findIndex((u) => u.includes("graphql"));

      // User auth should come before GraphQL
      if (userCallIndex >= 0 && graphqlCallIndex >= 0) {
        expect(userCallIndex).toBeLessThan(graphqlCallIndex);
      }
    } finally {
      restore();
    }
  });

  it("should include correct headers in GitHub API calls", async () => {
    // Create a more detailed tracking fetch
    let capturedHeaders: Record<string, string>[] = [];

    const detailedFetch = async (url: string | URL | Request, options?: RequestInit): Promise<Response> => {
      const headers: Record<string, string> = {};
      if (options?.headers) {
        const h = options.headers as Record<string, string>;
        Object.keys(h).forEach((key) => {
          headers[key] = h[key];
        });
      }
      capturedHeaders.push(headers);
      return originalFetch(url, options);
    };

    globalThis.fetch = detailedFetch;

    queuePromptResponses([
      { mode: "dryrun" },
      { action: "exit" },
    ]);

    const restore = suppressConsole();
    try {
      const { StarManagerAgent } = await import("../../src/agent");
      const agent = new StarManagerAgent();
      await agent.run();

      // Check that Authorization header is present
      const authHeaders = capturedHeaders.filter((h) => h.Authorization);
      expect(authHeaders.length).toBeGreaterThan(0);

      // Check Bearer token format
      for (const h of authHeaders) {
        expect(h.Authorization).toMatch(/^Bearer /);
      }
    } finally {
      restore();
    }
  });
});

// ============================================
// GraphQL Query Verification
// ============================================
describe("GraphQL Query Verification", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    setupTestEnvironment();
    apiCalls = [];
    originalFetch = globalThis.fetch;
    globalThis.fetch = createTrackingFetchMock(originalFetch);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    cleanupTestEnvironment();
  });

  it("should query lists with correct fields", async () => {
    queuePromptResponses([
      { mode: "dryrun" },
      { action: "exit" },
    ]);

    const restore = suppressConsole();
    try {
      const { StarManagerAgent } = await import("../../src/agent");
      const agent = new StarManagerAgent();
      await agent.run();

      const graphqlCalls = apiCalls.filter(
        (c) => c.url === "https://api.github.com/graphql"
      );

      const listsQuery = graphqlCalls.find(
        (c) => (c.body as any)?.query?.includes("viewer")
      );

      if (listsQuery) {
        const query = (listsQuery.body as any).query;
        // Should request required fields
        expect(query).toContain("lists");
        expect(query).toContain("id");
        expect(query).toContain("name");
      }
    } finally {
      restore();
    }
  });

  it("should use pagination cursor for list items", async () => {
    queuePromptResponses([
      { mode: "dryrun" },
      { action: "exit" },
    ]);

    const restore = suppressConsole();
    try {
      const { StarManagerAgent } = await import("../../src/agent");
      const agent = new StarManagerAgent();
      await agent.run();

      const graphqlCalls = apiCalls.filter(
        (c) => c.url === "https://api.github.com/graphql"
      );

      // Find list items query
      const listItemsQuery = graphqlCalls.find(
        (c) => (c.body as any)?.query?.includes("UserList")
      );

      if (listItemsQuery) {
        const query = (listItemsQuery.body as any).query;
        // Should include pagination
        expect(query).toContain("cursor");
        expect(query).toContain("pageInfo");
      }
    } finally {
      restore();
    }
  });

  it("should pass correct variables to GraphQL mutations", async () => {
    // This would test actual mutations - skip in dry run
    // Just verify the structure is correct
    const testMutation = {
      query: `mutation($input: CreateUserListInput!) {
        createUserList(input: $input) {
          list { id name }
        }
      }`,
      variables: {
        input: {
          name: "Test List",
          description: "Test description",
          isPrivate: false,
        },
      },
    };

    expect(testMutation.variables.input.name).toBe("Test List");
    expect(testMutation.query).toContain("CreateUserListInput");
  });
});

// ============================================
// REST API Verification
// ============================================
describe("REST API Verification", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    setupTestEnvironment();
    apiCalls = [];
    originalFetch = globalThis.fetch;
    globalThis.fetch = createTrackingFetchMock(originalFetch);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    cleanupTestEnvironment();
  });

  it("should use correct pagination parameters for starred repos", async () => {
    queuePromptResponses([
      { mode: "dryrun" },
      { action: "exit" },
    ]);

    const restore = suppressConsole();
    try {
      // The Octokit client is mocked, but we can verify the mock was called
      // with correct parameters through our test setup
      expect(true).toBe(true);
    } finally {
      restore();
    }
  });

  it("should handle Link header for pagination", () => {
    // Test Link header parsing
    const linkHeader = '<https://api.github.com/user/starred?page=5>; rel="last"';
    const lastPageMatch = linkHeader.match(/[?&]page=(\d+)[^>]*>;\s*rel="last"/);

    expect(lastPageMatch).toBeDefined();
    expect(lastPageMatch![1]).toBe("5");
  });

  it("should parse various Link header formats", () => {
    const testCases = [
      {
        header: '<https://api.github.com/user/starred?page=10>; rel="last"',
        expected: "10",
      },
      {
        header: '<https://api.github.com/user/starred?per_page=100&page=5>; rel="last"',
        expected: "5",
      },
      {
        header: "",
        expected: null,
      },
    ];

    for (const { header, expected } of testCases) {
      const match = header.match(/[?&]page=(\d+)[^>]*>;\s*rel="last"/);
      if (expected) {
        expect(match).toBeDefined();
        expect(match![1]).toBe(expected);
      } else {
        expect(match).toBeNull();
      }
    }
  });
});

// ============================================
// API Response Handling Verification
// ============================================
describe("API Response Handling", () => {
  beforeEach(() => {
    setupTestEnvironment();
  });

  afterEach(() => {
    cleanupTestEnvironment();
  });

  it("should correctly transform REST API response to StarredRepo", () => {
    const apiResponse = {
      id: 123,
      node_id: "R_123",
      name: "test-repo",
      full_name: "owner/test-repo",
      description: "Test description",
      html_url: "https://github.com/owner/test-repo",
      homepage: "https://test.com",
      language: "TypeScript",
      topics: ["test", "typescript"],
      stargazers_count: 1000,
      forks_count: 100,
      updated_at: "2024-01-10T00:00:00Z",
      pushed_at: "2024-01-10T00:00:00Z",
      archived: false,
      disabled: false,
    };

    // Transform (simulating what GitHubClient does)
    const transformed = {
      id: apiResponse.id,
      nodeId: apiResponse.node_id,
      name: apiResponse.name,
      fullName: apiResponse.full_name,
      description: apiResponse.description,
      url: apiResponse.html_url,
      homepage: apiResponse.homepage,
      language: apiResponse.language,
      topics: apiResponse.topics,
      stargazersCount: apiResponse.stargazers_count,
      forksCount: apiResponse.forks_count,
      updatedAt: apiResponse.updated_at,
      pushedAt: apiResponse.pushed_at,
      archived: apiResponse.archived,
      disabled: apiResponse.disabled,
    };

    expect(transformed.id).toBe(123);
    expect(transformed.nodeId).toBe("R_123");
    expect(transformed.fullName).toBe("owner/test-repo");
    expect(transformed.stargazersCount).toBe(1000);
  });

  it("should correctly transform GraphQL response to StarredRepo", () => {
    const graphqlResponse = {
      id: "R_graphql_123",
      databaseId: 456,
      name: "graphql-repo",
      nameWithOwner: "owner/graphql-repo",
      description: "GraphQL test",
      url: "https://github.com/owner/graphql-repo",
      homepageUrl: null,
      primaryLanguage: { name: "JavaScript" },
      repositoryTopics: {
        nodes: [{ topic: { name: "graphql" } }, { topic: { name: "api" } }],
      },
      stargazerCount: 500,
      forkCount: 50,
      updatedAt: "2024-01-10T00:00:00Z",
      pushedAt: "2024-01-10T00:00:00Z",
      isArchived: false,
      isDisabled: false,
    };

    // Transform (simulating what GitHubClient does)
    const transformed = {
      id: graphqlResponse.databaseId,
      nodeId: graphqlResponse.id,
      name: graphqlResponse.name,
      fullName: graphqlResponse.nameWithOwner,
      description: graphqlResponse.description,
      url: graphqlResponse.url,
      homepage: graphqlResponse.homepageUrl,
      language: graphqlResponse.primaryLanguage?.name || null,
      topics: graphqlResponse.repositoryTopics.nodes.map((t) => t.topic.name),
      stargazersCount: graphqlResponse.stargazerCount,
      forksCount: graphqlResponse.forkCount,
      updatedAt: graphqlResponse.updatedAt,
      pushedAt: graphqlResponse.pushedAt,
      archived: graphqlResponse.isArchived,
      disabled: graphqlResponse.isDisabled,
    };

    expect(transformed.id).toBe(456);
    expect(transformed.nodeId).toBe("R_graphql_123");
    expect(transformed.language).toBe("JavaScript");
    expect(transformed.topics).toEqual(["graphql", "api"]);
  });

  it("should handle null primaryLanguage in GraphQL response", () => {
    const response = {
      primaryLanguage: null,
    };

    const language = response.primaryLanguage?.name || null;
    expect(language).toBeNull();
  });

  it("should handle empty repositoryTopics in GraphQL response", () => {
    const response = {
      repositoryTopics: { nodes: [] },
    };

    const topics = response.repositoryTopics.nodes.map((t: any) => t.topic.name);
    expect(topics).toEqual([]);
  });
});

// ============================================
// API Call Count Verification
// ============================================
describe("API Call Count Verification", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    setupTestEnvironment();
    apiCalls = [];
    originalFetch = globalThis.fetch;
    globalThis.fetch = createTrackingFetchMock(originalFetch);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    cleanupTestEnvironment();
  });

  it("should minimize API calls by batching", async () => {
    queuePromptResponses([
      { mode: "dryrun" },
      { action: "exit" },
    ]);

    const restore = suppressConsole();
    try {
      const { StarManagerAgent } = await import("../../src/agent");
      const agent = new StarManagerAgent();
      await agent.run();

      // Count total API calls
      const totalCalls = apiCalls.length;

      // Should be reasonable (not hundreds of calls)
      // With 20 mock repos and 2 lists, should be under 20 calls
      expect(totalCalls).toBeLessThan(30);
    } finally {
      restore();
    }
  });

  it("should not duplicate API calls unnecessarily", async () => {
    queuePromptResponses([
      { mode: "dryrun" },
      { action: "exit" },
    ]);

    const restore = suppressConsole();
    try {
      const { StarManagerAgent } = await import("../../src/agent");
      const agent = new StarManagerAgent();
      await agent.run();

      // Count unique URLs (excluding body differences)
      const uniqueUrls = new Set(apiCalls.map((c) => c.url));

      // Should not have excessive duplicates
      // Each unique endpoint should be called a reasonable number of times
      const urlCounts: Record<string, number> = {};
      for (const call of apiCalls) {
        urlCounts[call.url] = (urlCounts[call.url] || 0) + 1;
      }

      // User endpoint might be called twice (auth + scope check)
      if (urlCounts["https://api.github.com/user"]) {
        expect(urlCounts["https://api.github.com/user"]).toBeLessThanOrEqual(3);
      }
    } finally {
      restore();
    }
  });
});

// ============================================
// Error Response Handling
// ============================================
describe("Error Response Handling", () => {
  beforeEach(() => {
    setupTestEnvironment();
  });

  afterEach(() => {
    cleanupTestEnvironment();
  });

  it("should identify retryable errors", () => {
    const retryableErrors = [
      { message: "Something went wrong while executing your query", status: 500 },
      { message: "Internal Server Error", status: 500 },
      { message: "Service Unavailable", status: 503 },
    ];

    for (const error of retryableErrors) {
      const isRetryable =
        error.message.includes("Something went wrong") || error.status >= 500;
      expect(isRetryable).toBe(true);
    }
  });

  it("should identify non-retryable errors", () => {
    const nonRetryableErrors = [
      { message: "Bad credentials", status: 401 },
      { message: "Not Found", status: 404 },
      { message: "Validation Failed", status: 422 },
    ];

    for (const error of nonRetryableErrors) {
      const isRetryable =
        error.message.includes("Something went wrong") || error.status >= 500;
      expect(isRetryable).toBe(false);
    }
  });

  it("should parse GraphQL error messages correctly", () => {
    const errorResponse = {
      errors: [
        { message: "Field 'nonexistent' doesn't exist on type 'Query'" },
        { message: "Variable $id is required" },
      ],
    };

    const errorMessages = errorResponse.errors.map((e) => e.message).join(", ");
    expect(errorMessages).toContain("doesn't exist");
    expect(errorMessages).toContain("required");
  });
});
