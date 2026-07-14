# README fetch 流程与架构图更新计划

> 状态:已确认并实施。

## 背景

fetch 功能已经上线,但 README 仍以「素材必须预先包含唯一音频」和「全程本地」作为
第一阅读印象。现有 `docs/assets/architecture.png` 也只展示原始本地 video/still
双管线,没有可选在线备料入口,且未在 README 中引用;图稿缺少可维护的 HTML 源文件和
重画说明。

同时,`docs/tsuzuri-status.md` 尚未记录 fetch,验证基线仍写 CLI 58 项,与当前 81 项
不一致。

## 目标

1. README 中英文准确说明两种素材入口:用户自行准备,或在交互终端中使用可选 fetch。
2. 用简短、可扫描的步骤说明音频下载、歌曲信息确认、规范命名、歌词搜索/预览/简体偏好
   和覆盖保护,同时明确非交互脚本行为不变。
3. 将架构图更新为「可选在线备料 → 本地确定性管线 → MP4 / PNG」,并在 README 中展示。
4. 建立可持续维护的架构图三件套:自包含 HTML、由 HTML 导出的 PNG、`prompt.md`。
5. 同步项目状态文档和真实验证基线。

## 方案

### 1. README 信息结构

涉及 `README.md`、`README.en.md`:

- 将首屏「全程本地」收窄为「分析与渲染本地完成,在线备料可选」,避免与 LRCLIB / yt-dlp
  冲突。
- 快速开始保留最短的自备素材路径,补一句缺音频或歌词时可运行 `fetch`。
- 将现有 fetch 长段落独立为简短的「可选在线备料 / Optional online preparation」小节,
  用有序流程表达:
  1. 缺音频时可输入有权使用的 URL,或用关键词选择 yt-dlp 候选;
  2. 下载后确认歌曲名与歌手,按 `歌曲名 - 歌手.ext` 整理;
  3. 按歌曲信息与音频时长搜索 LRCLIB,对时长差大于 3 秒的候选提示风险;
  4. 中文歌词转简体,英文/日文保持原文,预览确认后保存;
  5. 已有文件的替换均需确认,放弃或搜不到不视为错误,仍可使用 Whisper。
- 明确这些提议只在交互终端出现;管道和脚本继续保持原行为。
- 新增「架构 / Architecture」段落并嵌入同一张 PNG,不扩写 FAQ 或重复配置文档。

### 2. 架构图

将现有单张 PNG 归档为维护型图稿目录:

```text
docs/assets/architecture/
├── index.html
├── architecture.png
└── prompt.md
```

以 Kami `architecture.html` 模板为基础,保留当前 parchment + ink-blue 视觉语言,但按现状
重建内容。阅读路径为左到右,节点预算不超过 9 个:

1. 可选在线来源:视频 URL / yt-dlp 搜索、LRCLIB;
2. fetch 交互备料:覆盖确认、歌曲信息、歌词 preview;
3. 素材文件夹:照片、唯一音频、可选 LRC;
4. tsuzuri CLI:菜单/命令路由、交互兜底;
5. Analyze + Plan:节拍、歌词、照片时间线;
6. `metadata/timeline.json`:可手动编辑的阶段契约;
7. Diary render:Remotion 视频渲染;
8. Still render:EXIF / 签名 / 明暗色板;
9. 输出带:MP4 与 PNG。

在线边界使用辅助线和外部节点样式;本地 CLI/管线是主路径。所有节点均为已上线能力,
不绘制未来功能。图内使用简短英文技术标签,供中英文 README 共用。

`prompt.md` 固定记录 Must preserve、Suggested additions、Visual direction、Sister boundaries
四部分,后续重画不依赖会话记忆。

### 3. 项目状态同步

更新 `docs/tsuzuri-status.md`:

