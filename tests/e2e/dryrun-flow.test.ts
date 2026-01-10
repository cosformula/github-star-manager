import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  setupTestEnvironment,
  cleanupTestEnvironment,
  queuePromptResponses,
  dryRunFlowResponses,
  debugDryRunFlowResponses,
  cancelFlowResponses,
  mockRepos,
  mockLists,
  captureConsole,
  suppressConsole,
} from "../setup";

describe("E2E: Dry Run Flow", () => {
  beforeEach(() => {
    setupTestEnvironment();
  });

  afterEach(() => {
    cleanupTestEnvironment();
  });

  it("should complete dry run categorization flow without errors", async () => {
    // Queue responses for the dry run flow
    queuePromptResponses(dryRunFlowResponses);

    // Suppress console output for cleaner test output
    const restore = suppressConsole();

    try {
      // Import and run the agent
      const { StarManagerAgent } = await import("../../src/agent");
      const agent = new StarManagerAgent();

      // Run should complete without throwing
      await agent.run();

      // If we get here, the flow completed successfully
      expect(true).toBe(true);
    } finally {
      restore();
    }
  });

  it("should output dry run message when in dry run mode", async () => {
    queuePromptResponses(dryRunFlowResponses);

    const output = captureConsole();

    try {
      const { StarManagerAgent } = await import("../../src/agent");
      const agent = new StarManagerAgent();
      await agent.run();

      // Check that dry run message was logged
      const allOutput = output.logs.join("\n");
      expect(allOutput).toContain("Dry run");
    } finally {
      output.restore();
    }
  });

  it("should handle debug + dry run mode", async () => {
    queuePromptResponses(debugDryRunFlowResponses);

    const restore = suppressConsole();

    try {
      const { StarManagerAgent } = await import("../../src/agent");
      const agent = new StarManagerAgent();
      await agent.run();

      // Flow should complete without errors
      expect(true).toBe(true);
    } finally {
      restore();
    }
  });

  it("should handle user cancellation gracefully", async () => {
    queuePromptResponses(cancelFlowResponses);

    const restore = suppressConsole();

    try {
      const { StarManagerAgent } = await import("../../src/agent");
      const agent = new StarManagerAgent();
      await agent.run();

      // Should exit gracefully without errors
      expect(true).toBe(true);
    } finally {
      restore();
    }
  });
});

describe("E2E: Mock Data Verification", () => {
  it("should have correct number of mock repos", () => {
    expect(mockRepos.length).toBe(20);
  });

  it("should have correct number of mock lists", () => {
    expect(mockLists.length).toBe(2);
  });

  it("should have archived repo in mock data", () => {
    const archivedRepos = mockRepos.filter((r) => r.archived);
    expect(archivedRepos.length).toBeGreaterThan(0);
  });

  it("should have different languages in mock data", () => {
    const languages = new Set(mockRepos.map((r) => r.language).filter(Boolean));
    expect(languages.size).toBeGreaterThan(3);
  });
});

describe("E2E: GitHub Client Mock", () => {
  beforeEach(() => {
    setupTestEnvironment();
  });

  afterEach(() => {
    cleanupTestEnvironment();
  });

  it("should mock GitHub API fetch correctly", async () => {
    const response = await fetch("https://api.github.com/user");
    const data = await response.json();

    expect(data.login).toBe("testuser");
  });

  it("should mock GitHub GraphQL API correctly", async () => {
    const response = await fetch("https://api.github.com/graphql", {
      method: "POST",
      body: JSON.stringify({
        query: `query { viewer { lists(first: 100) { nodes { id name } } } }`,
      }),
    });

    const data = await response.json();
    expect(data.data.viewer.lists.nodes.length).toBe(2);
  });

  it("should return correct scopes in headers", async () => {
    const response = await fetch("https://api.github.com/user");
    const scopes = response.headers.get("x-oauth-scopes");

    expect(scopes).toContain("user");
  });
});

describe("E2E: OpenRouter Mock", () => {
  beforeEach(() => {
    setupTestEnvironment();
  });

  afterEach(() => {
    cleanupTestEnvironment();
  });

  it("should mock OpenRouter API correctly", async () => {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify({
        model: "test-model",
        messages: [{ role: "user", content: "suggest list categories for repos" }],
      }),
    });

    const data = await response.json();

    expect(data.choices).toBeDefined();
    expect(data.choices[0].message.content).toBeDefined();
    expect(data.usage).toBeDefined();
    expect(data.usage.total_tokens).toBeGreaterThan(0);
  });

  it("should return categorization response for categorize prompts", async () => {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify({
        model: "test-model",
        messages: [
          {
            role: "user",
            content: "categorize these repos: facebook/react, vuejs/vue",
          },
        ],
      }),
    });

    const data = await response.json();
    const content = JSON.parse(data.choices[0].message.content);

    expect(content.categorization).toBeDefined();
    expect(content.categorization.length).toBe(2);
  });
});
