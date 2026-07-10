# tsuzuri(綴り)

> Turn photos and a song into a beat-synced visual diary. Fully local: beat detection, smart cut planning, lyric transcription, and a clean white-canvas 16:9 render with gallery-style captions — one command, no editor.
>
> 把照片和一首歌缀成踩点影像日记:本地节拍分析、智能规划切换、歌词识别、画册式字幕,一条命令导出成片,无需剪辑软件。

綴る:缀写日记、装订相册 — 写真を音で綴る。

## Quick start / 快速开始

```bash
# Prerequisites / 依赖:Node 18+, uv, FFmpeg
cd renderer && npm install && cd ..

# Put photos + ONE audio file in a folder, then / 照片 + 唯一音频放进文件夹:
node cli/tsuzuri.mjs ./osaka-trip
# → ./osaka-trip/osaka-trip.mp4
```

That's the only command. No flags to learn (`-o` to change the output path is the single exception). Everything else is decided automatically:

这是唯一的日常命令,零决策设计,其余全部自动:

| Decision / 决策 | Auto rule / 自动规则 |
| --- | --- |
| Photo order / 照片顺序 | EXIF time first, filename fallback / EXIF 拍摄时间优先,无则文件名 |
| Subtitles / 字幕 | Whisper transcribes locally; pure music → skipped / 本地识别,纯音乐自动跳过 |
| Flash mode / 快闪 | avg display < 2s → snap to every beat / 人均 < 2s 自动切换 |
| Long song / 歌长图少 | avg > 10s → cut at a downbeat near target + fade / 重拍处截断 + 淡出 |
| Re-render / 微调重渲 | hand-edit `timeline.json`, rerun → skips analysis / 手改后重跑直接渲染 |

Optional `tsuzuri.toml` in the folder overrides defaults (`photo_scale`, `min_gap`, …).

## How it works / 工作原理

```
photos/ + music.mp3
   │  analyze (Python: librosa beats + Whisper lyrics)
   ▼  beats.json, lyrics.json
   │  plan (Python: greedy beat-snap allocation)
   ▼  timeline.json          ← the contract, hand-editable
   │  render (Remotion/React, 1920×1080@60, Noto Serif JP/SC/Latin)
   ▼  output.mp4
```

Three independent stages talk through JSON files — see [docs/specs/timeline-schema.md](docs/specs/timeline-schema.md). This keeps every stage swappable and agent-ready.

三阶段独立、以 JSON 文件为契约,为后续 agent 化预留。

## 100% local / 完全本地

Zero cloud, zero API keys. Whisper backend auto-detects your hardware (Apple Silicon → mlx / NVIDIA → CUDA / else CPU int8). If huggingface.co is unreachable (e.g. mainland China), it automatically switches to `hf-mirror.com` for the one-time model download.

零云依赖、零 API key。Whisper 后端自动探测硬件;国内网络下 HF 直连失败会自动切换 hf-mirror 镜像下载模型。

## Fonts / 字体

Noto Serif JP / SC / Latin (SIL OFL 1.1) are bundled in `renderer/src/fonts/` for offline rendering.

## Development / 开发

```bash
cd analyzer && uv run pytest        # allocation algorithm tests
cd renderer && npm run typecheck    # renderer types
cd renderer && npm run studio       # live-preview the fixture timeline
```

Plan & status: [docs/tsuzuri-implementation-plan.md](docs/tsuzuri-implementation-plan.md) · [docs/tsuzuri-status.md](docs/tsuzuri-status.md)
