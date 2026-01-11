# gh-star

English | [中文](./README_zh.md)

An AI-powered CLI agent for managing your GitHub Stars.

## Overview

gh-star is a **command-line star management agent** that leverages LLM to semantically understand your starred repositories. It analyzes the purpose and context of each repo, then organizes them into meaningful categories.

## Features

- 🔍 **Smart Analysis** - Analyzes language, topics, and activity of all starred repos
- 📂 **Semantic Categorization** - Creates meaningful Lists using LLM understanding (not keyword matching)
- ⭐ **Conservative Unstar** - Only suggests removing truly deprecated/broken repos
- 💾 **Auto Backup** - Automatic backup before operations with one-click restore
- 🤖 **Free by Default** - Uses free LLM model via OpenRouter
- 🔄 **Dry Run** - Preview mode to see changes without executing

## Tech Stack

- **Runtime**: [Bun](https://bun.sh/) (TypeScript)
- **GitHub API**: Octokit REST + GraphQL (Lists API)
- **AI**: OpenRouter API (default: mimo-v2-flash, free)

## Installation

```bash
bun install
```

## Usage

```bash
bun run src/cli.ts
```

### Token Configuration

```bash
# Option 1: Environment variables (recommended)
cp .env.example .env
# Edit .env and fill in your tokens
bun run src/cli.ts

# Option 2: Runtime input
bun run src/cli.ts
# Enter tokens when prompted
```

### Run Modes

Select from these modes at startup:

| Mode | Description |
|------|-------------|
| 📊 Analyze and organize | Full analysis and organization workflow |
| 🔄 Restore from backup | Restore from a previous backup |
| 🐛 Debug mode | Debug mode (processes only 2 batches) |
| 👁️ Dry run | Preview mode (no actual API operations) |
| 🐛👁️ Debug + Dry run | Combined debug and preview mode |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       src/cli.ts                            │
│                           ↓                                 │
│                   StarManagerAgent                          │
│                   (Main Orchestrator)                       │
│         ┌────────────┼────────────┐                         │
│         ↓            ↓            ↓                         │
│   GitHubClient  RepoAnalyzer  BackupManager                 │
│   (API Client)  (AI Analysis) (Backup/Restore)              │
└─────────────────────────────────────────────────────────────┘
```

## Workflow

```
┌─────────────────────────────────────────────────────────────┐
│  1. Select Mode                                             │
│     • 📊 Analyze and organize stars                         │
│     • 🔄 Restore from backup                                │
│     • 🐛 Debug mode / 👁️ Dry run                             │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  2. Enter Tokens (or read from env)                         │
│     • GITHUB_TOKEN                                          │
│     • OPENROUTER_API_KEY                                    │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  3. Fetch Data (with live progress)                         │
│     • Verify user identity and token permissions            │
│     • Fetch all starred repos: Stars: 100... 200... 1574   │
│     • Fetch existing Lists                                  │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  4. Auto Backup                                             │
│     • Saves to ~/.github-stars-backup/                      │
│     • Prompts to continue if backup fails                   │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  5. Review Existing Lists (if any)                          │
│     • 📋 View list contents                                 │
│     • ✨ Keep lists, suggest new                            │
│     • 🔄 Reorganize - consider merging/restructuring        │
│     • ⏭️  Skip - don't modify lists, only unstar             │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  6. AI Analysis (with spinner animation)                    │
│     ⠋ AI generating category suggestions...                 │
│     ✓ Categories complete (6 lists)                         │
│     ⠹ AI classifying (100/1574)...                          │
│     ✓ Classification complete (1574 suggestions)            │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  7. Display Analysis Summary                                │
│     ══════════════════════════════════════════════════════  │
│     📊 Analysis Summary                                     │
│     ══════════════════════════════════════════════════════  │
│     📦 Total repos: 1574                                    │
│        📁 Archived: 45                                      │
│        ⏰ Stale (2+ years): 234                             │
│     📂 Suggested Lists (6):                                 │
│        • AI/ML Tools (156 repos)                            │
│        • Web Development (289 repos)                        │
│        ...                                                  │
│     🎯 Suggested Actions:                                   │
│        ⭐ Unstar: 5 repos                                   │
│        📁 Categorize: 1200 repos                            │
│     ══════════════════════════════════════════════════════  │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  8. Review (can loop multiple times)                        │
│     • 📋 Review suggested lists (6)                         │
│     • 🗑️  Review repos to unstar (5)                         │
│     • 📁 Review categorization (1200)                       │
│     • ✅ Done reviewing, generate plan                      │
│     • ❌ Exit without changes                               │
│                                                             │
│     Each review option supports:                            │
│     • Accept all                                            │
│     • Skip all                                              │
│     • Review one by one / by list                           │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  9. Display Execution Plan                                  │
│     ══════════════════════════════════════════════════════  │
│     📋 Execution Plan                                       │
│     ══════════════════════════════════════════════════════  │
│     📁 Create lists (6):                                    │
│        • AI/ML Tools                                        │
│        • Web Development                                    │
│        ...                                                  │
│     ➕ Add to lists (1200):                                 │
│        • owner/repo1                                        │
│        ...                                                  │
│     ⭐ Unstar (5):                                          │
│        • owner/deprecated-repo                              │
│        ...                                                  │
│     ══════════════════════════════════════════════════════  │
│     📄 Full plan: /tmp/plan-xxx.json                        │
│                                                             │
│     Options:                                                │
│     • ✅ Execute plan                                       │
│     • ➖ Remove some actions                                │
│     • 🔄 Regenerate plan                                    │
│     • ❌ Cancel                                             │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  10. Execute (with live progress)                           │
│                                                             │
│     📁 Creating 6 lists...                                  │
│        "AI/ML Tools"... ✓                                   │
│        "Web Development"... ✓                               │
│                                                             │
│     ➕ Adding repos to lists (1200)...                      │
│        Progress: 500/1200                                   │
│        Result: 498 success, 2 skipped, 0 failed             │
│                                                             │
│     ⭐ Unstarring 5 repos...                                │
│        Progress: 5/5                                        │
│        Result: 5 success, 0 failed                          │
│                                                             │
│     ✅ Done!                                                │
└─────────────────────────────────────────────────────────────┘
```

## AI Analysis Pipeline

Analysis is divided into two phases:

### Phase 1: Generate Category Suggestions

```
All repos → Stratified sampling (60) → LLM → 5-8 category suggestions
```

- **Stratified Sampling**: Samples by language proportion to ensure diversity
- **Semantic Understanding**: Analyzes description, topics, and purpose for deep context
- **Output**: Generates meaningful category names and descriptions

### Phase 2: Batch Classification

```
All repos → 30 per batch → LLM → Categorize/Unstar/Keep decision
```

- **Batch Processing**: 30 repos per batch to control API calls
- **Three Decisions**: Assign to a List / Suggest unstar / Keep unchanged

### Model Configuration

| Task | Model |
|------|-------|
| Category Suggestions | `xiaomi/mimo-v2-flash:free` |
| Repo Classification/Unstar | `xiaomi/mimo-v2-flash:free` |

Uses OpenRouter API. Default model is free. Can be changed in `src/analyzer.ts`.

## GitHub Token Permissions

### Option 1: Fine-grained Personal Access Token

1. Go to https://github.com/settings/tokens?type=beta
2. Click "Generate new token"
3. Configure:
   - **Token name**: `github-stars-manager`
   - **Expiration**: Set as needed
   - **Repository access**: `Public Repositories (read-only)`
   - **Permissions**:

| Permission | Access | Purpose |
|------------|--------|---------|
| **Starring** | Read and write | Read/add/remove stars |
| **Metadata** | Read-only | Read repo basic info (auto-included) |

> ⚠️ **Note**: GitHub Lists API currently only supports Classic Tokens. Use a Classic Token if you need Lists functionality.

### Option 2: Classic Personal Access Token (Recommended)

1. Go to https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Select scopes:

| Scope | Purpose |
|-------|---------|
| `public_repo` | Read public repo info |
| `read:user` | Read user info |
| `user` | **Create/manage Lists (required)** |

## OpenRouter API Key

1. Go to https://openrouter.ai/keys
2. Create an API Key
3. Ensure your account has credits

## Backup & Restore

Backups are automatically saved to `~/.github-stars-backup/`.

Before each execution, a backup is created containing:
- All starred repos
- All Lists and their contents

To restore, select "🔄 Restore from backup" to:
- Re-star deleted repos
- Recreate deleted Lists

## Analysis Strategy

### Category Suggestions
- **Stratified Sampling**: Samples 60 repos proportionally by language
- **LLM Semantic Classification**: Understands repo purpose and context
- **Considers Existing Lists**: Can keep, reorganize, or create new categories

### Unstar Suggestions (Conservative)
Only suggests unstar for:
- ❌ Deprecated with recommended alternatives
- ❌ Joke/meme repos
- ❌ Explicitly marked broken/abandoned
- ❌ Outdated personal forks

**Will NOT** suggest unstar for:
- ✅ Archived but still useful repos
- ✅ Old but classic stable libraries
- ✅ Learning resources
- ✅ High star count (10k+) repos

## FAQ

### Lists Feature Unavailable

**Symptom**: "Cannot create lists" or Lists operations fail

**Cause**: GitHub Lists API currently only supports Classic Token with `user` scope

**Solution**: Use Classic Token with `user` permission enabled

### API Call Failed

**Symptom**: OpenRouter API returns errors

**Possible Causes**:
- Invalid or expired API Key
- Insufficient account balance
- Model temporarily unavailable

**Solution**: Check OpenRouter account status and balance

### Backup Restore Failed

**Symptom**: Cannot restore some repos

**Possible Causes**:
- Original repo was deleted
- Repo was renamed or transferred
- Network issues

**Solution**: Check error logs and manually handle failed repos

## Project Structure

```
github-star-manager/
├── src/
│   ├── cli.ts            # Entry point
│   ├── agent/index.ts    # Main orchestrator StarManagerAgent
│   ├── github/client.ts  # GitHub API wrapper
│   ├── analyzer.ts       # AI analysis engine
│   ├── backup.ts         # Backup/restore manager
│   ├── spinner.ts        # CLI progress animation
│   └── types/index.ts    # TypeScript type definitions
├── package.json
├── tsconfig.json
└── .env.example
```

## License

MIT
