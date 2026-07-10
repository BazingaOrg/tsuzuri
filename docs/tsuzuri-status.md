# tsuzuri — 跨会话状态

> Owner: orchestrator。新 session 从本文件重建上下文,不依赖对话摘要。
> 总计划见 [tsuzuri-implementation-plan.md](./tsuzuri-implementation-plan.md)。

## 任务板

| 里程碑 | 状态 | 完成 commit | 备注 |
| ------ | ---- | ----------- | ---- |
| M0 契约先行 | done | 800d711 | schema 文档 + fixture |
| M1 渲染端 | done | ccb1d78 | 关键帧检查通过;待用户对照剪映旧成片校调阴影/字幕参数 |
| M2 音频分析 | done | d921c4b | 120BPM click track 检出 120.19;待真实歌曲实测(M2 验收项) |
| M3 分配算法 + CLI | done | 39e8800 | 14 单测过;E2E `tsuzuri <folder>` 已跑通 |
| M4 歌词字幕 | done | d315599 | mlx 后端实测(合成语音 3 段 + 纯音乐 0 段);待中/日/英真歌验收 |
| M5 边界打磨 | done* | — | 裁歌、快闪、损坏图跳过、README 完成;*真实素材阈值调优待用户 |

## 关键决策(计划文档之外新增)

- **fps = 60**:计划文档第二节(已冻结视觉规格)写 60fps,第三节 schema 示例写 30 — 按冻结规格取 60 为默认,`meta.fps` 仍可覆盖。
- fixture 素材用 ffmpeg 本地生成(渐变测试图 ×3,含一张竖图;30s 正弦音),不引入外部版权素材。
- analyzer 已 pin Python 3.11–3.12(numba 不支持 3.14),uv 自动解析。
- 字体经 webpack asset 打进 bundle 而非 public dir:渲染时 `--public-dir` 指向用户素材文件夹,public dir 不能存字体。
- downbeat 为 MVP 启发式(4 拍相位取 onset 强度和最大者),madmom 升级路径保留。
- 音频裁剪(图少歌长)= 把 `meta.duration` 设为目标重拍处即可,渲染端已按 duration 收尾淡出,无需真裁音频文件(M5 实现)。
- CLI 为 Node 零依赖脚本(`cli/tsuzuri.mjs`),经 `uv run --project analyzer` 调 Python 两阶段,再 cwd=renderer 调 remotion render。
- input_hash:CLI 用 sha256(文件名+内容)前 16 位计算并传给 plan.py 写入 meta;比较逻辑在 CLI。

## 待办 / 已知问题

- M1 视觉验收最后一步(对照用户剪映旧成片调阴影、字幕基线 `descentRatio`)只能由用户做。
- M2 验收项:用 3–5 首真实歌曲实测节拍准确度,不准的记录作为 madmom 升级依据。
- M4 验收剩余:用中/日/英各一首真实歌曲验证(需要用户素材);demucs 未实测(需 `uv sync --extra separation` + 一首人声弱的歌)。
- M5 剩余:快闪/裁剪阈值用真实素材调优;examples 目前只有生成的 fixture,可补一组真实示例照片 + 无版权音乐。
- Whisper 模型可用 `TSUZURI_WHISPER_MODEL=tiny|small|medium` 临时覆盖(调试用)。
- Review 遗留(advisory,未修):吸附无距离上限(候选极稀时会吸到很远的拍点,DP 升级时一并解决);EXIF 排序是全有全无策略;信息条(INFO_BAR)常量已定义但渲染未实现(默认关,M6);HF 连通性探测用 urllib,SOCKS-only 环境会误切镜像(镜像可用,无害)。
- beat_alloc 约束优先级:所有间隔约束 > 切换点数量,塞不下时丢弃尾部照片(2026-07-10 review 修复了回退分支违反 min_gap 的 bug)。
- 本机环境有 SOCKS 代理,已加 `httpx[socks]` 依赖(顺带惠及代理用户)。

## 环境

- Apple Silicon (arm64), macOS 26.4
- Node 22.18 / npm 10.9 / Python 3.14.6 / uv 0.9.29 / FFmpeg 8.1.1
