# tsuzuri(綴り)

> Photos + a song (+ optional lyrics) → a beat-synced visual diary. One command, fully local.
>
> 照片 + 一首歌(+ 可选歌词),缀成踩点影像日记。一条命令,全程本地,无需剪辑软件。

綴る:缀写日记、装订相册 — 写真を音で綴る。

## Showcase / 效果

![成片一帧:白底画布上的照片与画展式字幕](docs/assets/showcase-frame.jpg)

<!-- 截图占位:终端一条命令跑完的输出 -->

## Quick start / 快速开始

```bash
# 依赖:Node 18+ · uv · FFmpeg
cd renderer && npm install && cd ..
node cli/tsuzuri.mjs doctor          # 可选:秒级预检依赖,缺什么直接给修复命令

# 素材文件夹 = 若干照片 + 唯一音频 + 可选一份 .lrc
node cli/tsuzuri.mjs ./osaka-trip
# → ./osaka-trip/output/osaka-trip.mp4
```

日常只有这一条命令,唯一的 flag 是 `-o <path>` 改输出路径。其余全部自动决策:

| 决策 | 自动规则 |
| --- | --- |
| 照片顺序 | EXIF 拍摄时间优先,无则按文件名 |
| 字幕 | `.lrc` 优先;否则本地 Whisper 识别;纯音乐自动跳过 |
| 快闪模式 | 人均展示 < 2s → 逐拍切换 |
| 歌长图少 | 人均 > 10s → 在重拍处截断歌曲 + 淡出收尾 |
| 微调重渲 | 手改 `metadata/timeline.json` 后重跑,跳过分析直接渲染 |
| 响度 | 成片归一到 −14 LUFS(TP −1.5 dB) |

文件夹内可放 `tsuzuri.toml` 覆盖默认值(`photo_scale`、`min_gap`、`transition` …)。

## How it works / 工作原理

![tsuzuri pipeline](docs/assets/architecture.svg)

Analyze / Plan / Render 三个阶段彼此独立,只通过 `metadata/` 下的 JSON 文件衔接;`timeline.json` 是可手改的契约(schema 见 [docs/specs/timeline-schema.md](docs/specs/timeline-schema.md)),素材未变时重跑会跳过分析、直接按改后的时间线渲染。

<details>
<summary>文件夹约定与 LRC 细节 / Folder contract &amp; LRC notes</summary>

```text
osaka-trip/
├── photo-01.jpg …             # .jpg .jpeg .png .webp
├── music.mp3                  # 唯一音频:.mp3 .m4a .wav .flac .aac .ogg
├── lyrics.lrc                 # 可选;UTF-8/BOM 行级 LRC
├── metadata/                  # 生成物:beats.json / lyrics.json / timeline.json
└── output/
    └── osaka-trip.mp4
```

LRC 支持 `[mm:ss.xx]`、同行多时间戳、`[offset:±ms]`、空时间行清除字幕;多份 `.lrc` 或同一时间戳配不同文本会明确报错。旧版根目录 JSON 会自动复制进 `metadata/`,原件保留。

</details>

## Commands / 命令速查

```bash
node cli/tsuzuri.mjs ./osaka-trip               # 渲染成片(唯一日常命令)
node cli/tsuzuri.mjs ./osaka-trip -o out.mp4    # 自定义输出路径
node cli/tsuzuri.mjs doctor                     # 预检依赖,失败项附修复命令
node cli/tsuzuri.mjs lyrics ./osaka-trip        # 渲染前预览歌词识别结果
node cli/tsuzuri.mjs help                       # 查看用法(同 -h / --help)
```

`lyrics` 会列出每行的时间戳与置信度,低于渲染阈值(0.6)的行会标出——先确认识别质量,再花时间渲染。

## 100% local / 完全本地

零云端、零 API key。Whisper 后端自动匹配硬件(Apple Silicon → mlx / NVIDIA → CUDA / 其余 → CPU int8);模型首次下载时若 huggingface.co 不可达,自动切换 hf-mirror 镜像。字幕字体 Noto Serif JP / SC / Latin(SIL OFL 1.1)已随仓库内置,离线可渲染。

## Development / 开发

```bash
cd analyzer && uv run pytest        # 分配算法 + 歌词解析测试
cd cli && npm test                  # CLI / 终端输出测试
cd renderer && npm run typecheck    # 渲染器类型检查
cd renderer && npm run studio       # 实时预览 fixture 时间线
```

Plan & status: [docs/tsuzuri-implementation-plan.md](docs/tsuzuri-implementation-plan.md) · [docs/tsuzuri-status.md](docs/tsuzuri-status.md)
