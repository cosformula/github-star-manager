import { mock } from "bun:test";
import { mockRepos, mockLists, mockListContents, mockUser, mockScopes } from "./fixtures";
import type { StarredRepo } from "../../src/types";

// Create mock Octokit instance
export function createMockOctokit() {
  return {
    activity: {
      listReposStarredByAuthenticatedUser: mock(async ({ per_page, page }: { per_page: number; page: number }) => {
        const start = (page - 1) * per_page;
        const end = start + per_page;
        const data = mockRepos.slice(start, end).map((repo) => ({
          id: repo.id,
          node_id: repo.nodeId,
          name: repo.name,
          full_name: repo.fullName,
          description: repo.description,
          html_url: repo.url,
          homepage: repo.homepage,
          language: repo.language,
          topics: repo.topics,
          stargazers_count: repo.stargazersCount,
          forks_count: repo.forksCount,
          updated_at: repo.updatedAt,
          pushed_at: repo.pushedAt,
          archived: repo.archived,
          disabled: repo.disabled,
        }));

        const totalPages = Math.ceil(mockRepos.length / per_page);
        const linkHeader =
          page < totalPages ? `<https://api.github.com/user/starred?page=${totalPages}>; rel="last"` : "";

        return {
          data,
          headers: {
            link: linkHeader,
          },
        };
      }),
      unstarRepoForAuthenticatedUser: mock(async () => {}),
      starRepoForAuthenticatedUser: mock(async () => {}),
    },
    users: {
      getAuthenticated: mock(async () => ({
        data: {
          login: mockUser.login,
          node_id: mockUser.node_id,
        },
      })),
    },
    repos: {
      get: mock(async ({ owner, repo }: { owner: string; repo: string }) => {
        const fullName = `${owner}/${repo}`;
        const found = mockRepos.find((r) => r.fullName === fullName);
        if (!found) {
          throw new Error(`Repository not found: ${fullName}`);
        }
        return {
          data: {
            id: found.id,
            node_id: found.nodeId,
            name: found.name,
            full_name: found.fullName,
            description: found.description,
            html_url: found.url,
            homepage: found.homepage,
            language: found.language,
            topics: found.topics,
            stargazers_count: found.stargazersCount,
            forks_count: found.forksCount,
            updated_at: found.updatedAt,
            pushed_at: found.pushedAt,
            archived: found.archived,
            disabled: found.disabled,
          },
        };
      }),
    },
  };
}

// Mock fetch for GitHub API (GraphQL and REST scope check)
export function createGitHubFetchMock() {
  return async (url: string, options?: RequestInit): Promise<Response> => {
    // REST API scope check
    if (url === "https://api.github.com/user" && (!options || options.method !== "POST")) {
      return new Response(JSON.stringify(mockUser), {
        status: 200,
        headers: {
          "x-oauth-scopes": mockScopes.scopes.join(", "),
        },
      });
    }

    // GraphQL API
    if (url === "https://api.github.com/graphql") {
      const body = JSON.parse(options?.body as string);
      const query = body.query as string;

      // Get lists
      if (query.includes("viewer") && query.includes("lists")) {
        return new Response(
          JSON.stringify({
            data: {
              viewer: {
                lists: {
                  nodes: mockLists.map((list) => ({
                    id: list.id,
                    name: list.name,
                    description: list.description,
                    isPrivate: list.isPrivate,
                    items: { totalCount: list.itemCount },
                  })),
                },
              },
            },
          }),
          { status: 200 }
        );
      }

      // Get list items
      if (query.includes("node(id:") && query.includes("UserList")) {
        const listId = body.variables?.listId as string;
        const list = mockLists.find((l) => l.id === listId);
        const repos = list ? mockListContents[list.name] || [] : [];

        return new Response(
          JSON.stringify({
            data: {
              node: {
                items: {
                  pageInfo: { hasNextPage: false, endCursor: null },
                  nodes: repos.map((repo) => ({
                    id: repo.nodeId,
                    databaseId: repo.id,
                    name: repo.name,
                    nameWithOwner: repo.fullName,
                    description: repo.description,
                    url: repo.url,
                    homepageUrl: repo.homepage,
                    primaryLanguage: repo.language ? { name: repo.language } : null,
                    repositoryTopics: { nodes: repo.topics.map((t) => ({ topic: { name: t } })) },
                    stargazerCount: repo.stargazersCount,
                    forkCount: repo.forksCount,
                    updatedAt: repo.updatedAt,
                    pushedAt: repo.pushedAt,
                    isArchived: repo.archived,
                    isDisabled: repo.disabled,
                  })),
                },
              },
            },
          }),
          { status: 200 }
        );
      }

      // Create list
      if (query.includes("createUserList")) {
        const input = body.variables?.input;
        return new Response(
          JSON.stringify({
            data: {
              createUserList: {
                list: {
                  id: `L_new_${Date.now()}`,
                  name: input?.name,
                  description: input?.description,
                  isPrivate: input?.isPrivate || false,
                },
              },
            },
          }),
          { status: 200 }
        );
      }

      // Add repo to list
      if (query.includes("updateUserListsForItem")) {
        return new Response(
          JSON.stringify({
            data: {
              updateUserListsForItem: {
                item: { id: body.variables?.itemId },
              },
            },
          }),
          { status: 200 }
        );
      }

      // Get repo lists
      if (query.includes("viewerUserListsConnection")) {
        return new Response(
          JSON.stringify({
            data: {
              node: {
                viewerUserListsConnection: {
                  nodes: [],
                },
              },
            },
          }),
          { status: 200 }
        );
      }

      // Delete list
      if (query.includes("deleteUserList")) {
        return new Response(
          JSON.stringify({
            data: {
              deleteUserList: { clientMutationId: null },
            },
          }),
          { status: 200 }
        );
      }
    }

    // Default: not found
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  };
}
