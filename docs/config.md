# tsuzuri.toml 配置参考

在素材文件夹根目录放置 `tsuzuri.toml` 即可覆盖默认值。配置文件计入 input hash，修改后重跑会自动重新分析和规划，无需清理缓存。

配置必须使用顶层平铺的 `key = value`，不支持 `[table]` 或多行字符串。未知键会在终端警告后忽略；`motion`、`kenburns_from` 和 `kenburns_to` 已弃用。

## 画布与输出

| 键 | 默认值 | 说明 |
| --- | --- | --- |
| `width` | `1920` | 输出宽度（px） |
| `height` | `1080` | 输出高度（px） |
| `fps` | `60` | 帧率；设为 30 可明显缩短渲染时间 |
| `background` | `"#FFFFFF"` | 画布底色，支持 `#RGB` / `#RRGGBB`；深色会自动切换配色；命令行 `--dark` 可一次性覆盖为黑底 |
| `photo_scale` | `0.8` | 照片安全框占画布的比例（0–1） |

## 切换与节奏

| 键 | 默认值 | 说明 |
| --- | --- | --- |
| `transition` | `"album"` | `album`（覆盖淡入）、`cut`（硬切）或 `crossfade` |
| `album_fade` | `0.4` | album 过渡时长（秒） |
| `crossfade` | `0.6` | crossfade 过渡时长（秒） |
| `min_gap` | `2.0` | 相邻切换点最小间隔（秒） |
| `flash_avg_threshold` | `2.0` | 平均每张展示低于此值时进入逐拍快闪模式 |
| `flash_min_gap` | `0.8` | 快闪模式的最小切换间隔（秒） |
| `pacing` | `"dynamic"` | `dynamic` 按逐拍能量调整切换密度；`uniform` 严格使用原均匀网格 |
| `trim` | `"auto"` | `"auto"` 自动裁剪、`"full"` 播完整首歌，或填正数秒数并吸附到最近重拍 |
| `trim_avg_threshold` | `10.0` | `trim = "auto"` 时，平均每张展示超过此值才裁短歌曲 |
| `trim_target_avg` | `8.0` | `trim = "auto"` 时，裁歌后的目标平均每张展示时长（秒） |

首次触发自动裁剪时，交互终端会询问接受裁剪还是播放完整首歌，并将选择写入
`output/metadata/preferences.json`，之后不再重复询问；程序不会改写 `tsuzuri.toml`。优先级为
`--trim`、`tsuzuri.toml` 的 `trim`、已保存偏好、默认 `auto`。管道和脚本保持自动行为、不进入问答。

命令行 `--trim auto|full|秒数` 可仅覆盖本次运行；例如：

```bash
tsuzuri ./osaka-trip --trim full
tsuzuri ./osaka-trip --trim 120
```

`--portrait`（1080×1920）和 `--square`（1080×1080）是一次性渲染预设，互斥，优先于 TOML 的 `width`/`height`，但不写回 `timeline.json`。不带预设时仍完全沿用 TOML 画布设置；`still` 也支持这两个参数。

`chapters = false` 可关闭跨天照片自动插入的日期章节卡；默认开启，且仅在所有照片都有可解析 EXIF 拍摄日期时生效。

`pacing = "dynamic"`（默认）按逐拍能量调整照片切换密度，副歌偏密、主歌偏疏；`pacing = "uniform"` 可严格回退到原均匀网格。快闪模式始终使用 uniform。

## 字幕与识别

| 键 | 默认值 | 说明 |
| --- | --- | --- |
| `subtitles` | `true` | 字幕轨开关；`false` 会在规划时清空字幕，不影响前置音频分析 |
| `demucs` | `true` | 低置信度时尝试人声分离后重新识别；需安装 `separation` 依赖 |

安装人声分离支持：`cd analyzer && uv sync --extra separation`。

## 片头与片尾

只有显式配置的键会写入 `timeline.json`；其余使用渲染器默认值。

| 键 | 默认值 | 说明 |
| --- | --- | --- |
| `outro_text` | `"Thanks for watching :)"` | 片尾文案；设为 `""` 可隐藏 |
| `signature` | *内置* | 素材文件夹内签名 SVG 的相对路径 |
| `intro` | `true` | 片头开关；`false` 时不预留或渲染片头 |

`signature` 同时用于视频片头、`still --sign` 以及视频渲染的 `--sign` 落款。`--sign` 仍需在命令行或菜单中显式启用。

### 自定义签名 SVG 约束

- 必须包含 `viewBox`，且只使用转换为轮廓的 `<path>`
- 使用单色填充；渲染时统一转换为 `currentColor`
- 多个 path 会并行书写
- 文件缺失或解析失败会终止运行

## 示例

```toml
fps = 30
background = "#000000"
photo_scale = 0.85
transition = "crossfade"
trim = "full"
subtitles = false
outro_text = "谢谢观看"
signature = "signature.svg"
intro = false
```
