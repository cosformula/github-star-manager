import prompts from "prompts";
import { GitHubClient } from "../github/client";
import { RepoAnalyzer } from "../analyzer";
import { BackupManager } from "../backup";
import type { StarredRepo, StarList, AnalysisResult, PlanAction, ExecutionPlan } from "../types";

export class StarManagerAgent {
  private github!: GitHubClient;
  private analyzer!: RepoAnalyzer;
  private backup!: BackupManager;
  private stars: StarredRepo[] = [];
  private lists: StarList[] = [];
  private analysis: AnalysisResult | null = null;
  private plan: ExecutionPlan | null = null;

  async run(): Promise<void> {
    console.log("\n🌟 GitHub Stars Manager\n");

    // Check for restore mode
    const { mode } = await prompts({
      type: "select",
      name: "mode",
      message: "What would you like to do?",
      choices: [
        { title: "📊 Analyze and organize stars", value: "analyze" },
        { title: "🔄 Restore from backup", value: "restore" },
      ],
    });

    // Get tokens
    const tokens = await this.getTokens();
    if (!tokens) return;

    this.github = new GitHubClient(tokens.github);
    this.analyzer = new RepoAnalyzer(tokens.openrouter);
    this.backup = new BackupManager(this.github);

    if (mode === "restore") {
      await this.restoreFromBackup();
      return;
    }

    // Normal flow
    await this.fetchData();
    await this.createBackup();
    await this.analyzeAndSuggest();
    await this.reviewPlan();
    await this.executePlan();
  }

  private async getTokens(): Promise<{ github: string; openrouter: string } | null> {
    // 优先读取环境变量
    let github = process.env.GITHUB_TOKEN || "";
    let openrouter = process.env.OPENROUTER_API_KEY || "";

    if (github && openrouter) {
      console.log("Using tokens from environment variables.\n");
      return { github, openrouter };
    }

    console.log("API tokens required (or set GITHUB_TOKEN & OPENROUTER_API_KEY).\n");

    if (!github) {
      const res = await prompts({
        type: "password",
        name: "github",
        message: "GitHub Personal Access Token:",
        validate: (v) => v.length > 0 || "Required",
      });
      if (!res.github) return null;
      github = res.github;
    } else {
      console.log("GitHub token: from env");
    }

    if (!openrouter) {
      const res = await prompts({
        type: "password",
        name: "openrouter",
        message: "OpenRouter API Key:",
        validate: (v) => v.length > 0 || "Required",
      });
      if (!res.openrouter) return null;
      openrouter = res.openrouter;
    } else {
      console.log("OpenRouter key: from env");
    }

    return { github, openrouter };
  }

  private async fetchData(): Promise<void> {
    console.log("\n📡 Fetching your GitHub data...\n");

    try {
      const user = await this.github.getAuthenticatedUser();
      console.log(`   User: ${user.login}`);

      process.stdout.write("   Stars: fetching...");
      this.stars = await this.github.getStarredRepos();
      console.log(`\r   Stars: ${this.stars.length} repos    `);

      process.stdout.write("   Lists: fetching...");
      this.lists = await this.github.getLists();
      console.log(`\r   Lists: ${this.lists.length} lists    `);
    } catch (e) {
      console.error(`\n❌ Error: ${e instanceof Error ? e.message : e}`);
      throw e;
    }
  }

  private async createBackup(): Promise<void> {
    console.log("\n💾 Creating backup...");
    try {
      const filepath = await this.backup.createBackup(this.stars, this.lists);
      console.log(`   Saved to: ${filepath}\n`);
    } catch (e) {
      console.log(`   ⚠️  Backup failed: ${e instanceof Error ? e.message : e}`);
      const { cont } = await prompts({
        type: "confirm",
        name: "cont",
        message: "Continue without backup?",
        initial: false,
      });
      if (!cont) throw new Error("Aborted");
    }
  }

