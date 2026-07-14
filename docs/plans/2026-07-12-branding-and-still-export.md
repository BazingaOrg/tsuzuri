# 执行方案:片头/片尾个性化 + still 图片导出命令

> 状态:已实施(2026-07-12)。后续命名、报错与视觉打磨由 [2026-07-12-still-polish-and-error-ux.md](./2026-07-12-still-polish-and-error-ux.md) 取代。

> 最终实现口径:本文件保留方案推导过程;对外行为以 README、config.md 与后续打磨方案为准。plan 只把用户显式设置的 branding 键写入 timeline,默认文案留在渲染器;still 最终增加 `--sign` / `--skip-existing`,四种变体使用 `-exif` / `-sign` 文件名段并保留单一 `.png` 扩展名。

## 背景与目标

1. **片头/片尾个性化**:当前片头签名(`renderer/src/Signature.tsx` 硬编码
   SVG path)与片尾谢幕语(`renderer/src/theme.ts` 的 `OUTRO.text`)都写死在
   渲染器源码里。目标:使用者不改源码,只通过配置替换个性签名与结束文案;
   不配置时输出与现在**逐帧一致**。
2. **still 图片导出**:新增子命令,把照片按视频同款视觉(白底、横幅画布、
   `photo_scale=0.8`、同一套阴影/描边)导出为最高质量静态图;可选叠加 EXIF
   信息面板(照片左、信息右,整体在画布中水平垂直居中)。

---

## 第一部分:片头/片尾个性化

### 方案选型

| 方案 | 做法 | 评价 |
| --- | --- | --- |
| **A. 配置驱动(推荐)** | `tsuzuri.toml` 新增键 → `plan.py` 写入 `timeline.json` 的 `meta.branding` → 渲染器按 props 消费 | 复用现有唯一配置面;toml 已计入 input hash,改配置自动触发重规划;使用者零源码接触 |
| B. 渲染器内 branding.ts | 把签名 path、文案收拢到一个源码文件让用户改 | 仍要求会改 TS + 理解构建;对外部使用者不友好,仅作为 A 的内部代码组织手段 |
| C. 只做组件抽取 | Outro/Intro 组件化但入口仍是常量 | 是 A 的前置步骤,单独做不解决"别人使用"问题 |

**结论:A + C 组合**——先组件化(不改行为),再接配置通道。

### 配置面设计(tsuzuri.toml)

```toml
outro_text = "谢谢观看"          # 片尾谢幕语;默认 "Thanks for watching :)";空串 "" 隐藏片尾文案
signature  = "signature.svg"     # 素材文件夹内的签名 SVG;缺省用内置签名
intro      = true                # 片头总开关;false 时跳过片头(plan 不再为片头预留时长)
```

- 仅用户显式设置的键进入 `meta.branding`(timeline schema v 保持不变,新增可选字段,老
  timeline 无该字段走默认值,向后兼容)。
- `signature` 的 SVG 由素材文件夹经 `publicDir` 服务,渲染器用
  `staticFile()` 取,和照片同一通道,无新资源机制。

### 自定义签名 SVG 的技术约束

现状:描边书写动画依赖**路径总长**(`Intro.tsx` 硬编码 2109.58,是
chrome-headless-shell 里 `getTotalLength()` 实测值;注释已说明多子路径
path 设置 `pathLength` 会禁用虚线,必须用真实长度)。自定义 SVG 长度未知,
需运行时测量:

- 组件挂载后 `fetch(staticFile(svg))` 取文本,解析出 `viewBox` 与所有
  `<path d>`;用 `delayRender()/continueRender()` 阻塞渲染直到就绪。
- 每条 path 各自 `getTotalLength()`(挂到隐藏 SVG 上测),**并行**做同参数
  描边动画(dasharray = 各自长度),fill 同步上墨——多笔画签名视觉上
  "同时写完",时长仍是 `INTRO.drawDuration`,**总时长不变**,因此
  `analyzer/plan.py` 的 `INTRO_DURATION` 镜像常量无需改动。
