# timeline.json Schema v1(阶段契约)

analyze/plan(Python)与 render(Remotion)之间的唯一契约。photos 与 subtitles
是两个平级数组、独立时间线,渲染层各消费各的。

来源:[实现方案第三节](../tsuzuri-implementation-plan.md)。字段修改需先改本文档。

## 顶层结构

```jsonc
{
  "meta": { ... },
  "photos": [ ... ],
  "subtitles": [ ... ],
  "beats": { ... }        // 可选,调试用,渲染层不消费
}
```

## meta

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| `version` | int | 固定 `1` |
| `audio` | string | 音频路径,相对素材根目录(渲染时的 `--public-dir`) |
| `duration` | float | 成片总时长(秒),= 音频时长(或裁剪后时长) |
| `width` / `height` | int | 默认 1920 × 1080 |
| `fps` | int | 默认 **60** |
| `background` | string | 默认 `#FFFFFF` |
| `photo_scale` | float | 默认 `0.8`,定义照片 fit 安全框占画布宽高的比例;照片在整个可见区间保持固定几何尺寸 |
| `input_hash` | string? | CLI 写入的输入素材 hash,用于区分"手改 timeline"与"素材变了" |

## photos[]

按 `start` 升序;首张 `start = 0`,末张 `end = meta.duration`。
相邻两张区间衔接:`photos[i].end == photos[i+1].start`。

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| `src` | string | 图片路径,相对素材根目录(渲染时的 `--public-dir`) |
| `start` / `end` | float | 秒。`album` / `crossfade` 含淡化前沿:切换点 = opacity 淡化中点,即上一张 `end` 与本张 `start` 都等于对齐节拍的时间点,淡化区间为 `[start - d/2, start + d/2]` |
| `transition.type` | string | `"album"` \| `"crossfade"` \| `"cut"` \| `"none"`;首张固定为 `"none"` |
| `transition.duration` | float | 秒。`album` 默认 0.4,做节拍中点对齐的短时整页叠化;`crossfade` 默认 0.6;`cut` / `none` 为 0。旧页保持不透明、新页覆盖淡入,所有类型都不改变照片几何尺寸 |
| `motion.type` | string | v1 兼容字段,历史值为 `"kenburns"` \| `"none"`;现已废弃且渲染器不再消费。新 planner 固定写 `"none"` |
| `motion.from` / `motion.to` | float | v1 兼容占位,历史值继续允许但不影响渲染。新 planner 固定写 `1.0` / `1.0` |

## subtitles[]

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| `text` | string | 单行歌词 |
| `lang` | string | `ja` \| `zh` \| `en` \| `mixed` — 决定字体路由 |
| `start` / `end` | float | 秒,来自用户 LRC 或 Whisper 段时间戳 |
| `confidence` | float | LRC 固定为 `1.0`;Whisper 使用识别置信度。渲染层按阈值(默认 0.6)兜底过滤 |

允许时间空洞(间奏):无字幕覆盖的时段字幕轨整体淡出留白。

## beats(可选)

```jsonc
{ "bpm": 118.4, "downbeats": [0.51, 2.54, 4.57] }
```

## Fixture

`examples/fixture/` 内有默认 timeline 与生成素材,用于 Studio 预览和渲染回归检查。
