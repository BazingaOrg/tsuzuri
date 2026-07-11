# tsuzuri(綴り)— 实现方案

> **tsuzuri(綴り)** — Turn photos and a song into a beat-synced visual diary. Fully local: beat detection, smart cut planning, lyric transcription, and a clean white-canvas 16:9 render with gallery-style captions — one command, no editor.
>
> 把照片和一首歌缀成踩点影像日记:本地节拍分析、智能规划切换、歌词识别、画册式字幕,一条命令导出成片,无需剪辑软件。

- 定位:摄影日记工具,输出 16:9 横版 MP4
- 原则:100% 本地运行,零云依赖,零 API key;确定性 pipeline,阶段间以 JSON 文件为契约
- 命名语义:綴る = 缀写日记、装订相册 → 写真を音で綴る

---

## 一、架构总览

```
photos/ + music.mp3
      │
      ▼
┌─────────────┐     beats.json      ┌─────────────┐    timeline.json    ┌──────────────┐
│  analyze    │ ──────────────────▶ │    plan     │ ──────────────────▶ │    render    │ ──▶ output/<album>.mp4
│  (Python)   │     lyrics.json     │  (Python)   │                     │  (Remotion)  │
└─────────────┘                     └─────────────┘                     └──────────────┘
```

三阶段各自独立、读写文件衔接。这个约定是为后续 agent 化预留的:每个阶段天然是一个 skill,未来把 orchestrator 换成 agent(让 LLM 参与生成/修改 timeline.json)时零重构。

**技术栈**


| 环节       | 选型                              | 说明                                                               |
| -------- | ------------------------------- | ---------------------------------------------------------------- |
| 节拍检测     | librosa `beat_track`            | MVP 用它;后续可升级 madmom downbeat(重拍识别)                               |
| 人声分离(可选) | demucs                          | 仅在 Whisper 识别置信度低时启用                                             |
| 歌词识别     | faster-whisper(small/medium)    | Apple Silicon 可换 mlx-whisper 吃 Metal 加速;word-level timestamps 开启 |
| 渲染       | Remotion(React)                 | 视觉规格全部 CSS/JSX,帧级动画插值                                            |
| 编码       | FFmpeg(Remotion 内置调用)           | H.264, yuv420p, AAC                                              |
| 字体       | Noto Serif JP / SC / Noto Serif | SIL 开源协议,打包进仓库离线加载                                               |


---

## 二、当前视觉规格(1080p 基准)

### 画布

- 1920 × 1080,60fps,背景纯白 `#FFFFFF`

### 照片

- 照片按原比例 fit 进 `photo_scale` 安全框,默认占画布宽高的 **80%**;可见期间几何尺寸固定,画布**正中心**(50%, 50%),不因字幕偏移
- 模拟左上方午后展陈灯光的三层定向阴影:`3px 5px 8px -3px rgba(38,28,20,.28), 22px 20px 38px -14px rgba(58,40,24,.24), 46px 34px 78px -30px rgba(96,64,32,.16)`;阴影集中向右下延伸,避免四边平均发灰。另加低对比内向轮廓,像素值按输出高度相对 1080p 等比缩放
- 横竖图混排:fit 进安全框内居中,白底天然兼容

### 字幕(画册图注风格)

- 位置:水平居中,垂直居中于照片安全框下缘与画布底部之间的字幕带;锚定安全框,不随照片宽高比跳动
- 字号:36px,字重 500,颜色暖墨 `#37332D`
- 字间距:0.12em;单行超过约 18 个全角字符时回退 0.06em;行宽上限为画布 86%
- 逐行语言检测切字体:
  - 含假名(ひらがな/カタカナ Unicode 区间)→ **Noto Serif JP**
  - 纯 CJK 无假名 → **Noto Serif SC**
  - 纯拉丁 → **Noto Serif**(可选配置:英文行 italic)
  - 混合行走 CSS font stack 自然回退,双重校验用 Whisper 语言标签
- 可选:右下角 20px 浅灰 `#B0AEA6` 时间戳/曲名信息条(配置开关,默认关)

### 动画

- **照片切换**:`album` 用 0.4s、`crossfade` 用 0.6s 整页叠化,二者的淡化**中点对齐节拍点**;旧页保持不透明,包含白画布与照片的新页覆盖淡入,避免双半透明照片泄漏白底;`cut` 纯硬切。切换过程不改变照片尺寸
- **照片停留**:固定在安全框尺寸,不做放大、微缩或其他几何动画。timeline v1 的 `motion` 字段仅保留读取兼容,渲染器不再消费
- **字幕切换**:独立于照片轨,跟歌词行时间戳;新句在 0.35s 内淡入并上浮 6px,旧句在 0.25s 内继续上行 4px 并淡出,不使用模糊滤镜
- **间奏/无歌词段**:字幕轨整体淡出留白
- **收尾**:最后一张照片定格,音频末尾 1.5s 淡出,画面同步淡至白

