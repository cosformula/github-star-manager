import type { StarredRepo, StarList, ListSuggestion } from "../../src/types";

// Mock starred repos - 20 repos covering different languages and scenarios
export const mockRepos: StarredRepo[] = [
  {
    id: 1,
    nodeId: "R_kg1",
    name: "react",
    fullName: "facebook/react",
    description: "The library for web and native user interfaces",
    url: "https://github.com/facebook/react",
    homepage: "https://react.dev",
    language: "JavaScript",
    topics: ["javascript", "frontend", "ui", "react"],
    stargazersCount: 220000,
    forksCount: 45000,
    updatedAt: "2024-01-10T00:00:00Z",
    pushedAt: "2024-01-10T00:00:00Z",
    archived: false,
    disabled: false,
  },
  {
    id: 2,
    nodeId: "R_kg2",
    name: "vue",
    fullName: "vuejs/vue",
    description: "Vue.js is a progressive JavaScript framework",
    url: "https://github.com/vuejs/vue",
    homepage: "https://vuejs.org",
    language: "TypeScript",
    topics: ["javascript", "frontend", "vue"],
    stargazersCount: 206000,
    forksCount: 34000,
    updatedAt: "2024-01-09T00:00:00Z",
    pushedAt: "2024-01-09T00:00:00Z",
    archived: false,
    disabled: false,
  },
  {
    id: 3,
    nodeId: "R_kg3",
    name: "TypeScript",
    fullName: "microsoft/TypeScript",
    description: "TypeScript is a superset of JavaScript",
    url: "https://github.com/microsoft/TypeScript",
    homepage: "https://www.typescriptlang.org",
    language: "TypeScript",
    topics: ["typescript", "javascript", "language"],
    stargazersCount: 96000,
    forksCount: 12000,
    updatedAt: "2024-01-10T00:00:00Z",
    pushedAt: "2024-01-10T00:00:00Z",
    archived: false,
    disabled: false,
  },
  {
    id: 4,
    nodeId: "R_kg4",
    name: "next.js",
    fullName: "vercel/next.js",
    description: "The React Framework for the Web",
    url: "https://github.com/vercel/next.js",
    homepage: "https://nextjs.org",
    language: "JavaScript",
    topics: ["react", "nextjs", "framework"],
    stargazersCount: 118000,
    forksCount: 25000,
    updatedAt: "2024-01-10T00:00:00Z",
    pushedAt: "2024-01-10T00:00:00Z",
    archived: false,
    disabled: false,
  },
  {
    id: 5,
    nodeId: "R_kg5",
    name: "tailwindcss",
    fullName: "tailwindlabs/tailwindcss",
    description: "A utility-first CSS framework",
    url: "https://github.com/tailwindlabs/tailwindcss",
    homepage: "https://tailwindcss.com",
    language: "JavaScript",
    topics: ["css", "tailwind", "utility-first"],
    stargazersCount: 76000,
    forksCount: 4000,
    updatedAt: "2024-01-08T00:00:00Z",
    pushedAt: "2024-01-08T00:00:00Z",
    archived: false,
    disabled: false,
  },
  {
    id: 6,
    nodeId: "R_kg6",
    name: "express",
    fullName: "expressjs/express",
    description: "Fast, unopinionated, minimalist web framework for Node.js",
    url: "https://github.com/expressjs/express",
    homepage: "https://expressjs.com",
    language: "JavaScript",
    topics: ["nodejs", "backend", "web", "framework"],
    stargazersCount: 63000,
    forksCount: 13000,
    updatedAt: "2024-01-05T00:00:00Z",
    pushedAt: "2024-01-05T00:00:00Z",
    archived: false,
    disabled: false,
  },
  {
    id: 7,
    nodeId: "R_kg7",
    name: "prisma",
    fullName: "prisma/prisma",
    description: "Next-generation ORM for Node.js & TypeScript",
    url: "https://github.com/prisma/prisma",
    homepage: "https://www.prisma.io",
    language: "TypeScript",
    topics: ["database", "orm", "typescript", "nodejs"],
    stargazersCount: 36000,
    forksCount: 1400,
    updatedAt: "2024-01-10T00:00:00Z",
    pushedAt: "2024-01-10T00:00:00Z",
    archived: false,
    disabled: false,
  },
  {
    id: 8,
    nodeId: "R_kg8",
    name: "pytorch",
    fullName: "pytorch/pytorch",
    description: "Tensors and Dynamic neural networks in Python",
    url: "https://github.com/pytorch/pytorch",
    homepage: "https://pytorch.org",
    language: "Python",
    topics: ["python", "machine-learning", "deep-learning", "ai"],
    stargazersCount: 76000,
    forksCount: 21000,
    updatedAt: "2024-01-10T00:00:00Z",
    pushedAt: "2024-01-10T00:00:00Z",
    archived: false,
    disabled: false,
  },
  {
    id: 9,
    nodeId: "R_kg9",
    name: "transformers",
    fullName: "huggingface/transformers",
    description: "Transformers: State-of-the-art Machine Learning",
    url: "https://github.com/huggingface/transformers",
    homepage: "https://huggingface.co/transformers",
    language: "Python",
    topics: ["python", "nlp", "transformers", "ai"],
    stargazersCount: 120000,
    forksCount: 24000,
    updatedAt: "2024-01-10T00:00:00Z",
    pushedAt: "2024-01-10T00:00:00Z",
    archived: false,
    disabled: false,
  },
  {
    id: 10,
    nodeId: "R_kg10",
    name: "langchain",
    fullName: "langchain-ai/langchain",
    description: "Building applications with LLMs through composability",
    url: "https://github.com/langchain-ai/langchain",
    homepage: "https://www.langchain.com",
    language: "Python",
    topics: ["python", "llm", "ai", "langchain"],
    stargazersCount: 75000,
    forksCount: 11000,
    updatedAt: "2024-01-10T00:00:00Z",
    pushedAt: "2024-01-10T00:00:00Z",
    archived: false,
    disabled: false,
  },
  {
    id: 11,
    nodeId: "R_kg11",
    name: "rust",
    fullName: "rust-lang/rust",
    description: "Empowering everyone to build reliable and efficient software",
    url: "https://github.com/rust-lang/rust",
    homepage: "https://www.rust-lang.org",
    language: "Rust",
    topics: ["rust", "language", "systems-programming"],
    stargazersCount: 90000,
    forksCount: 12000,
    updatedAt: "2024-01-10T00:00:00Z",
    pushedAt: "2024-01-10T00:00:00Z",
    archived: false,
    disabled: false,
  },
  {
    id: 12,
    nodeId: "R_kg12",
    name: "go",
    fullName: "golang/go",
    description: "The Go programming language",
    url: "https://github.com/golang/go",
    homepage: "https://go.dev",
    language: "Go",
    topics: ["go", "golang", "language"],
    stargazersCount: 118000,
    forksCount: 17000,
    updatedAt: "2024-01-10T00:00:00Z",
    pushedAt: "2024-01-10T00:00:00Z",
    archived: false,
    disabled: false,
  },
  // Archived repo for testing
  {
    id: 13,
    nodeId: "R_kg13",
    name: "deprecated-lib",
    fullName: "someone/deprecated-lib",
    description: "This library is deprecated, use new-lib instead",
    url: "https://github.com/someone/deprecated-lib",
    homepage: null,
    language: "JavaScript",
    topics: ["deprecated"],
    stargazersCount: 500,
    forksCount: 20,
    updatedAt: "2020-01-01T00:00:00Z",
    pushedAt: "2020-01-01T00:00:00Z",
    archived: true,
    disabled: false,
  },
  // Stale repo for testing
  {
    id: 14,
    nodeId: "R_kg14",
    name: "old-project",
    fullName: "someone/old-project",
    description: "An old project not updated for years",
    url: "https://github.com/someone/old-project",
    homepage: null,
    language: "Python",
    topics: [],
    stargazersCount: 50,
    forksCount: 5,
    updatedAt: "2021-01-01T00:00:00Z",
    pushedAt: "2021-01-01T00:00:00Z",
    archived: false,
    disabled: false,
  },
  {
    id: 15,
    nodeId: "R_kg15",
    name: "vscode",
    fullName: "microsoft/vscode",
    description: "Visual Studio Code",
    url: "https://github.com/microsoft/vscode",
    homepage: "https://code.visualstudio.com",
    language: "TypeScript",
    topics: ["editor", "ide", "typescript"],
    stargazersCount: 155000,
    forksCount: 28000,
    updatedAt: "2024-01-10T00:00:00Z",
    pushedAt: "2024-01-10T00:00:00Z",
    archived: false,
    disabled: false,
  },
  {
    id: 16,
    nodeId: "R_kg16",
    name: "neovim",
    fullName: "neovim/neovim",
    description: "Vim-fork focused on extensibility and usability",
    url: "https://github.com/neovim/neovim",
    homepage: "https://neovim.io",
    language: "Vim Script",
    topics: ["vim", "neovim", "editor"],
    stargazersCount: 74000,
    forksCount: 5000,
    updatedAt: "2024-01-10T00:00:00Z",
    pushedAt: "2024-01-10T00:00:00Z",
    archived: false,
    disabled: false,
  },
  {
    id: 17,
    nodeId: "R_kg17",
    name: "docker",
    fullName: "docker/docker-ce",
    description: "Docker CE",
    url: "https://github.com/docker/docker-ce",
    homepage: "https://www.docker.com",
    language: "Go",
    topics: ["docker", "containers", "devops"],
    stargazersCount: 23000,
    forksCount: 4000,
    updatedAt: "2024-01-05T00:00:00Z",
    pushedAt: "2024-01-05T00:00:00Z",
    archived: false,
    disabled: false,
  },
  {
    id: 18,
    nodeId: "R_kg18",
    name: "kubernetes",
    fullName: "kubernetes/kubernetes",
    description: "Production-Grade Container Scheduling and Management",
    url: "https://github.com/kubernetes/kubernetes",
    homepage: "https://kubernetes.io",
    language: "Go",
    topics: ["kubernetes", "k8s", "containers", "devops"],
    stargazersCount: 104000,
    forksCount: 38000,
    updatedAt: "2024-01-10T00:00:00Z",
    pushedAt: "2024-01-10T00:00:00Z",
    archived: false,
    disabled: false,
  },
  {
    id: 19,
    nodeId: "R_kg19",
    name: "bun",
    fullName: "oven-sh/bun",
    description: "Incredibly fast JavaScript runtime, bundler, test runner",
    url: "https://github.com/oven-sh/bun",
    homepage: "https://bun.sh",
    language: "Zig",
    topics: ["javascript", "runtime", "bundler"],
    stargazersCount: 68000,
    forksCount: 2000,
    updatedAt: "2024-01-10T00:00:00Z",
    pushedAt: "2024-01-10T00:00:00Z",
    archived: false,
    disabled: false,
  },
  {
    id: 20,
    nodeId: "R_kg20",
    name: "deno",
    fullName: "denoland/deno",
    description: "A modern runtime for JavaScript and TypeScript",
    url: "https://github.com/denoland/deno",
    homepage: "https://deno.land",
    language: "Rust",
    topics: ["javascript", "typescript", "runtime"],
    stargazersCount: 92000,
    forksCount: 5000,
    updatedAt: "2024-01-10T00:00:00Z",
    pushedAt: "2024-01-10T00:00:00Z",
    archived: false,
    disabled: false,
  },
];

