# tsuzuri — 跨会话状态

> Owner: orchestrator。新 session 从本文件重建上下文,不依赖对话摘要。
> 总计划见 [tsuzuri-implementation-plan.md](./tsuzuri-implementation-plan.md)。

## 任务板

| 里程碑 | 状态 | 完成 commit | 备注 |
| ------ | ---- | ----------- | ---- |
| M0 契约先行 | in progress | — | schema 文档 + fixture |
| M1 渲染端 | pending | — | Remotion 工程 |
| M2 音频分析 | pending | — | librosa beats.json |
| M3 分配算法 + CLI | pending | — | 端到端里程碑 |
| M4 歌词字幕 | pending | — | Whisper resolver |
| M5 边界打磨 | pending | — | |

## 关键决策(计划文档之外新增)

- **fps = 60**:计划文档第二节(已冻结视觉规格)写 60fps,第三节 schema 示例写 30 — 按冻结规格取 60 为默认,`meta.fps` 仍可覆盖。
- fixture 素材用 ffmpeg 本地生成(渐变测试图 ×3,含一张竖图;30s 正弦音),不引入外部版权素材。
- Python 3.14 为系统默认;M4 阶段 faster-whisper/mlx-whisper 若不支持 3.14,用 uv 在 analyzer/ 内 pin 3.12(届时验证)。

## 环境

- Apple Silicon (arm64), macOS 26.4
- Node 22.18 / npm 10.9 / Python 3.14.6 / uv 0.9.29 / FFmpeg 8.1.1
