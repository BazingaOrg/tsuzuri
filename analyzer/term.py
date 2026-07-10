"""终端输出样式:重要信息着色,次要信息调暗;非 TTY / NO_COLOR 时自动裸文本。"""

from __future__ import annotations

import os
import sys


def _enabled(stream) -> bool:
    return stream.isatty() and not os.environ.get("NO_COLOR")


def _c(code: str, s: str, stream=None) -> str:
    return f"\x1b[{code}m{s}\x1b[0m" if _enabled(stream or sys.stdout) else s


def dim(s: str) -> str:
    return _c("2", s)


def cyan(s: str) -> str:
    return _c("36", s)


def green(s: str) -> str:
    return _c("32", s)


def yellow(s: str) -> str:
    return _c("33", s)


def warn(s: str) -> None:
    print(_c("33", s, sys.stderr), file=sys.stderr)