// Mock existing lists
export const mockLists: StarList[] = [
  {
    id: "L_list1",
    name: "Frontend",
    description: "Frontend frameworks and tools",
    isPrivate: false,
    itemCount: 3,
  },
  {
    id: "L_list2",
    name: "AI/ML",
    description: "Machine learning and AI tools",
    isPrivate: false,
    itemCount: 2,
  },
];

// Mock list contents
export const mockListContents: Record<string, StarredRepo[]> = {
  Frontend: [mockRepos[0], mockRepos[1], mockRepos[4]], // react, vue, tailwind
  "AI/ML": [mockRepos[7], mockRepos[8]], // pytorch, transformers
};

// Mock AI suggested lists
export const mockSuggestedLists: ListSuggestion[] = [
  {
    name: "Frontend Frameworks",
    description: "JavaScript/TypeScript frontend frameworks and libraries",
    matchingRepos: ["facebook/react", "vuejs/vue", "vercel/next.js", "tailwindlabs/tailwindcss"],
  },
  {
    name: "Backend & Database",
    description: "Backend frameworks and database tools",
    matchingRepos: ["expressjs/express", "prisma/prisma"],
  },
  {
    name: "AI & Machine Learning",
    description: "AI, ML, and deep learning tools",
    matchingRepos: ["pytorch/pytorch", "huggingface/transformers", "langchain-ai/langchain"],
  },
  {
    name: "Programming Languages",
    description: "Programming language implementations",
    matchingRepos: ["rust-lang/rust", "golang/go", "microsoft/TypeScript"],
  },
  {
    name: "Developer Tools",
    description: "IDEs, editors, and development utilities",
    matchingRepos: ["microsoft/vscode", "neovim/neovim", "oven-sh/bun", "denoland/deno"],
  },
  {
    name: "DevOps & Infrastructure",
    description: "Containers and infrastructure tools",
    matchingRepos: ["docker/docker-ce", "kubernetes/kubernetes"],
  },
];

