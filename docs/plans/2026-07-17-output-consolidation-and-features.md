# 产出目录统一、trim 偏好迁移与新特性批次

来源:2026-07-17 讨论。视频素材支持从路线图移除;片尾 GPS 足迹不做,记入
文末"待讨论"。

## 阶段 A:产出目录统一 + trim 偏好迁出 toml

### 背景

- 现在一次运行会在素材夹里产出两个目录:`metadata/`(4 份 JSON)和 `output/`(成片),
  首次裁剪问答还会把 `trim = "..."` 写进素材夹根部的 `tsuzuri.toml` —— 非专业用户
  看不懂这份文件,也不该让机器写用户的配置文件。

### 设计

**目录:`output/` 成为唯一产出目录**

```text
osaka-trip/
├── photo-01.jpg …          # 用户素材(不动)
├── audio/                   # 用户素材(不动)
├── tsuzuri.toml             # 可选,只由用户手写,程序不再写入
└── output/                  # 唯一产出目录
    ├── osaka-trip.mp4
    └── metadata/
        ├── beats.json / lyrics.json / analysis.json / timeline.json
        └── preferences.json # 交互问答的持久化(新)
```

- `resolveProjectPaths`:`metadataDir = folder/output/metadata`。
- 迁移:运行时若存在旧 `folder/metadata/` 且新位置为空,整目录**复制**到新位置并
  打印一行(旧目录保留,沿用 `copyLegacyJson` 的保守先例;该函数的复制目标同步指向
  新位置)。
- `still` 的默认输出路径一并核对,统一落 `output/`。
- docs(README / config.md / tsuzuri-status.md / timeline schema 文档)同步。

**trim 偏好:`output/metadata/preferences.json`**

```json
{"version": 1, "trim": "auto" | "full"}
```

- 优先级:CLI `--trim` > toml `trim` > preferences > 默认 `auto`。
  CLI 解析出有效值后统一以 `--trim` 传给 plan(preferences 不进 `input_hash`,
  也不需要:plan 每次都运行,`meta.trim` 已在 timeline 校验和覆盖范围内)。
- 首次问答条件不变(双 TTY、planOutcome === generated、auto 实际生效、
  toml/CLI 均未显式指定),新增:preferences 已有 `trim` 键时不再询问。
- 答案写 preferences.json,**删除 `writeTrimConfig` 的 toml 写回**
  (`hasExplicitTrimConfig` 读 toml 的逻辑保留,作为专业用户入口)。
- 收益:选"接受裁剪"时 **不再需要重跑 plan**(timeline 已是裁剪版,
  写 preferences 不影响 input_hash);只有选"播完整首歌"才重规划一次。

### 步骤

1. [x] `project.mjs`:路径改造 + 旧 `metadata/` 迁移 + preferences 读写 helper;
       trim 偏好写入 preferences
       → verify: project 单测(新旧布局、迁移幂等、preferences 读写)
2. [x] `tsuzuri.mjs` / `trim.mjs`:优先级合并逻辑;"接受裁剪"分支去掉重跑
       → verify: trim 单测(四级优先级、已答不再问、full 才重规划)
3. [x] `still.mjs` / `lyrics.mjs` / `fetch.mjs` 等所有引用 metadata 路径处核对
       → verify: 全量 `npm --prefix cli test`
4. [x] docs 同步 + 端到端:旧布局素材夹跑一次确认迁移,新素材夹跑一次确认单目录
       → verify: `uv run --project analyzer pytest` + 手动检查素材夹内只多出 output/

## 阶段 B:问答后文案减重(随 A 顺带)

- [x] 选"播完整首歌"后的 `term.start('按裁剪选择重新规划照片时间线')` 去掉,
  只保留一行轻量 `term.detail('已按完整歌曲重新规划')` 与最终 success;
  "裁剪选择已保存到 tsuzuri.toml" 文案随阶段 A 改为不提文件路径的
  `term.success('已记住你的选择')` 级别措辞。
- → verify: 交互路径手动走一遍,输出不再出现两组完整的 start/success。

## 阶段 C:竖屏 / 方形预设

背景确认(用户问题):1920×1080 横版上传小红书等竖屏优先平台,信息流默认竖屏
观看时上下大黑边,只有旋转全屏才满屏;原生 1080×1920 竖版在信息流与全屏都满屏。
预设就是为了原生适配这种观看形态。

### 设计

