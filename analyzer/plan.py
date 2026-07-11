"""plan 阶段:beats.json(+ lyrics.json)+ 照片文件夹 → timeline.json。

自动决策:
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

import term
from beat_alloc import allocate_switch_points

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp"}

DEFAULTS = {
    "width": 1920,
    "height": 1080,
    "fps": 60,
    "background": "#FFFFFF",
    "photo_scale": 0.8,
    "min_gap": 2.0,
    "transition": "album",    # album(透明度切换,默认)| cut(纯硬切)| crossfade
    "album_fade": 0.4,
    "crossfade": 0.6,
    "flash_avg_threshold": 2.0,
    "flash_min_gap": 0.8,
    "trim_avg_threshold": 10.0,  # 人均展示超过此值 → 裁剪音频
    "trim_target_avg": 8.0,      # 裁剪目标:人均展示秒数
    "subtitles": True,           # 字幕轨总开关
}

# 属于其他阶段的合法配置键,plan 不消费但不该告警
FOREIGN_KEYS = {"demucs"}
DEPRECATED_KEYS = {"motion", "kenburns_from", "kenburns_to"}

# 识别段置信度阈值,与渲染层 SUBTITLE.confidenceThreshold 保持一致(LRC 固定为 1.0)
CONFIDENCE_THRESHOLD = 0.6

DATETIME_ORIGINAL = next(k for k, v in ExifTags.TAGS.items() if v == "DateTimeOriginal")


def load_config(folder: Path) -> dict:
    cfg = dict(DEFAULTS)
    toml_path = folder / "tsuzuri.toml"
    if toml_path.is_file():
        with toml_path.open("rb") as f:
            user = tomllib.load(f)
        deprecated = set(user) & DEPRECATED_KEYS
        if deprecated:
            term.warn(
                f"tsuzuri.toml 配置 {sorted(deprecated)} 已弃用且不再生效;"
                "照片保持静止显示"
            )
        unknown = set(user) - set(DEFAULTS) - FOREIGN_KEYS - DEPRECATED_KEYS
        if unknown:
            term.warn(f"tsuzuri.toml 中未知配置项被忽略: {sorted(unknown)}")
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


def _is_valid_image(path: Path) -> bool:
    try:
        with Image.open(path) as im:
            im.verify()
        return True
    except Exception:
        term.warn(f"图片损坏,已跳过: {path.name}")
        return False


def ordered_photos(folder: Path) -> list[Path]:
    photos = sorted(
        p
        for p in folder.iterdir()
        if p.suffix.lower() in IMAGE_EXTS and _is_valid_image(p)
    )
    if not photos:
        term.error(f"{folder} 中没有图片(支持 {'/'.join(sorted(IMAGE_EXTS))})")
        raise SystemExit(1)
    stamps = {p: exif_datetime(p) for p in photos}
    if all(stamps.values()):
        term.detail(f"photo order: EXIF 拍摄时间({len(photos)} 张)")
        return sorted(photos, key=lambda p: (stamps[p], p.name))
    term.detail(f"photo order: 文件名排序({len(photos)} 张,EXIF 时间不完整)")
    return photos


def build_timeline(folder: Path, beats: dict, lyrics: list[dict], cfg: dict,
                   input_hash: str | None) -> dict:
    photos = ordered_photos(folder)
    duration = float(beats["duration"])
    n = len(photos)
    avg = duration / n

    # 图少歌长:在目标时长附近的重拍处截断(渲染端按 duration 收尾淡出,无需真裁音频)
    if avg > cfg["trim_avg_threshold"]:
        target = n * cfg["trim_target_avg"]
        candidates = [d for d in beats["downbeats"] if d >= n * cfg["min_gap"]]
        if candidates:
            duration = min(candidates, key=lambda d: abs(d - target))
            avg = duration / n
            term.info(f"裁剪模式: 歌长图少,在 {duration:.1f}s 重拍处截断并淡出,人均 {avg:.1f}s")

    if avg < cfg["flash_avg_threshold"]:
        candidates, min_gap = beats["beats"], cfg["flash_min_gap"]
        term.info(f"快闪模式: 人均 {avg:.1f}s < {cfg['flash_avg_threshold']}s,吸附每拍,min_gap={min_gap}s")
    else:
        candidates, min_gap = beats["downbeats"], cfg["min_gap"]

    # 首个切换点避开前奏,但最多让出一个网格槽位:
    # 强 onset 阈值在响度起伏大的歌里可能落到很晚,不设上限会把全部照片挤进后段
    # (牺牲整体节奏比前奏内多切一刀更伤,取更安全的失败方式)
    not_before = min(float(beats.get("first_strong_onset", 0.0)), duration / n)

    switches = allocate_switch_points(
        duration, n, candidates,
        min_gap=min_gap, not_before=not_before,
    )
    if len(switches) < n - 1:
        dropped = n - 1 - len(switches)
        term.warn(f"时长塞不下全部照片,丢弃末尾 {dropped} 张")
        photos = photos[: len(switches) + 1]
        n = len(photos)

    if cfg["transition"] == "crossfade":
        later_transition = {"type": "crossfade", "duration": cfg["crossfade"]}
    elif cfg["transition"] == "cut":
        later_transition = {"type": "cut", "duration": 0}
    else:
        later_transition = {"type": "album", "duration": cfg["album_fade"]}
    motion = {"type": "none", "from": 1.0, "to": 1.0}

    bounds = [0.0, *switches, duration]
    clips = []
    for i, p in enumerate(photos):
        clips.append({
            "src": f"./{p.relative_to(folder)}",
            "start": round(bounds[i], 3),
            "end": round(bounds[i + 1], 3),
            "transition": {"type": "none", "duration": 0} if i == 0 else dict(later_transition),
            "motion": dict(motion),
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
    parser.add_argument("--beats", type=Path, default=None, help="beats.json(默认 folder/metadata/beats.json)")
    parser.add_argument("--lyrics", type=Path, default=None, help="lyrics.json(默认 folder/metadata/lyrics.json,可选)")
    parser.add_argument("--input-hash", default=None, help="输入素材 hash,由 CLI 计算传入")
    parser.add_argument("-o", "--output", type=Path, default=None, help="默认 folder/metadata/timeline.json")
    args = parser.parse_args(argv)

    folder = args.folder.resolve()
    if not folder.is_dir():
        term.error(f"不是文件夹: {folder}")
        return 1

    metadata_dir = folder / "metadata"
    beats_path = args.beats or metadata_dir / "beats.json"
    if not beats_path.is_file():
        term.error(f"找不到 beats.json: {beats_path}(先跑 tsuzuri-analyze)")
        return 1
    beats = json.loads(beats_path.read_text(encoding="utf-8"))

    lyrics: list[dict] = []
    lyrics_path = args.lyrics or metadata_dir / "lyrics.json"
    if lyrics_path.is_file():
        lyrics = json.loads(lyrics_path.read_text(encoding="utf-8")).get("segments", [])

    cfg = load_config(folder)
    if not cfg["subtitles"] and lyrics:
        term.info("已按 tsuzuri.toml 关闭字幕轨")
        lyrics = []

    # 置信度过滤在 plan 层做并明确告知,timeline 即所见即所得
    # (渲染层保留同阈值兜底;0.6 与 whisper 幻觉风险的权衡见计划文档第四节)
    kept = [s for s in lyrics if s["confidence"] >= CONFIDENCE_THRESHOLD]
    if len(kept) < len(lyrics):
        term.warn(
            f"lyrics: {len(lyrics) - len(kept)} 行置信度 < {CONFIDENCE_THRESHOLD} 被过滤"
            "(宁可漏不可错,防识别幻觉)"
        )
    lyrics = kept

    timeline = build_timeline(folder, beats, lyrics, cfg, args.input_hash)

    out = args.output or metadata_dir / "timeline.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(timeline, ensure_ascii=False, indent=2), encoding="utf-8")
    n = len(timeline["photos"])
    term.detail(
        f"plan: {n} photos / {timeline['meta']['duration']}s "
        f"(人均 {timeline['meta']['duration'] / n:.1f}s, 字幕 {len(lyrics)} 行)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
