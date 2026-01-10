import prompts from "prompts";
import { GitHubClient } from "../github/client";
import { RepoAnalyzer } from "../analyzer";
import { BackupManager } from "../backup";
import { Spinner } from "../spinner";
import type { StarredRepo, StarList, ListSuggestion, RepoSuggestion, PlanAction, ExecutionPlan } from "../types";

export class StarManagerAgent {
  private github!: GitHubClient;
  private analyzer!: RepoAnalyzer;
  private backup!: BackupManager;
  private stars: StarredRepo[] = [];
  private lists: StarList[] = [];
  private plan: ExecutionPlan | null = null;
  private canCreateLists = false;

  // Two-stage analysis results
  private finalizedLists: ListSuggestion[] = [];
  private repoSuggestions: RepoSuggestion[] = [];
  private staleRepos: StarredRepo[] = [];
  private archivedRepos: StarredRepo[] = [];

  private debugMode = false;
  private dryRun = false;

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
        { title: "🐛 Debug mode (2 batches only)", value: "debug" },
        { title: "🧪 Dry run (no actual writes)", value: "dryrun" },
        { title: "🐛🧪 Debug + Dry run", value: "debug_dryrun" },
      ],
    });

    if (mode === "debug" || mode === "debug_dryrun") {
      this.debugMode = true;
      console.log("⚠️  Debug mode: only processing 2 batches (~60 repos)");
    }
    if (mode === "dryrun" || mode === "debug_dryrun") {
      this.dryRun = true;
      console.log("🧪 Dry run: no actual API writes will be made");
    }
    if (this.debugMode || this.dryRun) console.log();

    // Get tokens
    const tokens = await this.getTokens();
    if (!tokens) return;

    this.github = new GitHubClient(tokens.github);
    this.analyzer = new RepoAnalyzer(tokens.openrouter);
    this.backup = new BackupManager(this.github);

    if (this.debugMode) {
      this.analyzer.setDebugMode(true, 2);
    }

    if (mode === "restore") {
      await this.restoreFromBackup();
      return;
    }

    // Normal flow
    await this.fetchData();
    await this.createBackup();

    // Main loop
    await this.mainLoop();
  }

  /**
   * Main loop - user can choose operations until they exit
   */
  private async mainLoop(): Promise<void> {
    while (true) {
      // Reset state for new operation
      this.resetOperationState();

      const action = await this.showMainMenu();

      if (action === "exit") {
        console.log("\n👋 Goodbye!\n");
        break;
      }

      if (action === "categorize") {
        await this.runCategorizationFlow();
      } else if (action === "unstar") {
        await this.runUnstarFlow();
      }
    }
  }

  /**
   * Reset state between operations
   */
  private resetOperationState(): void {
    this.finalizedLists = [];
    this.repoSuggestions = [];
    this.plan = null;
    this.useExistingListsOnly = false;
    this.shouldReorganizeLists = false;
  }

  /**
   * Show main menu and return selected action
   */
  private async showMainMenu(): Promise<string> {
    console.log("\n" + "═".repeat(50));
    console.log("📊 Overview");
    console.log("═".repeat(50));
    console.log(`\n📦 Total starred repos: ${this.stars.length}`);
    console.log(`   📁 Archived: ${this.archivedRepos.length}`);
    console.log(`   ⏰ Stale (2+ years): ${this.staleRepos.length}`);
    console.log(`   📂 Existing lists: ${this.lists.length}`);
    console.log("═".repeat(50));

    const { action } = await prompts({
      type: "select",
      name: "action",
      message: "What would you like to do?",
      choices: [
        { title: "📂 Categorize repos into lists", value: "categorize" },
        { title: "🧹 Clean up (find repos to unstar)", value: "unstar" },
        { title: "👋 Exit", value: "exit" },
      ],
    });

    return action || "exit";
  }

  /**
   * Run the categorization flow
   */
  private async runCategorizationFlow(): Promise<void> {
    if (this.lists.length > 0) {
      await this.handleExistingLists();
    } else {
      console.log("\n📂 You don't have any Lists yet. Let's create some first.\n");
      await this.listManagementStage();
    }

    if (this.finalizedLists.length > 0) {
      await this.categorizationStage();
    }

    if (this.repoSuggestions.length > 0) {
      await this.reviewCategorization();
      await this.generatePlan();
      await this.showPlanAndModify();
      await this.executePlan();
    }

    // Refresh lists after execution
    await this.refreshLists();
  }

  /**
   * Run the unstar flow
   */
  private async runUnstarFlow(): Promise<void> {
    await this.unstarAnalysisStage();

    if (this.repoSuggestions.length > 0) {
      await this.reviewUnstar();
      await this.generatePlan();
      await this.showPlanAndModify();
      await this.executePlan();
    }

    // Refresh stars after execution
    await this.refreshStars();
  }

  /**
   * Refresh lists data after modifications
   */
  private async refreshLists(): Promise<void> {
    try {
      this.lists = await this.github.getLists();
    } catch (e) {
      // Ignore refresh errors
    }
  }

  /**
   * Refresh stars data after unstar operations
   */
  private async refreshStars(): Promise<void> {
    try {
      const { staleRepos, archivedRepos } = this.analyzer.getRepoStats(this.stars);
      this.staleRepos = staleRepos;
      this.archivedRepos = archivedRepos;
    } catch (e) {
      // Ignore refresh errors
    }
  }

  /**
   * Review categorization suggestions only
   */
  private async reviewCategorization(): Promise<void> {
    const toCategorize = this.repoSuggestions.filter((s) => s.action === "categorize");
    if (toCategorize.length === 0) {
      console.log("\n📁 No repos to categorize.\n");
      return;
    }

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

    const { choice } = await prompts({
      type: "select",
      name: "choice",
      message: `How to handle these ${toCategorize.length} categorizations?`,
      choices: [
        { title: "✅ Accept all", value: "accept" },
        { title: "❌ Skip all (don't add to lists)", value: "skip" },
        { title: "📝 Review by list", value: "review" },
      ],
    });

    if (choice === "skip") {
      for (const s of toCategorize) s.action = "keep";
    } else if (choice === "review") {
      for (const [list, repos] of Object.entries(byList)) {
        const { include } = await prompts({
          type: "confirm",
          name: "include",
          message: `Add ${repos.length} repos to "${list}"?`,
          initial: true,
        });
        if (!include) {
          for (const s of repos) s.action = "keep";
        }
      }
    }
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
      // 验证用户
      const spinnerUser = new Spinner("验证用户");
      spinnerUser.start();
      const user = await this.github.getAuthenticatedUser();
      spinnerUser.stop(`用户: ${user.login}`);

      // 检查权限
      const spinnerScope = new Spinner("检查权限");
      spinnerScope.start();
      const { scopes, canCreateLists } = await this.github.checkScopes();
      this.canCreateLists = canCreateLists;
      spinnerScope.stop(`权限: ${scopes.join(", ") || "(none)"}`);
      if (!canCreateLists) {
        console.log(`   ⚠️  缺少 'user' scope，无法创建 Lists`);
      }

      // 获取 stars
      const spinnerStars = new Spinner("获取 Stars");
      spinnerStars.start();
      const maxStars = this.debugMode ? 100 : undefined;
      this.stars = await this.github.getStarredRepos((count) => {
        spinnerStars.update(`获取 Stars (${count}${maxStars ? `/${maxStars}` : ""})`);
      }, maxStars);
      spinnerStars.stop(`Stars: ${this.stars.length} repos${this.debugMode ? " (debug limit)" : ""}`);

      // 获取 lists
      const spinnerLists = new Spinner("获取 Lists");
      spinnerLists.start();
      this.lists = await this.github.getLists();
      spinnerLists.stop(`Lists: ${this.lists.length} lists`);

      // 计算 stats
      const { staleRepos, archivedRepos } = this.analyzer.getRepoStats(this.stars);
      this.staleRepos = staleRepos;
      this.archivedRepos = archivedRepos;
    } catch (e) {
      console.error(`\n❌ Error: ${e instanceof Error ? e.message : e}`);
      throw e;
    }
  }

  private async createBackup(): Promise<void> {
    const spinner = new Spinner("创建备份");
    spinner.start();
    try {
      const filepath = await this.backup.createBackup(this.stars, this.lists);
      spinner.stop(`备份完成: ${filepath}`);
    } catch (e) {
      spinner.stop(`备份失败: ${e instanceof Error ? e.message : e}`);
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

  /**
   * Handle existing lists - user can choose to use them directly or manage them
   */
  private async handleExistingLists(): Promise<void> {
    console.log("\n" + "═".repeat(50));
    console.log("📂 Your Existing Lists");
    console.log("═".repeat(50));

    for (const list of this.lists) {
      console.log(`\n   ${list.isPrivate ? "🔒" : "📁"} ${list.name}`);
      console.log(`      ${list.description || "(no description)"}`);
      console.log(`      ${list.itemCount} repos`);
    }

    console.log("\n" + "═".repeat(50));

    const { action } = await prompts({
      type: "select",
      name: "action",
      message: `You have ${this.lists.length} existing lists. How do you want to categorize?`,
      choices: [
        { title: "📂 Use existing lists only", value: "use_existing" },
        { title: "✨ Keep lists + suggest new categories", value: "keep_suggest" },
        { title: "🔄 Reorganize lists first", value: "reorganize" },
        { title: "📋 View list contents", value: "view" },
      ],
    });

    if (action === "view") {
      await this.viewListContents();
      // After viewing, ask again
      await this.handleExistingLists();
    } else if (action === "use_existing") {
      // Use existing lists directly - skip to categorization
      this.useExistingListsOnly = true;
      this.finalizedLists = this.lists.map((l) => ({
        name: l.name,
        description: l.description || "",
        matchingRepos: [],
      }));
    } else if (action === "reorganize") {
      this.shouldReorganizeLists = true;
      await this.listManagementStage();
    } else {
      // keep_suggest - go through list management
      await this.listManagementStage();
    }
  }

  private shouldReorganizeLists = false;
  private useExistingListsOnly = false;

  private async viewListContents(): Promise<void> {
    const { listName } = await prompts({
      type: "select",
      name: "listName",
      message: "Select a list to view:",
      choices: this.lists.map((l) => ({
        title: `${l.isPrivate ? "🔒" : "📁"} ${l.name} (${l.itemCount})`,
        value: l.name,
      })),
    });

    if (!listName) return;

    const list = this.lists.find((l) => l.name === listName);
    if (!list) return;

    console.log(`\n📂 Contents of "${list.name}":\n`);

    try {
      const repos = await this.github.getListItems(list.id);
      if (repos.length === 0) {
        console.log("   (empty list)");
      } else {
        for (const repo of repos.slice(0, 20)) {
          console.log(`   • ${repo.fullName}`);
          if (repo.description) {
            console.log(`     ${repo.description.slice(0, 60)}${repo.description.length > 60 ? "..." : ""}`);
          }
        }
        if (repos.length > 20) {
          console.log(`   ... +${repos.length - 20} more`);
        }
      }
    } catch (e) {
      console.log(`   ⚠️  Failed to fetch: ${e instanceof Error ? e.message : e}`);
    }

    console.log();
  }

  /**
   * List Management Stage
   * - Generate list suggestions (or use existing lists)
   * - User reviews and confirms the final list structure
   */
  private async listManagementStage(): Promise<void> {
    console.log("\n" + "═".repeat(50));
    console.log("📂 List Management");
    console.log("═".repeat(50));

    // Generate list suggestions
    console.log("\n🔍 Generating list suggestions...\n");
    this.finalizedLists = await this.analyzer.generateListSuggestions(this.stars, this.lists, {
      shouldReorganize: this.shouldReorganizeLists,
      useExistingListsOnly: this.useExistingListsOnly,
    });

    // Show suggested lists
    console.log(`\n📂 Suggested Lists (${this.finalizedLists.length}):`);
    for (const list of this.finalizedLists) {
      const isExisting = this.lists.find((l) => l.name === list.name);
      const tag = isExisting ? "(existing)" : "(new)";
      console.log(`   • ${list.name} ${tag}`);
      console.log(`     ${list.description}`);
    }

    // Let user review and modify lists
    await this.reviewAndFinalizeLists();

    console.log("═".repeat(50));
  }

  /**
   * Let user review and modify the suggested lists before categorization
   */
  private async reviewAndFinalizeLists(): Promise<void> {
    while (true) {
      const { action } = await prompts({
        type: "select",
        name: "action",
        message: `${this.finalizedLists.length} lists ready. What would you like to do?`,
        choices: [
          { title: "✅ Confirm lists, proceed to categorization", value: "confirm" },
          { title: "📝 Edit lists (add/remove/rename)", value: "edit" },
          { title: "❌ Cancel", value: "cancel" },
        ],
      });

      if (action === "cancel") {
        this.finalizedLists = []; // Clear lists to skip categorization
        return;
      }
      if (action === "confirm") break;

      if (action === "edit") {
        await this.editLists();
      }
    }
  }

  /**
   * Edit the list structure
   */
  private async editLists(): Promise<void> {
    const { editAction } = await prompts({
      type: "select",
      name: "editAction",
      message: "What would you like to do?",
      choices: [
        { title: "➖ Remove lists", value: "remove" },
        { title: "➕ Add a custom list", value: "add" },
        { title: "✏️  Rename a list", value: "rename" },
        { title: "⬅️  Back", value: "back" },
      ],
    });

    if (editAction === "back") return;

    if (editAction === "remove") {
      const choices = this.finalizedLists.map((list, i) => ({
        title: list.name,
        value: i,
        selected: true,
      }));

      const { selected } = await prompts({
        type: "multiselect",
        name: "selected",
        message: "Select lists to KEEP (deselect to remove):",
        choices,
        hint: "Space to toggle, Enter to confirm",
      });

      if (selected) {
        this.finalizedLists = (selected as number[]).map((i) => this.finalizedLists[i]).filter(Boolean) as ListSuggestion[];
      }
    } else if (editAction === "add") {
      const { name, description } = await prompts([
        { type: "text", name: "name", message: "List name:" },
        { type: "text", name: "description", message: "Description:" },
      ]);

      if (name) {
        this.finalizedLists.push({ name, description: description || "", matchingRepos: [] });
        console.log(`   ✓ Added list "${name}"`);
      }
    } else if (editAction === "rename") {
      const { listIndex } = await prompts({
        type: "select",
        name: "listIndex",
        message: "Select list to rename:",
        choices: this.finalizedLists.map((l, i) => ({ title: l.name, value: i })),
      });

      if (listIndex !== undefined && this.finalizedLists[listIndex]) {
        const list = this.finalizedLists[listIndex];
        const { newName } = await prompts({
          type: "text",
          name: "newName",
          message: `New name for "${list.name}":`,
          initial: list.name,
        });

        if (newName) {
          const oldName = list.name;
          list.name = newName;
          console.log(`   ✓ Renamed "${oldName}" to "${newName}"`);
        }
      }
    }
  }

  /**
   * Categorization Stage
   * - AI categorizes repos into the finalized lists
   */
  private async categorizationStage(): Promise<void> {
    if (this.finalizedLists.length === 0) {
      console.log("\n⚠️  No lists to categorize repos into.\n");
      return;
    }

    console.log("\n" + "═".repeat(50));
    console.log("📁 Categorization");
    console.log("═".repeat(50));

    // Fetch existing list contents to tell AI which repos are already categorized
    console.log("\n📂 Fetching existing list contents...");
    const existingRepoLists = await this.fetchExistingRepoLists();
    const reposInLists = Array.from(existingRepoLists.keys()).length;
    console.log(`   Found ${reposInLists} repos already in lists`);

    console.log(`\n🔍 Categorizing ${this.stars.length} repos into ${this.finalizedLists.length} lists...\n`);

    const spinner = new Spinner("AI 正在分类");
    spinner.start();

    const categorizationResults = await this.analyzer.categorizeRepos(
      this.stars,
      this.finalizedLists,
      existingRepoLists,
      (progress, total, tokens, eta) => {
        spinner.update(`AI 正在分类 (${progress}/${total}) [${tokens.toLocaleString()} tokens] ETA: ${eta}`);
      }
    );

    spinner.stop(`分类完成`);

    // Only keep categorization results (not unstar - that's a separate stage)
    const categorized = categorizationResults.filter((s) => s.action === "categorize");
    this.repoSuggestions.push(...categorized);

    console.log(`\n🎯 Categorization Results:`);
    console.log(`   📁 Categorized: ${categorized.length} repos`);

    // Show token stats
    const stats = this.analyzer.getTokenStats();
    console.log(`\n💰 Total Token Usage:`);
    console.log(`   Prompt: ${stats.prompt.toLocaleString()} | Completion: ${stats.completion.toLocaleString()} | Total: ${stats.total.toLocaleString()}`);
    console.log(`   API Calls: ${stats.calls}`);

    console.log("═".repeat(50));
  }

  /**
   * Fetch which repos are already in which lists
   * Returns a map: repo fullName -> list names[]
   * Optimized: fetches all lists in parallel
   */
  private async fetchExistingRepoLists(): Promise<Map<string, string[]>> {
    const repoToLists = new Map<string, string[]>();

    // 并行获取所有 lists 的内容
    const results = await Promise.all(
      this.lists.map(async (list) => {
        try {
          const repos = await this.github.getListItems(list.id);
          return { list, repos, error: null };
        } catch (e) {
          return { list, repos: [], error: e };
        }
      })
    );

    // 处理结果
    for (const { list, repos, error } of results) {
      if (error) {
        console.log(`   ⚠️ Failed to fetch "${list.name}": ${error instanceof Error ? error.message : error}`);
        continue;
      }
      for (const repo of repos) {
        const existing = repoToLists.get(repo.fullName) || [];
        existing.push(list.name);
        repoToLists.set(repo.fullName, existing);
      }
    }

    return repoToLists;
  }

  /**
   * Unstar Analysis Stage (independent)
   * - AI analyzes repos to find candidates for unstarring
   */
  private async unstarAnalysisStage(): Promise<void> {
    console.log("\n" + "═".repeat(50));
    console.log("🧹 Cleanup Analysis");
    console.log("═".repeat(50));

    console.log(`\n🔍 Analyzing ${this.stars.length} repos for cleanup...\n`);

    const spinner = new Spinner("AI 正在分析");
    spinner.start();

    const unstarResults = await this.analyzer.analyzeForUnstar(
      this.stars,
      (progress) => {
        spinner.update(`AI 正在分析 (${progress}/${this.stars.length})`);
      }
    );

    spinner.stop(`分析完成`);

    // Only keep unstar suggestions
    const toUnstar = unstarResults.filter((s) => s.action === "unstar");
    this.repoSuggestions.push(...toUnstar);

    console.log(`\n🎯 Cleanup Results:`);
    console.log(`   🗑️  Suggested unstar: ${toUnstar.length} repos`);

    // Show token stats
    const stats = this.analyzer.getTokenStats();
    console.log(`\n💰 Token Usage:`);
    console.log(`   Prompt: ${stats.prompt.toLocaleString()} | Completion: ${stats.completion.toLocaleString()} | Total: ${stats.total.toLocaleString()}`);
    console.log(`   API Calls: ${stats.calls}`);

    console.log("═".repeat(50));
  }


  private syncCategorization(): void {
    const validListNames = new Set(this.finalizedLists.map((l) => l.name));
    // 加上已存在的 lists
    for (const list of this.lists) {
      validListNames.add(list.name);
    }

    for (const s of this.repoSuggestions) {
      if (s.action === "categorize" && s.suggestedList && !validListNames.has(s.suggestedList)) {
        s.action = "keep";
        s.reason = `List "${s.suggestedList}" was removed`;
      }
    }
  }

  private async reviewUnstar(): Promise<void> {
    const toUnstar = this.repoSuggestions.filter((s) => s.action === "unstar");

    if (toUnstar.length === 0) {
      console.log("\n🗑️  No repos suggested for unstar.\n");
      return;
    }

    console.log(`\n🗑️  Repos suggested for unstar (${toUnstar.length}):\n`);

    for (const s of toUnstar.slice(0, 20)) {
      console.log(`   • ${s.repo.fullName}`);
      console.log(`     ${s.reason}`);
    }
    if (toUnstar.length > 20) console.log(`   ... +${toUnstar.length - 20} more`);

    const { choice } = await prompts({
      type: "select",
      name: "choice",
      message: `How to handle these ${toUnstar.length} unstar suggestions?`,
      choices: [
        { title: "✅ Accept all", value: "accept" },
        { title: "❌ Skip all (keep these repos)", value: "skip" },
        { title: "🔍 Review one by one", value: "review" },
      ],
    });

    if (choice === "skip") {
      for (const s of toUnstar) s.action = "keep";
    } else if (choice === "review") {
      for (const s of toUnstar) {
        const { keep } = await prompts({
          type: "confirm",
          name: "keep",
          message: `Keep ${s.repo.fullName}? (${s.reason})`,
          initial: false,
        });
        if (keep) s.action = "keep";
      }
    }
  }

  private async generatePlan(): Promise<void> {
    const actions: PlanAction[] = [];

    // Add list-related actions (create lists and add repos)
    for (const list of this.finalizedLists) {
      if (!this.lists.find((l) => l.name === list.name)) {
        actions.push({
          type: "create_list",
          description: `Create list "${list.name}"`,
          params: { name: list.name, description: list.description },
        });
      }
    }

    for (const s of this.repoSuggestions) {
      if (s.action === "categorize" && s.suggestedList) {
        actions.push({
          type: "add_to_list",
          description: `Add ${s.repo.fullName} to "${s.suggestedList}"`,
          params: { list_name: s.suggestedList, repo_full_name: s.repo.fullName },
        });
      }
    }

    // Add unstar actions
    for (const s of this.repoSuggestions) {
      if (s.action === "unstar") {
        actions.push({
          type: "unstar",
          description: `Unstar ${s.repo.fullName}`,
          params: { repo_full_name: s.repo.fullName },
        });
      }
    }

    // 统计实际的 action 数量
    const createCount = actions.filter((a) => a.type === "create_list").length;
    const addCount = actions.filter((a) => a.type === "add_to_list").length;
    const unstarCount = actions.filter((a) => a.type === "unstar").length;

    const parts: string[] = [];
    if (createCount > 0) parts.push(`创建 ${createCount} 个 lists`);
    if (addCount > 0) parts.push(`分类 ${addCount} 个 repos`);
    if (unstarCount > 0) parts.push(`unstar ${unstarCount} 个 repos`);

    this.plan = {
      summary: parts.length > 0 ? parts.join(", ") : "No actions",
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

      // 显示 create_list
      if (grouped.create_list?.length) {
        console.log(`📁 Create lists (${grouped.create_list.length}):`);
        for (const a of grouped.create_list) {
          console.log(`   • ${a.params.name}`);
        }
      }

      // 显示 add_to_list，按 list 分组
      if (grouped.add_to_list?.length) {
        const byList: Record<string, number> = {};
        for (const a of grouped.add_to_list) {
          byList[a.params.list_name] = (byList[a.params.list_name] || 0) + 1;
        }
        console.log(`➕ Add to lists (${grouped.add_to_list.length} repos):`);
        for (const [listName, count] of Object.entries(byList).slice(0, 10)) {
          const exists = this.lists.find((l) => l.name === listName);
          const newList = grouped.create_list?.find((a) => a.params.name === listName);
          const status = exists ? "existing" : newList ? "new" : "⚠️ not found";
          console.log(`   • ${listName}: ${count} repos (${status})`);
        }
        if (Object.keys(byList).length > 10) {
          console.log(`   ... +${Object.keys(byList).length - 10} more lists`);
        }
      }

      // 显示 unstar
      if (grouped.unstar?.length) {
        console.log(`⭐ Unstar (${grouped.unstar.length}):`);
        for (const a of grouped.unstar.slice(0, 5)) {
          console.log(`   • ${a.params.repo_full_name}`);
        }
        if (grouped.unstar.length > 5) console.log(`   ... +${grouped.unstar.length - 5} more`);
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
        // 重新生成 plan，不需要递归回 reviewPlan
        this.syncCategorization();
        await this.generatePlan();
        // 继续循环显示新的 plan
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

    if (this.dryRun) {
      console.log(`\n🧪 DRY RUN: Would execute ${this.plan.actions.length} actions...\n`);
    } else {
      console.log(`\n🚀 Executing ${this.plan.actions.length} actions...\n`);
    }

    const listIdMap = new Map<string, string>();

    // 先加载已有的 lists
    for (const list of this.lists) listIdMap.set(list.name, list.id);

    // Create lists
    const createActions = this.plan.actions.filter((a) => a.type === "create_list");
    if (createActions.length > 0) {
      // 如果已知没有权限，提前询问
      if (!this.canCreateLists) {
        console.log(`\n⚠️  当前 Token 缺少 'user' scope，无法创建 Lists`);
        const { choice } = await prompts({
          type: "select",
          name: "choice",
          message: "如何处理?",
          choices: [
            { title: "🔑 我已更新 Token，重试", value: "retry" },
            { title: "⏭️  跳过创建 Lists，只执行 unstar", value: "skip" },
            { title: "❌ 取消执行", value: "cancel" },
          ],
        });

        if (choice === "cancel") {
          console.log("\n已取消。\n");
          return;
        }
        if (choice === "skip") {
          // 移除 create_list 和 add_to_list 操作
          this.plan.actions = this.plan.actions.filter((a) => a.type === "unstar");
        }
        // retry 的话继续执行
      }

      const listsToCreate = this.plan.actions.filter((a) => a.type === "create_list");
      if (listsToCreate.length > 0) {
        console.log(`\n📁 ${this.dryRun ? "[DRY] Would create" : "Creating"} ${listsToCreate.length} lists...`);
        let failed = false;

        for (const action of listsToCreate) {
          try {
            process.stdout.write(`   "${action.params.name}"... `);
            if (this.dryRun) {
              // Dry run: 模拟成功，用 fake ID
              listIdMap.set(action.params.name!, `dry-run-id-${action.params.name}`);
              console.log("✓ (dry)");
            } else {
              const list = await this.github.createList(action.params.name!, action.params.description);
              listIdMap.set(action.params.name!, list.id);
              console.log("✓");
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (msg.includes("scopes")) {
              console.log("✗ 需要 'user' scope");
            } else {
              console.log(`✗ ${msg.slice(0, 60)}`);
            }
            failed = true;
            break; // 第一个失败就停止
          }
        }

        if (failed) {
          const { choice } = await prompts({
            type: "select",
            name: "choice",
            message: "创建 List 失败，如何处理?",
            choices: [
              { title: "🔑 更新 Token 后重试", value: "retry" },
              { title: "⏭️  跳过 Lists，只执行 unstar", value: "skip" },
              { title: "❌ 取消执行", value: "cancel" },
            ],
          });

          if (choice === "cancel") {
            console.log("\n已取消。\n");
            return;
          }
          if (choice === "skip") {
            this.plan.actions = this.plan.actions.filter((a) => a.type === "unstar");
          }
          if (choice === "retry") {
            // 重新检查权限
            const { canCreateLists } = await this.github.checkScopes();
            this.canCreateLists = canCreateLists;
            return this.executePlan(); // 递归重试
          }
        }
      }
    }

    // Add to lists (optimized with parallel fetching and concurrency pool)
    const addActions = this.plan.actions.filter((a) => a.type === "add_to_list");
    if (addActions.length > 0) {
      console.log(`\n➕ ${this.dryRun ? "[DRY] Would add" : "Adding"} repos to lists (${addActions.length})...`);

      // 创建 case-insensitive lookup map
      const listIdMapNormalized = new Map<string, string>();
      for (const [name, id] of listIdMap) {
        listIdMapNormalized.set(name.toLowerCase().trim(), id);
      }

      let addSuccess = 0, addSkipped = 0, addFailed = 0;
      const skipReasons: Record<string, number> = {};
      const failReasons: Record<string, number> = {};
      const seenErrors = new Set<string>();

      // Step 1: 预处理 - 过滤掉找不到 list 的 actions，并记录 listId
      type PreparedAction = { action: PlanAction; listId: string };
      const preparedActions: PreparedAction[] = [];
      
      for (const action of addActions) {
        const listName = action.params.list_name || "";
        let listId = listIdMap.get(listName);
        if (!listId) {
          listId = listIdMapNormalized.get(listName.toLowerCase().trim());
        }
        if (!listId) {
          addSkipped++;
          const reason = `list not found: "${listName}"`;
          skipReasons[reason] = (skipReasons[reason] || 0) + 1;
        } else {
          preparedActions.push({ action, listId });
        }
      }

      if (this.dryRun) {
        // Dry run: 模拟成功
        addSuccess = preparedActions.length;
        process.stdout.write(`   进度: ${addSuccess + addSkipped}/${addActions.length} (✓${addSuccess} ✗0)`);
      } else if (preparedActions.length > 0) {
        // Step 2: 并行获取所有 repo 信息
        console.log(`   📥 并行获取 ${preparedActions.length} 个 repo 信息...`);
        const repoResults = await Promise.all(
          preparedActions.map(async ({ action, listId }) => {
            try {
              const repo = await this.github.getRepoByName(action.params.repo_full_name!);
              return { action, listId, repo, error: null };
            } catch (e) {
              return { action, listId, repo: null, error: e };
            }
          })
        );

        // Step 3: 使用并发池写入（控制并发数为 10，避免触发 rate limit）
        const CONCURRENCY = 10;
        const validRepos = repoResults.filter(r => r.repo && !r.error);
        const invalidRepos = repoResults.filter(r => !r.repo || r.error);

        // 处理无效的 repos
        for (const { action, error } of invalidRepos) {
          if (error) {
            addFailed++;
            const errMsg = error instanceof Error ? error.message : String(error);
            failReasons[errMsg] = (failReasons[errMsg] || 0) + 1;
            if (!seenErrors.has(errMsg)) {
              seenErrors.add(errMsg);
              console.log(`\n   ❌ 错误: ${errMsg}`);
            }
          } else {
            addSkipped++;
            const reason = `repo not found: "${action.params.repo_full_name}"`;
            skipReasons[reason] = (skipReasons[reason] || 0) + 1;
          }
        }

        // 并发池执行写入
        console.log(`   📤 并发写入 ${validRepos.length} 个 repos (并发数: ${CONCURRENCY})...`);
        let completed = 0;
        
        for (let i = 0; i < validRepos.length; i += CONCURRENCY) {
          const batch = validRepos.slice(i, i + CONCURRENCY);
          const results = await Promise.all(
            batch.map(async ({ listId, repo }) => {
              try {
                await this.github.addRepoToList(listId, repo!.nodeId);
                return { success: true, error: null };
              } catch (e) {
                return { success: false, error: e };
              }
            })
          );

          for (const result of results) {
            completed++;
            if (result.success) {
              addSuccess++;
            } else {
              addFailed++;
              const errMsg = result.error instanceof Error ? result.error.message : String(result.error);
              failReasons[errMsg] = (failReasons[errMsg] || 0) + 1;
              if (!seenErrors.has(errMsg)) {
                seenErrors.add(errMsg);
                console.log(`\n   ❌ 错误: ${errMsg}`);
              }
            }
          }
          process.stdout.write(`\r   进度: ${addSuccess + addSkipped + addFailed}/${addActions.length} (✓${addSuccess} ✗${addFailed})`);
        }
      }

      console.log(`\n   结果: ${addSuccess} 成功, ${addSkipped} 跳过, ${addFailed} 失败${this.dryRun ? " (dry)" : ""}`);

      // 显示 skip 原因统计
      if (Object.keys(skipReasons).length > 0) {
        console.log(`   跳过原因:`);
        for (const [reason, count] of Object.entries(skipReasons).slice(0, 5)) {
          console.log(`      • ${reason}: ${count} 个`);
        }
        if (Object.keys(skipReasons).length > 5) {
          console.log(`      ... +${Object.keys(skipReasons).length - 5} more reasons`);
        }
      }

      // 显示失败原因统计
      if (Object.keys(failReasons).length > 0) {
        console.log(`   失败原因:`);
        for (const [reason, count] of Object.entries(failReasons).slice(0, 5)) {
          console.log(`      • ${reason}: ${count} 个`);
        }
        if (Object.keys(failReasons).length > 5) {
          console.log(`      ... +${Object.keys(failReasons).length - 5} more reasons`);
        }
      }
    }

    // Unstar (optimized with concurrency pool)
    const unstarActions = this.plan.actions.filter((a) => a.type === "unstar");
    if (unstarActions.length > 0) {
      console.log(`\n⭐ ${this.dryRun ? "[DRY] Would unstar" : "Unstarring"} ${unstarActions.length} repos...`);
      let unstarSuccess = 0, unstarFailed = 0;
      const unstarFailReasons: Record<string, number> = {};
      const seenUnstarErrors = new Set<string>();

      if (this.dryRun) {
        // Dry run: 模拟全部成功
        unstarSuccess = unstarActions.length;
        process.stdout.write(`   进度: ${unstarSuccess}/${unstarActions.length} (✓${unstarSuccess} ✗0)`);
      } else {
        // 使用并发池（并发数 10）
        const CONCURRENCY = 10;
        
        for (let i = 0; i < unstarActions.length; i += CONCURRENCY) {
          const batch = unstarActions.slice(i, i + CONCURRENCY);
          const results = await Promise.all(
            batch.map(async (action) => {
              try {
                const [owner, repo] = (action.params.repo_full_name || "").split("/");
                await this.github.unstarRepo(owner, repo);
                return { success: true, error: null };
              } catch (e) {
                return { success: false, error: e };
              }
            })
          );

          for (const result of results) {
            if (result.success) {
              unstarSuccess++;
            } else {
              unstarFailed++;
              const errMsg = result.error instanceof Error ? result.error.message : String(result.error);
              unstarFailReasons[errMsg] = (unstarFailReasons[errMsg] || 0) + 1;
              if (!seenUnstarErrors.has(errMsg)) {
                seenUnstarErrors.add(errMsg);
                console.log(`\n   ❌ 错误: ${errMsg}`);
              }
            }
          }
          process.stdout.write(`\r   进度: ${unstarSuccess + unstarFailed}/${unstarActions.length} (✓${unstarSuccess} ✗${unstarFailed})`);
        }
      }

      console.log(`\n   结果: ${unstarSuccess} 成功, ${unstarFailed} 失败${this.dryRun ? " (dry)" : ""}`);

      // 显示失败原因统计
      if (Object.keys(unstarFailReasons).length > 0) {
        console.log(`   失败原因:`);
        for (const [reason, count] of Object.entries(unstarFailReasons).slice(0, 5)) {
          console.log(`      • ${reason}: ${count} 个`);
        }
        if (Object.keys(unstarFailReasons).length > 5) {
          console.log(`      ... +${Object.keys(unstarFailReasons).length - 5} more reasons`);
        }
      }
    }

    if (this.dryRun) {
      console.log("\n🧪 DRY RUN complete - no actual changes were made!\n");
    } else {
      console.log("\n✅ Done!\n");
    }
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