- CLI 加 `--portrait`(1080×1920)与 `--square`(1080×1080),互斥;与 `--dark`
  同机制:**渲染时覆盖 inputProps 的 width/height,不改写 timeline.json**
  (plan 的切换点与画布尺寸无关,核对过 `build_timeline` 仅把宽高写进 meta)。
  默认输出文件名追加 `-portrait` / `-square` 变体后缀。toml 手写 width/height
  的高级用法保持不变。
- 渲染端适配(核心工作量):
  - 视觉规格基准 `scale = height/1080` 在竖版会放大 1.78 倍,需改为
    `min(width, height)/1080` 并全量核对 Intro/Outro/Signature/Subtitle/still;
  - EXIF 展签横排(照片左 + 展签右)在竖版放不下 → 展签移到照片下方的纵排布局;
  - photo_scale / 字幕带公式按新画布验证,菜单问答加一问(横版/竖版/方形)。

### 步骤

1. [x] renderer:scale 基准改造 + 纵排 EXIF 布局 + 三种画布的构图核对
       → verify: still 三种画布各导一张目测;renderer 类型检查
2. [x] CLI:`--portrait` / `--square` 解析、互斥校验、变体后缀、菜单加问
       → verify: options/menu 单测
3. [x] 端到端各渲一条,ffprobe 校验分辨率,手机上目测小红书式竖屏观看效果
       → 本地构图与 ffprobe 已验证（landscape 1280×720、portrait 720×1280、square 720×720 draft 视频；三画幅 EXIF+sign still）；手机平台目测待补
4. [x] docs 同步

## 阶段 D:日期章节卡

### 设计

- plan 层:照片全部有 EXIF 日期且跨天 ≥ 2 天时自动启用(toml `chapters = false`
  可关;EXIF 不全则静默不启用,打印一行 detail)。在换天边界插入章节 clip:
  `{"kind": "chapter", "text": "7月14日 · 第2天", "start": …, "end": …}`,
  时长约 2s、吸附重拍,占用一个切换槽;timeline 的 photos 数组容纳混合 kind,
  旧渲染端不认识的 kind 直接忽略(向后兼容)。
- 日期后缀可爱符号:固定小集合 `[":)", "♪", "✦", "˖°"]` 按天序取模轮换,
  保证同素材重复运行输出稳定(不引入随机)。
- 渲染端:新 `ChapterCard` 组件,复用主题字体与色板,居中大字 + 淡入淡出,
  风格与 Intro 手写签名同气质。
- 首张照片若与片头 / 首个章节卡冲突(第 1 天的卡是否要?):第 1 天不出卡,
  从第 2 天的换天边界开始 —— 片头已承担"开篇"职责,避免开场连续两张卡。

### 步骤

1. [ ] plan.py:日期分组、章节 clip 注入、toml 开关、meta 说明字段
       → verify: 单测(跨天/单天/EXIF 不全/关闭开关/符号轮换稳定)
2. [ ] renderer:types + ChapterCard + Diary 分发 kind
       → verify: 类型检查 + 固定帧截图目测
3. [ ] 端到端:多日素材渲一条完整验证
4. [ ] docs 同步

## 阶段 E:副歌感知节奏 + 踩点质量审视

两件事同属"切换与音乐更和谐",合并推进,但**先测量再改**:

### E1 踩点质量审计(先做,产出报告不改行为)

- 现状:`beat_track` 默认参数;downbeat 是 4/4 假设 + onset 相位启发式;
  切换淡入以切换点为中心(前后各半),视觉重心恰在拍点上 —— 先确认这是否已足够。
- 用 2-3 首不同风格(强节奏/慢歌/变速)的歌,人工标注若干重拍,对比
  beats.json 偏差;同时渲成片主观评估"切在拍上"的感受。
- 候选改进(按审计结果取舍):`beat_track` 的 `tightness`/`trim` 参数调优;
  downbeat 相位对 3/4 拍的兜底;切换点吸附时偏向"拍点前一点点"
  (人眼对提前切换的容忍高于滞后)。madmom 重依赖,除非审计证明必要,不引入。

### E2 副歌感知

- analyze 增补每拍区间的能量特征(librosa RMS 均值),beats.json 加
  `energy` 数组(与 beats 等长,归一化 0-1)。
- plan / beat_alloc:切换密度按能量加权 —— 高能段(副歌)切换间隔向 min_gap
  压缩,低能段(主歌/间奏)放宽;总照片数不变,只重分布。快闪模式下不叠加
  (本来就贴每拍)。toml `pacing = "uniform" | "dynamic"`(默认 dynamic,
  给用户回退开关)。