// Mock user for authenticated user endpoint
export const mockUser = {
  login: "testuser",
  id: "U_123",
  node_id: "U_123",
};

// Mock scopes response
export const mockScopes = {
  scopes: ["repo", "user"],
  canCreateLists: true,
};

// Mock AI categorization response
export function getMockCategorizationResponse(repos: StarredRepo[]): string {
  const categorization = repos.map((repo) => {
    // Simple categorization logic based on language/topics
    let list = "Developer Tools";
    if (repo.topics.some((t) => ["react", "vue", "frontend", "css"].includes(t))) {
      list = "Frontend Frameworks";
    } else if (repo.topics.some((t) => ["ai", "machine-learning", "deep-learning", "nlp", "llm"].includes(t))) {
      list = "AI & Machine Learning";
    } else if (repo.topics.some((t) => ["nodejs", "backend", "database", "orm"].includes(t))) {
      list = "Backend & Database";
    } else if (repo.topics.some((t) => ["language", "rust", "golang", "typescript"].includes(t))) {
      list = "Programming Languages";
    } else if (repo.topics.some((t) => ["docker", "kubernetes", "containers", "devops"].includes(t))) {
      list = "DevOps & Infrastructure";
    }

    return {
      repo: repo.fullName,
      action: repo.archived ? "unstar" : "categorize",
      list: repo.archived ? undefined : list,
      reason: repo.archived ? "Repository is archived" : `Categorized as ${list}`,
    };
  });

  return JSON.stringify({ categorization });
}

