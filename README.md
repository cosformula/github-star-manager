# GitHub Stars Manager

使用 AI 分析和整理你的 GitHub Stars。

## 功能

- 🔍 分析所有 starred repos（语言、topics、活跃度）
- 📂 智能建议分类 Lists
- ⭐ 识别过时/归档的 repos 建议 unstar
- 💾 自动备份，支持一键恢复
- 🤖 使用 Claude Haiku 进行智能分析

## 安装

```bash
bun install
```

## 使用

```bash
bun run index.ts
```

可以设置环境变量或运行时输入：

```bash
# 方式一：环境变量
cp .env.example .env
# 编辑 .env 填入 tokens
bun run index.ts

# 方式二：运行时输入
bun run index.ts
# 按提示输入 tokens
```

## GitHub Token 权限设置

### 方式一：Fine-grained Personal Access Token（推荐）

1. 前往 https://github.com/settings/tokens?type=beta
2. 点击 "Generate new token"
3. 设置：
   - **Token name**: `github-stars-manager`
   - **Expiration**: 按需设置
   - **Repository access**: `Public Repositories (read-only)`
   - **Permissions**:

| Permission | Access | 用途 |
|------------|--------|------|
| **Starring** | Read and write | 读取/添加/移除 stars |
| **Metadata** | Read-only | 读取仓库基本信息（自动包含） |

> ⚠️ **注意**: GitHub Lists API 目前只支持 Classic Token。如果需要使用 Lists 分类功能，请使用 Classic Token。

### 方式二：Classic Personal Access Token

1. 前往 https://github.com/settings/tokens
2. 点击 "Generate new token (classic)"
3. 勾选权限：

| Scope | 用途 |
|-------|------|
| `public_repo` | 读取公共仓库信息、操作 Lists |
| `read:user` | 读取用户信息 |

## OpenRouter API Key

1. 前往 https://openrouter.ai/keys
2. 创建 API Key
3. 默认模型：`anthropic/claude-3-5-haiku`

可选模型（在代码中修改）：
- `anthropic/claude-3-5-haiku` - 快速便宜
- `google/gemini-flash-1.5` - 免费额度
- `openai/gpt-4o-mini` - 便宜稳定

## 备份

备份自动保存到 `~/.github-stars-backup/` 目录。

恢复时选择 "🔄 Restore from backup"。

## 工作流程

```
1. 输入 Tokens
2. 获取 Stars 和 Lists
3. 自动备份当前状态
4. AI 分析并建议分类
5. 用户审核/修改计划
6. 确认后执行
```

## License

MIT