- 风险:能量加权可能让照片扎堆副歌、主歌段过长 —— 设加权上下限
  (如间隔在均值的 0.6×–1.6× 之间)。

### 步骤

1. [ ] E1 审计,结论记入本文档 → 决定 E1 改进项做哪些
2. [ ] analyze:energy 特征 + 单测;beats.json version 保持兼容(新增字段)
3. [ ] beat_alloc:加权分配 + 上下限 + 单测(uniform 回归、dynamic 分布断言)
4. [ ] 端到端 A/B:同素材 uniform vs dynamic 各渲一条主观对比
5. [ ] docs 同步

## 执行顺序与依赖

A(+B) → C → D → E。A 是结构性改动,先落定目录与偏好存放再叠特性;
C/D/E 相互独立,可按此序也可并行分支。每阶段独立提交、独立可验证。

## Implementation notes

### 阶段 A（2026-07-17）

- 所有 JSON 与交互 trim 偏好现在写入 `output/metadata/`；旧 `metadata/` 仅在新目录为空时整目录复制，随后根目录旧 JSON 按缺失项补齐，源文件全部保留。
- trim 优先级实现为 CLI、显式 TOML、保存的 preferences、planner 默认值；preferences 不参与 `input_hash`。接受自动裁剪只保存偏好，选择完整歌曲才以 `--trim full` 重规划一次。
- analyzer 的默认输出同步改到 `output/metadata/`，并从标准新布局正确推导素材根目录，以保留 `audio/` 内音频的相对路径。

### 阶段 B（2026-07-17）

- 选择完整歌曲后的第二次规划保留，但只输出 `已按完整歌曲重新规划` 的 detail；偏好保存确认改为 `已记住你的选择`，不暴露内部文件路径，也不重复完整 start/success 组。

### 阶段 C（2026-07-17）

- `--portrait` 与 `--square` 只覆盖 render/still 的内存 props，分别固定为 1080×1920 和 1080×1080；默认文件名带对应后缀，显式 `-o` 保持原样。
- 视觉缩放改按画布短边，EXIF 展签在竖版改为照片在上、信息在下的共享纵排布局；横版和方形维持原横排比例。
- 本地 draft 视频经 ffprobe 确认 landscape 1280×720、portrait 720×1280、square 720×720；三画幅 EXIF+sign still 构图通过。手机平台的信息流目测尚待补做。

## Review findings and root causes

### 阶段 A（2026-07-17）

- P1: `tsuzuri-plan` 独立调用仍默认读写 `folder/metadata/`，与 CLI 已传入的新路径不一致。根因是目录迁移只覆盖了 analyze 和 Node 编排路径。已将 planner 的 beats、lyrics、timeline 默认值及帮助文本统一为 `folder/output/metadata/`，并更新默认路径测试。
- P2: 原有 trim 测试只覆盖偏好 helper 与问答本身，未验证 CLI 传给 planner 的最终参数和重规划次数。根因是 `runCommandFromArgv` 未提供小范围的命令执行注入点。已加入仅供测试替换的 `runCommandImpl`，用真实 CLI 编排覆盖四级优先级、接受 auto 一次规划、选择 full 两次规划且第二次显式 `--trim full`，并断言不会创建 TOML。
- P3: `tsuzuri-analyze` 的默认输出实现已迁移，但顶层 help 与 `--lyrics-output` help 仍沿用或省略旧目录说明。根因是路径迁移时没有将 CLI 文案作为独立调用契约逐项核对。已改为明确的 `output/metadata/` 默认路径，并用 `--help` 验证。

### 阶段 C（2026-07-17）

- P1: still 的跨变体碰撞检查最初只列出部分画幅后缀，无法覆盖展示组合与 portrait/square 的笛卡尔积。根因是以手写列表维护组合，新增画幅时遗漏了已有展示状态。已从展示状态与画幅状态生成完整矩阵，并覆盖代表性碰撞及显式 `-o` 回归。

## 待讨论(不在本批次)

- **片尾 GPS 足迹**:EXIF GPS → 途经地点列表/轨迹。开放问题:地名反查
  需要在线服务(与"全程本地"定位冲突,离线库体积大);隐私(成片带地点
  是否默认合适);展示形态(文字列表 vs 小地图)。留待专门讨论。
- 视频素材支持:已从路线图移除(2026-07-17)。