  private async restoreFromBackup(): Promise<void> {
    const backups = this.backup.listBackups();

    if (backups.length === 0) {
      console.log("\n❌ No backups found.\n");
      return;
    }

    console.log("\n📂 Available backups:\n");

    const { selected } = await prompts({
      type: "select",
      name: "selected",
      message: "Select backup to restore:",
      choices: backups.map((b) => ({
        title: `${b.timestamp} (${b.user})`,
        value: b.filename,
      })),
    });

    if (!selected) return;

    const backup = await this.backup.loadBackup(selected);
    if (!backup) {
      console.log("\n❌ Failed to load backup.\n");
      return;
    }

    console.log(`\n📋 Backup contents:`);
    console.log(`   Stars: ${backup.stars.length}`);
    console.log(`   Lists: ${backup.lists.length}`);
    for (const list of backup.lists) {
      console.log(`      • ${list.name} (${list.repos.length} repos)`);
    }

    const { confirm } = await prompts({
      type: "confirm",
      name: "confirm",
      message: "Restore this backup?",
      initial: false,
    });

    if (!confirm) return;

    console.log("\n🔄 Restoring...\n");
    const result = await this.backup.restore(backup, (msg) => console.log(`   ${msg}`));
    console.log(`\n✅ Done: ${result.success} restored, ${result.failed} failed\n`);
  }

  private async analyzeAndSuggest(): Promise<void> {
    console.log("🔍 Analyzing your stars...\n");

    this.analysis = await this.analyzer.analyze(this.stars, this.lists);

    console.log("═".repeat(50));
    console.log("📊 Analysis Summary");
    console.log("═".repeat(50));

    console.log(`\n📦 Total repos: ${this.stars.length}`);
    console.log(`   📁 Archived: ${this.analysis.archivedRepos.length}`);
    console.log(`   ⏰ Stale (2+ years): ${this.analysis.staleRepos.length}`);

    console.log(`\n📂 Suggested Lists (${this.analysis.suggestedLists.length}):`);
    for (const list of this.analysis.suggestedLists) {
      console.log(`   • ${list.name} (${list.matchingRepos.length} repos)`);
      console.log(`     ${list.description}`);
    }

    const toUnstar = this.analysis.repoSuggestions.filter((a) => a.action === "unstar");
    const toCategorize = this.analysis.repoSuggestions.filter((a) => a.action === "categorize");

    console.log(`\n🎯 Suggested Actions:`);
    console.log(`   ⭐ Unstar: ${toUnstar.length} repos`);
    console.log(`   📁 Categorize: ${toCategorize.length} repos`);

    console.log("═".repeat(50));
  }

  private async reviewPlan(): Promise<void> {
    if (!this.analysis) return;

    const { action } = await prompts({
      type: "select",
      name: "action",
      message: "What would you like to do?",
      choices: [
        { title: "📋 Review suggested lists", value: "lists" },
        { title: "🗑️  Review repos to unstar", value: "unstar" },
        { title: "📁 Review categorization", value: "categorize" },
        { title: "✅ Generate full plan", value: "plan" },
        { title: "❌ Exit", value: "exit" },
      ],
    });

    if (action === "exit") return;

    if (action === "lists") await this.reviewLists();
    else if (action === "unstar") await this.reviewUnstar();
    else if (action === "categorize") await this.reviewCategorize();

    await this.generatePlan();
    await this.showPlanAndModify();
  }

  private async reviewLists(): Promise<void> {
    if (!this.analysis) return;

    console.log("\n📂 Suggested Lists:\n");

    const choices = this.analysis.suggestedLists.map((list, i) => ({
      title: `${list.name} (${list.matchingRepos.length} repos)`,
      value: i,
      selected: true,
    }));

    const { selected } = await prompts({
      type: "multiselect",
      name: "selected",
      message: "Select lists to create:",
      choices,
      hint: "Space to toggle, Enter to confirm",
    });

    this.analysis.suggestedLists = (selected || []).map((i: number) => this.analysis!.suggestedLists[i]);

    const { addCustom } = await prompts({
      type: "confirm",
      name: "addCustom",
      message: "Add a custom list?",
      initial: false,
    });

    if (addCustom) {
      const { name, description } = await prompts([
        { type: "text", name: "name", message: "List name:" },
        { type: "text", name: "description", message: "Description:" },
      ]);

      if (name) {
        this.analysis.suggestedLists.push({ name, description: description || "", matchingRepos: [] });
      }
    }
  }

