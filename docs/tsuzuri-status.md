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
| M4 歌词字幕 | pending | — | Whisper backend resolver + faster-whisper/mlx |
| M5 边界打磨 | pending | — | 裁歌策略、异常输入、README、examples |

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
- M4:Whisper resolver(mlx / CUDA / CPU int8)+ HF 镜像连通性检测 + demucs fallback;faster-whisper 需另开依赖组(或独立 venv),避免拖累纯节拍路径。
- M5:图少歌长裁剪、异常输入(损坏图片等)、examples 完整示例、双语 README。

## 环境

- Apple Silicon (arm64), macOS 26.4
- Node 22.18 / npm 10.9 / Python 3.14.6 / uv 0.9.29 / FFmpeg 8.1.1
