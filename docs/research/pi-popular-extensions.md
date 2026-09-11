# Pi coding agent 第三方包 / 扩展流行度调研

| | |
|---|---|
| **调研日期** | 2026-09-11 (UTC) |
| **调研对象** | Pi coding agent（`@earendil-works/pi-coding-agent`，本地版本 `0.85.1`，binary `pi`，站点 <https://pi.dev>） |
| **明确排除** | Raspberry Pi、Inflection Pi、pi-mono 旧名、Oh My Pi (OMP)、以及任何不是"给 Pi 装的包"的东西 |
| **本地权威依据** | `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/docs/packages.md`、`docs/extensions.md`（机制以这两份为准） |
| **数据窗口** | 画廊 30 天下载量：2026-09-11 抓取；npm `last-week`：2026-09-03 → 2026-09-09；GitHub API：2026-09-11 |
| **输出约束** | 只写了本文件；未修改 `pi/settings.json`；未运行 `pi install` / `npm install` / `pi update`；未提交、未推送 |

## 摘要（一句话版）

截至 2026-09-11，Pi 生态中真正被广泛使用、且经一手 README / `package.json` 的 `pi` manifest 确认面向 Pi 的第三方包主要集中在三条线：**上下文与模型接入**（`pi-mcp-adapter` 866K/月、`pi-web-access` 404K/月）、**子代理/编排**（`pi-subagents` 412K/月、`@tintinweb/pi-subagents`、`@quintinshaw/pi-dynamic-workflows`）、以及**单个高价值工具**（`pi-lens` LSP、`@gotgenes/pi-permission-system` 权限门、`pi-background-tasks` 后台任务、`pi-memory` / `pi-hermes-memory` 记忆）。本仓库已经装了其中最头部的两个（`pi-web-access`、`pi-mcp-adapter`）；`pi-exit` 虽然也在本仓库的包列表里，但周下载只有 7 次、仓库仅 1 star，完全够不上"流行"。**本仓库最值得考虑的新增是 `@gotgenes/pi-permission-system`（安全缺口）、`pi-background-tasks`（后台任务缺口）和 `pi-lens`（诊断缺口）**；`/goal` 类包（`pi-goal-x`、`@narumitw/pi-goal`）与本仓库自维护的 `pi/extensions/goal/` 功能重叠，不应重复引入。

---

## 1. 排名规则与候选漏斗

### 1.1 机制前提（不是猜的，来自本地文档）

Pi 包通过 `package.json` 的 `pi` manifest 声明扩展 / skill / prompt / theme，或使用约定目录；用 `pi install npm:<pkg>` / `pi install git:<host>/<repo>` 安装，写入 `~/.pi/agent/settings.json`（`docs/packages.md`）。

> **Security:** Pi packages run with full system access. Extensions execute arbitrary code, and skills can instruct the model to perform any action including running executables. Review source code before installing third-party packages.
> — `docs/packages.md`，本地路径 `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/docs/packages.md`

扩展的能力边界（`docs/extensions.md`）：注册 LLM 可调用的工具（`pi.registerTool()`）、拦截/修改 tool call、注册 `/command`、注册事件钩子、自定义 TUI。**因此下面所有"风险"都从"任意代码执行 + 完整用户权限"这个基准出发**，只标注额外的东西（网络、凭据、遥测、license）。

### 1.2 排名规则（可复现）

1. **主指标**：`pi.dev` 官方画廊的 30 天 npm 下载量（HTML 属性 `data-package-downloads`，页面显示为 `866.3K/mo`），降序。
2. **独立佐证**：npm `last-week` 下载量（`https://api.npmjs.org/downloads/point/last-week/<pkg>`）+ GitHub `stargazers_count`（`https://api.github.com/repos/<owner>/<repo>`）。
3. **流行门槛**：**30 天下载 ≥ 20,000**。这个阈值把"确实有人在装"和"作者自娱"分开；我同时记录远低于门槛的对照（例如本仓库在用的 `pi-exit`，7 次/周）。
4. **准入前置条件**：必须确认面向 *Pi coding agent*。确认依据是以下之一：README 出现 `pi install` / "Pi coding agent" / `pi.dev`；npm `package.json` 里有 `pi` manifest；源码 import `@earendil-works/pi-coding-agent` 或使用 `ExtensionAPI`。
5. **去重**：monorepo（`rpiv-mono`、`gotgenes/pi-packages`、`narumiruna/pi-extensions`）按子包分别计量，但在详情里合并成一节，避免同一 star 数被重复计入看板。

### 1.3 候选漏斗

| 阶段 | 数量 | 依据 |
|---|---:|---|
| 官方画廊中被标记 `pi-package` 的全部包 | **5,405** | `curl -sL https://pi.dev/packages` → `packages-count">1-50 / 5405` |
| 我实际逐条采集指标（按下载量前 200） | **200** | `https://pi.dev/packages?page=1..4`，每页 50 |
| 通过"30 天下载 ≥ 20,000"门槛 | **45** | 见下方阈值分布 |
| 其中经一手材料确认面向 Pi | **44** | `billion-context` 未过确认（其 Pi 版本是独立的 `billion-context-pi`） |
| 最终逐个读 README/source 写详情 | **20**（+21 个仅在总表列出） | 本文件 §3 / §4 |

阈值分布（前 200 名，`data-package-downloads`；最小 5,776，最大 866,318）：

```
累计（>= N）:  >=1,000,000: 0   >=300,000: 4   >=100,000: 7   >=50,000: 13
               >=  20,000: 45  >= 10,000: 95  >=  5,000: 200
区间（[lo,hi)）: [300K,1M): 4  [100K,300K): 3  [50K,100K): 6  [20K,50K): 32
               [10K,20K): 50  [5K,10K): 105  [0,5K): 0
```

（我用的“流行门槛” = 累计 ≥20,000/月 → 45 个；前 200 名里最低也有 5,776/月，因为这是按下载量排序的前 200。）

另外记录两个"宽松检索"的上界，说明为什么我不用它们做漏斗：
- `https://registry.npmjs.org/-/v1/search?text=keywords:pi-package&size=250` → `total: 9573`，但该接口的 total 是模糊匹配，前 250 条里已混入 `context-mode`、`confluence-cli` 等非 Pi 专属包；不可作为精确分母。
- `npm search pi-coding-agent --json` 等价接口 → `total: 153747`，同样不可用于计数。

### 1.4 对流行度保持敌意（adversarial notes）

- **下载量会虚高**：npm 下载量统计的是 `npm install` 次数，包含 CI、Docker build、以及把子包作为 `bundledDependencies` 的传递安装。证据：`@juicesharp/rpiv-pi`（管线本体）只有 361 次/周，而它的兄弟包 `@juicesharp/rpiv-ask-user-question` 有 25,570 次/周、`@juicesharp/rpiv-todo` 有 25,357 次/周（`https://api.npmjs.org/downloads/point/last-week/@juicesharp/rpiv-ask-user-question`）。因此我用 **30 天下载量做排序、周下载量 + star 做交叉验证**，并且明确：单看下载量可能会高估"真实日常使用者数"。
- **star 数会张冠李戴**：`DietrichGebert/ponytail` 有 134,982 star、`mksglu/context-mode` 有 22,046 star、`dmtrKovalenko/fff` 有 10,687 star，但这些仓库是**多 agent 通用产品**，Pi 只是它们支持的众多宿主之一（ponytail 的 README 明确写 "works with 20 agents"）。给 Pi 的那部分用户远少于 star 数所暗示的规模。
- **版本号刷量**：`@akagilnc/pi-workflow-roles` 的 latest 是 `0.1.3977`（`curl -s https://registry.npmjs.org/@akagilnc/pi-workflow-roles` → `"latest":"0.1.3977"`），`@trim21/personal-pi-extensions` 是 `0.1.527`；而后者作者自己在 README 里写"不要直接使用"。
- **官方画廊本身是被动收录**：任何在 `package.json` 打了 `pi-package` keyword 的包都会进画廊（`docs/packages.md`: "The package gallery displays packages tagged with `pi-package`"）。所以"上了画廊"≈"作者声明是 Pi 包"，不等于"社区在用"。
- **负数证据也要保留**：Reddit 上关于 `pi-lens` 的性能抱怨（见 §3.6）不是"推荐"，我把它当作真实使用证据但同时标为风险。

---

## 2. 流行包排名表

