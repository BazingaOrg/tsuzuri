"""Whisper 后端探测与统一接口(实现方案第五节,零决策)。

优先级:mlx(arm64 Mac 且可导入)→ faster-whisper CUDA float16 → faster-whisper CPU int8。
三后端收敛到 transcribe(audio) -> (language, [Segment]);探测结果打印一行日志。
模型默认 mlx/CUDA=medium、CPU=small,可用环境变量 TSUZURI_WHISPER_MODEL 覆盖(调试用)。
国内网络:HF 直连超时自动切 hf-mirror.com,再失败才提示配代理。
"""

from __future__ import annotations

import importlib.util
import math
import os
import platform
import sys
import urllib.request
from dataclasses import dataclass
from pathlib import Path


@dataclass
class Segment:
    text: str
    start: float
    end: float
    confidence: float  # exp(avg_logprob),约 0–1


def ensure_hf_reachable(timeout: float = 3.0) -> None:
    """HuggingFace 连通性检测:不可达则自动设 HF_ENDPOINT 指向国内镜像。"""
    if os.environ.get("HF_ENDPOINT"):
        return
    try:
        req = urllib.request.Request("https://huggingface.co", method="HEAD")
        urllib.request.urlopen(req, timeout=timeout)
    except Exception:
        os.environ["HF_ENDPOINT"] = "https://hf-mirror.com"
        print("hf: 直连超时,已切换镜像 hf-mirror.com(仍失败请配置代理)", file=sys.stderr)


def _pick_backend() -> tuple[str, str]:
    """返回 (backend, model)。backend: mlx | cuda | cpu"""
    override = os.environ.get("TSUZURI_WHISPER_MODEL")
    if (
        sys.platform == "darwin"
        and platform.machine() == "arm64"
        and importlib.util.find_spec("mlx_whisper") is not None
    ):
        return "mlx", override or "medium"
    try:
        import ctranslate2

        if ctranslate2.get_cuda_device_count() > 0:
            return "cuda", override or "medium"
    except Exception:
        pass
    return "cpu", override or "small"  # 精度换速度


def _confidence(avg_logprob: float) -> float:
    return round(min(1.0, max(0.0, math.exp(avg_logprob))), 3)


def transcribe(audio: Path) -> tuple[str, list[Segment], str]:
    """统一转写接口。返回 (language, segments, backend_desc)。

    word-level timestamps 开启(为后续卡拉OK式字幕预留),当前只消费段级。
    no_speech_prob > 0.6 的段直接丢弃(Whisper 在音乐场景会幻觉编词,宁可漏不可错)。
    """
    backend, model = _pick_backend()
    desc = f"{backend} / {model}"
    print(f"whisper backend: {desc}")
    ensure_hf_reachable()

    if backend == "mlx":
        import mlx_whisper

        result = mlx_whisper.transcribe(
            str(audio),
            path_or_hf_repo=f"mlx-community/whisper-{model}-mlx",
            word_timestamps=True,
            verbose=None,
        )
        language = result.get("language", "unknown")
        segments = [
            Segment(
                text=s["text"].strip(),
                start=float(s["start"]),
                end=float(s["end"]),
                confidence=_confidence(float(s.get("avg_logprob", -10.0))),
            )
            for s in result["segments"]
            if s["text"].strip() and float(s.get("no_speech_prob", 0.0)) <= 0.6
        ]
        return language, segments, desc

    from faster_whisper import WhisperModel

    wm = WhisperModel(
        model,
        device="cuda" if backend == "cuda" else "cpu",
        compute_type="float16" if backend == "cuda" else "int8",
    )
    raw_segments, info = wm.transcribe(str(audio), word_timestamps=True)
    segments = [
        Segment(
            text=s.text.strip(),
            start=float(s.start),
            end=float(s.end),
            confidence=_confidence(float(s.avg_logprob)),
        )
        for s in raw_segments
        if s.text.strip() and float(s.no_speech_prob) <= 0.6
    ]
    return info.language, segments, desc
