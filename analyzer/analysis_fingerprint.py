"""Print the runtime choices that can change analyzer output."""

import importlib.util
import json

from whisper_backend import _pick_backend


def build_fingerprint() -> dict:
    backend, model = _pick_backend()
    return {
        "version": 1,
        "backend": backend,
        "model": model,
        "demucs_available": importlib.util.find_spec("demucs") is not None,
    }


def main() -> None:
    print(json.dumps(build_fingerprint(), sort_keys=True))


if __name__ == "__main__":
    main()
