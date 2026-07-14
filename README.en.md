# tsuzuri (綴り)

> Photos + a song (+ optional lyrics) → a beat-synced visual diary. Local analysis and rendering, with optional online preparation.

[中文](README.md) · **English**

## Quick start

Requires [Node.js 18+](https://nodejs.org/), [uv](https://docs.astral.sh/uv/), and [FFmpeg](https://ffmpeg.org/). On macOS, install them with `brew install node uv ffmpeg`.

```bash
npm --prefix cli install
npm --prefix renderer install
node cli/tsuzuri.mjs doctor
```

Prepare a media folder:

```text
osaka-trip/
├── photo-01.jpg
├── photo-02.jpg
├── music.mp3
└── lyrics.lrc
```

When bringing your own media, include photos, exactly one audio file, and optionally one `.lrc`.
If audio or lyrics are missing, first run `node cli/tsuzuri.mjs fetch ./osaka-trip` to fill them
interactively. Then run:

```bash
node cli/tsuzuri.mjs ./osaka-trip
```

The video is written to `osaka-trip/output/osaka-trip.mp4`. Without an `.lrc`, tsuzuri downloads a Whisper model on first use and transcribes lyrics locally.

## Usage

```bash
node cli/tsuzuri.mjs
node cli/tsuzuri.mjs ./osaka-trip
node cli/tsuzuri.mjs ./osaka-trip -o out.mp4
node cli/tsuzuri.mjs lyrics ./osaka-trip
node cli/tsuzuri.mjs fetch ./osaka-trip
node cli/tsuzuri.mjs still ./photo.jpg
node cli/tsuzuri.mjs still ./photos --exif --sign --dark
node cli/tsuzuri.mjs doctor
node cli/tsuzuri.mjs help
```

Running without arguments opens the interactive menu. The main commands are:

| Command | Purpose |
| --- | --- |
| `<folder>` | Analyze audio, plan the timeline, and render a video |
| `lyrics <folder>` | Preview lyric recognition without rendering |
| `fetch <folder>` | Fetch audio/lyrics into the media folder online (interactive) |
| `still <photo\|folder>` | Export a matching still PNG |
| `doctor` | Check local dependencies |

`still` supports `-o`, `--exif`, `--sign`, `--dark`, `--skip-existing`, and `--scale <1-4>`. Run `node cli/tsuzuri.mjs help` for the current full syntax.

tsuzuri automatically:

- Orders photos by EXIF time when every photo has it, otherwise by filename
- Uses `.lrc` when present, otherwise local Whisper; instrumental music skips subtitles
- Offers to fetch missing audio/lyrics online in interactive terminals (same as `fetch`); stays quiet when the folder is complete
- Adapts cut timing to the photo count and song length, trimming and fading on a downbeat when needed
- Normalizes output loudness to −14 LUFS (TP −1.5 dB)

Supported images are `.jpg`, `.jpeg`, `.png`, and `.webp`; supported audio files are `.mp3`, `.m4a`, `.wav`, `.flac`, `.aac`, and `.ogg`. Video clips are not supported yet.

## Architecture

![tsuzuri architecture: optional online preparation feeding the local analysis, planning, and dual-render pipeline](docs/assets/architecture/architecture.png)

`fetch` only writes optional online material into the media folder. Once photos, audio, and LRC are
ready, Analyze, Plan, Remotion rendering, and loudness processing all run locally. Video and still
exports share the same canvas, typography, photo, and palette system.

## Optional online preparation

```bash
node cli/tsuzuri.mjs fetch ./osaka-trip
```

1. When audio is missing, enter a video URL you are entitled to use, or choose from five yt-dlp search results.
2. Confirm the song title and artist after download; tsuzuri names it `Song - Artist.ext`. Replacing existing audio requires confirmation.
3. [LRCLIB](https://lrclib.net) searches synced lyrics using the song metadata and audio duration; candidates more than three seconds away are flagged.
4. Preview the timestamped lyrics before saving `.lrc`; Chinese is converted to Simplified Chinese when applicable, while English and Japanese stay unchanged.

Audio download requires a [yt-dlp](https://github.com/yt-dlp/yt-dlp) you install yourself
(`brew install yt-dlp` on macOS); `fetch` checks it only when download is used. Existing lyrics are never
silently overwritten. Cancelling or finding no match is not an error; local Whisper remains available.
Only interactive terminals offer online preparation—pipes and scripts never enter the network prompts.

## Configuration and documentation

Add `tsuzuri.toml` to the media folder to adjust resolution, frame rate, transitions, subtitles, background, intro, and outro.

Analysis output lives under `metadata/`. When the media is unchanged, edit `metadata/timeline.json` and rerun: tsuzuri preserves the hand-edited timeline and skips repeated analysis.

Analysis and rendering stay local and require no API key. Whisper selects an Apple Silicon, NVIDIA CUDA, or CPU backend automatically; its model is downloaded only on first use.

- [Configuration reference](docs/config.md): all `tsuzuri.toml` options (Chinese)
- [Timeline schema](docs/specs/timeline-schema.md): editing `timeline.json` or developing the renderer (Chinese)
- [Project status](docs/tsuzuri-status.md): current capabilities, constraints, and pending validation (Chinese)

## Development

```bash
cd analyzer && uv run pytest
cd cli && npm test
cd renderer && npm run typecheck
cd renderer && npm run studio
```

## License

Code is licensed under [MIT](LICENSE). Bundled Noto fonts use the [SIL OFL 1.1](renderer/src/fonts/OFL.txt).
