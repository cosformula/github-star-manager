import { Octokit } from "@octokit/rest";
import type { StarredRepo, StarList } from "../types";

// GitHub API response types
interface GitHubRepoData {
  id: number;
  node_id: string;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  homepage: string | null;
  language: string | null;
  topics?: string[];
  stargazers_count: number;
  forks_count: number;
  updated_at: string | null;
  pushed_at: string | null;
  archived: boolean;
  disabled: boolean;
}

interface GraphQLRepoData {
  id: string;
  databaseId: number;
  name: string;
  nameWithOwner: string;
  description: string | null;
  url: string;
  homepageUrl: string | null;
  primaryLanguage: { name: string } | null;
  repositoryTopics: { nodes: Array<{ topic: { name: string } }> };
  stargazerCount: number;
  forkCount: number;
  updatedAt: string;
  pushedAt: string;
  isArchived: boolean;
  isDisabled: boolean;
}

// Helper function to convert REST API repo data to StarredRepo
function toStarredRepo(data: GitHubRepoData): StarredRepo {
  return {
    id: data.id,
    nodeId: data.node_id,
    name: data.name,
    fullName: data.full_name,
    description: data.description,
    url: data.html_url,
    homepage: data.homepage,
    language: data.language,
    topics: data.topics || [],
    stargazersCount: data.stargazers_count,
    forksCount: data.forks_count,
    updatedAt: data.updated_at || "",
    pushedAt: data.pushed_at || "",
    archived: data.archived,
    disabled: data.disabled,
  };
}

// Helper function to convert GraphQL repo data to StarredRepo
function graphqlToStarredRepo(repo: GraphQLRepoData): StarredRepo {
  return {
    id: repo.databaseId,
    nodeId: repo.id,
    name: repo.name,
    fullName: repo.nameWithOwner,
    description: repo.description,
    url: repo.url,
    homepage: repo.homepageUrl,
    language: repo.primaryLanguage?.name || null,
    topics: repo.repositoryTopics.nodes.map((t) => t.topic.name),
    stargazersCount: repo.stargazerCount,
    forksCount: repo.forkCount,
    updatedAt: repo.updatedAt,
    pushedAt: repo.pushedAt,
    archived: repo.isArchived,
    disabled: repo.isDisabled,
  };
}

export class GitHubClient {
  private octokit: Octokit;
  private token: string;

  constructor(token: string) {
    this.token = token;
    this.octokit = new Octokit({ auth: token });
  }

  async getStarredRepos(onProgress?: (count: number, total: number) => void, maxCount?: number): Promise<StarredRepo[]> {
    const perPage = 100;

    // Step 1: Get first page and parse Link header for total pages
    const firstResponse = await this.octokit.activity.listReposStarredByAuthenticatedUser({
      per_page: perPage,
      page: 1,
      sort: "created",
      direction: "desc",
    });

    if (firstResponse.data.length === 0) return [];

    // Parse Link header to get last page
    const linkHeader = firstResponse.headers.link || "";
    const lastPageMatch = linkHeader.match(/[?&]page=(\d+)[^>]*>;\s*rel="last"/);
    const totalPages = lastPageMatch?.[1] ? parseInt(lastPageMatch[1], 10) : 1;
    const estimatedTotal = maxCount ? Math.min(totalPages * perPage, maxCount) : totalPages * perPage;

    // Calculate pages to fetch
    const maxPages = maxCount ? Math.ceil(maxCount / perPage) : totalPages;
    const pagesToFetch = Math.min(totalPages, maxPages);

    // Report first page progress
    onProgress?.(firstResponse.data.length, estimatedTotal);

    // Step 2: Fetch remaining pages concurrently
    const CONCURRENCY = 3;
    const allResponses: Array<typeof firstResponse.data> = [firstResponse.data];

    for (let i = 2; i <= pagesToFetch; i += CONCURRENCY) {
      const batch = [];
      for (let p = i; p < i + CONCURRENCY && p <= pagesToFetch; p++) {
        batch.push(
          this.octokit.activity.listReposStarredByAuthenticatedUser({
            per_page: perPage,
            page: p,
            sort: "created",
            direction: "desc",
          })
        );
      }
      const results = await Promise.all(batch);
      for (const res of results) {
        allResponses.push(res.data);
      }
      onProgress?.(allResponses.flat().length, estimatedTotal);
    }

    // Step 3: Transform data
    const repos: StarredRepo[] = [];
    for (const data of allResponses) {
      for (const repo of data) {
        const repoData = ("repo" in repo ? repo.repo : repo) as GitHubRepoData;
        repos.push(toStarredRepo(repoData));

        if (maxCount && repos.length >= maxCount) {
          return repos;
        }
      }
    }

    return repos;
  }

