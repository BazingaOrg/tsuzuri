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

## 近期落地(2026-07-12)

- **片头/片尾个性化(配置驱动)**:`tsuzuri.toml` 新增 `outro_text` / `signature` / `intro`;plan 只透传显式配置,展示默认值单一来源留在渲染器。自定义签名 SVG 运行时测长,cleanup 会释放 pending delayRender handle;`intro=false` 时 plan 不预留片头、渲染器不挂 Intro。
- **`tsuzuri still`**:纯 Node + `renderStill` PNG,默认 `--scale 2`;支持 `--exif` 四行展签、`--sign` 落款和显式 `--skip-existing`。四种变体以 `-exif` / `-sign` 文件名段分离,扩展名始终为 `.png`;批量同 stem 自动把源扩展名并入 basename 消歧。方案见 [still-polish-and-error-ux-plan.md](./still-polish-and-error-ux-plan.md)。
- **裸命令交互菜单**:`tsuzuri` 零参数 + TTY 时进入数字选择菜单(readline 标准库,零新依赖),菜单只组装 argv 交回 `parseArgs` 与命令行同路,执行前回显等效命令;非 TTY 裸跑仍报 USAGE。拖拽路径规整(macOS 反斜杠转义 / Windows 引号 / `~` 展开)与 Windows 兼容(rl 级 SIGINT、`-o` 结尾分隔符只在 win32 认 `\`)一并落地。方案见 [interactive-menu-plan.md](./interactive-menu-plan.md)。

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

- **增量缓存不认 analyzer 代码版本 → 已修复(2026-07-12)**:原问题(2026-07-11 排查):CLI 只对比素材内容哈希,改了分配算法后旧文件夹继续复用旧 `metadata/timeline.json`,曾误判"片头没显示"是新 bug(实为吃了旧 timeline)。修复方案:`plan.py` 生成时写入 `meta.plan_checksum`(整份文档去掉该字段后 `json.dumps(sort_keys=True, ensure_ascii=False)` 的 sha256 前 16 位);素材未变时规划步骤照常运行,由 plan.py 自判——校验和吻合说明文件从未被手动碰过,放心用最新算法覆盖刷新(悄悄升级);不吻合判定手改,原样保留并提示。整文档校验(而非只挑 photos/subtitles/beats 字段)是方案评审的强制修订:否则手改 `meta.photo_scale` 之类会被静默覆盖。CLI 侧 `skipPlan` 改名 `skipAnalyze`,只跳过音频分析。beats.json 缺失时退回保留现状而非报错。测试:`analyzer/tests/test_plan_hand_edit_preservation.py` 8 条(含 meta 字段护栏测试);两组 E2E 对照实验分别验证自动刷新与手改保留路径。**遗留一次性成本**:功能上线前生成的旧 timeline.json 没有 plan_checksum,保守视为"可能手改过"而保留——旧文件夹想吃到新算法需手动 `rm -rf metadata` 一次。

- M1 视觉验收最后一步需要用用户真实素材检查三层阴影、横竖图和字幕带位置。
- M2 验收项:用 3–5 首真实歌曲实测节拍准确度,不准的记录作为 madmom 升级依据。
- M4 验收剩余:用中/日/英各一首真实歌曲验证(需要用户素材);demucs 未实测(需 `uv sync --extra separation` + 一首人声弱的歌)。
- Windows:代码层面兼容(faster-whisper CPU/CUDA 路径、npx 坑已修 9e09165),未真机实测;最可能的坑:CJK/空格路径、demucs 的 torch 安装。
- M5 剩余:快闪/裁剪阈值用真实素材调优;examples 目前只有生成的 fixture,可补一组真实示例照片 + 无版权音乐。
- Whisper 模型可用 `TSUZURI_WHISPER_MODEL=tiny|small|medium` 临时覆盖(调试用)。
- Review 遗留(advisory,未修):EXIF 排序是全有全无策略;信息条(INFO_BAR)常量已定义但视频渲染未实现(默认关,M6);HF 连通性探测用 urllib,SOCKS-only 环境会误切镜像(镜像可用,无害)。
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
- README 重写(2026-07-11,架构图于 2026-07-12 更新):标语纳入歌词;去除全文中英双份句(标题双语 + 正文中文);Kami 风格 PNG 架构图现覆盖视频与 still 双管线,README 预留 EXIF / EXIF+签名案例位;LRC/目录约定折叠进 `<details>`;辅助命令单列一节。
- 片头片尾(2026-07-11,替代右下角常驻签名):片头 = 白画布居中"写"签名——虚线偏移描字(stroke-dasharray = 路径总长 2109.58,dashoffset 逐帧从总长插值到 0,笔迹沿真实轮廓画出),1.4s 描字 + 0.35s 上墨(fillOpacity 淡入)+ 0.4s 停留 + 0.5s 卡片淡出;第一张照片可见时长不足自动跳过。⚠ 两个实测踩坑:CSS animation 在 Remotion 不可用(须 useCurrentFrame 逐帧驱动);Chrome/WebKit 对多子路径 <path> 设置 pathLength 归一化会**整体禁用虚线**,必须用真实路径长度(getTotalLength 在渲染用 chrome-headless-shell 实测,硬编码为常量)。片尾 = "Thanks for watching :)" 沿用字幕题签样式(Noto Serif 36px/500/0.12em)随白场过半淡入;Sacramento 字体随之移除(git 历史可找回)。ANIMATION 拆分:audioFadeDuration 1.5s / whiteFadeDuration 2.5s(白场更长给谢幕语留时间,音频淡出不变)。Signature.tsx 改纯展示组件(viewBox 内聚,定位配色由使用方给)。
- 个人签名落款(2026-07-11,后续方案已替代常驻右下角):Sacramento 手写 SVG 转实心路径内联为 Signature.tsx(方案 A,渲染器内置)。视频中作为片头书写;still 由 `--sign` 显式开启——无 EXIF 时位于照片下方留白中央,有 EXIF 时位于展签底部,使用 `#37332D` / 0.65 opacity。SVG 字形 bbox 为 viewBox "2 2 320 129"(宽高比 2.5:1)。
- 开源与文档完善(2026-07-11):代码 MIT(字体 OFL 1.1 并行,fonts/OFL.txt 已在库);README 增安装指引(brew 一行,不套娃)、首跑预期(模型下载体积 + 渲染耗时)、平台声明(仅 macOS/Apple Silicon 实测)、FAQ 六条、License 节;新增 docs/config.md(tsuzuri.toml 全量参考)与 README.en.md;whisper_backend 在触发 HF 下载前打印模型体积预期。模型不入库:GitHub 100MB 上限 + models/ 约定目录已覆盖离线场景。CLAUDE.md/AGENTS.md 移出版本库。
- 片头/片尾配时预留(2026-07-11):plan.py 新增常量镜像 INTRO_DURATION=2.65 / WHITE_FADE_DURATION=2.5 / MIN_PHOTO_VISIBLE=0.8(与 renderer/src/theme.ts、Intro.tsx 双向注释互指,任一侧改动需同步)。非快闪且 duration>=5.95s 时预留片头:beat_alloc.allocate_switch_points 新增 head_offset(理想网格整体右移,0 时行为逐位不变,56 条既有测试回归确认)把首张照片的可见时长拉平到与其余照片相当,并把 not_before 抬高到 3.45s 兜底(该值经既有 usable 过滤 + fallback 逻辑天然保证下界,无需额外硬编码分支)。任何时长都尝试给末张照片预留 not_after(片尾白场前 ≥0.8s 不透明可见),取 max(网格自身理想末位, 该下界)——绝不比均分网格更早,与 min_gap 冲突时 min_gap 胜出(不为保尾丢照片)。不变式(plan 预留 ⟺ 渲染端 showIntro 判定为真)已用 test_plan_head_tail_reserve.py 的独立 Python 复刻函数覆盖。examples/fixture/timeline.json(Studio 预览用静态文件)未随之重新生成,如需体现新配时需手动重跑。
  - **审查发现并修复(Codex 定向复核 + deep-reasoner 独立复核)**:n==2 时头尾两个约束落在同一个(唯一的)切换点上,原用通用门槛 5.95s 会在 duration ∈ [5.95, 6.75) 的窄窗口内(该点必须同时 ≥3.45 且 ≤duration−3.3,但窗口宽度不足)因找不到候选而被 `t > duration - min_gap: break` 整体丢弃、误删第二张照片(已用脚本复现:D=5.95,n=2,原逻辑丢照片;修复后保留)。修复:n==2 时预留门槛抬高到 SHOW_INTRO_MIN_T+MIN_PHOTO_VISIBLE=6.75s(n>=3 时头尾分属不同切换点,门槛不变)。同时改掉两个空验证测试:`test_avg_boundary_at_two_seconds_is_non_flash` 原是重言式(`X==X` 恒真);`test_last_photo_has_opaque_tail_before_white_fade` 原场景理想末位天然早于白场起点,not_after 从未真正生效——现用手工构造的候选(唯一候选 11.0 距理想位 8.325 在吸附范围内但会把尾部压到 3.0s<3.3s 目标)证明该候选确实被排除。analyzer 测试 56→59。

## 环境

- Apple Silicon (arm64), macOS 26.4
- Node 22.18 / npm 10.9 / Python 3.14.6 / uv 0.9.29 / FFmpeg 8.1.1
