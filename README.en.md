# tsuzuri(綴り)

> Photos + a song (+ optional lyrics) → a beat-synced visual diary. One command, fully local.

綴る: to write a diary, to bind an album — weaving photos together with sound.

[中文](README.md) · **English**

## Showcase

![A rendered frame: photo with gallery-style caption on a white canvas](docs/assets/showcase-frame.jpg)

<!-- placeholder: terminal output screenshot -->

## Quick start

```bash
# Prerequisites: Node 18+ · uv · FFmpeg
#   macOS: brew install node ffmpeg uv
#   elsewhere: nodejs.org · docs.astral.sh/uv · ffmpeg.org
cd renderer && npm install && cd ..
node cli/tsuzuri.mjs doctor          # optional: instant dependency preflight with fix hints

# A media folder = photos + exactly one audio file + optionally one .lrc
node cli/tsuzuri.mjs ./osaka-trip
# → ./osaka-trip/output/osaka-trip.mp4
```

> **First run**: without an `.lrc`, the Whisper model is downloaded once (small ≈ 500 MB on CPU, medium ≈ 1.5 GB on Apple Silicon / CUDA). Rendering at 60fps is CPU-heavy — a 3-minute song typically takes a few minutes and your fans will spin. That's normal.

This is the only everyday command; the single flag is `-o <path>` to change the output location. Everything else is decided automatically:

| Decision | Auto rule |
| --- | --- |
| Photo order | EXIF capture time first, filename fallback |
| Subtitles | `.lrc` wins; otherwise local Whisper; pure music → skipped |
| Flash mode | avg display < 2s → cut on every beat |
| Long song, few photos | avg > 10s → trim at a downbeat + fade out |
| Tweak & re-render | hand-edit `metadata/timeline.json`, rerun → analysis is skipped |
| Intro / outro | handwritten signature + outro line; customize via `tsuzuri.toml` (`signature` / `outro_text` / `intro`) |
| Loudness | normalized to −14 LUFS (TP −1.5 dB) |

Drop a `tsuzuri.toml` in the folder to override defaults (resolution / fps / transitions / flash & trim thresholds / subtitles / branding …) — full reference in [docs/config.md](docs/config.md) (Chinese).

## How it works

![tsuzuri dual pipeline: video and still outputs share one local visual system](docs/assets/architecture.png)

Analyze / Plan / Render are three independent stages that only talk through JSON files under `metadata/`. `timeline.json` is the hand-editable contract (schema: [docs/specs/timeline-schema.md](docs/specs/timeline-schema.md)); rerunning with unchanged material skips analysis and renders your edited timeline directly.

<details>
<summary>Folder contract &amp; LRC notes</summary>

```text
osaka-trip/
├── photo-01.jpg …             # .jpg .jpeg .png .webp
├── music.mp3                  # exactly one audio: .mp3 .m4a .wav .flac .aac .ogg
├── lyrics.lrc                 # optional; UTF-8/BOM line-synced LRC
├── metadata/                  # generated: beats.json / lyrics.json / timeline.json
└── output/
    └── osaka-trip.mp4
```

LRC supports `[mm:ss.xx]`, multiple timestamps per line, `[offset:±ms]`, and empty timed lines that clear the caption; multiple `.lrc` files or conflicting duplicate timestamps fail with a clear error. Legacy root-level JSON is copied into `metadata/` automatically, originals kept.

Video clips (`.mp4`, `.mov`, …) are not supported yet: they won't appear in the film — the scanner warns and ignores them.

</details>

## Commands

Run `node cli/tsuzuri.mjs` with no arguments to get an interactive menu: pick a number, drag a path in, and the equivalent one-liner is echoed before running — use it once and you know the direct command. The menu only appears in an interactive terminal; scripts and pipes get the usual usage error.

```bash
node cli/tsuzuri.mjs                            # interactive menu (numbered choices, first-run friendly)
node cli/tsuzuri.mjs ./osaka-trip               # render video
node cli/tsuzuri.mjs ./osaka-trip -o out.mp4    # custom output path
node cli/tsuzuri.mjs still ./photo.jpg          # export a still PNG (same look as the video, default 2× supersample)
node cli/tsuzuri.mjs still ./photos --exif      # batch + EXIF caption panel
node cli/tsuzuri.mjs still ./photos --sign      # add the same signature used by the video intro
node cli/tsuzuri.mjs still ./photos --dark      # black gallery background (adds a -dark filename suffix)
node cli/tsuzuri.mjs still ./photos --skip-existing # explicitly resume a batch
node cli/tsuzuri.mjs doctor                     # dependency preflight with fix hints
node cli/tsuzuri.mjs lyrics ./osaka-trip        # preview lyric recognition before rendering
node cli/tsuzuri.mjs help                       # usage (same as -h / --help)
```

Real terminal output of the render pipeline (instrumental material, recorded on Apple Silicon):