  async unstarRepo(owner: string, repo: string): Promise<void> {
    await this.octokit.activity.unstarRepoForAuthenticatedUser({ owner, repo });
  }

  async starRepo(owner: string, repo: string): Promise<void> {
    await this.octokit.activity.starRepoForAuthenticatedUser({ owner, repo });
  }

  async getAuthenticatedUser(): Promise<{ login: string; id: string }> {
    const { data } = await this.octokit.users.getAuthenticated();
    return { login: data.login, id: data.node_id };
  }

  async checkScopes(): Promise<{ scopes: string[]; canCreateLists: boolean }> {
    const response = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    const scopeHeader = response.headers.get("x-oauth-scopes") || "";
    const scopes = scopeHeader.split(",").map((s) => s.trim()).filter(Boolean);
    const canCreateLists = scopes.includes("user") || scopes.includes("write:user");
    return { scopes, canCreateLists };
  }

  // GraphQL helper for Lists API (no retry - let caller handle batch-level retry)
  private async graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const response = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });

    const json = await response.json() as { data?: T; errors?: Array<{ message: string }> };
    if (json.errors) {
      const errorMsg = json.errors.map((e) => e.message).join(", ");
      const error = new Error(errorMsg) as Error & { retryable: boolean };
      // Mark server errors as retryable
      error.retryable = errorMsg.includes("Something went wrong") || response.status >= 500;
      throw error;
    }
    return json.data as T;
  }

  async getLists(): Promise<StarList[]> {
    const query = `
      query {
        viewer {
          lists(first: 100) {
            nodes {
              id
              name
              description
              isPrivate
              items(first: 1) {
                totalCount
              }
            }
          }
        }
      }
    `;

    const data = await this.graphql<{
      viewer: {
        lists: {
          nodes: Array<{
            id: string;
            name: string;
            description: string | null;
            isPrivate: boolean;
            items: { totalCount: number };
          }>;
        };
      };
    }>(query);

    return data.viewer.lists.nodes.map((list) => ({
      id: list.id,
      name: list.name,
      description: list.description,
      isPrivate: list.isPrivate,
      itemCount: list.items.totalCount,
    }));
  }

  async getListItems(listId: string): Promise<StarredRepo[]> {
    const query = `
      query($listId: ID!, $cursor: String) {
        node(id: $listId) {
          ... on UserList {
            items(first: 100, after: $cursor) {
              pageInfo {
                hasNextPage
                endCursor
              }
              nodes {
                ... on Repository {
                  id
                  databaseId
                  name
                  nameWithOwner
                  description
                  url
                  homepageUrl
                  primaryLanguage {
                    name
                  }
                  repositoryTopics(first: 10) {
                    nodes {
                      topic {
                        name
                      }
                    }
                  }
                  stargazerCount
                  forkCount
                  updatedAt
                  pushedAt
                  isArchived
                  isDisabled
                }
              }
            }
          }
        }
      }
    `;

    interface ListItemsResponse {
      node: {
        items: {
          pageInfo: { hasNextPage: boolean; endCursor: string };
          nodes: Array<GraphQLRepoData>;
        };
      };
    }

    const repos: StarredRepo[] = [];
    let cursor: string | null = null;

    while (true) {
      const response: ListItemsResponse = await this.graphql<ListItemsResponse>(query, { listId, cursor });

      for (const repo of response.node.items.nodes) {
        if (!repo.nameWithOwner) continue;
        repos.push(graphqlToStarredRepo(repo));
      }

      if (!response.node.items.pageInfo.hasNextPage) break;
      cursor = response.node.items.pageInfo.endCursor;
    }

    return repos;
  }

  async createList(name: string, description?: string, isPrivate = false): Promise<StarList> {
    const query = `
      mutation($input: CreateUserListInput!) {
        createUserList(input: $input) {
          list {
            id
            name
            description
            isPrivate
          }
        }
      }
    `;

    const data = await this.graphql<{
      createUserList: {
        list: { id: string; name: string; description: string | null; isPrivate: boolean };
      };
    }>(query, {
      input: { name, description, isPrivate },
    });

    return {
      id: data.createUserList.list.id,
      name: data.createUserList.list.name,
      description: data.createUserList.list.description,
      isPrivate: data.createUserList.list.isPrivate,
      itemCount: 0,
    };
  }

  async deleteList(listId: string): Promise<void> {
    const query = `
      mutation($listId: ID!) {
        deleteUserList(input: { listId: $listId }) {
          clientMutationId
        }
      }
    `;

    await this.graphql(query, { listId });
  }

  /**
   * Add a repo to a list while preserving existing list memberships
   * @param listId - The list ID to add the repo to
   * @param repoId - The repo node ID
   * @param existingListIds - Optional: list IDs the repo already belongs to (from cache)
   */
  async addRepoToList(listId: string, repoId: string, existingListIds: string[] = []): Promise<void> {
    const query = `
      mutation($itemId: ID!, $listIds: [ID!]!) {
        updateUserListsForItem(input: { itemId: $itemId, listIds: $listIds }) {
          item {
            ... on Repository {
              id
            }
          }
        }
      }
    `;

    // Combine existing lists with the new listId
    const newListIds = [...new Set([...existingListIds, listId])];

    await this.graphql(query, { itemId: repoId, listIds: newListIds });
  }

  /**
   * Remove a repo from a list
   * @param listId - The list ID to remove the repo from
   * @param repoId - The repo node ID
   * @param existingListIds - List IDs the repo currently belongs to (from cache)
   */
  async removeRepoFromList(listId: string, repoId: string, existingListIds: string[]): Promise<void> {
    const query = `
      mutation($itemId: ID!, $listIds: [ID!]!) {
        updateUserListsForItem(input: { itemId: $itemId, listIds: $listIds }) {
          item {
            ... on Repository {
              id
            }
          }
        }
      }
    `;

    // Remove the listId from existing lists
    const newListIds = existingListIds.filter((id) => id !== listId);

    await this.graphql(query, { itemId: repoId, listIds: newListIds });
  }

  async getRepoByName(fullName: string): Promise<StarredRepo | null> {
    const [owner, name] = fullName.split("/");
    if (!owner || !name) return null;
    try {
      const { data } = await this.octokit.repos.get({ owner, repo: name });
      return toStarredRepo({
        id: data.id,
        node_id: data.node_id,
        name: data.name,
        full_name: data.full_name,
        description: data.description,
        html_url: data.html_url,
        homepage: data.homepage ?? null,
        language: data.language ?? null,
        topics: data.topics,
        stargazers_count: data.stargazers_count,
        forks_count: data.forks_count,
        updated_at: data.updated_at ?? null,
        pushed_at: data.pushed_at ?? null,
        archived: data.archived,
        disabled: data.disabled,
      });
    } catch {
      // Silently fail - repo may not exist or be inaccessible
      return null;
    }
  }
}