- 对使用者的约束(写进 config.md):
  - 轮廓填充型路径(和内置 Sacramento 字形同型),单色,`fill` 任意(渲染
    时强制 `currentColor` 覆盖);
  - 必须有 `viewBox`;只识别 `<path>`(text/rect 等元素报错提示先转路径);
  - 解析失败/文件缺失 → **报错终止**而非静默回退,避免用户误以为配置生效。
- 内置签名走原路径:常量长度、单 path,不 fetch,保证默认输出逐帧一致。

### `intro = false` 的联动

`plan.py` 目前无条件按 `INTRO_DURATION` 右移理想切换网格、按
`MIN_PHOTO_VISIBLE` 决定是否跳片头。`intro = false` 时 plan 不再预留片头
时长(网格不右移),渲染器同时不挂载 `<Intro>`。两端都从配置读,单一事实
来源是 toml,不会漂移。

### 实施步骤(阶段一)

1. **组件抽取(纯重构,行为不变)**
   - `Diary.tsx` 里内联的谢幕语 JSX 抽成 `renderer/src/Outro.tsx`,props:
     `{text, scale, opacity}`;默认文案仍来自 `OUTRO.text`。
   - 验证:`cd renderer && npm run typecheck`;用 examples/fixture 渲染前后
     视频抽帧 diff(或人工比对片尾几帧)。
2. **schema 与 plan 通道**
   - `renderer/src/types.ts`:`TimelineMeta` 增加可选
     `branding?: {outro_text?: string; signature?: string; intro?: boolean}`。
   - `analyzer/plan.py`:`KNOWN_KEYS` 增加三键;校验 `signature` 文件存在且
     后缀 .svg;写入 meta。注意 `_content_checksum` 会覆盖新字段——改了
     toml 就变 input hash、必然重规划,与手改保护机制无冲突,但需要跑
     `test_plan_hand_edit_preservation.py` 确认。
   - `docs/specs/timeline-schema.md`、`docs/config.md` 同步更新。
   - 测试:analyzer 加 toml 透传用例(`uv run pytest`)。
3. **Outro 接配置**:`Diary.tsx` 把 `meta.branding?.outro_text ?? OUTRO.text`
   传给 `Outro`;空串不渲染。片尾白场时长不变(文案不影响时序)。
4. **Intro 支持自定义 SVG**
   - `Signature.tsx` 改为可受控:默认导出内置 path;新增
     `useSignaturePaths(src?)` hook 做 fetch + 解析 + 测长(delayRender)。
   - `Intro.tsx` 按 paths 数组渲染,内置签名路径退化为单元素数组 + 常量长
     度(跳过测量)。
   - 验证:typecheck;fixture 无配置渲染与 main 分支输出比对;做一个带
     `signature.svg` 的临时素材夹跑通全流程。
5. **`intro = false` 联动 plan**:`plan.py` 头部预留逻辑接开关;渲染器
   `showIntro` 条件加 `meta.branding?.intro !== false`。跑
   `test_plan_head_tail_reserve.py` 并补用例。

---

## 第二部分:`tsuzuri still` 图片导出

### 命令设计

```
tsuzuri still <photo|folder> [-o <out.png|dir>] [--exif] [--sign] [--skip-existing] [--scale N]
```

- `<photo>`:单张图,默认输出到 `<照片所在文件夹>/output/stills/<名>.png`;其余变体为 `<名>-exif.png` / `<名>-sign.png` / `<名>-exif-sign.png`。
- `<folder>`:文件夹内全部照片批量导出到 `<folder>/output/stills/`。
- 若文件夹内有 `tsuzuri.toml`,遵循其 `width/height/background/photo_scale`
  ——still 与视频观感自动保持一致;无配置用 `theme.ts` 默认(1920×1080 白底
  0.8)。