// Mock AI list suggestion response
export function getMockListSuggestionResponse(): string {
  return JSON.stringify({
    lists: mockSuggestedLists.map((l) => ({
      name: l.name,
      description: l.description,
    })),
  });
}

// ============================================
// Edge Case Test Data
// ============================================

// Empty data scenarios
export const emptyRepos: StarredRepo[] = [];
export const emptyLists: StarList[] = [];

// Repos with special characters in names
export const specialCharRepos: StarredRepo[] = [
  {
    id: 100,
    nodeId: "R_special1",
    name: "project-name.js",
    fullName: "user/project-name.js",
    description: "A project with dots in name",
    url: "https://github.com/user/project-name.js",
    homepage: null,
    language: "JavaScript",
    topics: [],
    stargazersCount: 100,
    forksCount: 10,
    updatedAt: "2024-01-10T00:00:00Z",
    pushedAt: "2024-01-10T00:00:00Z",
    archived: false,
    disabled: false,
  },
  {
    id: 101,
    nodeId: "R_special2",
    name: "my_project_v2",
    fullName: "user-name/my_project_v2",
    description: "Project with underscores & special chars: <script>alert('xss')</script>",
    url: "https://github.com/user-name/my_project_v2",
    homepage: null,
    language: "Python",
    topics: ["test", "special-chars"],
    stargazersCount: 50,
    forksCount: 5,
    updatedAt: "2024-01-10T00:00:00Z",
    pushedAt: "2024-01-10T00:00:00Z",
    archived: false,
    disabled: false,
  },
  {
    id: 102,
    nodeId: "R_special3",
    name: "中文项目",
    fullName: "用户/中文项目",
    description: "A project with Chinese characters 中文描述",
    url: "https://github.com/用户/中文项目",
    homepage: null,
    language: null,
    topics: [],
    stargazersCount: 10,
    forksCount: 1,
    updatedAt: "2024-01-10T00:00:00Z",
    pushedAt: "2024-01-10T00:00:00Z",
    archived: false,
    disabled: false,
  },
  {
    id: 103,
    nodeId: "R_special4",
    name: "emoji-project-🚀",
    fullName: "dev/emoji-project-🚀",
    description: "Project with emoji 🎉🔥",
    url: "https://github.com/dev/emoji-project-🚀",
    homepage: null,
    language: "TypeScript",
    topics: ["emoji", "fun"],
    stargazersCount: 200,
    forksCount: 20,
    updatedAt: "2024-01-10T00:00:00Z",
    pushedAt: "2024-01-10T00:00:00Z",
    archived: false,
    disabled: false,
  },
];