---

## 三、timeline.json Schema(阶段契约)

```jsonc
{
  "meta": {
    "version": 1,
    "audio": "./music.mp3",
    "duration": 150.0,          // 秒
    "width": 1920,
    "height": 1080,
    "fps": 60,
    "background": "#FFFFFF",
    "photo_scale": 0.8
  },
  "photos": [
    {
      "src": "./photos/001.jpg",
      "start": 0.0,             // 秒,含 opacity 淡化前沿
      "end": 5.2,
      "transition": { "type": "album", "duration": 0.4 },
      "motion": { "type": "none", "from": 1.0, "to": 1.0 } // v1 兼容字段,渲染器忽略
    }
    // ... 按 start 升序,首张 start=0,末张 end=duration
  ],
  "subtitles": [
    {
      "text": "午後の光が、古い壁に触れていた",
      "lang": "ja",             // ja | zh | en | mixed
      "start": 3.1,
      "end": 7.8,
      "confidence": 0.92        // Whisper 段置信度,渲染层可按阈值过滤
    }
  ],
  "beats": {                    // 调试/微调用,渲染层不消费
    "bpm": 118.4,
    "downbeats": [0.51, 2.54, 4.57]
  }
}
```

photos 与 subtitles 是**两个平级数组、独立时间线**,渲染层各消费各的。

---

## 四、节拍分配算法(plan 阶段核心)

输入:音频时长 D、图片数 N、节拍候选集 B(优先重拍)。

**MVP:贪心吸附**

1. 计算理想切换点均匀网格 `t_i = i × (D / N)`,i = 1…N-1
2. 每个 `t_i` 吸附到 B 中最近的重拍
3. 约束:切换点严格单调递增;相邻间隔 ≥ `min_gap`(默认 2.0s);首个切换点 ≥ 第一个强 onset(避开前奏静音段)
4. 冲突处理:两个理想点吸附到同一节拍时,次者顺延到下一个可用节拍

**升级路径(非 MVP)**:动态规划,代价函数 = w1·偏离均匀网格 + w2·弱拍惩罚 + w3·间隔方差,求全局最优。

**图片数 / 音频时长失配策略(CLI 交互或参数指定)**


| 情况                  | 策略                                                   |
| ------------------- | ---------------------------------------------------- |
| 图少歌长(如 10 张 / 4 分钟) | 在目标时长附近的重拍处截断 + 淡出;没有合适重拍时延长固定尺寸照片的展示时间          |
| 图多歌短(如 60 张 / 90 秒) | 切"快闪模式":吸附目标从重拍降级为每拍/每两拍,`min_gap` 放宽到 0.8s          |
| 前奏长/纯音乐开头           | 首张照片从 0s 开始,但首个切换点从第一个强 onset 后起算                    |
| 尾部对齐                | 末张照片持续到音频自然结束,淡出收尾                                   |


**歌词边界**

- Whisper 输出为空或整体置信度极低 → 判定纯音乐,跳过字幕轨
- 逐段按 `confidence` 阈值(默认 0.6)过滤,宁可漏不可错(Whisper 在音乐场景会幻觉编词)
- 识别差时自动启用 demucs 人声分离重跑一次(配置开关)

---

## 五、设备自适应(零决策的延伸)

存在设备差异的环节共三处,全部自动探测,用户无感知。

### Whisper 后端(差异最大)


| 设备                | 后端                            | 模型默认         |
| ----------------- | ----------------------------- | ------------ |
| Apple Silicon     | mlx-whisper(Metal)            | medium       |
| NVIDIA GPU        | faster-whisper(CUDA, float16) | medium       |
| 纯 CPU / Intel Mac | faster-whisper(int8)          | small(精度换速度) |


**安装层**:PEP 508 环境标记做条件依赖,安装时自动按平台解析:

```toml
dependencies = [
  "faster-whisper",  # 全平台兜底
  "mlx-whisper; sys_platform == 'darwin' and platform_machine == 'arm64'",
]
```

