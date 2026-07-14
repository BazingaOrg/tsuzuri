# tsuzuri 项目状态

本文记录当前能力、关键约束和仍需验证的事项。具体配置见 [config.md](./config.md)，阶段契约见 [timeline schema](./specs/timeline-schema.md)；历史实施过程保留在各执行方案中。

## 当前能力

tsuzuri 已具备完整的本地视频管线：读取照片、唯一音频和可选 LRC，分析节拍与歌词，生成时间线，再通过 Remotion 输出 MP4。交互终端可在管线开始前选择在线补齐音频或同步歌词，分析和渲染本身仍全部在本地完成。

| 模块 | 当前行为 |
| --- | --- |
| 在线备料 | `fetch` 可通过 yt-dlp 下载音频、确认歌曲信息并规范命名，通过 LRCLIB 搜索和预览同步歌词；可交互选择唯一音频，替换或删除已有素材均需确认 |
| 素材扫描 | 支持 JPG、PNG、WebP 和常见音频格式；视频文件会提示后忽略 |
| 照片排序 | 全部具有 EXIF 时间时按拍摄时间，否则按文件名 |
| 歌词 | LRC 优先，否则使用本地 Whisper；LRCLIB 中文歌词优先转简体，英文和日文保持原文；低置信度 Whisper 歌词在规划阶段过滤 |
| 节奏 | 默认吸附重拍；照片密集时逐拍快闪，照片过少时在重拍处裁短歌曲 |
| 渲染 | 静止照片、三种过渡、片头签名、片尾文案和 −14 LUFS 响度归一 |
| 静态导出 | `still` 支持单张或批量 PNG、EXIF 展签、签名、暗色背景和续跑 |

日常入口为 `node cli/tsuzuri.mjs <folder>`。裸命令提供交互菜单，`fetch` 显式准备在线素材，`doctor` 检查依赖，`lyrics` 可在渲染前预览识别结果。缺素材时的在线提议只出现在交互终端，管道和脚本保持原行为。

交互问答统一为三类：确认题的默认值可独立设置且破坏性操作默认否，列表题用数字选择、按流程决定是否提供 `0` 返回上一步、空回车放弃，输入题支持默认值与原地校验。菜单会在原地提示无效序号或路径，并支持 `q` 退出。

## 管线与数据

```text
可选：视频 URL / 搜索词 → fetch → 音频 + LRC
                              ↓
照片 + 音频 + 可选 LRC
        ↓
Analyze → Plan → metadata/timeline.json → Render → output/*.mp4
```

三个阶段通过 `metadata/` 下的 JSON 文件衔接。CLI 使用 `input_hash` 判断素材是否变化，planner 使用 `plan_checksum` 判断 `timeline.json` 是否被手动修改：未修改的旧时间线会按最新算法刷新，手动修改的时间线会被保留。

视频与 still 共用画布、照片、字体和配色系统。深色背景根据对比度自动选择暗厅色板；视频背景通过 `tsuzuri.toml` 设置，still 也可使用 `--dark`。

## 关键约束

- 所有分析和渲染均在本地完成，不使用云端 API；只有可选 `fetch` 会访问 yt-dlp 支持的平台与 LRCLIB
- Python 支持 3.11–3.12，由 uv 管理 analyzer 环境
- 照片保持静止，不再使用 Ken Burns motion 字段
- `timeline.json` 是允许手动编辑的稳定阶段契约
- 默认输出为 1920×1080、60fps；可通过 `tsuzuri.toml` 调整
- 默认视频写入素材目录的 `output/`，分析文件写入 `metadata/`

## 待验证与已知限制

- macOS Apple Silicon 已实测；Linux 和 Windows 尚缺完整真机验证
- 视频素材暂不支持
- 节拍、快闪和裁歌阈值仍需更多真实歌曲与照片组合调优
- 中、日、英歌词识别及 demucs 人声分离仍需更广泛的真实素材验证
- EXIF 排序采用“全有或全无”策略；部分照片缺少时间时会整体回退文件名
- 功能上线前生成且没有 `plan_checksum` 的时间线会被保守视为手动修改，不会自动刷新

## 验证基线

当前仓库验证命令：

```bash
cd analyzer && uv run pytest
cd cli && npm test
cd renderer && npm run typecheck
```

最近一次本地验证（2026-07-14）：analyzer 76 项、CLI 89 项测试通过，renderer 类型检查通过。