  private async reviewUnstar(): Promise<void> {
    if (!this.analysis) return;

    const toUnstar = this.analysis.repoSuggestions.filter((s) => s.action === "unstar");

    console.log(`\n🗑️  Repos suggested for unstar (${toUnstar.length}):\n`);

    for (const s of toUnstar.slice(0, 20)) {
      console.log(`   • ${s.repo.fullName}`);
      console.log(`     ${s.reason}`);
    }
    if (toUnstar.length > 20) console.log(`   ... +${toUnstar.length - 20} more`);

    const { confirm } = await prompts({
      type: "confirm",
      name: "confirm",
      message: `Unstar these ${toUnstar.length} repos?`,
      initial: true,
    });

    if (!confirm) {
      for (const s of toUnstar) s.action = "keep";
    }
  }

  private async reviewCategorize(): Promise<void> {
    if (!this.analysis) return;

    const toCategorize = this.analysis.repoSuggestions.filter((s) => s.action === "categorize");

    console.log(`\n📁 Repos to categorize (${toCategorize.length}):\n`);

    const byList: Record<string, typeof toCategorize> = {};
    for (const s of toCategorize) {
      (byList[s.suggestedList || "Uncategorized"] ||= []).push(s);
    }

    for (const [list, repos] of Object.entries(byList)) {
      console.log(`   ${list} (${repos.length}):`);
      for (const r of repos.slice(0, 5)) console.log(`      • ${r.repo.fullName}`);
      if (repos.length > 5) console.log(`      ... +${repos.length - 5} more`);
    }

    const { confirm } = await prompts({
      type: "confirm",
      name: "confirm",
      message: "Proceed with categorization?",
      initial: true,
    });

    if (!confirm) {
      for (const s of toCategorize) s.action = "keep";
    }
  }

  private async generatePlan(): Promise<void> {
    if (!this.analysis) return;

    const actions: PlanAction[] = [];

    for (const list of this.analysis.suggestedLists) {
      if (!this.lists.find((l) => l.name === list.name)) {
        actions.push({
          type: "create_list",
          description: `Create list "${list.name}"`,
          params: { name: list.name, description: list.description },
        });
      }
    }

    for (const s of this.analysis.repoSuggestions) {
      if (s.action === "categorize" && s.suggestedList) {
        actions.push({
          type: "add_to_list",
          description: `Add ${s.repo.fullName} to "${s.suggestedList}"`,
          params: { list_name: s.suggestedList, repo_full_name: s.repo.fullName },
        });
      }
    }

    for (const s of this.analysis.repoSuggestions) {
      if (s.action === "unstar") {
        actions.push({
          type: "unstar",
          description: `Unstar ${s.repo.fullName}`,
          params: { repo_full_name: s.repo.fullName },
        });
      }
    }

    const unstarCount = this.analysis.repoSuggestions.filter((s) => s.action === "unstar").length;
    this.plan = {
      summary: `Create ${this.analysis.suggestedLists.length} lists, categorize repos, unstar ${unstarCount} repos`,
      actions,
      reasoning: "Based on analysis of your starred repos",
    };
  }