**运行时层**:backend resolver 启动探测,优先级 mlx(可导入且 arm64 Mac)→ CUDA(`torch.cuda.is_available()`)→ CPU int8。三后端收敛到统一接口 `transcribe(audio) -> segments`,探测结果打印一行日志(如 `whisper backend: mlx / medium`)。

### demucs(人声分离 fallback)

CUDA 可用则用,否则一律 CPU——MPS 算子支持不完整,不折腾。仅在 Whisper 置信度低时触发,每首歌至多一次,CPU 慢也可接受。

### 视频编码(M5 打磨项,非 MVP)

FFmpeg 硬编探测:macOS `h264_videotoolbox` → NVIDIA `h264_nvenc` → 兜底 `libx264`。MVP 直接 libx264,瓶颈在 Chrome 画帧不在编码。

### 国内网络适配

Whisper/demucs 模型首次使用从 HuggingFace 下载,国内直连易失败。resolver 增加连通性检测:超时自动设 `HF_ENDPOINT=https://hf-mirror.com` 重试,再失败才提示配置代理。README 中作为差异化特性说明。

librosa(纯 CPU 数值计算)与字体(本地文件)无设备差异。

---

## 六、CLI 形态(零决策设计)

```bash
tsuzuri ./osaka-trip        # 唯一的日常命令
```

**约定优于配置**:文件夹内的图片 + 唯一的音频文件即必需输入,可选一份 `.lrc`;分析产物统一写入 `metadata/{beats,lyrics,timeline}.json`,默认成片写入 `output/<文件夹名>.mp4`。命令行 flag 仅保留 `-o`(改成片路径)。根目录旧 JSON 会安全复制到 `metadata/`,不删除原件且不覆盖已存在的新文件。

**原 flag 全部转为自动决策**


| 场景   | 自动规则                                                                               |
| ---- | ---------------------------------------------------------------------------------- |
| 字幕来源 | 单份 UTF-8/BOM LRC 优先;没有时使用 Whisper;无人声/置信度低则自动跳过                                |
| 快闪模式 | 人均展示 < 2s → 自动切换,吸附降级为每拍                                                           |
| 裁剪音频 | 人均展示 > 10s → 自动在目标时长附近重拍处截断 + 淡出                                                   |
| 照片顺序 | EXIF 拍摄时间优先,无 EXIF 按文件名排序,打印一行告知                                                   |
| 微调重渲 | timeline.json 副产物永远输出;重跑同一命令时,若输入 hash 未变而 timeline 被改过 → 跳过分析直接渲染;若输入变了 → 重新规划并提示 |


输入 hash 存于 `timeline.meta.input_hash`,以此区分"用户手改了 timeline"和"素材变了"。渲染前打印计划摘要但不询问确认,直接开始。主状态行统一用 `●` 前缀:默认前景色表示信息,橙色 `#D97757` 表示阶段开始,绿色表示完成,黄色表示提醒,红色表示错误;次级详情用调暗的 `└`。渲染阶段使用固定宽度百分比显示 Bundling、Rendering frames 与 Encoding video,不显示抖动较大的剩余秒数。`NO_COLOR`、`TERM=dumb` 或非 TTY 输出不带 ANSI 颜色。

**高级用户的唯一口子**:文件夹内可选放置 `tsuzuri.toml`(photo_scale、min_gap、字幕开关、信息条开关等),缺省即全默认值。

LRC 采用保守的常用行级子集:`[mm:ss]`、1–3 位小数、同一行多个时间戳、`[offset:+/-毫秒]`;忽略元数据标签,带时间戳的空行用于清空上一句。多个 LRC、无有效时间戳或同一时间戳对应冲突文本均报错;TXT/SRT 不在当前范围。

**错误约定**:文件夹含多个音频或多个 LRC → 报错并列出文件;无音频或无图片 → 报错并说明目录约定。

---

## 七、仓库结构

```
tsuzuri/
├── analyzer/                  # Python:analyze + plan
│   ├── analyze.py             # → beats.json, lyrics.json
│   ├── plan.py                # → timeline.json
│   ├── beat_alloc.py          # 分配算法(独立模块,便于单测)
│   └── pyproject.toml
├── renderer/                  # Node:Remotion 工程
│   ├── src/
│   │   ├── Root.tsx
│   │   ├── Diary.tsx          # 主 Composition,消费 timeline.json
│   │   ├── Photo.tsx          # 固定尺寸照片 + 三层阴影 + opacity 淡化
│   │   ├── Subtitle.tsx       # 三语字体切换 + 淡入上浮
│   │   └── theme.ts           # 本文档第二节全部常量
│   └── public/fonts/          # Noto Serif JP / SC / Latin
├── cli/                       # 入口,串联两端(Python 或 Node 皆可,建议 Node 统一)
├── examples/                  # 示例照片 + 一首无版权音乐 + 期望输出
└── README.md                  # 双语,orch-kit 风格
```

