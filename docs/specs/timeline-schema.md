# timeline.json Schema v1

`output/metadata/timeline.json` 是 Python analyzer/planner 与 Remotion renderer 之间的阶段契约。`photos` 和 `subtitles` 是相互独立的时间线。

字段变更时应同步更新本文档、planner 输出和 renderer 类型。

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
| `version` | int | 固定为 `1` |
| `audio` | string | 相对素材根目录的音频路径 |
| `duration` | float | 成片总时长（秒），可能短于原音频 |
| `width` / `height` | int | 默认 1920 × 1080 |
| `fps` | int | 默认 60 |
| `background` | string | 默认 `#FFFFFF` |
| `photo_scale` | float | 默认 `0.8`，照片安全框占画布的比例 |
| `trim` | object | 本次歌曲裁剪决策的说明元数据 |
| `trim.mode` | string | `auto`、`full` 或 `seconds` |
| `trim.applied` | bool | 是否实际缩短了歌曲时间线 |
| `trim.full_duration` | float | 原歌曲总时长（秒） |
| `trim.trimmed_duration` | float | 本次规划采用的时长（秒）；未裁剪时等于原时长 |
| `input_hash` | string? | CLI 计算的素材与配置摘要，用于判断输入是否变化 |
| `plan_checksum` | string? | planner 计算的文档摘要，用于识别手动编辑并决定是否刷新时间线 |
| `branding` | object? | 用户显式配置的片头与片尾设置 |
| `branding.outro_text` | string? | 片尾文案；空串隐藏，缺省使用渲染器默认值 |
| `branding.signature` | string? | 签名 SVG 相对素材根目录的路径 |
| `branding.intro` | bool? | 片头开关，缺省为 `true` |

## photos[]

按 `start` 升序；首张 `start = 0`，末张 `end = meta.duration`，相邻照片的 `end` 与 `start` 相等。

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| `src` | string | 相对素材根目录的图片路径 |
| `start` / `end` | float | 可见区间（秒）；边界是对齐节拍的切换中点 |
| `transition.type` | string | `album`、`crossfade`、`cut` 或 `none`；首张为 `none` |
| `transition.duration` | float | 过渡时长（秒）；`cut` 和 `none` 为 0 |
| `motion.type` | string | v1 兼容字段；新 planner 固定写 `none`，renderer 不再消费 |
| `motion.from` / `motion.to` | float | v1 兼容字段；新 planner 固定写 `1.0` |

## subtitles[]

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| `text` | string | 单行歌词 |
| `lang` | string | `ja` \| `zh` \| `en` \| `mixed` — 决定字体路由 |
| `start` / `end` | float | 来自 LRC 或 Whisper 的时间戳（秒） |
| `confidence` | float | LRC 固定为 `1.0`；Whisper 使用识别置信度，低于 0.6 的行通常已在规划阶段过滤 |

字幕时间线允许空洞，无字幕覆盖时保持留白。

## beats(可选)

```jsonc
{ "bpm": 118.4, "downbeats": [0.51, 2.54, 4.57] }
```

## Fixture

`examples/fixture/` 包含 Studio 预览和渲染回归使用的示例时间线与素材。