// Repos with null/undefined fields
export const nullFieldRepos: StarredRepo[] = [
  {
    id: 200,
    nodeId: "R_null1",
    name: "no-description",
    fullName: "user/no-description",
    description: null,
    url: "https://github.com/user/no-description",
    homepage: null,
    language: null,
    topics: [],
    stargazersCount: 0,
    forksCount: 0,
    updatedAt: "",
    pushedAt: "",
    archived: false,
    disabled: false,
  },
];

// Large number of repos for pagination testing
export function generateLargeRepoSet(count: number): StarredRepo[] {
  return Array.from({ length: count }, (_, i) => ({
    id: 1000 + i,
    nodeId: `R_large${i}`,
    name: `repo-${i}`,
    fullName: `user/repo-${i}`,
    description: `Test repository number ${i}`,
    url: `https://github.com/user/repo-${i}`,
    homepage: null,
    language: ["JavaScript", "Python", "TypeScript", "Go", "Rust"][i % 5],
    topics: [`topic${i % 10}`],
    stargazersCount: Math.floor(Math.random() * 10000),
    forksCount: Math.floor(Math.random() * 1000),
    updatedAt: "2024-01-10T00:00:00Z",
    pushedAt: "2024-01-10T00:00:00Z",
    archived: i % 50 === 0, // Every 50th repo is archived
    disabled: false,
  }));
}

// All archived repos
export const allArchivedRepos: StarredRepo[] = mockRepos.slice(0, 5).map((r) => ({
  ...r,
  archived: true,
}));

// All stale repos (very old)
export const allStaleRepos: StarredRepo[] = mockRepos.slice(0, 5).map((r) => ({
  ...r,
  updatedAt: "2018-01-01T00:00:00Z",
  pushedAt: "2018-01-01T00:00:00Z",
}));

// Disabled repos
export const disabledRepos: StarredRepo[] = [
  {
    ...mockRepos[0],
    id: 300,
    nodeId: "R_disabled1",
    disabled: true,
  },
];

// Mock scopes without list permission
export const mockScopesNoListPermission = {
  scopes: ["repo"],
  canCreateLists: false,
};

// Mock malformed AI responses
export const malformedAIResponses = {
  emptyResponse: "",
  invalidJson: "{ invalid json }",
  missingFields: JSON.stringify({ data: "wrong format" }),
  nullContent: JSON.stringify({ categorization: null }),
  emptyArray: JSON.stringify({ categorization: [] }),
  wrongTypes: JSON.stringify({ categorization: "not an array" }),
};

// Mock backup data
export const mockBackupData = {
  version: 1,
  timestamp: "2024-01-10T00:00:00Z",
  user: "testuser",
  stars: mockRepos.slice(0, 5).map((r) => r.fullName),
  lists: [
    {
      name: "Test List",
      description: "A test list",
      repos: ["facebook/react", "vuejs/vue"],
    },
  ],
};

// Corrupted backup data
export const corruptedBackupData = {
  version: 999, // Unknown version
  timestamp: "invalid-date",
  user: null,
  stars: "not an array",
  lists: null,
};
