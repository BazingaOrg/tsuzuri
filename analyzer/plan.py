"""plan 阶段:beats.json(+ lyrics.json)+ 照片文件夹 → timeline.json。

自动决策(实现方案第六节):
- 照片顺序:EXIF 拍摄时间优先,无 EXIF 按文件名排序(打印一行告知)
- 快闪模式:人均展示 < 2s → 吸附目标从重拍降级为每拍,min_gap 放宽到 0.8s
- 字幕:lyrics.json 存在则并入,否则空数组(纯音乐)
配置:文件夹内可选 tsuzuri.toml(photo_scale / min_gap 等),缺省即默认值。
"""

from __future__ import annotations

import argparse
import json
import sys
import tomllib
from pathlib import Path

from PIL import ExifTags, Image

from beat_alloc import allocate_switch_points

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp"}

DEFAULTS = {
    "width": 1920,
    "height": 1080,
    "fps": 60,
    "background": "#FFFFFF",
    "photo_scale": 0.8,
    "min_gap": 2.0,
    "crossfade": 0.6,
    "kenburns_from": 1.0,
    "kenburns_to": 1.035,
    "flash_avg_threshold": 2.0,
    "flash_min_gap": 0.8,
}

DATETIME_ORIGINAL = next(k for k, v in ExifTags.TAGS.items() if v == "DateTimeOriginal")


def load_config(folder: Path) -> dict:
    cfg = dict(DEFAULTS)
    toml_path = folder / "tsuzuri.toml"
    if toml_path.is_file():
        with toml_path.open("rb") as f:
            user = tomllib.load(f)
        unknown = set(user) - set(DEFAULTS)
        if unknown:
            print(f"warning: tsuzuri.toml 中未知配置项被忽略: {sorted(unknown)}", file=sys.stderr)
        cfg.update({k: v for k, v in user.items() if k in DEFAULTS})
    return cfg


def exif_datetime(path: Path) -> str | None:
    try:
        with Image.open(path) as im:
            exif = im.getexif()
            value = exif.get(DATETIME_ORIGINAL)
            if not value:
                value = exif.get_ifd(ExifTags.IFD.Exif).get(DATETIME_ORIGINAL)
            return str(value) if value else None
    except Exception:
        return None


def ordered_photos(folder: Path) -> list[Path]:
    photos = sorted(p for p in folder.iterdir() if p.suffix.lower() in IMAGE_EXTS)
    if not photos:
        raise SystemExit(f"error: {folder} 中没有图片(支持 {'/'.join(sorted(IMAGE_EXTS))})")
    stamps = {p: exif_datetime(p) for p in photos}
    if all(stamps.values()):
        print(f"photo order: EXIF 拍摄时间({len(photos)} 张)")
        return sorted(photos, key=lambda p: (stamps[p], p.name))
    print(f"photo order: 文件名排序({len(photos)} 张,EXIF 时间不完整)")
    return photos


def build_timeline(folder: Path, beats: dict, lyrics: list[dict], cfg: dict,
                   input_hash: str | None) -> dict:
    photos = ordered_photos(folder)
    duration = float(beats["duration"])
    n = len(photos)
    avg = duration / n

    if avg < cfg["flash_avg_threshold"]:
        candidates, min_gap = beats["beats"], cfg["flash_min_gap"]
        print(f"mode: 快闪(人均 {avg:.1f}s < {cfg['flash_avg_threshold']}s,吸附每拍,min_gap={min_gap}s)")
    else:
        candidates, min_gap = beats["downbeats"], cfg["min_gap"]

    switches = allocate_switch_points(
        duration, n, candidates,
        min_gap=min_gap, not_before=float(beats.get("first_strong_onset", 0.0)),
    )
    if len(switches) < n - 1:
        dropped = n - 1 - len(switches)
        print(f"warning: 时长塞不下全部照片,丢弃末尾 {dropped} 张", file=sys.stderr)
        photos = photos[: len(switches) + 1]
        n = len(photos)

    bounds = [0.0, *switches, duration]
    clips = []
    for i, p in enumerate(photos):
        clips.append({
            "src": f"./{p.relative_to(folder)}",
            "start": round(bounds[i], 3),
            "end": round(bounds[i + 1], 3),
            "transition": (
                {"type": "none", "duration": 0}
                if i == 0
                else {"type": "crossfade", "duration": cfg["crossfade"]}
            ),
            "motion": {"type": "kenburns", "from": cfg["kenburns_from"], "to": cfg["kenburns_to"]},
        })

    meta = {
        "version": 1,
        "audio": f"./{beats['audio']}",
        "duration": round(duration, 3),
        "width": cfg["width"],
        "height": cfg["height"],
        "fps": cfg["fps"],
        "background": cfg["background"],
        "photo_scale": cfg["photo_scale"],
    }
    if input_hash:
        meta["input_hash"] = input_hash

    return {
        "meta": meta,
        "photos": clips,
        "subtitles": lyrics,
        "beats": {"bpm": beats["bpm"], "downbeats": beats["downbeats"]},
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="tsuzuri plan: beats/lyrics -> timeline.json")
    parser.add_argument("folder", type=Path, help="素材文件夹(照片 + 音频)")
    parser.add_argument("--beats", type=Path, default=None, help="beats.json(默认 folder/beats.json)")
    parser.add_argument("--lyrics", type=Path, default=None, help="lyrics.json(可选,M4)")
    parser.add_argument("--input-hash", default=None, help="输入素材 hash,由 CLI 计算传入")
    parser.add_argument("-o", "--output", type=Path, default=None, help="默认 folder/timeline.json")
    args = parser.parse_args(argv)

    folder = args.folder.resolve()
    if not folder.is_dir():
        print(f"error: not a folder: {folder}", file=sys.stderr)
        return 1

    beats_path = args.beats or folder / "beats.json"
    if not beats_path.is_file():
        print(f"error: beats.json not found: {beats_path}(先跑 tsuzuri-analyze)", file=sys.stderr)
        return 1
    beats = json.loads(beats_path.read_text(encoding="utf-8"))

    lyrics: list[dict] = []
    lyrics_path = args.lyrics or folder / "lyrics.json"
    if lyrics_path.is_file():
        lyrics = json.loads(lyrics_path.read_text(encoding="utf-8")).get("segments", [])

    timeline = build_timeline(folder, beats, lyrics, load_config(folder), args.input_hash)

    out = args.output or folder / "timeline.json"
    out.write_text(json.dumps(timeline, ensure_ascii=False, indent=2), encoding="utf-8")
    n = len(timeline["photos"])
    print(
        f"plan: {n} photos / {timeline['meta']['duration']}s "
        f"(人均 {timeline['meta']['duration'] / n:.1f}s, 字幕 {len(lyrics)} 行) -> {out}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
