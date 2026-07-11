"""与 Node CLI 对齐的终端状态语义。"""

from __future__ import annotations

import os
import sys
from typing import TextIO


_COLORS = {
    "info": "39",
    "start": "38;2;217;119;87",
    "success": "32",
    "warn": "33",
    "error": "31",
}


def _enabled(stream: TextIO) -> bool:
    return (
        stream.isatty()
        and "NO_COLOR" not in os.environ
        and os.environ.get("TERM", "").lower() != "dumb"
    )


def _lines(message: object) -> list[str]:
    return str(message).replace("\r\n", "\n").split("\n")


def _emit(kind: str, message: object, stream: TextIO) -> None:
    dot = f"\x1b[{_COLORS[kind]}m●\x1b[0m" if _enabled(stream) else "●"
    for line in _lines(message):
        print(f"{dot} {line}", file=stream, flush=True)


def info(message: object) -> None:
    _emit("info", message, sys.stdout)


def start(message: object) -> None:
    _emit("start", message, sys.stdout)


def success(message: object) -> None:
    _emit("success", message, sys.stdout)


def warn(message: object) -> None:
    _emit("warn", message, sys.stderr)


def error(message: object) -> None:
    _emit("error", message, sys.stderr)


def detail(message: object) -> None:
    for line in _lines(message):
        output = f"└ {line}"
        if _enabled(sys.stdout):
            output = f"\x1b[2m{output}\x1b[0m"
        print(output, file=sys.stdout, flush=True)