- **不跑音频分析**:still 管道纯 Node(扫描 → EXIF → renderStill),不碰
  analyzer,速度秒级。

### 最高质量策略

- 格式:**PNG(无损)**,`renderStill({imageFormat: 'png'})`,不存在 jpeg
  质量参数问题。
- 分辨率:视觉规格以 1080p 为基准,直接 1920×1080 输出会把照片压到
  ~864px 高。用 Remotion `renderStill` 的 `scale` 超采样:**默认
  `--scale 2`(3840×2160)**,阴影/描边随 `height/1080` 等比缩放,视觉不变
  只提清晰度。上限 `--scale 4`(内存与 Chromium 画布上限考虑)。
  - 备选(记录不实施):按照片原生分辨率自动选 scale
    (`ceil(photoH / (canvasH * photo_scale))`),v2 再说。

### 布局设计

**无 `--exif`(默认)**:与视频中照片页完全一致——白底,照片居中,
`maxW/H = 画布 × photo_scale`,同一套三层阴影 + 1px 描边。

**有 `--exif`**:照片左、信息右,组合体整体居中(flex row + gap,外层
AbsoluteFill 居中,天然满足"水平垂直居中"):

```
┌──────────────────────────────────────────────────┐
│                                                  │
│      ┌────────────────┐                          │
│      │                │      Sony α7 IV          │
│      │     photo      │      FE 35mm F1.8        │
│      │                │                          │
│      │                │      35mm · f/1.8        │
│      │                │      1/250s · ISO 100    │
│      └────────────────┘                          │
│                              2026.05.21 18:42    │
│                                                  │
└──────────────────────────────────────────────────┘
```

对布局的评估:这个结构是成立的,就是经典的"展签"排法,注意三点——

1. **照片要多让位**:建议照片限位从 0.8 收到
   `maxHeight = 0.72 × 画布高`、`maxWidth = 0.52 × 画布宽`(1080p 下约
   778×998px),信息面板定宽 `0.24 × 画布宽`(约 460px),间距
   `0.05 × 画布宽`(约 96px)。竖图天然更窄,组合体仍居中,不需特殊分支。
2. **面板文字左对齐**、相对照片垂直居中;右侧留白比左侧多一点是正常的
   (组合体居中即可,不必强行光学配平)。
3. 以上比例进 `theme.ts` 新增 `STILL` 常量段,在 Remotion Studio 里肉眼
   微调后定稿——数值不必现在纠结。

### EXIF 字段取舍

按"摄影展签"原则:只留观看者关心的拍摄事实,四行封顶,缺哪行省哪行。

| 展示 | 来源字段 | 呈现 |
| --- | --- | --- |
| 相机 | Make + Model(去重叠词) | `Sony α7 IV`(v1 只做大小写规范 + Make/Model 去重) |
| 镜头 | LensModel | `FE 35mm F1.8` |
| 参数行 | FocalLength / FNumber / ExposureTime / ISO | `35mm · f/1.8 · 1/250s · ISO 100` |
| 拍摄时间 | DateTimeOriginal | `2026.05.21 18:42` |

**不展示**:GPS(隐私风险,坚决不上)、软件/固件、白平衡、测光模式、闪光
灯、曝光补偿、色彩空间——都是噪音。相机、镜头与拍摄参数均缺失时警告一行
并跳过该 EXIF 变体,不生成名不副实的 `-exif.png` / `-exif-sign.png`。

排版沿用现有语汇:Noto Serif 家族、墨色 `#37332D`、`0.12em` 字距;参数行
为视觉主角(字号同字幕 36),相机/镜头次之,时间最小且用 `INFO_BAR` 的灰
`#B0AEA6`。

### EXIF 提取实现