- 当前能力增加交互备料与简体歌词偏好;
- 日常入口补 `fetch`;
- 管线图用文字标出 fetch 是管线前的可选步骤;
- 将「所有分析和渲染本地」与「可选在线备料」的边界写清;
- 以本轮真实测试结果更新验证基线。

## 验证

1. 代码事实:运行 CLI、analyzer 测试与 renderer typecheck,文档中的测试数以真实输出为准。
2. 文档:检查中英文命令、术语和链接一致,`git diff --check` 通过。
3. 图稿机械检查:无外部资源、脚本、渐变或阴影;SVG 包含 `role=img`、`title`、`desc`;
   HTML/prompt/PNG 术语一致。
4. PNG:从 HTML 以 2800–3200px 宽导出,不得直接编辑;确认 PNG 新于 HTML。
5. 视觉:分别检查 HTML 浏览器效果、PNG 原尺寸、README 实际列宽下的可读性和留白。

## 风险与边界

- README 保持入门文档定位,不复制完整实现计划或故障排查。
- 架构图只表达系统边界和主要流向,fetch 的交互分支由 README 有序步骤承担,不把单图
  膨胀为流程图。
- yt-dlp 与 LRCLIB 是可选在线依赖/服务,不能让图或文案暗示渲染需要联网。
- 本任务只更新文档和图稿,不修改 CLI 行为。

## Execution status

- [x] README 中英文信息结构与 fetch 流程
- [x] 架构图 HTML / PNG / prompt 三件套
- [x] 项目状态与验证基线
- [x] 机械、测试与视觉验收

## Implementation notes(2026-07-14)

- README 中英文首屏改为「本地分析与渲染,在线备料可选」;快速开始保留自备素材主路径,
  缺音频/歌词时补充 `fetch` 入口。
- 将原来的 fetch 长段落重写为 4 步可扫描流程:音频 URL/关键词候选、歌曲信息与文件名
  确认、LRCLIB 时长匹配、带时间戳歌词 preview 与语言保持策略。覆盖确认、失败/放弃回退
  Whisper、非交互不联网问答作为流程边界单独说明。
- 新增 README 架构段落;中英文共用英文技术标签图,避免维护两套图稿造成术语漂移。
- 原 `docs/assets/architecture.png` 移至 `docs/assets/architecture/architecture.png`,并新增
  自包含 `index.html` 与四段式 `prompt.md`。图中 9 个节点均为已上线能力,CLI 与
  `timeline.json` 是两个 focal;在线备料在本地确定性核心之外。
- PNG 由 Chrome headless 从 HTML 以 2.5 倍设备比例导出为 3000×1700,没有直接编辑位图。
- `docs/tsuzuri-status.md` 同步 fetch、中文歌词简体偏好、交互/脚本边界和真实验证基线。

验证结果:

- `uv run --project analyzer pytest -q`:76/76 通过。
- `npm --prefix cli test`:81/81 通过。
- `npm --prefix renderer run typecheck`:通过。
- 本地 Markdown 链接检查与 `git diff --check` 通过。
- HTML 机械扫描未发现纯白、渐变、阴影、脚本、外部图片或 em dash;所有颜色均来自 Kami
  token map;SVG 包含 `role=img`、`title`、`desc`。
- 已检查 HTML 浏览器导出、3000px PNG 原图和 832px README 内容列预览;无裁切、重叠、
  节点溢出或双重边距。

## Review issues(2026-07-14)

1. 首轮导出中 fetch、timeline、Diary render 三个副标题超出节点。根因是直接沿用实现
   术语,没有先按 160px 固定节点预算压缩文案;修复为更短的功能标签后重新导出。
2. 首轮图把 yt-dlp 放在「素材来源」节点。根因是混淆了下载工具与外部服务;修正为
   `Online sources: video / LRCLIB`,下载动作留在 `Prepare media`。
3. README 初稿写「yt-dlp 只在实际下载时检查」,忽略 `doctor` 会主动报告可选依赖。
   修正为「`fetch` 只在实际下载时检查」,与代码边界一致。
