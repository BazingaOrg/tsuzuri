from __future__ import annotations

from pathlib import Path

import numpy as np
import soundfile as sf

import analyze


def write_tiny_wav(path: Path, *, duration: float = 1.0, sr: int = 8000) -> None:
    samples = np.zeros(int(duration * sr), dtype=np.float32)
    sf.write(str(path), samples, sr)


def test_lyrics_only_with_lrc_writes_lyrics_json_and_skips_beats(tmp_path: Path):
    audio_path = tmp_path / "song.wav"
    write_tiny_wav(audio_path, duration=2.0)

    lrc_path = tmp_path / "song.lrc"
    lrc_path.write_text("[00:00.00]Hello\n[00:01.00]World\n", encoding="utf-8")

    lyrics_output = tmp_path / "metadata" / "lyrics.json"
    beats_output = tmp_path / "metadata" / "beats.json"

    code = analyze.main(
        [
            str(audio_path),
            "--lyrics-only",
            "--lyrics-output",
            str(lyrics_output),
            "--lyrics-file",
            str(lrc_path),
        ]
    )

    assert code == 0
    assert lyrics_output.is_file()
    assert not beats_output.exists()

    import json

    result = json.loads(lyrics_output.read_text(encoding="utf-8"))
    assert result["backend"] == "lrc"
    assert [s["text"] for s in result["segments"]] == ["Hello", "World"]
    assert result["segments"][0]["start"] == 0.0
    assert result["segments"][1]["start"] == 1.0
    # 末尾片段应延伸到音频时长(直接读取采样获取,而非节拍分析)
    assert result["segments"][1]["end"] == 2.0


def test_lyrics_only_and_no_lyrics_is_a_usage_error(tmp_path: Path):
    audio_path = tmp_path / "song.wav"
    write_tiny_wav(audio_path, duration=1.0)

    try:
        analyze.main([str(audio_path), "--lyrics-only", "--no-lyrics"])
        assert False, "应当因 argparse.error 而退出"
    except SystemExit as exc:
        assert exc.code == 2
