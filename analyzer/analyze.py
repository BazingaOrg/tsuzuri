"""analyze 阶段:音频 → beats.json。

M2 范围:librosa 节拍检测 + 强 onset(前奏起算点)。
歌词识别(lyrics.json,Whisper)在 M4 接入本模块。
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import librosa
import numpy as np


def analyze_beats(audio_path: Path) -> dict:
    y, sr = librosa.load(str(audio_path), sr=None, mono=True)
    duration = float(librosa.get_duration(y=y, sr=sr))

    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr, units="frames")
    bpm = float(np.atleast_1d(tempo)[0])
    beat_times = librosa.frames_to_time(beat_frames, sr=sr)

    onset_env = librosa.onset.onset_strength(y=y, sr=sr)

    # downbeat 启发式(madmom 升级前的 MVP):按 4 拍一小节,
    # 取节拍点 onset 强度按相位求和最大的相位作为重拍相位
    if len(beat_frames) >= 4:
        idx = np.minimum(beat_frames, len(onset_env) - 1)
        strengths = onset_env[idx]
        phase = int(np.argmax([strengths[p::4].sum() for p in range(4)]))
        downbeat_times = beat_times[phase::4]
    else:
        downbeat_times = beat_times

    # 首个强 onset:避开前奏静音/弱起,首个切换点从这里起算
    onset_frames = librosa.onset.onset_detect(onset_envelope=onset_env, sr=sr, units="frames")
    first_strong_onset = 0.0
    if len(onset_frames) > 0:
        onset_times = librosa.frames_to_time(onset_frames, sr=sr)
        strengths = onset_env[np.minimum(onset_frames, len(onset_env) - 1)]
        threshold = float(np.mean(onset_env) + np.std(onset_env))
        strong = onset_times[strengths >= threshold]
        first_strong_onset = float(strong[0]) if len(strong) > 0 else float(onset_times[0])

    return {
        "version": 1,
        "audio": audio_path.name,
        "duration": round(duration, 3),
        "bpm": round(bpm, 2),
        "beats": [round(float(t), 3) for t in beat_times],
        "downbeats": [round(float(t), 3) for t in downbeat_times],
        "first_strong_onset": round(first_strong_onset, 3),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="tsuzuri analyze: audio -> beats.json")
    parser.add_argument("audio", type=Path, help="音频文件路径")
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        default=None,
        help="输出路径(默认与音频同目录 beats.json)",
    )
    args = parser.parse_args(argv)

    if not args.audio.is_file():
        print(f"error: audio not found: {args.audio}", file=sys.stderr)
        return 1

    result = analyze_beats(args.audio)
    out = args.output or args.audio.parent / "beats.json"
    out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(
        f"beats: bpm={result['bpm']} beats={len(result['beats'])} "
        f"downbeats={len(result['downbeats'])} first_onset={result['first_strong_onset']}s "
        f"-> {out}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
