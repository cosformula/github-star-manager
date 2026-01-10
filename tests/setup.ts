import { mock, beforeEach, afterEach } from "bun:test";
import { createMockOctokit, createGitHubFetchMock } from "./mocks/github";
import { createOpenRouterFetchMock } from "./mocks/openrouter";
import { createPromptsMock, resetPromptsMock, queuePromptResponses } from "./mocks/prompts";

// Store original implementations
const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

// Mock Octokit module
mock.module("@octokit/rest", () => ({
  Octokit: class MockOctokit {
    constructor() {
      return createMockOctokit();
    }
  },
}));

// Mock prompts module
const mockPrompts = createPromptsMock();
mock.module("prompts", () => ({
  default: mockPrompts,
}));

// Combined fetch mock that handles both GitHub and OpenRouter
function createCombinedFetchMock() {
  const githubFetch = createGitHubFetchMock();
  const openRouterFetch = createOpenRouterFetchMock();

  return async (url: string | URL | Request, options?: RequestInit): Promise<Response> => {
    const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

    if (urlStr.includes("api.github.com")) {
      return githubFetch(urlStr, options);
    }
    if (urlStr.includes("openrouter.ai")) {
      return openRouterFetch(urlStr, options);
    }

    // Fallback to original fetch for other URLs (shouldn't happen in tests)
    console.warn(`Unexpected fetch URL in test: ${urlStr}`);
    return new Response(JSON.stringify({ error: "Mocked - URL not handled" }), { status: 500 });
  };
}

// Setup function to be called in beforeEach
export function setupTestEnvironment() {
  // Set test environment variables
  process.env.GITHUB_TOKEN = "test-github-token";
  process.env.OPENROUTER_API_KEY = "test-openrouter-key";

  // Replace global fetch with mock
  globalThis.fetch = createCombinedFetchMock() as typeof fetch;

  // Reset prompts mock state
  resetPromptsMock();
}

// Cleanup function to be called in afterEach
export function cleanupTestEnvironment() {
  // Restore original fetch
  globalThis.fetch = originalFetch;

  // Restore original environment
  process.env = { ...originalEnv };

  // Reset prompts mock
  resetPromptsMock();
}

// Export queue function for test cases
export { queuePromptResponses, resetPromptsMock };

// Export response presets
export {
  dryRunFlowResponses,
  debugDryRunFlowResponses,
  unstarFlowResponses,
  restoreFlowResponses,
  simpleAnalyzeFlowResponses,
  cancelFlowResponses,
} from "./mocks/prompts";

// Export mock data for assertions
export {
  mockRepos,
  mockLists,
  mockListContents,
  mockUser,
  mockScopes,
  mockSuggestedLists,
  // Edge case data
  emptyRepos,
  emptyLists,
  specialCharRepos,
  nullFieldRepos,
  generateLargeRepoSet,
  allArchivedRepos,
  allStaleRepos,
  disabledRepos,
  mockScopesNoListPermission,
  malformedAIResponses,
  mockBackupData,
  corruptedBackupData,
} from "./mocks/fixtures";

// Suppress console output during tests (optional)
export function suppressConsole() {
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;

  console.log = () => {};
  console.error = () => {};
  console.warn = () => {};

  return () => {
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
  };
}

// Helper to capture console output
export function captureConsole() {
  const logs: string[] = [];
  const errors: string[] = [];
  const warns: string[] = [];

  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;

  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };
  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(" "));
  };
  console.warn = (...args: unknown[]) => {
    warns.push(args.map(String).join(" "));
  };

  return {
    logs,
    errors,
    warns,
    restore: () => {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
    },
  };
}
