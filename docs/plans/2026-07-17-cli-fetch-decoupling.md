# CLI 解耦小重构：拆分 fetch.mjs 与下沉 formatEquivalentCommand

## 背景

结构评审发现两处可维护性问题：

1. `cli/fetch.mjs`（约 695 行）混合了 LRC 歌词解析/预览、yt-dlp 音频下载、lrclib API 调用与交互流程，职责偏多。
2. `fetch.mjs` 与 `project.mjs` 从展示层 `menu.mjs` 导入纯格式化函数 `formatEquivalentCommand`，形成业务模块 → 菜单层的倒挂依赖。

## 计划

1. 新建 `cli/command-format.mjs`，将 `formatEquivalentCommand` 从 `menu.mjs` 移入；`menu.mjs`、`fetch.mjs`、`project.mjs` 改为从新模块导入；相关测试从 `menu.test.mjs` 迁到 `command-format.test.mjs`。
   → 验证：`node --test cli` 全绿，`menu.mjs` 不再导出该函数。
2. 从 `fetch.mjs` 抽出 `cli/lrc.mjs`：`parseLrc`、`formatLrcPreview`、`formatLrcPageTitle`、`detectLyricsScript`、`preferSimplifiedChineseLrc`、繁简转换 helper 及相关常量；对应测试迁到 `lrc.test.mjs`。
   → 验证：`node --test cli` 全绿。
3. 从 `fetch.mjs` 抽出 `cli/ytdlp.mjs`：`checkYtDlp`、`searchYtDlp`、`downloadWithYtDlp`、`parseSearchLine` 及相关常量；对应测试迁到 `ytdlp.test.mjs`。
   → 验证：`node --test cli` 全绿。

约束：纯移动 + 改 import，不改任何函数实现与行为；保持现有代码风格；不做额外"顺手改进"。

分工：fast-worker 实施，qa-runner 跑测试验证，主会话整合并提交推送。

## 实施笔记（2026-07-17）

三步均按计划完成，`node --test` 148 通过 / 0 失败，qa-runner 独立复核无残留引用。与计划的偏差（均为依赖方向所迫，无行为变化）：

- `searchYtDlp` 原为 fetch.mjs 模块私有，移入 ytdlp.mjs 后因 fetch.mjs 仍调用而改为导出。
- `SEARCH_LIMIT`、`PREVIEW_LINES` 被移走代码与留下代码同时使用，分别落在 ytdlp.mjs / lrc.mjs 并导出，fetch.mjs 反向导入。
- lyrics.mjs 实际并未从 fetch.mjs 导入任何被移符号，无需改动。
- "yt-dlp 下载目录"一例测试同时覆盖 `downloadWithYtDlp` 与留守的 `installDownloadedAudio`，按主要被测对象迁至 ytdlp.test.mjs。
