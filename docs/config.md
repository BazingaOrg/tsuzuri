# tsuzuri.toml 配置参考

在素材文件夹根目录放一份 `tsuzuri.toml` 即可覆盖默认值。该文件计入 input hash:改动配置后重跑会自动重新分析和规划,无需手动清缓存。

未知配置键会在终端警告后忽略;`motion` / `kenburns_from` / `kenburns_to` 已弃用(照片保持静止展示)。

## 画布与输出

| 键 | 默认值 | 说明 |
| --- | --- | --- |
| `width` | `1920` | 输出宽度(px) |
| `height` | `1080` | 输出高度(px) |
| `fps` | `60` | 帧率;渲染耗时与其近似成正比,接受 30fps 可显著提速 |
| `background` | `"#FFFFFF"` | 画布底色 |
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

## 示例

```toml
# osaka-trip/tsuzuri.toml
fps = 30                 # 提速:渲染时间近似减半
photo_scale = 0.85
transition = "crossfade"
subtitles = false        # 纯音乐相册,不要字幕
```
