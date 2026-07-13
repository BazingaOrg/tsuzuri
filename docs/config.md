# tsuzuri.toml 配置参考

在素材文件夹根目录放一份 `tsuzuri.toml` 即可覆盖默认值。该文件计入 input hash:改动配置后重跑会自动重新分析和规划,无需手动清缓存。

配置必须使用顶层平铺的 `key = value` 形式,不要使用 `[table]` 或多行字符串(still 的轻量读取器与 analyzer 的 tomllib 共同遵守此约束)。未知配置键会在终端警告后忽略;`motion` / `kenburns_from` / `kenburns_to` 已弃用(照片保持静止展示)。

## 画布与输出

| 键 | 默认值 | 说明 |
| --- | --- | --- |
| `width` | `1920` | 输出宽度(px) |
| `height` | `1080` | 输出高度(px) |
| `fps` | `60` | 帧率;渲染耗时与其近似成正比,接受 30fps 可显著提速 |
| `background` | `"#FFFFFF"` | 画布底色;请用 hex(`#RGB` / `#RRGGBB`),深色背景会自动切换暗厅文字与光影色板 |
| `photo_scale` | `0.8` | 照片安全框占画布的比例(0–1) |

## 切换与节奏

| 键 | 默认值 | 说明 |
| --- | --- | --- |
| `transition` | `"album"` | 照片过渡:`album`(覆盖淡入,默认)/ `cut`(硬切)/ `crossfade` |
| `album_fade` | `0.4` | album 过渡时长(秒) |
| `crossfade` | `0.6` | crossfade 过渡时长(秒) |
| `min_gap` | `2.0` | 相邻切换点最小间隔(秒) |
| `flash_avg_threshold` | `2.0` | 人均展示低于此值(秒)进入快闪模式:逐拍切换 |
| `flash_min_gap` | `0.8` | 快闪模式下的最小切换间隔(秒) |
| `trim_avg_threshold` | `10.0` | 人均展示超过此值(秒)时裁短歌曲 |
| `trim_target_avg` | `8.0` | 裁歌后的目标人均展示时长(秒) |

## 字幕与识别

| 键 | 默认值 | 说明 |
| --- | --- | --- |
| `subtitles` | `true` | 字幕轨总开关;关掉后既不识别也不渲染 |
| `demucs` | `true` | Whisper 识别置信度低时,是否尝试 demucs 人声分离后重识别一次(需 `cd analyzer && uv sync --extra separation`) |

## 片头 / 片尾(branding)

仅显式配置的键写入 `timeline.json` 的 `meta.branding`;不配置时由渲染器内置默认值负责,避免两份默认文案漂移。

| 键 | 默认值 | 说明 |
| --- | --- | --- |
| `outro_text` | `"Thanks for watching :)"` | 片尾谢幕语;设为 `""` 隐藏文案(片尾白场时长不变) |
| `signature` | *(内置)* | 素材文件夹内的签名 SVG 相对路径;缺省用内置 Sacramento 手写签名 |
| `intro` | `true` | 片头总开关;`false` 时 plan 不预留片头时长,渲染器不挂载片头 |

`signature` 同时供视频片头与 `tsuzuri still --sign` 使用:无 EXIF 时落款位于照片下方留白,有 EXIF 时位于展签面板底部。`--sign` 是 still 的显式开关,不写入 toml。

### 自定义签名 SVG 约束

- 轮廓填充型路径(与内置字形同型),单色;`fill` 任意(渲染时强制 `currentColor`)
- **必须有 `viewBox`**;只识别 `<path>`(若含 text/rect 等请先转路径)
- 多笔画会**并行**书写,总时长不变
- 文件缺失或解析失败会**报错终止**,不静默回退内置签名

## 示例

```toml
# osaka-trip/tsuzuri.toml
fps = 30                 # 提速:渲染时间近似减半
background = "#000000"   # 黑底会自动使用暖纸白文字、亮描边与低强度暖光晕
photo_scale = 0.85
transition = "crossfade"
subtitles = false        # 纯音乐相册,不要字幕
outro_text = "谢谢观看"
signature = "signature.svg"
# intro = false          # 不要片头
```
