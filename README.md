# tsuzuri（綴り）

> 照片 + 一首歌（可选歌词），自动生成踩点影像日记。一条命令，全程本地。

**中文** · [English](README.en.md)

## 快速开始

需要 [Node.js 18+](https://nodejs.org/)、[uv](https://docs.astral.sh/uv/) 和 [FFmpeg](https://ffmpeg.org/)。macOS 可通过 `brew install node uv ffmpeg` 安装。

```bash
npm --prefix cli install
npm --prefix renderer install
node cli/tsuzuri.mjs doctor
```

准备一个素材文件夹：

```text
osaka-trip/
├── photo-01.jpg
├── photo-02.jpg
├── music.mp3
└── lyrics.lrc
```

其中应包含若干照片、唯一一份音频，可选一份 `.lrc`。然后运行：

```bash
node cli/tsuzuri.mjs ./osaka-trip
```

成片默认写入 `osaka-trip/output/osaka-trip.mp4`。没有 `.lrc` 时，tsuzuri 会在首次运行时下载 Whisper 模型并在本地识别歌词。

## 使用

```bash
node cli/tsuzuri.mjs
node cli/tsuzuri.mjs ./osaka-trip
node cli/tsuzuri.mjs ./osaka-trip -o out.mp4
node cli/tsuzuri.mjs lyrics ./osaka-trip
node cli/tsuzuri.mjs still ./photo.jpg
node cli/tsuzuri.mjs still ./photos --exif --sign --dark
node cli/tsuzuri.mjs doctor
node cli/tsuzuri.mjs help
```

不带参数会打开交互菜单。常用命令包括：

| 命令 | 用途 |
| --- | --- |
| `<folder>` | 分析音频、规划时间线并渲染视频 |
| `lyrics <folder>` | 预览歌词识别结果，不渲染 |
| `still <photo\|folder>` | 导出同款静态 PNG |
| `doctor` | 检查本地依赖 |

`still` 支持 `-o`、`--exif`、`--sign`、`--dark`、`--skip-existing` 和 `--scale <1-4>`；完整用法以 `node cli/tsuzuri.mjs help` 为准。

tsuzuri 会自动处理：

- 照片均有 EXIF 时间时按拍摄时间排列，否则按文件名排列
- 优先读取 `.lrc`，否则使用本地 Whisper；纯音乐自动跳过字幕
- 根据照片数量和歌曲长度选择踩点节奏，必要时在重拍处裁歌并淡出
- 将成片响度归一到 −14 LUFS（TP −1.5 dB）

目前支持 `.jpg`、`.jpeg`、`.png`、`.webp` 图片，以及 `.mp3`、`.m4a`、`.wav`、`.flac`、`.aac`、`.ogg` 音频；视频素材暂不支持。

## 配置与文档

在素材文件夹中添加 `tsuzuri.toml`，可调整分辨率、帧率、过渡、字幕、背景和片头片尾。

分析结果保存在 `metadata/`。素材未变化时，可直接修改 `metadata/timeline.json` 后重跑，tsuzuri 会保留手动时间线并跳过重复分析。

所有分析和渲染均在本地完成，不需要 API key。Whisper 会根据 Apple Silicon、NVIDIA CUDA 或 CPU 自动选择后端；模型仅在首次使用时下载。

- [配置参考](docs/config.md)：`tsuzuri.toml` 的全部选项
- [时间线格式](docs/specs/timeline-schema.md)：手动编辑 `timeline.json` 或开发渲染器
- [项目状态](docs/tsuzuri-status.md)：当前能力、约束和待验证事项

## 开发

```bash
cd analyzer && uv run pytest
cd cli && npm test
cd renderer && npm run typecheck
cd renderer && npm run studio
```

## 许可

代码采用 [MIT](LICENSE) 许可；内置 Noto 字体采用 [SIL OFL 1.1](renderer/src/fonts/OFL.txt)。
