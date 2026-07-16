# 性能优化

## 原则

先测量后优化。耗时大头预期在:Whisper 识别、librosa 节拍分析、Remotion 逐帧渲染。
Whisper 后端已是 mlx / faster-whisper(见 `whisper_backend.py`)，不在本轮范围。
CLI / plan 本身毫秒级，不动。

## 阶段 0:测量基线

对 examples 典型素材夹各阶段计时(analyze / plan / bundle / render / loudnorm)，
记录到本文档的实现笔记节。改动最小的做法:`tsuzuri.mjs` 各 `term.start/success`
处已有阶段边界，临时打点或直接 `time` 分段跑即可，不引入常驻计时代码。

## P1:analyze 缓存拆分(预期收益最大的迭代场景优化)

现状:`input_hash` 覆盖 audio + photos + toml + lrc，任何变化整体重跑
analyze(`tsuzuri.mjs:132-159`)。但加/删照片不需要重跑 Whisper 与节拍 —— 音频没变。

设计:

- 新增 `audioHash = computeInputHash(folder, [audio, lyrics?].filter(Boolean))`
  (demucs 开关影响 lyrics 结果，故 toml 存在时把其中 `demucs` 键值折入 hash 输入，
  不折整份 toml —— photo_scale 等键与 analyze 无关)。
- analyze 成功后 CLI 写 `metadata/analysis.json`: `{"version": 1, "audio_hash": "..."}`。
- 跳过条件从"timeline.input_hash 相同"改为:
  `analysis.json.audio_hash === audioHash && beats.json 存在 &&(lrc 或 lyrics.json 存在)`。
- timeline 的 `input_hash` 语义不变(整体素材 hash，供 plan 手改保护用)。
- 现有"输入完全未变 → 跳过 analyze"路径被新条件自然覆盖(音频没变即跳过)，
  timeline 级 hash 仍控制 plan 是否需要输出新结果。

→ verify: `cli` 单测(加照片 → 跳过 analyze 只重跑 plan;换音频 → 全量重跑;
无 analysis.json 的旧项目 → 重跑一次后补上)。手动:examples 素材夹加一张照片,
第二次运行不出现 "分析音频" 阶段。

## P2:渲染参数(改动最小)

`cli/render.mjs`(still 的对应参数一并核对):

- `concurrency`: 显式设为 `os.cpus().length - 1`(Remotion 默认为核数一半)。
  在 M 系列 Mac 上通常是免费提速;若测量显示内存压力再回调。
- `jpegQuality: 100 → 90`:这是帧从浏览器到编码器的中间传输质量,90 与 100
  成片肉眼无差,编码/传输开销显著下降。`crf: 16` 保持(最终质量不降)。
- 新增 `--draft` 快速预览:`scale: 2/3`(1080p→720p)、`crf: 23`、
  `jpegQuality: 80`,输出文件名追加 `-draft`,并跳过响度归一。
  透传链:`options.mjs` → `tsuzuri.mjs` → `render.mjs`。fps 不动
  (fps 在 timeline/composition 里,draft 不该改变 plan 产物)。

→ verify: 基线素材夹分别用旧参数 / 新参数 / draft 各渲一次,记录耗时;
目测抽帧对比确认无可见质量退化;`npm --prefix cli test`。

## P3:大图预缩放(收益依测量而定,最后做)

现状:手机原图(4000×3000 级)直接进 Chromium,每帧解码大图。

设计:

- 渲染前用 `sharp`(加入 cli 依赖)把超过阈值的图缩放:长边上限
  `max(width, height) × 2`(1080p 即 3840,留足 photo_scale 内的清晰度余量),
  `rotate()` 处理 EXIF 方向,输出高质量 JPEG/原格式。
- 缓存目录 `metadata/cache/resized/`,文件名带内容 hash,命中即复用。
- 渲染时组一个临时 public 目录:缩放图 + 原样 symlink 音频/签名等其余文件,
  timeline 的 `src` 相对路径保持不变(目录结构镜像)。
- EXIF 展签提取(`render.mjs applyRenderVariants`)继续读原图,不受影响。
- 若 P0 测量显示解码不是瓶颈(照片少/本来就小),此项搁置。

→ verify: 大图素材夹渲染耗时对比;成片抽帧目测;缩放缓存二次运行命中;
`still` 路径不受影响(仍读原图或同样受益,实现时定,倾向 still 不接入保持简单)。

## 执行顺序

1. [x] 阶段 0 测量,数据记入本文档
2. [x] P1 缓存拆分 → 单测 + 手动验证
3. [x] P2 渲染参数与 --draft → 耗时对比 + 质量目测
4. [x] P3 预缩放(视测量结果决定做不做)
5. [x] 全量:`npm --prefix cli test`、`uv run --project analyzer pytest`、
   端到端渲一次 examples