排序：30 天下载量降序。所有指标采集于 2026-09-11；周下载窗口为 2026-09-03 → 2026-09-09。

| # | 包 | 30 天下载 | 周下载 | GitHub stars | 类型 | 最新版本（发布日期） | 安装串 | 本仓库相关性 |
|---:|---|---:|---:|---:|---|---|---|---|
| 1 | [`pi-mcp-adapter`](https://pi.dev/packages/pi-mcp-adapter) | 866,318 | 197,718 | 1,451 | extension+skills | 2.33.0 (2026-09-10) | `npm:pi-mcp-adapter` | **已安装** |
| 2 | [`pi-subagents`](https://pi.dev/packages/pi-subagents) | 412,438 | 66,401 | 3,532 | extension+prompts+skills | 0.67.0 (2026-09-10) | `npm:pi-subagents` | 候选（补子代理缺口） |
| 3 | [`pi-web-access`](https://pi.dev/packages/pi-web-access) | 403,562 | 63,027 | 1,416 | extension | 0.29.0 (2026-09-10) | `npm:pi-web-access` | **已安装** |
| 4 | [`@juicesharp/rpiv-ask-user-question`](https://pi.dev/packages/@juicesharp/rpiv-ask-user-question) | 151,488 | 25,570 | 780 (mono) | extension | 2.9.0 (2026-09-01) | `npm:@juicesharp/rpiv-ask-user-question` | 候选（小而实用） |
| 5 | [`@juicesharp/rpiv-todo`](https://pi.dev/packages/@juicesharp/rpiv-todo) | 133,850 | 25,357 | 780 (mono) | extension | 2.9.0 (2026-09-01) | `npm:@juicesharp/rpiv-todo` | 候选（todo overlay） |
| 6 | [`pi-background-tasks`](https://pi.dev/packages/pi-background-tasks) | 107,663 | 20,144 | 25 | extension | 2.5.0 (2026-09-04) | `npm:pi-background-tasks` | **候选（缺口）** |
| 7 | [`pi-lens`](https://pi.dev/packages/pi-lens) | 74,469 | 18,158 | 403 | extension+skills | 4.1.6 (2026-09-10) | `npm:pi-lens` | **候选（缺口）** |
| 8 | [`context-mode`](https://pi.dev/packages/context-mode) | 73,979 | 10,235 | 22,046 | extension+skills | 1.0.169 (2026-06-29) | `npm:context-mode` | 候选（注意 license） |
| 9 | [`@plannotator/pi-extension`](https://pi.dev/packages/@plannotator/pi-extension) | 58,110 | 7,781 | 8,605 | extension+skills | 0.27.13 (2026-09-10) | `npm:@plannotator/pi-extension` | 候选（plan review） |
| 10 | [`pi-goal-x`](https://pi.dev/packages/pi-goal-x) | 57,237 | 15,204 | 54 | extension | 0.31.2 (2026-09-08) | `npm:pi-goal-x` | **与本地 goal 重复** |
| 11 | [`@tintinweb/pi-subagents`](https://pi.dev/packages/@tintinweb/pi-subagents) | 47,744 | 6,458 | 1,125 | extension | 0.19.0 (2026-08-27) | `npm:@tintinweb/pi-subagents` | 与 #2 二选一 |
| 12 | [`@narumitw/pi-goal`](https://pi.dev/packages/@narumitw/pi-goal) | 45,569 | 2,922 | 541 (mono) | extension | 0.54.4 (2026-08-31) | `npm:@narumitw/pi-goal` | **与本地 goal 重复** |
| 13 | [`@dietrichgebert/ponytail`](https://pi.dev/packages/@dietrichgebert/ponytail) | 41,866 | 8,746 | 134,982 | extension+skills | 4.9.0 (2026-08-07) | `git:github.com/DietrichGebert/ponytail` | 候选（多宿主） |
| 14 | [`pi-simplify`](https://pi.dev/packages/pi-simplify) | 39,856 | 2,957 | 141 | extension | 0.2.3 (2026-07-17) | `npm:pi-simplify` | 候选（小） |
| 15 | [`@quintinshaw/pi-dynamic-workflows`](https://pi.dev/packages/@quintinshaw/pi-dynamic-workflows) | 39,555 | 5,365 | 503 | extension+skills | 3.10.1 (2026-09-03) | `npm:@quintinshaw/pi-dynamic-workflows` | 候选（编排） |
| 16 | [`pi-memory`](https://pi.dev/packages/pi-memory) | 38,776 | 4,108 | 154 | extension | 0.4.2 (2026-08-11) | `npm:pi-memory` | 候选（记忆） |
| 17 | [`@gotgenes/pi-permission-system`](https://pi.dev/packages/@gotgenes/pi-permission-system) | 38,285 | 6,048 | 209 (mono) | extension | 31.1.3 (2026-09-08) | `npm:@gotgenes/pi-permission-system` | **候选（安全缺口）** |
| 18 | [`@ff-labs/pi-fff`](https://pi.dev/packages/@ff-labs/pi-fff) | 36,439 | 3,947 | 10,687 | extension | 0.10.6 (2026-08-30) | `npm:@ff-labs/pi-fff` | 候选（搜索替换内建） |
| 19 | [`pi-hermes-memory`](https://pi.dev/packages/pi-hermes-memory) | 31,076 | 3,692 | 428 | extension+skill | 0.9.8 (2026-09-05) | `npm:pi-hermes-memory` | 候选（记忆） |
| 20 | [`pi-claude-bridge`](https://pi.dev/packages/pi-claude-bridge) | 28,766 | 7,509 | 371 | extension | 0.7.0 (2026-08-09) | `npm:pi-claude-bridge` | 候选（需 Claude 订阅） |
| 21 | [`pi-powerline-footer`](https://pi.dev/packages/pi-powerline-footer) | 28,252 | 5,241 | 424 | extension | 0.17.1 (2026-09-10) | `npm:pi-powerline-footer` | 候选（纯 UI） |

指标来源：30 天下载 = `curl -sL 'https://pi.dev/packages?page=N'` 的 `data-package-downloads`；周下载 = `curl -s 'https://api.npmjs.org/downloads/point/last-week/<pkg>'`；stars = `curl -s 'https://api.github.com/repos/<owner>/<repo>' | jq .stargazers_count`；版本/发布日期 = `curl -s 'https://registry.npmjs.org/<pkg>'`。

---

## 3. 包详情

以下每节都基于**我在 2026-09-11 实际打开的 README / npm 元数据 / 画廊卡片**，不是 npm 一句话描述。

### 3.1 pi-mcp-adapter（本仓库已安装）

**做什么**：把 MCP server 接进 Pi，但只向模型暴露一个约 200 token 的代理工具，按需发现/启动 server，以避免"每个 MCP server 烧掉 10k+ token 工具定义"。

> The problem: tool definitions are verbose. A single MCP server can burn 10k+ tokens, and you're paying that cost whether you use those tools or not. … This adapter gives you access without the bloat. One proxy tool (~200 tokens) instead of hundreds. The agent discovers what it needs on-demand. Servers only start when you actually use them.
> — <https://github.com/nicobailon/pi-mcp-adapter> README（2026-09-11 抓取，`main`）

**安装串**：`pi install npm:pi-mcp-adapter`（README Install 段）。

**证据**：
- 30 天下载 **866,318**（画廊第 1 名）：`curl -sL 'https://pi.dev/packages'` → `data-package-name="pi-mcp-adapter" … data-package-downloads="866318"`。
- 周下载 **197,718**：`curl -s 'https://api.npmjs.org/downloads/point/last-week/pi-mcp-adapter'` → `{"downloads":197718,…}`。
- GitHub **1,451 stars**，最后 push 2026-09-10：`curl -s 'https://api.github.com/repos/nicobailon/pi-mcp-adapter'`。
- 独立社区提及：r/LocalLLaMA「favorite Agentic Coding Harness」帖 — "Im using https://github.com/nicobailon/pi-mcp-adapter with my searxng and playwright mcp."（<https://www.reddit.com/r/LocalLLaMA/comments/1th5t1b/favorite_agentic_coding_harness/>，经 `web_search` domainFilter=reddit.com 取得，2026-09-11）。

**风险 / 注意**：会真正启动 MCP server（README 示例 `npx -y chrome-devtools-mcp@1.6.0`），因此引入被启动进程的全部代码执行面；OAuth 凭据存入操作系统凭据库而非明文（README: "OAuth credentials are stored in the operating system credential store"）。Pi 官方文档的通用警告仍然适用（第三方包 = 完整用户权限）。

---

### 3.2 pi-subagents（nicobailon）

**做什么**：给 Pi 加一个 `subagent` 工具，把工作委派给聚焦的子 Pi 会话；自带 `scout` / `researcher` / `evidence-auditor` / `worker` / `reviewer` / `oracle` / `delegate` 等内置 agent，支持前台流式与后台 detached 运行。

> `pi-subagents` lets Pi delegate work to focused child agents. Use it for code review, scouting, implementation, parallel audits, saved workflows, background jobs, and anything else that benefits from a second or third set of model eyes.
> — <https://github.com/nicobailon/pi-subagents> README

**安装串**：`pi install npm:pi-subagents`。

**证据**：
- 30 天下载 **412,438**（画廊第 2）：`data-package-downloads="412438"`。
- 周下载 **66,401**：`…/last-week/pi-subagents` → `{"downloads":66401,…}`。
- GitHub **3,532 stars**（本次调研中 Pi 专属仓库里最高），最后 push 2026-09-11。
- 社区提及（r/PiCodingAgent「Pi devs, I have some questions…」）："4. Subagents : I am using nicobailon/pi-subagents. This works."；另一帖「a bit late into the party…」："external extensions: pi-subagent, pi-web-access"。

**风险 / 注意**：README 明确后台子进程使用宿主 SDK；子 agent 拥有自己的工具集，等于放大了自动执行面。子 agent 的 `researcher` 需要子会话里另装 `pi-web-access`（README: "Requires pi-web-access in the child"）。

---

### 3.3 pi-web-access（本仓库已安装）

**做什么**：Pi 的联网能力集合：web search、URL 抓取、GitHub repo 克隆、PDF 抽取、YouTube/本地视频理解。支持 20+ provider（Exa 免 key、OpenAI/Codex 复用登录、Brave、Tavily、Firecrawl、Kagi、SearXNG 自建、DuckDuckGo 免 key 等）。

> **Web search, content extraction, and video understanding for Pi agent. OpenAI/Codex search, zero-config Exa search, Brave, Parallel, TinyFish, … or bring your own API keys.**
> — `curl -s https://registry.npmjs.org/pi-web-access` → `versions["0.29.0"].description`

**安装串**：`pi install npm:pi-web-access`。

**证据**：
- 30 天下载 **403,562**（画廊第 3）：`data-package-downloads="403562"`。
- 周下载 **63,027**：`…/last-week/pi-web-access` → `{"downloads":63027,…}`。
- GitHub **1,416 stars**，最后 push 2026-09-10。
- 社区：r/PiCodingAgent「Best Search Tool」 — "I use this one: https://github.com/nicobailon/pi-web-access"；「New to PI-Agent…」帖列出已装 `pi-web-access`；本地模型帖把它列为必装。

**风险 / 注意**：网络出口 + 可选浏览器 cookie 访问（README 提到 "opt into browser-cookie access for Gemini Web"）；API key 写入 `~/.pi/agent/web-search.json`。是本仓库现有依赖，属于既有信任决策。

---

### 3.4 @juicesharp/rpiv-ask-user-question + @juicesharp/rpiv-todo（rpiv-mono）

**做什么**：`rpiv-mono` 是一个 15 包 workspace，其中两个子包下载量最高：`rpiv-ask-user-question` 让模型用结构化问卷代替瞎猜；`rpiv-todo` 提供能在 `/reload` 与 compaction 后存活的任务 overlay。另有 `rpiv-advisor`（升级到更强 reviewer 模型）、`rpiv-web-tools`、`rpiv-workflow`(`/wf`) 等。

> **rpiv-ask-user-question** lets the model put a structured questionnaire to the user instead of guessing, **rpiv-todo** keeps a live task overlay that survives `/reload` and compaction…
> — <https://github.com/juicesharp/rpiv-mono> README

**安装串**：`pi install npm:@juicesharp/rpiv-ask-user-question`、`pi install npm:@juicesharp/rpiv-todo`（或整条管线 `npm:@juicesharp/rpiv-pi` + `/rpiv-setup`）。

**证据**：
- 30 天下载 ask-user-question **151,488** / todo **133,850**（画廊第 5、6 名）。
- 周下载 **25,570** / **25,357**（`…/last-week/@juicesharp/rpiv-ask-user-question`）。
- GitHub **780 stars**（mono），最后 push 2026-09-10。
- 对照：管线本体 `@juicesharp/rpiv-pi` 周下载仅 **361**，说明高下载量至少部分是子包被传递安装的结果，不能直接读成"25,570 个活跃用户"。

**风险 / 注意**：monorepo 里有 `rpiv-telemetry`（MLflow 观测），但它是 `private: true`、不上 npm、必须从 checkout 加载（README: "it stays `private: true` and is loaded from a checkout, never the registry"），所以默认安装不会带遥测。

---

### 3.5 pi-background-tasks — 值得本仓库优先评估

**做什么**：后台 shell 任务 + 只读委派子 agent + 固定用途的多模型 "Fusion"（3 个候选 + 盲评 + merger）。提供 11 commands / 11 tools / 2 shortcuts / 4 workflows。

> **Keep Pi moving while long jobs, delegated investigations, and fixed-purpose multi-model Fusion work run in the background.**
> — <https://github.com/ismailsaleekh/pi-background-tasks> README

**安装串**：`pi install npm:pi-background-tasks@latest`（README；`@latest` 是作者写法）。

**证据**：
- 30 天下载 **107,663**（画廊第 7）：`data-package-downloads="107663"`。
- 周下载 **20,144**：`…/last-week/pi-background-tasks` → `{"downloads":20144,…}`。
- GitHub 只有 **25 stars**（`ismailsaleekh/pi-background-tasks`），最后 push 2026-09-04。**这是一个"下载量 ≫ star 数"的典型**：流行度证据主要来自安装量，社区热度信号弱。

**风险 / 注意（重要）**：README 自述"Shell jobs are tracked by the package, but they are not sandboxed. Treat commands as local processes with your permissions and credentials."（`docs` / README §Windows shell and telemetry）。另外它会为 Anthropic 会话全局加载一个包自带的 Claude Code OAuth attribution/sanitization provider — 这是会改动请求构造的深层介入，值得读源码后再决定。

---

### 3.6 pi-lens — 值得本仓库优先评估

**做什么**：把 LSP 诊断/导航、语言级 linter/formatter/type-checker、ast-grep/tree-sitter 结构规则、`/lens-map` 依赖图注入到 Pi 的写/编辑流程，提供 `symbol_search`、`read_symbol`、`lens_diagnostic_mark` 等工具，另有一个实验性 MCP server。

> pi-lens gives AI coding agents fast, language-aware feedback while they write/edit. … LSP diagnostics and navigation across supported languages … ast-grep and tree-sitter structural rules for correctness/security smells
> — <https://github.com/apmantza/pi-lens> README（`master`）

**安装串**：`pi install npm:pi-lens`。

**证据**：
- 30 天下载 **74,469**（画廊第 8）：`data-package-downloads="74469"`。
- 周下载 **18,158**；GitHub **403 stars**，最后 push 2026-09-11（活跃）。
- 反证（真实使用但负面）：r/PiCodingAgent「Pi Tui is slow?」 — "The biggest offender for me turned out to be a pi-lens. Currently running Pi almost without any extensions…"。这是**它确实被大量安装**的独立证据，同时是性能风险信号。

**风险 / 注意**：运行本地/下载的 language server 与 formatter（会执行第三方二进制）；自带 bounded telemetry / degradation ledger（`/lens-health`，README 自述）；对每次 write/edit 都跑扫描，可能在慢机器上显著拖慢 TUI。

---

### 3.7 context-mode

**做什么**：一个 MCP server / 插件，宣称节省约 98% 上下文；README 明确有 Pi 集成（"**Pi Coding Agent** — extension with full hook support"），安装方式就是 `pi install npm:context-mode` 再配 `~/.pi/agent/mcp.json`。

**安装串**：`pi install npm:context-mode`（README §Pi Coding Agent）。

**证据**：
- 30 天下载 **73,979**（画廊第 9）；周下载 **10,235**。
- GitHub **22,046 stars**（`mksglu/context-mode`），README 自报 HN #1 "570+ points"，但这是**多 agent 产品**（Claude Code / Gemini / Pi / OpenClaw 等），Pi 只是其宿主之一 → star 数严重高估 Pi 侧使用量。
- 社区：r/PiCodingAgent「What is your essential Pi extensions?」一条回复 — "pi-rtk-optimizer, pi-caveman, btw, context7, graphify, context-mode."

**风险 / 注意**：**license 是 Elastic-2.0**（`curl -s https://registry.npmjs.org/context-mode` → `"license":"Elastic-2.0"`），不是 OSI 开源许可，引入前需评估合规；last publish 2026-06-29，相比列表里其他包偏旧（约 2.5 个月未发版）。

---

### 3.8 @plannotator/pi-extension

**做什么**：浏览器里的 plan / markdown / diff / PR 审阅面，把注释回传给 agent。Pi 是它的官方一等支持目标。

> Plannotator is a local, browser-based review surface for AI coding agents: Claude Code, Codex, Copilot CLI, Gemini CLI, OpenCode, Kiro, Droid, Amp, and Pi.
> — <https://github.com/backnotprop/plannotator> README（同时 README 表格里写明 Pi 的安装方式）

**安装串**：`pi install npm:@plannotator/pi-extension`（README: "**Pi** | Skip the installer. Just `pi install npm:@plannotator/pi-extension`. Start Pi with `--plan`, or toggle with `/plannotator-plan-mode`."）

**证据**：
- 30 天下载 **58,110**（画廊第 10）；周下载 **7,781**。
- GitHub **8,605 stars**（`backnotprop/plannotator`），最后 push 2026-09-11 — 同样是多宿主项目，star 数不等于 Pi 用户数。
- 社区：r/PiCodingAgent「Is there a list of the best extensions for PI?」 — "The only extensions I installed were plannotator (but I may uninstall…)"; 另有帖子 "I do something similar with plannotator"。

**风险 / 注意**：启动本地浏览器界面（本地服务 + 打开浏览器）；审阅内容包含代码/plan，本地运行，但要注意端口暴露面。

---

### 3.9 pi-goal-x — 与本仓库本地扩展重复

**做什么**：给 Pi 加 `/goal`：会话式目标规划、可选有序目标、跨会话进度持久化、独立的完成度审计 agent。

> Adds /goal to pi: conversational goal planning, flexible or ordered goals, persistent progress, and an independent completion auditor.
> — `curl -s https://registry.npmjs.org/pi-goal-x` → `versions["0.31.2"].description`；README: <https://github.com/tmonk/pi-goal-x>

**安装串**：`pi install npm:pi-goal-x`。

**证据**：30 天下载 **57,237**（画廊第 11）；周下载 **15,204**；GitHub 仅 **54 stars**（`tmonk/pi-goal-x`），最后 push 2026-09-08。下载/star 比极高。

**风险 / 注意**：实现自主续跑（autonomous completion），会长时间无人值守地驱动模型 → token 花费与会话失控风险。**本仓库已有 `pi/extensions/goal/`**（`/goal` + 持久目标状态 + 重试/退避），功能高度重叠，详见 §7。

---

### 3.10 @tintinweb/pi-subagents

**做什么**：Claude Code 风格的子 agent 编排：`Agent` / `get_subagent_result` / `steer_subagent` 工具、FleetView、`.pi/agents/<name>.md` 自定义 agent、git worktree 隔离、`SubagentWorkflow` 确定性 JS 编排脚本、cron 调度。

> A pi extension that brings **Claude Code-style autonomous sub-agents and workflow orchestration** to pi. Spawn specialized agents that run in isolated sessions — each with its own tools, system prompt, model, and thinking level.
> — <https://github.com/tintinweb/pi-subagents> README

**安装串**：`pi install npm:@tintinweb/pi-subagents`。

**证据**：30 天下载 **47,744**；周下载 **6,458**；GitHub **1,125 stars**，最后 push 2026-09-03。社区：r/PiCodingAgent 有其专帖「pi-subagents - Claude Code like subagents for Pi」；同帖评论 "Most of current extensions are forks of tintinweb subagents."

**风险 / 注意**：`SubagentWorkflow` 脚本跑在 `node:vm` 沙箱（README 称 `Date.now()`/`Math.random()`/`eval` 会抛错），但 `agent()` 的 `gate` 会执行命令；worktree 隔离默认可选。与 #3.2 的 `pi-subagents` 功能重合，二选一。

---

### 3.11 @narumitw/pi-goal（narumiruna/pi-extensions）— 与本仓库本地扩展重复

**做什么**：单目标 `/goal` 自主完成扩展；同一 monorepo（`narumiruna/pi-extensions`，npm scope `@narumitw`）还发布 `pi-btw`、`pi-usage`、`pi-lsp`、`pi-statusline`、`pi-starship`、`pi-caffeinate`、`pi-plan-mode`、`pi-firecrawl` 等，均为独立安装。

> Independently installable **Pi Coding Agent** extensions and reusable extension libraries for coding, research, browser automation, workflow management, observability, and terminal ergonomics.
> — <https://github.com/narumiruna/pi-extensions> README
>
> Pi extensions run with your full user permissions. Review an extension before installing it from any third party. — 同 README

**安装串**：`pi install npm:@narumitw/pi-goal`（README Quick start）。

**证据**：`@narumitw/pi-goal` 30 天下载 **45,569**；周下载 **2,922**；mono GitHub **541 stars**，最后 push 2026-09-11。同 mono 的 `@narumitw/pi-usage` 30 天 **24,299**、周 **4,141**；`@narumitw/pi-btw` 30 天 **28,954**；`@narumitw/pi-plan-mode` 30 天 **27,365**。

**风险 / 注意**：下载/star 比高，且同作者一人维护多个包（bus factor）；`pi-goal` 与本仓库本地 `goal/` 重叠。

---

### 3.12 @dietrichgebert/ponytail

**做什么**：`skill` 型包，"懒资深工程师模式"——极简实现、少写代码。README 有专门的 "### Pi agent harness" 段与 `pi install git:github.com/DietrichGebert/ponytail`。

**安装串**：`pi install git:github.com/DietrichGebert/ponytail`（README §Pi agent harness，注意是 git 而非 npm）。

**证据**：30 天下载 **41,866**（画廊第 17）；周下载 **8,746**（`…/last-week/@dietrichgebert/ponytail` → `{"downloads":8746,…}`）；GitHub **134,982 stars**、7,235 forks、最后 push 2026-09-07。

**风险 / 注意（关键）**：README badge 明示 "works with 20 agents"，且命令章节列出 Claude Code / Codex / Devin CLI / OpenCode / Gemini / pi / Swival / Hermes Agent / Qoder / Grok Build 等。134,982 star **属于整个多宿主项目**，不是 Pi 社区规模；把它当"Pi 最流行扩展"会是严重误读。作为 skill（纯指令文本）它的代码执行面最小，但仍会改变 agent 行为。

---

### 3.13 pi-simplify

**做什么**：对最近的改动做"简化/一致性/可维护性"复审，`/simplify` 命令。

> A [Pi](https://github.com/nicholasgasior/pi-coding-agent) extension that reviews recently changed code for clarity, consistency, and maintainability improvements.
> — `curl -s https://registry.npmjs.org/pi-simplify` → `readme`

**安装串**：`pi install npm:pi-simplify`。

**证据**：30 天下载 **39,856**；周下载 **2,957**；GitHub **141 stars**（`MattDevy/pi-extensions`，monorepo）；latest `0.2.3` 发布于 **2026-07-17**，是本清单里发版最旧的一批（近 2 个月未发版）。

**风险 / 注意**：README 里的 Pi 链接指向 `github.com/nicholasgasior/pi-coding-agent`（不是官方 `earendil-works/pi`），是旧/错误链接，但 `package.json` 有 `pi` manifest（`{"extensions":["dist/index.js"]}`）且 keyword 含 `pi-package`，确认为 Pi 包。维护节奏慢。

---

### 3.14 @quintinshaw/pi-dynamic-workflows

**做什么**：把一次请求展开成一段 JS 编排脚本，扇出到隔离子 agent、按任务路由模型、交叉校验、合成一个答案；中间结果留在脚本变量里不占聊天上下文。

> Turn one request into a JavaScript orchestration script that fans work out across isolated subagents, routes each task to the right model, cross-checks the results, and returns one synthesized answer. Intermediate work stays in script variables instead of filling your chat context.
> — <https://github.com/QuintinShaw/pi-dynamic-workflows> README

**安装串**：`pi install npm:@quintinshaw/pi-dynamic-workflows`。

**证据**：30 天下载 **39,555**；周下载 **5,365**；GitHub **503 stars**，最后 push 2026-09-10。

**风险 / 注意**：默认开启关键词触发（消息里出现 `workflow`/`workflows` 就武装 workflow 模式）；会"fan out across 100s of subagents"（description），是显著的成本放大器。

---

### 3.15 pi-memory

**做什么**：把长期事实、决策、每日 log、scratchpad 存成 `~/.pi/agent/memory/` 下的纯 markdown；可选 [qmd](https://github.com/tobi/qmd) 提供关键词/语义/混合检索。

> **The most popular memory extension for pi** — listed in the official pi package directory, with semantic search powered by qmd.
> — <https://github.com/jayzeng/pi-memory> README

**安装串**：`pi install npm:pi-memory`。

**证据**：30 天下载 **38,776**；周下载 **4,108**；GitHub **154 stars**，最后 push **2026-08-11**（约 1 个月未更新）。README 自我宣称"most popular"，但同类的 `pi-hermes-memory`（#3.18）在 star/活跃度上更强 — 这句自我宣称不构成独立证据。

**风险 / 注意**：写入 memory 目录（机器本地，符合本仓库"凭据/状态不入库"的规则）；若启用 qmd 会引入外部索引依赖。

---

### 3.16 @gotgenes/pi-permission-system — 本仓库最值得评估的安全类包

**做什么**：集中式、确定性的权限门：工具调用前隐藏被禁工具、allow/ask/deny 三级、bash 通配匹配（`rm -rf *: deny`）、MCP/skill 粒度门控、敏感路径保护（`.env`、`~/.ssh/*`，并对 symlink 解析后的路径同样生效）、越出 cwd 的访问提示、出错时 fail-closed。

> Permission enforcement extension for the Pi coding agent that provides centralized, deterministic permission gates over tool, bash, MCP, skill, and special operations. … **Fails closed** — an internal gate error blocks the tool
> — `curl -s https://registry.npmjs.org/@gotgenes/pi-permission-system` → `readme`

**安装串**：`pi install npm:@gotgenes/pi-permission-system`（monorepo 也可 `pi install git:github.com/gotgenes/pi-packages`）。

**证据**：30 天下载 **38,285**；周下载 **6,048**；mono GitHub **209 stars**，最后 push 2026-09-11。社区：r/PiCodingAgent「New to PI-Agent. Advice on essential extensions」作者列出已装 `@gotgenes/pi-permission-system:src` 与 `pi-web-access`。

**风险 / 注意**：README 有 fork 声明 — 它是 `MasuRii/pi-permission-system` 的完整 fork，已大幅分叉（配置格式/架构/权限模型），升级前注意上游差异。作为"安全门"它本身需要高信任：一旦规则写错可能 fail-closed 阻断正常工作。

---

### 3.17 @ff-labs/pi-fff

**做什么**：把 fff（typo-resistant 文件/内容搜索，带 frecency 与常驻内存索引）作为 Pi 扩展；`override` 模式会**替换 Pi 内建的 `grep` / `find` / `multi_grep`**，并为 `@` 提及补全供数。

> pi install npm:@ff-labs/pi-fff … `override` | Replaces pi's built-in `grep`, `find`, and `multi_grep` with FFF implementations.
> — <https://github.com/dmtrKovalenko/fff> README §Pi agent extension

**安装串**：`pi install npm:@ff-labs/pi-fff`。

**证据**：30 天下载 **36,439**；周下载 **3,947**；宿主仓库 `dmtrKovalenko/fff` **10,687 stars**（但 fff 同时是 opencode / nushell / Neovim 的组件，star 不属于 Pi 扩展本身）。独立扩展仓库见 README: "Source: `packages/pi-fff/`"。

**风险 / 注意**：默认（`tools-only`）只注入工具；`override` 会改变 Pi 内建工具语义，需谨慎；会建立常驻索引（默认 `~/.pi/agent/fff/`，README 提到优先复用已有 fff.nvim DB）。

---

### 3.18 pi-hermes-memory

**做什么**：持久记忆 + 全会话检索 + 写入前 secret 扫描；用 SQLite 索引历史会话，支持"从失败中学习"（记录 tool quirk / correction），每 10 轮后台复盘。

> **Persistent memory + session search + secret scanning for Pi** … 🛡️ **Secret scanning** — API keys and tokens are blocked from being saved
> — <https://github.com/chandra447/pi-hermes-memory> README

**安装串**：`pi install npm:pi-hermes-memory`。

**证据**：30 天下载 **31,076**；周下载 **3,692**；GitHub **428 stars**，最后 push 2026-09-10。社区：r/LocalLLaMA 本地模型帖把 `pi-hermes-memory` 列进日常扩展清单。

**风险 / 注意**：会把历史会话索引进本地 SQLite（`/memory-index-sessions`），属于对会话内容的持久化处理；README 宣称有 secret 扫描，但"扫描能挡住什么"需要自行验证（它同样是完整权限扩展）。

---

### 3.19 pi-claude-bridge

**做什么**：通过 Anthropic Claude Agent SDK 把 Claude Code 当作 Pi 的 provider（Opus/Sonnet/Haiku），或提供 `AskClaude` 工具在别的 provider 下委派给 Claude Code；支持流式、MCP 工具桥接、session resume、thinking、skill 转发。

> Pi extension that integrates Claude Code via the [Agent SDK]… 1. **Provider** — Use Opus/Sonnet/Haiku as models in pi, with all tool calls flowing through pi's TUI  2. **AskClaude tool** — Delegate tasks or questions to Claude Code when using another provider
> — <https://github.com/elidickinson/pi-claude-bridge> README

**安装串**：`pi install npm:pi-claude-bridge`。

**证据**：30 天下载 **28,766**；周下载 **7,509**；GitHub **371 stars**，最后 push 2026-09-08。

**风险 / 注意**：README 顶部有计费警告 — Anthropic "announced and then unannounced" 了 Agent SDK 的计费变更，"It currently uses your regular subscription quota just like Claude Code." 计费规则可能再变。把 Pi 的工具桥到 Claude Code 意味着两套权限模型叠加；`AskClaude` 的 `full` 模式（读写+bash）需显式开启。

---

### 3.20 pi-powerline-footer

**做什么**：把 Pi 默认编辑器替换成 powerline 风格状态栏 + welcome overlay + AI 生成的 loading "vibes"；灵感来自 Powerlevel10k 与 oh-my-pi。

> Customizes the default pi editor with a powerline-style status bar, welcome overlay, and AI-generated "vibes" for loading messages. Inspired by [Powerlevel10k] and [oh-my-pi].
> — <https://github.com/nicobailon/pi-powerline-footer> README

**安装串**：`pi install npm:pi-powerline-footer`。

**证据**：30 天下载 **28,252**；周下载 **5,241**；GitHub **424 stars**，最后 push 2026-09-10。同作者还有 `pi-interview`（30 天 20,170）、`pi-prompt-template-model`（25,968）。

**风险 / 注意**：纯 UI，代码执行面小；但 `workingVibeMode` 默认是 `"generate"`（按需调用模型生成 loading 文案，可配 `workingVibeModel`），README 另提供 `"file"` 模式（"instant, no API calls"）。本仓库已自维护 `shift-enter.ts` 等 TUI 小改，引入前注意与现有 TUI 定制冲突。

---

## 4. 通过门槛（≥20,000/月）但未逐节详述的包

这些同样**经验证面向 Pi**（有 `pi` manifest 或 README 的 `pi install`），只是我优先详述了上面 20 个。

| 包 | 30 天下载 | 周下载 | stars | 类型 | 一句话 + 风险提示 |
|---|---:|---:|---:|---|---|
| [`bigpowers`](https://pi.dev/packages/bigpowers) | 61,744 | 15,162 | 182 | skill+prompt+extension | 73+ agent skills 方法论；README 明说面向 "Claude Code, Gemini CLI, Cursor, pi"；有 "🔌 pi Support" 节。多宿主。 |
| [`@trim21/personal-pi-extensions`](https://pi.dev/packages/@trim21/personal-pi-extensions) | 44,132 | 3,034 | 3 | extension+skills | 含 bwrap sandbox、workspace guard、web search/fetch 等 11 个扩展。**README 中文自述："不要直接使用：这是我个人自用的扩展集…不承诺向后兼容"** → 不建议引入。 |
| [`@akagilnc/pi-workflow-roles`](https://pi.dev/packages/@akagilnc/pi-workflow-roles) | 38,011 | 11,504 | 2 | extension | 中文工作流角色（大理寺/给事中/…）。latest `0.1.3977`、当日发版 → 版本号刷量特征明显，star 仅 2。 |
| [`confluence-cli`](https://pi.dev/packages/confluence-cli) | 32,472 | n/a | n/a | extension+skills | Atlassian Confluence CLI，附带 `./.pi/extensions/confluence-cli.ts`；非 Pi 专属但对 Pi 有 manifest。 |
| [`@remnic/plugin-pi`](https://pi.dev/packages/@remnic/plugin-pi) | 32,438 | n/a | n/a | extension | Remnic 记忆扩展；latest `9.69.56`。README 内容为空（npm registry `readme` 为空），无法从 README 判断机制。 |
| [`@amaster.ai/pi-memory-mem0`](https://pi.dev/packages/@amaster.ai/pi-memory-mem0) | 32,322 | n/a | n/a | extension | Mem0 语义记忆；Apache-2.0；npm registry `readme` 为空。 |
| [`@narumitw/pi-btw`](https://pi.dev/packages/@narumitw/pi-btw) | 28,954 | n/a | 541 (mono) | extension | `/btw` 侧问，不污染主上下文。 |
| [`pi-intercom`](https://pi.dev/packages/pi-intercom) | 28,010 | n/a | n/a | extension+skills | 同机 Pi 会话间 1:1 消息。 |
| [`@raindrop-ai/pi-agent`](https://pi.dev/packages/@raindrop-ai/pi-agent) | 28,108 | n/a | n/a | extension | Raindrop 观测/追踪 → 会把会话与工具调用发送到第三方 SaaS。 |
| [`@narumitw/pi-plan-mode`](https://pi.dev/packages/@narumitw/pi-plan-mode) | 27,365 | n/a | 541 (mono) | extension | Codex 风格只读 `/plan`；与本仓库 goal 生态相关但不同（规划 vs 目标）。 |
| [`cc-safety-net`](https://pi.dev/packages/cc-safety-net) | 26,874 | 3,737 | 1,534 | extension | 破坏性命令/密钥文件拦截 hook；README 支持列表含 Pi；多宿主。 |
| [`pi-prompt-template-model`](https://pi.dev/packages/pi-prompt-template-model) | 25,968 | 6,601 | 309 | extension+skills | prompt template 级别指定模型。 |
| [`pi-provider-litellm`](https://pi.dev/packages/pi-provider-litellm) | 25,600 | 15,988 | 36 | extension | 自建 LiteLLM proxy 接入 Pi provider；凭据落 `~/.pi/agent/auth.json`。 |
| [`@braintrust/pi-extension`](https://pi.dev/packages/@braintrust/pi-extension) | 25,517 | n/a | n/a | extension | Braintrust tracing → 第三方遥测。 |
| [`billion-context-pi`](https://pi.dev/packages/billion-context-pi) | 24,377 | 9,155 | 177 | extension | Pi 专用上下文压缩（README: "this plugin is for **Pi**. It does **not** support **OMP**"）。 |
| [`@narumitw/pi-usage`](https://pi.dev/packages/@narumitw/pi-usage) | 24,299 | 4,141 | 541 (mono) | extension | 显示账号用量 / DeepSeek 余额。 |
| [`pi-fabric`](https://pi.dev/packages/pi-fabric) | 22,184 | 5,621 | 210 | extension+skills | `fabric_exec` 可编程 tool/agent 运行时；默认 QuickJS 沙箱，**"Trusted TypeScript workloads can also use unsafe Node/Bun processes"** → 设计上就有 RCE 出口。 |
| [`pi-web-ui`](https://pi.dev/packages/pi-web-ui) | 22,012 | 4,916 | 未获取（GitHub 配额耗尽） | extension | 基于 Pi SDK 的 web 聊天界面。 |
| [`@agimon-ai/log-sink-mcp`](https://pi.dev/packages/@agimon-ai/log-sink-mcp) | 21,654 | n/a | n/a | extension | DoomPi 生态的 log sink MCP；npm readme 为空。 |
| [`@langchain/langsmith-pi-extension`](https://pi.dev/packages/@langchain/langsmith-pi-extension) | 20,708 | 7,054 | 未获取（GitHub 配额耗尽） | extension | LangSmith tracing → 第三方遥测。 |
| [`pi-interview`](https://pi.dev/packages/pi-interview) | 20,170 | 6,243 | 315 | extension | 交互式访谈表单（同作者 nicobailon）。 |

## 5. 声称流行但证据不支持的（claimed but not supported by evidence）

- **`pi-exit`（本仓库 `pi/settings.json` 里已装）** — npm 描述只有一句 "Minimal pi package that adds a /exit command."；latest `0.2.0`，发布于 **2026-06-23**（近 80 天未更新）；周下载 **7**（`curl -s 'https://api.npmjs.org/downloads/point/last-week/pi-exit'` → `{"downloads":7,…}`）；GitHub `lukaspanni/pi-exit` **1 star**、最后 push 2026-06-23。Pi 0.85.1 的内建命令里已有 `/quit`、`/new`，但没有 `/exit`（`docs/usage.md` 的 Slash Commands 表），所以它只是加了个别名。**结论：它不是"流行的第三方包"，只是本仓库的个人偏好。**
- **`billion-context`（未详述，30 天 73,064）** — README 自述是 "Universal context-compression proxy … Any agent that can set a base URL"，通篇没有 `pi install`，也没有 `pi` manifest 关键词入口；Pi 的对应物是独立的 `billion-context-pi`。因此我没有把 `billion-context` 计入"面向 Pi"的流行包（虽然它在画廊里）。
- **`@companion-ai/feynman`（30 天 352,019）** — 有 `pi` manifest（extensions/prompts/skills），但 README 描述的是一个**独立 CLI agent**（`curl -fsSL https://feynman.is/install | bash`），不是装进你现有 Pi 的包；README 里 "feynman update 只刷新 Feynman 环境里的 Pi 包" 说明 Pi 是它的运行时。**判定：是"基于 Pi 的产品"，不是"给 Pi 装的包"，故未列入正文。**
- **`@trim21/personal-pi-extensions` 与 `@akagilnc/pi-workflow-roles`** — 下载量达标，但作者自述不要直接使用 / 版本号极度密集而 star 个位数；列入 §4 的对照而非"推荐"。
- **自我宣称不算证据** — `pi-memory` README 自称 "The most popular memory extension for pi"、`context-mode` README 自标 "Hacker News #1 • 570+ points"：这些是营销语句，我在正文里只把它们当作**作者声明**，独立指标另行列出。

## 6. 验证说明（gaps、rate limit、不可达来源）

1. **Reddit JSON API 被封锁**。`curl -s -A 'pi-research/1.0' 'https://www.reddit.com/search.json?q=pi+coding+agent&limit=5'` → `HTTP 403` + 返回 HTML `You've been blocked by network security.`；`https://old.reddit.com/search.json?...` → `HTTP 302`；`https://r.jina.ai/https://www.reddit.com/search/?q=pi+coding+agent` → `403 Forbidden`。**替代方案**：用 `web_search` 并以 `domainFilter: ["reddit.com","news.ycombinator.com"]` 做了 4 组检索，拿到了 10 个 r/PiCodingAgent 帖子与 4 个 r/LocalLLaMA 帖子的引文片段（本文件所有 Reddit 引文均来自这一路径，不是直接抓取的账户数据）。`arctic-shift.photon-reddit.com/api/posts/search?query=...` 返回 `400: 'query' query parameter requires one of: author, subreddit`，未使用。
2. **npm downloads API 限流**。连续请求约 35 次后返回 `HTTP 429 {"error code: 1015"}`（`curl -s -w '\nHTTP:%{http_code}\n' 'https://api.npmjs.org/downloads/point/last-week/@dietrichgebert/ponytail'`）。之后我改为每次请求间隔 3 秒重取，全部补齐。
3. **GitHub 未认证 API 限流 60 次/小时**。调研中途 `rate_limit` 显示 `remaining: 7`；`companion-inc/feynman` 返回 `HTTP 301 Moved Permanently`（改用 `advaitpaliwal/feynman`，9,380 stars）。**产物**：`xing-shuyin/pi-web-ui` 与 `langchain-ai/langsmith-pi-extension` 的 star 数在配额耗尽后未取得 → 在 §4 表中标注"未获取（GitHub 配额耗尽）"。所有已取得的 GitHub 数据缓存在本地临时文件，未写入本仓库。
4. **画廊只采了前 200 名**（`?page=1..4`）。5,405 个包里 200 名之后我只做了抽样判断，没有逐个验证 Pi 目标，因此 §1.3 的漏斗只对前 200 名成立。
5. **npm registry 的搜索 total 不可信**（`keywords:pi-package` → `total: 9573`；`pi-coding-agent` → `total: 153747`），与画廊 `5,405` 不一致；本文件以画廊数字为分母。
6. **无法确认的机制细节**：`@remnic/plugin-pi`、`@amaster.ai/pi-memory-mem0`、`@agimon-ai/log-sink-mcp` 的 npm registry `readme` 字段为空，我只能确认 `pi` manifest 存在，无法逐条核对 README 声称的功能。
7. **未做**：没有真正安装任何包、没有跑 `pi list`、没有读取 `~/.pi/agent/auth.json` 或任何凭据/会话内容（只 `ls` 了目录结构与 `cat ~/.pi/agent/npm/package.json` 这个非敏感的依赖清单）。

## 7. 与本仓库（dotfiles）的关系

### 7.1 现状（只读核对）

- `pi/settings.json` 的 `packages` 为：`["npm:pi-web-access", "npm:pi-exit", "npm:pi-mcp-adapter"]`。
- 本机实际安装的依赖清单 `~/.pi/agent/npm/package.json` → `dependencies: { "pi-exit": "^0.2.0", "pi-mcp-adapter": "^2.33.0", "pi-web-access": "^0.29.0" }`，与 settings 一致。
- 本仓库自维护扩展在 `pi/extensions/`：`shift-enter.ts`、`goal/`（`/goal` + 持久目标状态 + 重试退避，见 `pi/extensions/goal/state.ts`、`retry.ts`）、`qiniu/`、`openlux/`（后两者是 provider catalog，配合 `pi/models.json` 里的 `qiniu`/`openlux` 模型）。
- `modules/programs/pi-agent.nix` 把 `pi/settings.json`、`pi/models.json`、`pi/extensions/*` 以 `mkOutOfStoreSymlink` 指回 dotfiles checkout，从而让 Pi 自己还能写 package 列表；`pi-sync` = `git pull --ff-only` + `home-manager switch` + `pi update --extensions`（见 `modules/programs/pi-agent.nix` 与 `README.md`）。

### 7.2 逐类判定

| 类别 | 包 | 判定 |
|---|---|---|
| 已在用且是头部流行 | `pi-web-access`（#3）、`pi-mcp-adapter`（#1） | **保留**。两者分别是画廊下载第 1、3 名，且都在本仓库已有使用记录。 |
| 已在用但不算流行 | `pi-exit`（周下载 7、1 star、80 天未更新） | **可考虑移除**，但这是维护者偏好，不是流行度结论；移除属于变更配置，本次未执行。 |
| 与本仓库本地扩展功能重叠 | `pi-goal-x`（#10）、`@narumitw/pi-goal`（#12）、`pi-goal-list-loop-audit`、`@narumitw/pi-plan-mode` | **不应重复引入**。`pi/extensions/goal/` 已经实现 `/goal` + 持久状态 + 重试；再装第三方 `/goal` 会造成命令/状态冲突。 |
| provider 类 | `pi-provider-litellm`、`@twogiants/pi-anthropic-vertex`、`pi-claude-bridge`、`billion-context-pi` | 本仓库用 `qiniu`（默认 provider）+ `openlux` 自定义 catalog，没有 LiteLLM/Vertex/Claude 订阅依赖，**暂不需要**。 |
| 真实缺口候选 | `@gotgenes/pi-permission-system`、`pi-background-tasks`、`pi-lens`、`pi-memory`/`pi-hermes-memory`、`@narumitw/pi-usage`、`pi-simplify`、`@juicesharp/rpiv-todo` | **优先评估前三项**：权限门（安全）、后台任务（能力缺口）、LSP 诊断（质量缺口）；其余属可选增益。 |
| 与本仓库 web 能力重复 | `pi-web-search`（30 天 18,124，低于门槛）、`@juicesharp/rpiv-web-tools`、`@ff-labs/pi-fff`（部分） | 已有 `pi-web-access`，**冗余**；`pi-fff` 只与搜索/文件查找部分重叠，可单独考虑。 |
| 需要额外订阅/凭据 | `pi-claude-bridge`（Claude 订阅）、`@langchain/langsmith-pi-extension` / `@braintrust/pi-extension` / `@raindrop-ai/pi-agent`（第三方 SaaS 遥测） | 与本仓库"凭据不入库、最小权限"的取向不符，**不建议**。 |
| license 需注意 | `context-mode`（Elastic-2.0） | **引入前需评估合规**；不是 OSI 开源许可。 |
| 不推荐 | `@trim21/personal-pi-extensions`（作者称不要直接用）、`@akagilnc/pi-workflow-roles`（版本刷量、2 star） | **跳过**。 |

### 7.3 安装方式（遵守本仓库的 package-ownership 政策）

- 按 `AGENTS.md`「Package ownership policy」：稳定运行时用 Nix/Home Manager；**上游包管理器是主要分发渠道且更新频繁的工具，用上游包管理器**。Pi 包正是后者，且 `README.md` 明确"Pi's shared settings … Home Manager links those manifests into `~/.pi/agent/` without routing them through a read-only Nix store file, so Pi can continue to manage its package list."
- 因此新增包的正确做法是：把它加进 **`pi/settings.json` 的 `packages` 数组**（或在该用户自己的 account 下运行 `pi install npm:<pkg>`，让 Pi 自己写入那个文件），再由 `pi-sync` 里的 `pi update --extensions` 更新。**不要**为这些包写 Nix derivation，也不要改 `modules/programs/pi-agent.nix` 去硬编码包列表。
- `docs/packages.md` 的 `pi install` 默认写入 `~/.pi/agent/settings.json`（即本仓库 symlink 出去的那个文件）；`-l` 才会写项目级 `.pi/settings.json`。用 `git:` 源的包（如 `@dietrichgebert/ponytail`）会被 pin 在 tag/commit，`pi update --extensions` 不会自动移动 ref。
- 安装前建议至少做：读该包扩展入口源码、确认它是否发起网络请求 / 读凭据 / 写 `~/.pi/agent/` 之外的文件；`pi install` 与 `pi update` 都会执行第三方代码。

---

## 8. 方法与引用附录

### 8.1 精确命令与 URL（均为 2026-09-11 执行）

```bash
# 官方画廊：全量包数 + 前 200 名指标（data-package-downloads / data-package-types / repo 链接）
curl -sL -A 'pi-research/1.0' 'https://pi.dev/packages' -o gallery.html      # packages-count">1-50 / 5405
for p in 1 2 3 4; do curl -sL -A 'pi-research/1.0' "https://pi.dev/packages?page=$p" -o gal/p$p.html; done

# npm 检索（分母不可信，仅用于枚举候选）
curl -s -A 'pi-research/1.0' 'https://registry.npmjs.org/-/v1/search?text=keywords:pi-package&size=250'   # total: 9573
curl -s -A 'pi-research/1.0' 'https://registry.npmjs.org/-/v1/search?text=pi-coding-agent&size=100'       # total: 153747

# 周下载（限流前约 35 次/轮；之后每次 sleep 3s）
curl -s -A 'pi-research/1.0' 'https://api.npmjs.org/downloads/point/last-week/<pkg>'   # {"downloads":N,"start":"2026-09-03","end":"2026-09-09"}

# 版本 / 发布日 / license / keywords / pi manifest
curl -s -A 'pi-research/1.0' 'https://registry.npmjs.org/<pkg>' \
  | python3 -c 'import json,sys;d=json.load(sys.stdin);lt=d["dist-tags"]["latest"];print(lt,d["time"][lt],d["versions"][lt].get("license"),d["versions"][lt].get("pi"),d["versions"][lt].get("keywords"))'

# GitHub 指标（未认证，60/h；缓存到本地临时文件）
curl -s -A 'pi-research/1.0' 'https://api.github.com/repos/<owner>/<repo>'   # stargazers_count / forks_count / pushed_at
curl -s -A 'pi-research/1.0' 'https://api.github.com/rate_limit'             # 中途 remaining: 7

# README（优先 raw，限额内）
curl -sL -A 'pi-research/1.0' 'https://raw.githubusercontent.com/<owner>/<repo>/main/README.md'   # 失败则 master

# 本地权威文档（机制判定依据）
sed -n '1,200p' /opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/docs/packages.md
sed -n '1,60p'  /opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md
grep -n -A30 -m1 'Slash Commands' /opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/docs/usage.md
```

### 8.2 社区来源（经 `web_search`，domainFilter = reddit.com / news.ycombinator.com）

| 来源 | URL | 用途 |
|---|---|---|
| r/PiCodingAgent「Is there a list of the "best" extensions for PI?」 | <https://www.reddit.com/r/PiCodingAgent/comments/1t0av3l/> | plannotator、permission gate、pi.dev/packages 提及 |
| r/PiCodingAgent「What is your essential Pi extensions?」 | <https://www.reddit.com/r/PiCodingAgent/comments/1t9xt2t/> | context-mode、pi-caveman、pi-rtk-optimizer、pi-guardrails 提及 |
| r/PiCodingAgent「New to PI-Agent. Advice on essential extensions」 | <https://www.reddit.com/r/PiCodingAgent/comments/1tnat69/> | `@gotgenes/pi-permission-system`、`pi-web-access` 实装证据 |
| r/PiCodingAgent「pi-subagents – Claude Code like subagents for Pi」 | <https://www.reddit.com/r/PiCodingAgent/comments/1u6d9yj/> | tintinweb 子代理专帖 |
| r/PiCodingAgent「Minimal subagents for Pi」 | <https://www.reddit.com/r/PiCodingAgent/comments/1u5g1wo/> | "Most of current extensions are forks of tintinweb subagents." |
| r/PiCodingAgent「Best Search Tool」 | <https://www.reddit.com/r/PiCodingAgent/comments/1thjxgr/> | "I use this one: nicobailon/pi-web-access" |
| r/PiCodingAgent「Background Tool Execution?」 | <https://www.reddit.com/r/PiCodingAgent/comments/1u84ww5/> | `@aliou/pi-processes` 推荐（30 天下载未进前 200） |
| r/PiCodingAgent「Pi Tui is slow?」 | <https://www.reddit.com/r/PiCodingAgent/comments/1u9zlag/> | pi-lens 性能反证 |
| r/PiCodingAgent「a bit late into the party…」 | <https://www.reddit.com/r/PiCodingAgent/comments/1tvko93/> | pi-subagent + pi-web-access + pi-llm-wiki 清单 |
| r/LocalLLaMA「favorite Agentic Coding Harness」 | <https://www.reddit.com/r/LocalLLaMA/comments/1th5t1b/> | pi-mcp-adapter 独立使用证据 |
| r/LocalLLaMA Qwen3.5 本地模型帖 | <https://www.reddit.com/r/LocalLLaMA/comments/1rh6455/> | pi-hermes-memory / pi-subagents / pi-mcp-adapter 组合清单 |
| HN「Pi – A minimal terminal coding harness」 | <https://news.ycombinator.com/item?id=47143754> | Pi 生态背景 |
| HN「Ask HN: Which plugins or extensions do you most enjoy using with the Pi agent?」 | <https://news.ycombinator.com/item?id=49329068> | 仅提到 omp.sh，未提具体第三方包 |
| HN「To all the haters… Is mario zechner's ai agent」 | <https://news.ycombinator.com/item?id=48836644> | Pi ↔ earendil-works 关系背景 |

### 8.3 原始数字（可复核快照）

- 30 天下载（`data-package-downloads`）与周下载（`last-week`，窗口 2026-09-03→2026-09-09）：见 §2 表格、§4 表格、§1.3 分布。
- GitHub stars / forks / pushed_at：`nicobailon/pi-mcp-adapter` 1451/329/2026-09-10；`nicobailon/pi-subagents` 3532/665/2026-09-11；`nicobailon/pi-web-access` 1416/245/2026-09-10；`juicesharp/rpiv-mono` 780/147/2026-09-10；`apmantza/pi-lens` 403/113/2026-09-11；`tintinweb/pi-subagents` 1125/251/2026-09-03；`narumiruna/pi-extensions` 541/96/2026-09-11；`gotgenes/pi-packages` 209/78/2026-09-11；`chandra447/pi-hermes-memory` 428/97/2026-09-10；`elidickinson/pi-claude-bridge` 371/81/2026-09-08；`nicobailon/pi-powerline-footer` 424/116/2026-09-10；`jayzeng/pi-memory` 154/31/2026-08-11；`MattDevy/pi-extensions` 141/13/2026-09-11；`tmonk/pi-goal-x` 54/26/2026-09-08；`ismailsaleekh/pi-background-tasks` 25/14/2026-09-04；`lukaspanni/pi-exit` 1/1/2026-06-23；`trim21/pi-extensions` 3/0/2026-09-09；`Akagilnc/ak-pi-workflow-roles` 2/2/2026-09-11；`DietrichGebert/ponytail` 134982/7235/2026-09-07；`mksglu/context-mode` 22046/1588/2026-09-10；`backnotprop/plannotator` 8605/642/2026-09-11；`dmtrKovalenko/fff` 10687/444/2026-09-11；`kenryu42/cc-safety-net` 1534/75/2026-09-10；`danielvm-git/bigpowers` 182/18/2026-09-06；`ranxianglei/billion-context-pi` 177/26/2026-09-11；`advaitpaliwal/feynman` 9380/1059/2026-09-06。`@remnic/plugin-pi`、`@amaster.ai/*`、`xing-shuyin/pi-web-ui`、`langchain-ai/langsmith-pi-extension`、`pi-intercom`、`@raindrop-ai/pi-agent` 的 GitHub 指标未取（配额）。
- npm 元数据：见 §8.1 第三条命令的输出（本文件中每个包的最新版本与发布日期均已列出）。

---

## 9. 独立复核（由调度 agent 在调研结束后执行，2026-09-11）

调研 agent 退出后，调度 agent 用**不同的路径**重取了关键数字，以确认没有编造或串行错误。

| 复核项 | 方法 | 结果 | 判断 |
|---|---|---|---|
| 画廊前 3 名的 30 天下载 | `curl -sL https://pi.dev/packages?page=1` 解析 `data-package-downloads` | `866318` / `412438` / `403562`（pi-mcp-adapter / pi-subagents / pi-web-access） | **与 §2 表格逐位一致** |
| 周下载（`pi-mcp-adapter`/`pi-web-access`/`pi-subagents`） | `api.npmjs.org/downloads/point/last-week/*` | `197718` / `63027` / `66401`，窗口 `2026-09-03 → 2026-09-09` | **一致** |
| `pi-exit` 周下载 | 同上 | `7` | **一致**（§5 的"不流行"结论成立） |
| stars | GitHub API 已 429/配额 0，改用 **HTML 抓取**（`aria-label="N users starred"`，独立于 agent 用的 API 路径） | pi-subagents `3532`、pi-mcp-adapter `1451`、pi-lens `403`、pi-background-tasks `25`、pi-exit `1` | **一致**；ponytail 为 `134986`（§2 记 `134982`，几小时内新增 4 star，属正常漂移） |
| 归属仓库名（"这是不是一个 Pi 包"的前提） | npm registry `versions[latest].repository.url` | `nicobailon/pi-mcp-adapter`、`nicobailon/pi-subagents`、`nicobailon/pi-web-access`、`apmantza/pi-lens`、`ismailsaleekh/pi-background-tasks`、`gotgenes/pi-packages` | **与 §2/§3/§8.3 的 owner/repo 完全一致** |
| 画廊总量 | 同上 | 复核时为 `1-50 / 5410`（调研时记 `5405`） | 容器总量在数小时内 `+5`，说明生态当天仍在增长；§1.3 的 `5405` 是抓取时快照 |

复核未发现需要修正的数字。仍未独立复核的部分：§4 表格里未逐节详述包的周下载/stars、以及 §6 记录的 GitHub 配额耗尽条目——那些数字我沿用调研 agent 在同一窗口抓取的快照。
