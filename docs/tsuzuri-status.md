# tsuzuri — 跨会话状态

> Owner: orchestrator。新 session 从本文件重建上下文,不依赖对话摘要。
> 总计划见 [tsuzuri-implementation-plan.md](./tsuzuri-implementation-plan.md)。

## 任务板

| 里程碑 | 状态 | 完成 commit | 备注 |
| ------ | ---- | ----------- | ---- |
| M0 契约先行 | done | 800d711 | schema 文档 + fixture |
| M1 渲染端 | done | ccb1d78 | 固定照片尺寸、三层阴影与字幕视觉规格已落地;待用户用真实素材做最终视觉验收 |
| M2 音频分析 | done | d921c4b | 120BPM click track 检出 120.19;待真实歌曲实测(M2 验收项) |
| M3 分配算法 + CLI | done | 39e8800 | 14 单测过;E2E `tsuzuri <folder>` 已跑通 |
| M4 歌词字幕 | done | d315599 | Whisper + 用户 LRC 双入口;mlx 后端实测(合成语音 3 段 + 纯音乐 0 段);待真歌验收 |
| M5 边界打磨 | done* | — | 裁歌、快闪、损坏图跳过、README 完成;*真实素材阈值调优待用户 |

## 关键决策(计划文档之外新增)

- **fps = 60**:默认按 60fps 渲染,`meta.fps` 仍可覆盖。
- fixture 素材用 ffmpeg 本地生成(渐变测试图 ×3,含一张竖图;30s 正弦音),不引入外部版权素材。
- analyzer 已 pin Python 3.11–3.12(numba 不支持 3.14),uv 自动解析。
- 字体经 webpack asset 打进 bundle 而非 public dir:渲染时 `--public-dir` 指向用户素材文件夹,public dir 不能存字体。
- downbeat 为 MVP 启发式(4 拍相位取 onset 强度和最大者),madmom 升级路径保留。
- 音频裁剪(图少歌长)= 把 `meta.duration` 设为目标重拍处即可,渲染端已按 duration 收尾淡出,无需真裁音频文件(M5 实现)。
- CLI 为 Node 零依赖脚本(`cli/tsuzuri.mjs`),经 `uv run --project analyzer` 调 Python 两阶段,再 cwd=renderer 调 remotion render。
- input_hash:CLI 用 sha256(文件名+内容)前 16 位计算并传给 plan.py 写入 meta;比较逻辑在 CLI。

## 待办 / 已知问题