- cli 新增依赖 **`exifr`**(零依赖、纯 JS,支持 jpg/heic/webp/png),在
  `cli/still.mjs` 里提取并**格式化成最终字符串**后传 props——渲染器保持哑
  组件,不做任何解析,方便单测格式化逻辑。
- 不选 Python 侧提取:still 不应依赖 uv/analyzer 启动开销。

### 实施步骤(阶段二)

6. **CLI 解析**:`cli/options.mjs` 增加 `still` 子命令(photo|folder、
   `-o`、`--exif`、`--sign`、`--skip-existing`、`--scale`,scale 限 1–4 整数);`USAGE` 更新;
   `options.test.mjs` 补用例(含 `./still` 文件夹转义路径,沿用现有动词
   转义规则)。`cd cli && npm test`。
7. **渲染器:抽 `FramedPhoto` + 新 `Still` composition**
   - 从 `Photo.tsx` 抽出纯展示组件 `FramedPhoto`(Img + outline + 三层阴
     影),`Photo` 与 `Still` 共用,保证同款视觉且未来只改一处。
   - 新建 `Still.tsx`:props `{src, background, photoScale, sign?, signatureSrc?, exif?: {camera?, lens?, params?: string[], datetime?}}`,
     两种布局如上;`theme.ts` 增 `STILL` 常量段。
   - `Root.tsx` 注册第二个 `<Composition id="Still">`(defaultProps 用
     fixture 第一张照片,便于 Studio 调布局)。`npm run typecheck`。
8. **EXIF 模块**:`cli/exif.mjs` — `exifr` 提取 + 四行格式化(快门分数
   化、焦距取整、时间本地化格式),`exif.test.mjs` 覆盖缺字段/全缺/异常
   文件。
9. **渲染入口**:`cli/render-still.mjs` — 把 `render.mjs` 的 bundle 段抽成
   共享 helper(`cli/bundle.mjs`),`selectComposition('Still')` +
   `renderStill({imageFormat:'png', scale})`;批量模式复用同一 bundle 逐张
   renderStill(bundle 一次,快)。
10. **接线与文档**:`tsuzuri.mjs` 分发 `still` 命令;README 两语版、
    `docs/config.md` 增补;`docs/tsuzuri-status.md` 记录进展。

---

## 验证清单(整体)

- `cd cli && npm test`;`cd renderer && npm run typecheck`;
  `cd analyzer && uv run pytest`。
- 回归:examples/fixture 无任何新配置跑 `tsuzuri`,与改动前输出抽帧比对
  (片头签名、片尾文案各取 2–3 帧)。
- 新路径 smoke:临时素材夹分别验证 ①`outro_text` 中文文案 ②自定义
  `signature.svg` ③`intro=false` ④`still` 单张/文件夹/`--exif`/`--sign`/
  `--skip-existing`/`--scale`。

## 风险与备注

- **自定义 SVG 形态千奇百怪**:描边书写动画只对"轮廓填充型"路径成立;
  单笔画 stroke 型 SVG 视觉会退化成细线。文档写清约束,解析时对无
  viewBox/非 path 元素给出可读报错。
- **手改 timeline 保护**:meta 新增字段参与 `plan_checksum`,理论上与手改
  识别机制正交(toml 变 → input hash 变 → 重规划),但必须跑现有
  `test_plan_hand_edit_preservation.py` 确认,不要凭推断。
- **`--scale 4` 内存**:4K×2 超采样下 Chromium 截图内存可观,文档提示;
  默认 2 是质量/资源的平衡点。
- **exifr 对 HEIC**:主流路径可用,但 HEIC 变体多,提取失败按"无 EXIF"
  降级并警告,不阻断导出。
- 片头/片尾配置**不影响任何时序常量**,`plan.py` 与 `theme.ts` 的镜像常量
  (`INTRO_DURATION`/`WHITE_FADE_DURATION`)无需变更——这是本方案刻意保持
  的边界;唯一例外是 `intro=false`,两端同源于 toml。
