"""analyze 阶段:音频 → beats.json + lyrics.json。

librosa 提取节拍和前奏起算点;用户 LRC 优先,否则用 Whisper 识别歌词。
Whisper 低置信度时可选 demucs 人声分离重跑一次,纯音乐输出空 segments。
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import statistics
import subprocess
import sys
import tempfile
import tomllib
from pathlib import Path

import librosa
import numpy as np

import term
from lyrics_input import LrcError, parse_lrc


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


LOW_CONFIDENCE = 0.5  # 整体置信度低于此值触发 demucs 重跑
KNOWN_LANGS = {"ja", "zh", "en"}


def _demucs_enabled(audio_path: Path) -> bool:
    toml_path = audio_path.parent / "tsuzuri.toml"
    if toml_path.is_file():
        with toml_path.open("rb") as f:
            return bool(tomllib.load(f).get("demucs", True))
    return True


def _try_demucs(audio_path: Path, workdir: Path) -> Path | None:
    """人声分离,返回 vocals.wav 路径;demucs 未安装或失败返回 None。

    设备:demucs 自动 CUDA-else-CPU(MPS 算子不全,不折腾)。每首歌至多一次。
    """
    if importlib.util.find_spec("demucs") is None:
        term.warn("demucs 未安装,跳过人声分离(可 uv sync --extra separation 启用)")
        return None
    term.start("识别置信度低,启用 demucs 人声分离重跑")
    r = subprocess.run(
        [sys.executable, "-m", "demucs.separate", "--two-stems", "vocals",
         "-n", "htdemucs", "-o", str(workdir), str(audio_path)],
        capture_output=True, text=True,
    )
    if r.returncode != 0:
        term.warn(f"demucs 失败,沿用原始识别结果: {r.stderr.strip()[-200:]}")
        return None
    vocals = workdir / "htdemucs" / audio_path.stem / "vocals.wav"
    if vocals.is_file():
        term.success("demucs 人声分离完成")
        return vocals
    term.warn("demucs 未生成 vocals.wav,沿用原始识别结果")
    return None


def analyze_lyrics(audio_path: Path) -> dict:
    from whisper_backend import transcribe

    language, segments, backend = transcribe(audio_path)

    avg_conf = statistics.fmean(s.confidence for s in segments) if segments else 0.0
    if (not segments or avg_conf < LOW_CONFIDENCE) and _demucs_enabled(audio_path):
        with tempfile.TemporaryDirectory(prefix="tsuzuri-demucs-") as tmp:
            vocals = _try_demucs(audio_path, Path(tmp))
            if vocals is not None:
                language2, segments2, backend2 = transcribe(vocals)
                avg2 = statistics.fmean(s.confidence for s in segments2) if segments2 else 0.0
                if avg2 > avg_conf:
                    language, segments, backend = language2, segments2, f"{backend2} + demucs"
                    avg_conf = avg2

    lang = language if language in KNOWN_LANGS else "mixed"
    if not segments:
        term.warn("未识别到人声,按纯音乐处理并跳过字幕轨")
    return {
        "version": 1,
        "audio": audio_path.name,
        "language": language,
        "backend": backend,
        "segments": [
            {
                "text": s.text,
                "lang": lang,
                "start": round(s.start, 3),
                "end": round(s.end, 3),
                "confidence": s.confidence,
            }
            for s in segments
        ],
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="tsuzuri analyze: audio -> metadata/*.json")
    parser.add_argument("audio", type=Path, help="音频文件路径")
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        default=None,
        help="beats.json 输出路径(默认 audio_dir/metadata/beats.json)",
    )
    parser.add_argument("--lyrics-output", type=Path, default=None, help="lyrics.json 输出路径")
    parser.add_argument("--lyrics-file", type=Path, default=None, help="用户提供的单行时间轴 LRC 歌词")
    parser.add_argument("--no-lyrics", action="store_true", help="跳过歌词识别(调试用)")
    parser.add_argument(
        "--lyrics-only",
        action="store_true",
        help="只识别歌词,跳过节拍分析(不写 beats.json,调试/预览用)",
    )
    args = parser.parse_args(argv)

    if args.no_lyrics and args.lyrics_file:
        parser.error("--no-lyrics 与 --lyrics-file 不能同时使用")
    if args.lyrics_only and args.no_lyrics:
        parser.error("--lyrics-only 与 --no-lyrics 不能同时使用")

    if not args.audio.is_file():
        term.error(f"找不到音频文件: {args.audio}")
        return 1

    if args.lyrics_only:
        duration = float(librosa.get_duration(path=str(args.audio)))
        lyrics_out = args.lyrics_output or args.audio.parent / "metadata" / "lyrics.json"
    else:
        result = analyze_beats(args.audio)
        duration = float(result["duration"])
        out = args.output or args.audio.parent / "metadata" / "beats.json"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        term.detail(
            f"beats: bpm={result['bpm']} beats={len(result['beats'])} "
            f"downbeats={len(result['downbeats'])} first_onset={result['first_strong_onset']}s"
        )
        lyrics_out = args.lyrics_output or out.parent / "lyrics.json"

    if not args.no_lyrics:
        if args.lyrics_file:
            if not args.lyrics_file.is_file():
                term.error(f"找不到 LRC 歌词: {args.lyrics_file}")
                return 1
            try:
                lyrics = parse_lrc(
                    args.lyrics_file,
                    audio_name=args.audio.name,
                    duration=duration,
                )
            except LrcError as exc:
                term.error(str(exc))
                return 1
            term.info(f"使用用户歌词: {args.lyrics_file.name}")
        else:
            lyrics = analyze_lyrics(args.audio)
        lyrics_out.parent.mkdir(parents=True, exist_ok=True)
        lyrics_out.write_text(
            json.dumps(lyrics, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        term.detail(f"lyrics: {len(lyrics['segments'])} 行({lyrics['backend']})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