## 风险

- concurrency 拉满可能在低内存机器上 OOM Chromium —— 保留 `TSUZURI_CONCURRENCY`
  环境变量逃生口(仅环境变量,不进 toml,避免配置面膨胀)。
- jpegQuality 降档理论上影响画质 —— 用抽帧对比守门,有异议就回 95。
- P3 引入 sharp 原生依赖,`doctor` 需能诊断安装失败;这也是搁置它的理由之一。

## 实施笔记

### 阶段 0 与 P2 测量

环境：Apple Silicon、10 个逻辑 CPU；复制 `examples/fixture` 到 `/tmp` 并把三张照片
放到素材根目录。音频 30 秒，图片长边分别为 1600、1350、1920px。单次同机测量：

| 阶段/参数 | wall time | 备注 |
| --- | ---: | --- |
| analyze | 4.24s | mlx / medium，本地模型，demucs 未安装 |
| plan | 0.06s | 3 张照片 |
| bundle | 0.76s | 单独调用 `bundleRenderer` |
| 旧 render 总计 | 31.39s | 默认并发、JPEG 100、1080p |
| 新 render 总计 | 23.61s | 并发 9、JPEG 90、1080p；比旧参数快约 24.8% |
| draft render 总计 | 12.33s | 720p、CRF 23、JPEG 80；比旧参数快约 60.7% |
| loudnorm 编码 | 1.06s | 单独 FFmpeg loudnorm 音频重编码，视频 copy |

`ffprobe` 确认三份视频均为 60fps、30.059s 且含 AAC 音轨；旧版与新版默认均为
1920×1080，draft 为 1280×720。固定 12 秒抽帧并排目测：JPEG 90 与旧 JPEG 100
无可见差异；draft 放大对比只有预期的轻微清晰度下降，作为预览可接受。

### 实际实现

- 新增 `metadata/analysis.json` 和独立 analysis hash。hash 只覆盖音频、可选 LRC、
  规范化 `demucs` 布尔值、实际 Whisper backend/model、demucs 可用性与缓存版本；照片和其他 TOML
  配置不参与。manifest 仅在 analyzer 成功且 beats/lyrics 两份 JSON 有效后原子写入，
  cache miss 会先删除旧 manifest，防止失败运行留下可误命中的状态。
- 与原计划一处安全偏差：命中缓存必须同时存在且可解析 `beats.json`、`lyrics.json`，
  不能用“有 LRC”替代生成的 lyrics。planner 只读取 `metadata/lyrics.json`；按原条件会在
  生成文件丢失时静默丢字幕。
- 默认渲染显式使用 `CPU 数 - 1` 并发和 JPEG 90；`TSUZURI_CONCURRENCY` 接受正整数
  或 `1%-100%`。draft 使用 2/3 scale、CRF 23、JPEG 80，默认文件名追加 `-draft`，
  跳过响度归一。still 输出 PNG 单帧且已有独立 `--scale`，无需套用视频参数。
- P3 决定搁置：当前基准图最大长边 1920px，低于 1080p 输出对应的 3840px 预缩放阈值，
  无法测出任何收益；在没有代表性的 4000×3000+ 手机照片组前，不引入 sharp、缓存目录、
  临时 public 镜像和 doctor 诊断复杂度。
- 真实 CLI 冒烟先生成 `analysis.json` 和 draft，随后新增一张照片再次运行；第二次输出
  “音频和歌词未变,跳过音频分析”，只执行 plan/render，默认 draft 文件名追加 `-draft`，
  终端明确显示跳过响度归一。生成视频经 ffprobe 验证为 1280×720 / 60fps。

## 复核记录

- analysis cache 将算法版本作为显式 epoch；未来分析算法、默认模型或后端选择策略变化时需
  bump `ANALYSIS_CACHE_VERSION`。自动后端或 demucs 安装状态变化不在本轮 hash 范围内。
- 数字形式的 `TSUZURI_CONCURRENCY` 必须转成 Number；直接把字符串 `"4"` 传给 Remotion
  会按百分比字符串解析。实现已区分整数与百分比并拒绝非法值。
- review 发现容器 CPU 配额、低百分比并发和运行环境变化后的缓存命中问题。默认并发改用
  `os.availableParallelism()`（旧 Node 回退 `os.cpus()`）；百分比先按有效 CPU 数换算并至少为 1；
  analyzer 新增轻量 fingerprint，缓存会跟随实际 Whisper backend/model 与 demucs 安装状态失效。
- 最终独立 QA：CLI 138/138、analyzer 103/103、renderer 类型检查、三个 Node 入口语法检查
  及 `git diff --check` 全部通过；真实 CLI draft 渲染与新增照片后的缓存命中也已验证。
