# tsuzuri.toml 配置参考

在素材文件夹根目录放置 `tsuzuri.toml` 即可覆盖默认值。配置文件计入 input hash，修改后重跑会自动重新分析和规划，无需清理缓存。

配置必须使用顶层平铺的 `key = value`，不支持 `[table]` 或多行字符串。未知键会在终端警告后忽略；`motion`、`kenburns_from` 和 `kenburns_to` 已弃用。

## 画布与输出

| 键 | 默认值 | 说明 |
| --- | --- | --- |
| `width` | `1920` | 输出宽度（px） |
| `height` | `1080` | 输出高度（px） |
| `fps` | `60` | 帧率；设为 30 可明显缩短渲染时间 |
| `background` | `"#FFFFFF"` | 画布底色，支持 `#RGB` / `#RRGGBB`；深色会自动切换配色 |
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
| `trim_avg_threshold` | `10.0` | 平均每张展示超过此值时裁短歌曲 |
| `trim_target_avg` | `8.0` | 裁歌后的目标平均每张展示时长（秒） |

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

`signature` 同时用于视频片头和 `still --sign`。`--sign` 仍需在命令行显式启用。

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
subtitles = false
outro_text = "谢谢观看"
signature = "signature.svg"
intro = false
```
