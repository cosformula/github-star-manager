import { Octokit } from "@octokit/rest";
import type { StarredRepo, StarList } from "../types";

export class GitHubClient {
  private octokit: Octokit;
  private token: string;

  constructor(token: string) {
    this.token = token;
    this.octokit = new Octokit({ auth: token });
  }

  async getStarredRepos(onProgress?: (count: number, total: number) => void, maxCount?: number): Promise<StarredRepo[]> {
    const perPage = 100;

    // Step 1: 获取第一页，同时解析 Link header 得到总页数
    const firstResponse = await this.octokit.activity.listReposStarredByAuthenticatedUser({
      per_page: perPage,
      page: 1,
      sort: "created",
      direction: "desc",
    });

    if (firstResponse.data.length === 0) return [];

    // 解析 Link header 获取最后一页
    const linkHeader = firstResponse.headers.link || "";
    const lastPageMatch = linkHeader.match(/[?&]page=(\d+)[^>]*>;\s*rel="last"/);
    let totalPages = lastPageMatch ? parseInt(lastPageMatch[1], 10) : 1;

    // Debug: 打印 Link header
    console.log(`\n   [DEBUG] Link header: ${linkHeader || "(empty)"}`);
    console.log(`   [DEBUG] Parsed totalPages: ${totalPages}`);

    // 如果解析失败但第一页是满的，有问题
    const linkParseFailed = totalPages === 1 && firstResponse.data.length === perPage && !lastPageMatch;

    const estimatedTotal = maxCount
      ? Math.min(totalPages * perPage, maxCount)
      : (linkParseFailed ? 9999 : totalPages * perPage); // 回退时显示 ?

    // Debug mode: 限制页数
    const maxPages = maxCount ? Math.ceil(maxCount / perPage) : (linkParseFailed ? 999 : totalPages);
    const pagesToFetch = Math.min(linkParseFailed ? 999 : totalPages, maxPages);

    // 立即报告第一页的进度
    onProgress?.(firstResponse.data.length, estimatedTotal);

    const CONCURRENCY = 3;
    const allResponses: any[][] = [firstResponse.data];

    if (linkParseFailed) {
      // 回退方案：逐页获取直到空页
      let page = 2;
      while (page <= pagesToFetch) {
        const response = await this.octokit.activity.listReposStarredByAuthenticatedUser({
          per_page: perPage,
          page,
          sort: "created",
          direction: "desc",
        });
        if (response.data.length === 0) break;
        allResponses.push(response.data);
        onProgress?.(allResponses.flat().length, allResponses.flat().length);
        if (maxCount && allResponses.flat().length >= maxCount) break;
        page++;
      }
    } else {
      // 正常并行获取
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
    }

    // Step 3: 转换数据
    const repos: StarredRepo[] = [];
    for (const data of allResponses) {
      for (const repo of data) {
        const repoData = "repo" in repo ? repo.repo : repo;
        repos.push({
          id: repoData.id,
          nodeId: repoData.node_id,
          name: repoData.name,
          fullName: repoData.full_name,
          description: repoData.description,
          url: repoData.html_url,
          homepage: repoData.homepage,
          language: repoData.language,
          topics: repoData.topics || [],
          stargazersCount: repoData.stargazers_count,
          forksCount: repoData.forks_count,
          updatedAt: repoData.updated_at || "",
          pushedAt: repoData.pushed_at || "",
          archived: repoData.archived,
          disabled: repoData.disabled,
        });

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

  // GraphQL helper for Lists API (with retry)
  private async graphql<T>(query: string, variables?: Record<string, any>): Promise<T> {
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch("https://api.github.com/graphql", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query, variables }),
        });

        const json = await response.json();
        if (json.errors) {
          const errorMsg = json.errors.map((e: any) => e.message).join(", ");
          // 如果是服务端错误，进行重试
          if (errorMsg.includes("Something went wrong") || response.status >= 500) {
            throw new Error(errorMsg);
          }
          // 其他错误直接抛出
          throw new Error(errorMsg);
        }
        return json.data;
      } catch (error) {
        lastError = error as Error;
        if (attempt < maxRetries) {
          const delay = attempt * 2000; // 2s, 4s, 6s
          console.error(`   ⚠️ GitHub API 错误，${delay/1000}s 后重试 (${attempt}/${maxRetries})...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
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

    const repos: StarredRepo[] = [];
    let cursor: string | null = null;

    while (true) {
      const data = await this.graphql<{
        node: {
          items: {
            pageInfo: { hasNextPage: boolean; endCursor: string };
            nodes: Array<any>;
          };
        };
      }>(query, { listId, cursor });

      for (const repo of data.node.items.nodes) {
        if (!repo.nameWithOwner) continue;
        repos.push({
          id: repo.databaseId,
          nodeId: repo.id,
          name: repo.name,
          fullName: repo.nameWithOwner,
          description: repo.description,
          url: repo.url,
          homepage: repo.homepageUrl,
          language: repo.primaryLanguage?.name || null,
          topics: repo.repositoryTopics.nodes.map((t: any) => t.topic.name),
          stargazersCount: repo.stargazerCount,
          forksCount: repo.forkCount,
          updatedAt: repo.updatedAt,
          pushedAt: repo.pushedAt,
          archived: repo.isArchived,
          disabled: repo.isDisabled,
        });
      }

      if (!data.node.items.pageInfo.hasNextPage) break;
      cursor = data.node.items.pageInfo.endCursor;
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

  async addRepoToList(listId: string, repoId: string): Promise<void> {
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

    // 获取当前 repo 所属的 lists，然后添加新的 listId
    const currentLists = await this.getRepoLists(repoId);
    const newListIds = [...new Set([...currentLists, listId])];

    await this.graphql(query, { itemId: repoId, listIds: newListIds });
  }

  async getRepoLists(repoId: string): Promise<string[]> {
    const query = `
      query($id: ID!) {
        node(id: $id) {
          ... on Repository {
            viewerUserListsConnection(first: 100) {
              nodes {
                id
              }
            }
          }
        }
      }
    `;

    try {
      const data = await this.graphql<{
        node: { viewerUserListsConnection?: { nodes: { id: string }[] } };
      }>(query, { id: repoId });
      return data.node.viewerUserListsConnection?.nodes.map((n) => n.id) || [];
    } catch {
      return [];
    }
  }

  async removeRepoFromList(listId: string, repoId: string): Promise<void> {
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

    // 获取当前 repo 所属的 lists，然后移除 listId
    const currentLists = await this.getRepoLists(repoId);
    const newListIds = currentLists.filter((id) => id !== listId);

    await this.graphql(query, { itemId: repoId, listIds: newListIds });
  }

  async getRepoByName(fullName: string): Promise<StarredRepo | null> {
    const [owner, name] = fullName.split("/");
    try {
      const { data } = await this.octokit.repos.get({ owner, repo: name });
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
    } catch {
      return null;
    }
  }
}