---

## 八、开发计划 Step by Step

### M0 — 契约先行(0.5 天)

- 冻结 timeline.json schema(第三节)
- **手写一份假 timeline**(3 张示例图 + 30 秒音频,时间点手填)
- 产出:schema 文档 + fixture 文件
- 意义:M1 与 M2/M3 从此可并行

### M1 — 渲染端(2–3 天,先做这个)

- Remotion 工程搭建,`theme.ts` 落入全部视觉常量
- Photo 组件:居中 80%、三层阴影、固定几何尺寸、opacity 淡化(中点对齐语义)
- Subtitle 组件:稳定字幕带、三语字体切换、克制的淡入上浮与淡出
- 消费 M0 的假 timeline 渲出第一个 MP4
- **验收:成片与已确认的预览帧视觉一致**(拿你剪映的旧成片对着调阴影参数)
- 先渲染后分析的理由:视觉是这个产品的验收标准,尽早看到真 MP4 能最快暴露规格问题

### M2 — 音频分析(1–2 天)

- librosa beat_track → beats.json(bpm + beat/downbeat 时间戳)
- 强 onset 检测(前奏起算点)
- 用 3–5 首你常用的歌实测节拍准确度,不准的记录下来作为 madmom 升级依据

### M3 — 分配算法 + CLI 串联(1–2 天)

- beat_alloc.py 实现贪心吸附 + 三条约束,配单元测试(固定 beats 输入断言输出)
- plan.py 组装 timeline.json;`tsuzuri ./folder` 一条命令跑通 → mp4
- **这是第一个端到端里程碑,此时已可自用**
- 实现输入 hash 检测:手改 timeline.json 后重跑同一命令直接渲染

### M4 — 歌词字幕(2–3 天)

- Whisper backend resolver(mlx / CUDA / CPU int8 自动探测)+ HF 镜像连通性检测
- faster-whisper 集成,word timestamps,段级 confidence 过滤
- 逐行语言检测(假名区间 + Whisper 标签双校验)→ 字体路由
- demucs fallback 开关
- 纯音乐自动跳过;用中/日/英各一首歌验收

### M5 — 边界与打磨(2 天)

- 图少歌长 / 图多歌短两套自动策略(快闪切换、重拍处裁歌)+ 阈值调优
- 竖图 fit 逻辑、收尾淡出、异常输入(空文件夹、损坏图片、非 mp3)
- examples/ 完整示例 + 双语 README,开源发布

### M6 — 可选演进(不排期)

- 本地 H5 界面:拖入素材 → 波形图 + 切换点标记 → 拖动微调 → 渲染(与你小红书工具「交互工具走 H5」的结论一致)
- Agent 化:三阶段封装为 skill,LLM 参与 timeline 决策(选起点、判断快闪/慢节奏、按歌词情绪调整照片顺序),接入 orch-kit 编排

预估 M0–M5 合计 **8–12 个工作日**(业余时间折算 3–4 周)。

---

## 九、已确认决策清单


| 项       | 决策                                                            |
| ------- | ------------------------------------------------------------- |
| 名称      | tsuzuri(綴り)                                                   |
| 画幅      | 16:9 横版 1920×1080                                             |
| 形态      | 纯工具 CLI 优先,H5 界面后置                                            |
| 运行      | 100% 本地,零云依赖                                                  |
| 照片      | 正中心,默认 fit 进 80% 安全框(可配),固定几何尺寸,右下定向暖色三层阴影                  |
| 字幕      | 安全框下方稳定字幕带,宋体 36px / 500 暖墨,短距离淡入上浮                              |
| 三语      | 逐行检测,Noto Serif JP / SC / Latin                               |
| 照片动画    | `album` / `crossfade` 做不漏白的整页叠化并踩节拍,`cut` 纯硬切             |
| 字幕动画    | 独立轨道,淡入上浮/淡出                                                  |
| 踩点      | 均匀网格吸附重拍,min_gap 2s,智能非固定时长                                   |
| 渲染      | Remotion(React),Python 只做分析                                   |
| Agent 化 | 架构预留(JSON 契约),M6 再做                                           |
| 设备适配    | 全自动:Whisper 后端探测(mlx/CUDA/CPU)、demucs CUDA-else-CPU、HF 镜像自动切换 |