  private async showPlanAndModify(): Promise<void> {
    if (!this.plan) return;

    while (true) {
      console.log("\n" + "═".repeat(50));
      console.log("📋 Execution Plan");
      console.log("═".repeat(50));
      console.log(`\n${this.plan.summary}\n`);

      const grouped = this.groupActions(this.plan.actions);
      for (const [type, actions] of Object.entries(grouped)) {
        console.log(`${this.icon(type)} ${this.label(type)} (${actions.length}):`);
        for (const a of actions.slice(0, 5)) {
          console.log(`   • ${a.params.repo_full_name || a.params.name || a.params.list_name}`);
        }
        if (actions.length > 5) console.log(`   ... +${actions.length - 5} more`);
      }

      console.log("═".repeat(50));

      const file = `/tmp/plan-${Date.now()}.json`;
      await Bun.write(file, JSON.stringify(this.plan, null, 2));
      console.log(`📄 Full plan: ${file}\n`);

      const { choice } = await prompts({
        type: "select",
        name: "choice",
        message: `${this.plan.actions.length} actions. What to do?`,
        choices: [
          { title: "✅ Execute plan", value: "execute" },
          { title: "➖ Remove some actions", value: "remove" },
          { title: "🔄 Regenerate plan", value: "regenerate" },
          { title: "❌ Cancel", value: "cancel" },
        ],
      });

      if (choice === "execute" || choice === "cancel") {
        if (choice === "cancel") this.plan = null;
        break;
      }

      if (choice === "remove") await this.removeActions();
      else if (choice === "regenerate") {
        await this.reviewPlan();
        break;
      }
    }
  }

  private async removeActions(): Promise<void> {
    if (!this.plan) return;

    const { type } = await prompts({
      type: "select",
      name: "type",
      message: "Remove which actions?",
      choices: [
        { title: "⭐ Unstar", value: "unstar" },
        { title: "📁 Create list", value: "create_list" },
        { title: "➕ Add to list", value: "add_to_list" },
      ],
    });

    const count = this.plan.actions.filter((a) => a.type === type).length;
    const { confirm } = await prompts({
      type: "confirm",
      name: "confirm",
      message: `Remove all ${count} ${type} actions?`,
    });

    if (confirm) {
      this.plan.actions = this.plan.actions.filter((a) => a.type !== type);
    }
  }

  private async executePlan(): Promise<void> {
    if (!this.plan || this.plan.actions.length === 0) {
      console.log("\n👋 No actions to execute. Goodbye!\n");
      return;
    }

    console.log(`\n🚀 Executing ${this.plan.actions.length} actions...\n`);

    const listIdMap = new Map<string, string>();

    // Create lists
    const createActions = this.plan.actions.filter((a) => a.type === "create_list");
    for (const action of createActions) {
      try {
        process.stdout.write(`   Creating "${action.params.name}"... `);
        const list = await this.github.createList(action.params.name, action.params.description);
        listIdMap.set(action.params.name, list.id);
        console.log("✓");
      } catch (e) {
        console.log(`✗ ${e instanceof Error ? e.message : e}`);
      }
    }

    for (const list of this.lists) listIdMap.set(list.name, list.id);

    // Add to lists
    const addActions = this.plan.actions.filter((a) => a.type === "add_to_list");
    let addSuccess = 0;
    for (const action of addActions) {
      const listId = listIdMap.get(action.params.list_name);
      if (!listId) continue;
      try {
        const repo = await this.github.getRepoByName(action.params.repo_full_name);
        if (repo) {
          await this.github.addRepoToList(listId, repo.nodeId);
          addSuccess++;
        }
      } catch {}
      process.stdout.write(`\r   Adding to lists: ${addSuccess}/${addActions.length}`);
    }
    if (addActions.length > 0) console.log(" ✓");

    // Unstar
    const unstarActions = this.plan.actions.filter((a) => a.type === "unstar");
    let unstarSuccess = 0;
    for (const action of unstarActions) {
      try {
        const [owner, repo] = action.params.repo_full_name.split("/");
        await this.github.unstarRepo(owner, repo);
        unstarSuccess++;
      } catch {}
      process.stdout.write(`\r   Unstarring: ${unstarSuccess}/${unstarActions.length}`);
    }
    if (unstarActions.length > 0) console.log(" ✓");

    console.log("\n✅ Done!\n");
  }

  private groupActions(actions: PlanAction[]): Record<string, PlanAction[]> {
    return actions.reduce((acc, a) => ((acc[a.type] ||= []).push(a), acc), {} as Record<string, PlanAction[]>);
  }

  private icon(type: string): string {
    return { unstar: "⭐", create_list: "📁", add_to_list: "➕" }[type] || "•";
  }

  private label(type: string): string {
    return { unstar: "Unstar", create_list: "Create lists", add_to_list: "Add to lists" }[type] || type;
  }
}