```text
● 分析音频
└ beats: bpm=120.19 beats=59 downbeats=15 first_onset=0.511s
└ whisper backend: mlx / medium
● 未识别到人声,按纯音乐处理并跳过字幕轨
● 音频分析完成
● 规划照片时间线
└ plan: 3 photos / 30.0s (人均 10.0s, 字幕 0 行)
● 照片时间线规划完成
● 渲染计划
└ 照片: 3 张,人均 10.0s
└ 音频: music.mp3,30s
└ 歌词: 无(纯音乐或未识别)
● 渲染视频
● 视频渲染完成
● 检查成片响度
● 响度归一完成
└ -18.7 → -14 LUFS(真峰值 ≤ -1.5dB)
● 完成 → ./osaka-trip/output/osaka-trip.mp4
```

`lyrics` lists every line with timestamps and confidence; lines below the render threshold (0.6) are flagged — check recognition quality before spending minutes on a render.

`still` is a pure Node pipeline (no audio analysis). It writes lossless PNG; default `--scale 2` (3840×2160 supersample). `--exif`, `--sign`, and `--dark` form a fixed-order filename suffix (for example, `IMG-exif-sign-dark.png`), so light and dark versions can coexist. `--dark` overrides the folder's TOML background; for a dark video, set `background = "#000000"` in `tsuzuri.toml`. Photos without enough EXIF are reported and skipped for EXIF variants. Existing files are overwritten by default; `--skip-existing` is an explicit batch-resume mode.

### Still cases

| No EXIF · signature below photo | EXIF · signature inside caption panel |
| --- | --- |
| ![Without EXIF, the signature sits below the photo](docs/assets/still-sign-case.png) | ![With EXIF, the signature sits at the bottom of the caption panel](docs/assets/still-exif-sign-case.png) |

## 100% local

No cloud, no API keys. The Whisper backend matches your hardware automatically (Apple Silicon → mlx / NVIDIA → CUDA / otherwise CPU int8); if huggingface.co is unreachable, the one-time model download switches to the hf-mirror.com mirror. Noto Serif JP / SC / Latin fonts (SIL OFL 1.1) are bundled for fully offline rendering.

**Platforms**: tested on macOS (Apple Silicon); Linux should work (faster-whisper CPU / CUDA paths); Windows is code-compatible but untested — feedback welcome.

**Windows notes**: use [Windows Terminal](https://aka.ms/terminal) (UTF-8 by default); legacy cmd with a CJK codepage (CP936) garbles symbols like `●` `└` — run `chcp 65001` first. External dependencies (`uv` / `ffmpeg`) are plain .exe binaries, command spawning and path handling are written cross-platform, and the interactive menu's numbered choices work in cmd / PowerShell / Windows Terminal alike.

## FAQ

**Model download slow or failing?** The mirror kicks in automatically when huggingface.co is unreachable; you can also set `HF_ENDPOINT` yourself, or download a model into the repo's `models/` directory (`models/whisper-<size>-mlx` or `models/faster-whisper-<size>`) to go fully offline.

**Some lyrics are missing from the video?** Lines with confidence below 0.6 are filtered. Preview with `node cli/tsuzuri.mjs lyrics <folder>`; if recognition is poor, provide an `.lrc` to take over subtitles entirely.

**Weak vocals, bad recognition?** `cd analyzer && uv sync --extra separation` installs demucs; on low confidence the analyzer separates vocals and retries once automatically.

**Rendering is slow, fans are loud?** Expected: frame-by-frame 60fps rendering plus H.264 encoding is CPU-bound. If 30fps is acceptable, set `fps = 30` in `tsuzuri.toml` — roughly halves the time.

**Need the full stack trace?** Rerun with `TSUZURI_DEBUG=1`; for missing dependencies, start with `node cli/tsuzuri.mjs doctor`.

**Different Whisper model?** Set `TSUZURI_WHISPER_MODEL=tiny|small|medium` (or a local model directory path) before running.

**Video clips as input?** Not supported yet: the scanner warns and ignores them.

**`Cannot find module .../renderer/cli/tsuzuri.mjs`?** You probably ran `node cli/tsuzuri.mjs` from inside `renderer/` (common after `npm install` or Studio). `cd ..` to the repo root first; the real entry is `node cli/tsuzuri.mjs`. A small forwarder under `renderer/cli/` now redirects automatically if you stay in that directory.

## Development

```bash
cd analyzer && uv run pytest        # allocation + lyric parsing tests
cd cli && npm test                  # CLI / terminal output tests
cd renderer && npm run typecheck    # renderer types
cd renderer && npm run studio       # live-preview the fixture timeline
```

Plan & status (Chinese): [docs/tsuzuri-implementation-plan.md](docs/tsuzuri-implementation-plan.md) · [docs/tsuzuri-status.md](docs/tsuzuri-status.md)

## License

Code is [MIT](LICENSE); bundled Noto Serif JP / SC / Latin fonts are under the [SIL OFL 1.1](renderer/src/fonts/OFL.txt) and are freely redistributable with the repo.