- M1 视觉验收最后一步需要用用户真实素材检查三层阴影、横竖图和字幕带位置。
- M2 验收项:用 3–5 首真实歌曲实测节拍准确度,不准的记录作为 madmom 升级依据。
- M4 验收剩余:用中/日/英各一首真实歌曲验证(需要用户素材);demucs 未实测(需 `uv sync --extra separation` + 一首人声弱的歌)。
- Windows:代码层面兼容(faster-whisper CPU/CUDA 路径、npx 坑已修 9e09165),未真机实测;最可能的坑:CJK/空格路径、demucs 的 torch 安装。
- M5 剩余:快闪/裁剪阈值用真实素材调优;examples 目前只有生成的 fixture,可补一组真实示例照片 + 无版权音乐。
- Whisper 模型可用 `TSUZURI_WHISPER_MODEL=tiny|small|medium` 临时覆盖(调试用)。
- Review 遗留(advisory,未修):EXIF 排序是全有全无策略;信息条(INFO_BAR)常量已定义但渲染未实现(默认关,M6);HF 连通性探测用 urllib,SOCKS-only 环境会误切镜像(镜像可用,无害)。
- beat_alloc 约束优先级:所有间隔约束 > 切换点数量,塞不下时丢弃尾部照片(2026-07-10 review 修复了回退分支违反 min_gap 的 bug)。
- 歌词长段按词级时间戳拆行(上限 30 全角等效),断点优先乐句边界:词间停顿 ≥0.3s / 下一词大写开头(排除恒大写 "I")/ 标点收尾;渲染端另有超宽缩字号兜底。
- 成片响度归一:CLI 渲染后用 ffmpeg loudnorm 两遍法(linear=true 纯增益)统一到 -14 LUFS / TP -1.5dB,源已达标(±1 LU 且 TP ≤ -1)则跳过;视频流 copy 不重编码。
- 视觉规格第四次修订(2026-07-11,owner 选择 B):照片继续静止 fit 进默认 80% 安全框;切换改为旧页不透明、新页整体覆盖淡入,消除白底泄漏。阴影改为左上入光、向右下延伸的暖色三层展陈阴影。字幕改为 36px / 500 / #37332D,只保留克制的淡化和 6px/4px 位移,移除模糊。
- 产物目录修订(2026-07-11):JSON 统一写入素材目录下 `metadata/`,默认 MP4 写入 `output/`;`-o` 继续覆盖。根目录旧 JSON 安全复制,原文件保留;不自动迁移短暂使用过的 `tsuzuri/` 目录。
- 用户歌词入口(2026-07-11):素材目录自动识别唯一 `.lrc`,优先于 Whisper 并纳入 input hash;支持 UTF-8/BOM、常用行时间戳、多时间戳、offset、元数据与空白清字幕边界。
- 终端输出统一使用语义圆点:`●` 默认色表示信息,橙色 `#D97757` 表示阶段开始,绿色表示成功,黄色表示提醒,红色表示错误;次级详情使用调暗的 `└`。warn/error 写 stderr,其余写 stdout;`NO_COLOR`、`TERM=dumb` 或非 TTY 时不输出 ANSI 颜色,多行消息逐行重复前缀。
- Remotion 渲染改走公开的 bundler/renderer API,终端以固定宽度百分比分别显示打包、帧渲染和视频编码进度,移除波动的 ETA 秒数;非 TTY 仅输出 25% 里程碑。
- 字幕置信度过滤(0.6)移到 plan 层并明确打印被滤行数,timeline.json 所见即所得;渲染层同阈值兜底。
- 本地模型约定目录 `models/whisper-<size>-mlx`(gitignore),`TSUZURI_WHISPER_MODEL` 可指定尺寸或路径。
- 本机环境有 SOCKS 代理,已加 `httpx[socks]` 依赖(顺带惠及代理用户)。
- 视觉规格第五次修订(2026-07-11):照片阴影从暖棕改为中性冷黑三层(`rgba(10,12,16,…)`,α 0.32/0.28/0.18,垂直入光),白底上不再偏黄;描边同步中性化。渲染质量:中间帧 `jpegQuality: 100`、输出 `crf: 16`(此前走 Remotion 默认 80/18);音频仍为 AAC 320k 默认。
- CLI 子命令(2026-07-11):新增 `tsuzuri doctor`(秒级预检 node/uv/ffmpeg/渲染器依赖,analyzer venv 仅提示;不联网、不触发 uv sync)与 `tsuzuri lyrics <folder>`(analyzer 新增 `--lyrics-only`,跳过节拍分析仅识别歌词,LRC 分支用 `librosa.get_duration` 取时长;终端预览含置信度,<0.6 标记为不会渲染)。路由规则:首 token 恰为 `doctor`/`lyrics` 即子命令,路径前缀(`./lyrics`)转义;日常命令 `tsuzuri <folder>` 行为不变。CLI 测试 15→27,analyzer 39→41。
- README 重写(2026-07-11):标语纳入歌词;去除全文中英双份句(标题双语 + 正文中文);新增 kami 风格架构图 `docs/assets/architecture.svg` 与 Showcase 截图占位(待用户提供);LRC/目录约定折叠进 `<details>`;辅助命令单列一节。
- 片头片尾(2026-07-11,替代右下角常驻签名):片头 = 白画布居中"写"签名——轮廓填充路径无笔画骨架,用 12% 羽化渐变遮罩沿 100° 书写轴揭开(deep-reasoner 裁定硬边 clip 会暴露连笔笔顺错位),1.4s 写 + 0.7s 停 + 0.5s 卡片淡出;第一张照片可见时长不足(photos[0].end < 3.4s)自动跳过。片尾 = Sacramento 字体 "Thanks for watching" 随白场过半淡入。ANIMATION 拆分:audioFadeDuration 1.5s / whiteFadeDuration 2.5s(白场更长给谢幕语留时间,音频淡出不变)。Sacramento-Regular.ttf(OFL,静态字重,fonts.ts 用 truetype 格式注册)+ OFL-Sacramento.txt 入库。Signature.tsx 改纯展示组件(viewBox 内聚,定位配色由使用方给)。
- 个人签名落款(2026-07-11):Sacramento 手写 SVG 转实心路径内联为 Signature.tsx(方案 A,渲染器内置),常驻右下角(1080p 基准高 56px、边距 48px、#8F8C85 80% 透明),层级在片尾白场之上——淡白后落款保留。SVG 原件字形 bbox 为 viewBox "2 2 320 129"(宽高比 2.5:1);注意 qlmanage 预览该文件会几何失真,勿以缩略图判断比例。
- 开源与文档完善(2026-07-11):代码 MIT(字体 OFL 1.1 并行,fonts/OFL.txt 已在库);README 增安装指引(brew 一行,不套娃)、首跑预期(模型下载体积 + 渲染耗时)、平台声明(仅 macOS/Apple Silicon 实测)、FAQ 六条、License 节;新增 docs/config.md(tsuzuri.toml 全量参考)与 README.en.md;whisper_backend 在触发 HF 下载前打印模型体积预期。模型不入库:GitHub 100MB 上限 + models/ 约定目录已覆盖离线场景。CLAUDE.md/AGENTS.md 移出版本库。

## 环境

- Apple Silicon (arm64), macOS 26.4
- Node 22.18 / npm 10.9 / Python 3.14.6 / uv 0.9.29 / FFmpeg 8.1.1
