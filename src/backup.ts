import type { StarredRepo, StarList } from "./types";
import { GitHubClient } from "./github/client";
import { existsSync, mkdirSync, readdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export interface Backup {
  timestamp: string;
  user: string;
  stars: { fullName: string; nodeId: string }[];
  lists: {
    id: string;
    name: string;
    description: string | null;
    repos: string[]; // fullName[]
  }[];
}

const BACKUP_DIR = join(homedir(), ".github-stars-backup");

export class BackupManager {
  private github: GitHubClient;

  constructor(github: GitHubClient) {
    this.github = github;
    if (!existsSync(BACKUP_DIR)) {
      mkdirSync(BACKUP_DIR, { recursive: true });
    }
  }

  async createBackup(stars: StarredRepo[], lists: StarList[]): Promise<string> {
    const user = await this.github.getAuthenticatedUser();
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    // Fetch list items for each list
    const listsWithRepos = await Promise.all(
      lists.map(async (list) => {
        const items = await this.github.getListItems(list.id);
        return {
          id: list.id,
          name: list.name,
          description: list.description,
          repos: items.map((r) => r.fullName),
        };
      })
    );

    const backup: Backup = {
      timestamp,
      user: user.login,
      stars: stars.map((s) => ({ fullName: s.fullName, nodeId: s.nodeId })),
      lists: listsWithRepos,
    };

    const filename = `backup-${user.login}-${timestamp}.json`;
    const filepath = join(BACKUP_DIR, filename);
    await Bun.write(filepath, JSON.stringify(backup, null, 2));

    return filepath;
  }

  listBackups(): { filename: string; timestamp: string; user: string }[] {
    if (!existsSync(BACKUP_DIR)) return [];

    return readdirSync(BACKUP_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((filename) => {
        const match = filename.match(/backup-(.+)-(\d{4}-\d{2}-\d{2}T.+)\.json/);
        return {
          filename,
          user: match?.[1] || "unknown",
          timestamp: match?.[2]?.replace(/-/g, ":").slice(0, 19) || "",
        };
      })
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  async loadBackup(filename: string): Promise<Backup | null> {
    const filepath = join(BACKUP_DIR, filename);
    if (!existsSync(filepath)) return null;

    const content = await Bun.file(filepath).text();
    return JSON.parse(content);
  }

  async restore(backup: Backup, onProgress?: (msg: string) => void): Promise<{ success: number; failed: number }> {
    const result = { success: 0, failed: 0 };

    // Get current state
    onProgress?.("Fetching current state...");
    const currentStars = await this.github.getStarredRepos();
    const currentLists = await this.github.getLists();

    const currentStarNames = new Set(currentStars.map((s) => s.fullName));
    const backupStarNames = new Set(backup.stars.map((s) => s.fullName));

    // Re-star removed repos
    const toStar = backup.stars.filter((s) => !currentStarNames.has(s.fullName));
    for (const repo of toStar) {
      try {
        const [owner, name] = repo.fullName.split("/");
        await this.github.starRepo(owner, name);
        result.success++;
        onProgress?.(`Starred: ${repo.fullName}`);
      } catch {
        result.failed++;
      }
    }

    // Recreate deleted lists
    const currentListNames = new Set(currentLists.map((l) => l.name));
    const listIdMap = new Map<string, string>();

    for (const list of currentLists) {
      listIdMap.set(list.name, list.id);
    }

    for (const list of backup.lists) {
      if (!currentListNames.has(list.name)) {
        try {
          const created = await this.github.createList(list.name, list.description || undefined);
          listIdMap.set(list.name, created.id);
          result.success++;
          onProgress?.(`Created list: ${list.name}`);
        } catch {
          result.failed++;
        }
      }
    }

    // Restore list contents
    for (const list of backup.lists) {
      const listId = listIdMap.get(list.name);
      if (!listId) continue;

      const currentItems = await this.github.getListItems(listId);
      const currentItemNames = new Set(currentItems.map((r) => r.fullName));

      for (const repoName of list.repos) {
        if (!currentItemNames.has(repoName)) {
          try {
            const repo = await this.github.getRepoByName(repoName);
            if (repo) {
              await this.github.addRepoToList(listId, repo.nodeId);
              result.success++;
            }
          } catch {
            result.failed++;
          }
        }
      }
      onProgress?.(`Restored list: ${list.name}`);
    }

    return result;
  }
}
