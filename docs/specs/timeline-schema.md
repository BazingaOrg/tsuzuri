# timeline.json Schema v1(阶段契约,已冻结)

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
| `audio` | string | 音频路径,相对 timeline.json 所在目录 |
| `duration` | float | 成片总时长(秒),= 音频时长(或裁剪后时长) |
| `width` / `height` | int | 默认 1920 × 1080 |
| `fps` | int | 默认 **60**(冻结视觉规格;计划文档示例中的 30 为占位值) |
| `background` | string | 默认 `#FFFFFF` |
| `photo_scale` | float | 默认 `0.8`,照片安全框占画布比例 |
| `input_hash` | string? | M3 起写入:输入素材 hash,用于区分"手改 timeline"与"素材变了" |

## photos[]

按 `start` 升序;首张 `start = 0`,末张 `end = meta.duration`。
相邻两张区间衔接:`photos[i].end == photos[i+1].start`。

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| `src` | string | 图片路径,相对 timeline.json 所在目录 |
| `start` / `end` | float | 秒。**含 crossfade 前沿**:切换点 = 淡化中点,即上一张 `end` 与本张 `start` 都等于对齐节拍的时间点,淡化区间为 `[start - d/2, start + d/2]` |
| `transition.type` | string | `"crossfade"` \| `"none"`(首张为 `"none"` 或省略) |
| `transition.duration` | float | 秒,默认 0.6 |
| `motion.type` | string | `"kenburns"` \| `"none"` |
| `motion.from` / `motion.to` | float | 缩放系数,默认 1.0 → 1.035,线性随停留时长拉伸 |

## subtitles[]

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| `text` | string | 单行歌词 |
| `lang` | string | `ja` \| `zh` \| `en` \| `mixed` — 决定字体路由 |
| `start` / `end` | float | 秒,来自 Whisper 段时间戳 |
| `confidence` | float | Whisper 段置信度;渲染层按阈值(默认 0.6)过滤 |

允许时间空洞(间奏):无字幕覆盖的时段字幕轨整体淡出留白。

## beats(可选)

```jsonc
{ "bpm": 118.4, "downbeats": [0.51, 2.54, 4.57] }
```

## Fixture

`examples/fixture/` 内有手写 timeline + 生成素材,是 M1 渲染端的验收输入。
