# tsuzuri architecture redraw context

## Must preserve

- The diagram describes shipped behavior, not a roadmap.
- Optional yt-dlp and LRCLIB preparation writes material into the media folder; it is not part of
  the local analysis/rendering guarantee.
- The media folder is the boundary shared by self-supplied material and `fetch`.
- The main video path is CLI → Analyze + Plan → `metadata/timeline.json` → Diary render → MP4.
- `timeline.json` remains an explicit, hand-editable contract.
- Still export branches from the CLI and shares the Remotion visual system, producing PNG.
- MP4 and PNG are deterministic outputs from the same media folder and shared visual language.

## Suggested additions

- None for the current shipped architecture. Add a node only when a new system boundary is implemented
  and cannot be expressed in the README prose.

## Visual direction

- Read left to right, starting with optional online sources and ending at MP4 / PNG.
- Keep no more than nine nodes; merge Analyze and Plan before adding detail.
- Keep CLI and `timeline.json` as the only ink-blue focal nodes.
- Use parchment, ivory, warm gray, and ink-blue only; no gradients, shadows, icons, or decorative lines.
- Draw online preparation as secondary context and the local deterministic core as the primary path.
- Use short English technical labels so the same PNG works in Chinese and English README files.

## Sister boundaries

- Detailed fetch decisions, overwrite prompts, filename confirmation, LRCLIB candidate selection, and
  Simplified Chinese conversion belong in `README.md`, `README.en.md`, and
  `docs/plans/2026-07-14-fetch-audio-lyrics.md`, not in this architecture figure.
- Timeline field details belong in `docs/specs/timeline-schema.md`.
- Configuration keys and rendering options belong in `docs/config.md`.
- Current validation gaps and platform constraints belong in `docs/tsuzuri-status.md`.
