# 执行方案：纯黑背景与暗色展陈色板

> 状态：已实施（2026-07-13）。结论先行：不新增 `theme` 配置键，也不做
> 逐色反转——由 `background` 与两套主文字的对比度自动推导明/暗色板，色板解析只落在
> `renderer/src/theme.ts` 一处；命令面按交互菜单方案的既有模式扩展：still
> 加 `--dark` 旗标 + 菜单第三问，视频暗底走 toml，不加旗标。

## 背景与定位

现状：画布 `background` 已是 tsuzuri.toml 一等配置（默认 `#FFFFFF`），
timeline / still props 全链路透传，片尾淡场、片头卡、album 过渡盖层都已经
消费 `meta.background`——画布层天然可黑。真正的缺口在**前景**：

- 墨色文字 `#37332D`（字幕、谢幕语、EXIF 主信息、签名）
- 次级灰 `#B0AEA6`（EXIF 时间行 / INFO_BAR）
- 分隔线 `#E4E2DC`、照片描边 `rgba(16,20,26,0.10)`
- 三层冷黑阴影 `rgba(10,12,16,…)`

以上全部硬编码亮色假设在 `theme.ts`。今天写 `background = "#000000"`
得到的是黑底黑字黑阴影。本方案补齐暗色前景，并给黑底一个正式入口。

## 三条设计边界（定案，实施时不再讨论）

1. **单一旋钮，对比度推导**——不加 `theme` 键。`getPalette(background)` 按
   WCAG 对比度选择主文字对当前背景更清晰的 light / dark 色板。好处：
   零新配置键、不存在"黑底 + 墨字"的非法组合、`plan.py` / `still.mjs` /
   timeline schema 零改动——色板逻辑只在渲染器一处，无跨语言镜像常量。
2. **两套预设，不做主题系统**——只维护 light / dark 两组色值,不开放逐色
   配置。中间亮度的自定义背景（如中灰）按文字对比度归类，文档只承诺纯白/纯黑
   两个预设的视觉效果。
3. **老配置零变化**——默认白底路径的每个色值一个不动；dark 是纯新增分支。
   视频命令面维持"文件夹进、文件出"零旗标（菜单方案边界 3 的延续），暗底
   视频只走 toml；still 因单文件模式常在无 toml 的目录下使用，给旗标。

## 暗色色板推导（step by step）

### 0. 总纲：不是"反色"，是换一间展厅

亮色主题的隐喻是白墙画展：纸白墙、墨色题签、自然投影。简单 invert
（纯白文字、白色阴影）得到的是 UI 深色模式的观感,不是展陈。暗色主题的
参照应是**暗厅摄影展**：黑墙、射灯、暖白展签。每个元素按"这间展厅里它
是什么"重新推导，而不是数值取反。

### 1. 阴影：黑底上阴影物理失效，不反白

黑底上的黑阴影不可见；把阴影反成白色会变成"发光"，像霓虹 UI 而非展陈。
暗厅里照片与墙的分离靠的是灯光与边缘，不是投影。处置：

- **描边升格为边缘定义主角**：亮色下 hairline 是点缀
  （`rgba(16,20,26,0.10)`），暗色下加强为 `rgba(232,229,222,0.16)`——
  同时解决暗部照片"沉入"纯黑背景无边界的问题。
- **阴影层换成一层低强度暖光晕**：保留 `shadowLayers` 数组结构（缩放
  函数 `getPhotoShadow` 不动），dark 色板给
  `{x:0, y:0, blur:80, spread:-12, color:'rgba(255,252,244,0.06)'}`
  单层，模拟射灯环境光。视觉调参阶段若嫌多余可归零成空数组，结构允许。

### 2. 文字：暖纸白，不用纯白

`#FFFFFF` 文字在纯黑底上有眩光感（halation），36px / 500 字重的衬线细笔画
尤其明显。沿用"墨与纸"的材质关系做对调：亮色是纸上墨（`#37332D` 暖黑），
暗色就是墨上纸——**暖纸白 `#E8E5DE`**。色温与现有墨色同族（偏暖微黄），
避免冷白的荧幕感。

### 3. 次级灰：不做等距反转，黑底适当提对比

亮色的 `#B0AEA6` 对白底约 2.1:1，是刻意的"耳语级"信息（EXIF 时间行）。
若等距反转,黑底上等效值约 `#4A4843`（≈2.1:1），但暗底上细衬线字的可读性
衰减比亮底更狠（笔画被背景"吃"进去），等距反转会直接糊掉。取
**`#807D76`（对黑底 ≈5:1）**：仍明显弱于主文字（16.8:1），层级关系保住，
可读性不牺牲。

### 4. 分隔线与签名

- 分隔线 `#E4E2DC` → `#2A2925`：同为"比背景抬起一档"的 hairline 灰。
- 签名（片头 Intro 与 still 落款）颜色本就引用墨色（`INTRO.color`、
  `STILL.signature.color = INTRO.color`），随主文字换暖纸白即可,
  opacity（0.9 / 0.65）不动——引用链保持,不新增独立色值。

### 5. 色板总表

| 元素 | light(现状,不动) | dark(新增) | 对黑底对比度 |
| --- | --- | --- | --- |
| 画布 | `#FFFFFF` | `#000000` | — |
| 墨色文字(字幕/谢幕/EXIF/签名) | `#37332D` | `#E8E5DE` | ≈16.8:1 |
| 次级灰(时间行/INFO_BAR) | `#B0AEA6` | `#807D76` | ≈5:1 |
| 分隔线 | `#E4E2DC` | `#2A2925` | hairline |
| 照片描边 | `rgba(16,20,26,0.10)` | `rgba(232,229,222,0.16)` | — |
| 照片阴影 | 三层冷黑投影 | 单层暖光晕 `rgba(255,252,244,0.06)` | — |

覆盖的可见元素清单（自查完整性）：视频字幕、片头签名卡、片尾谢幕语、
片尾淡场（已消费 `meta.background`，自动淡黑，无需改）、album 过渡盖层
（同上）、still 无 EXIF 落款、still EXIF 展签全部四级文字 + 分隔线 + 面板
落款、照片描边与阴影。INFO_BAR 目前无消费方，色值一并入板防漂移。

## 命令面与菜单（沿用交互菜单方案的模式)

- **toml**：`background = "#000000"` 即全套暗色,无新键。config.md 在
  `background` 行补一句"深色背景自动切换暗色文字与光影"。
- **still 旗标**：`tsuzuri still <target> --dark`——等价于把画布背景覆盖为
  `#000000`（优先于 toml 的 `background`）。输出文件名后缀链追加 `-dark`
  （如 `001-exif-sign-dark.png`），避免明暗两版互相覆盖,
  `--skip-existing` 语义随后缀自然区分。
- **菜单**：选 2（still）在两问 y/N 后加第三问「黑色背景?[y/N]」，默认否；
  `buildArgvFromChoices` 追加 `--dark`。等效命令回显随之教学：
  `└ 等效命令: tsuzuri still ./photos --exif --sign --dark`。
  选 1（视频）不加问答——保持"拖进来就走"，暗底视频由收尾那句 toml 提示
  引导（提示文案已含"分辨率/过渡/字幕…"，补"背景"一词即可）。
- **USAGE**：still 选项行补 `--dark`。
- 菜单仍只组装 argv 交回 `parseArgs`,同一条代码路径,零语义分叉。

## 实施步骤

1. **`renderer/src/theme.ts`**：新增 `PALETTES = {light, dark}`（表 5 全部
   色值）与纯函数 `getPalette(background: string)`——解析 `#RGB`/`#RRGGBB`
   算相对亮度并比较两套主文字的 WCAG 对比度，取对比度更高者；解析失败回退
   light（与今日行为一致)。现有
   `SUBTITLE.color`、`OUTRO.color`、`INTRO.color`、`INFO_BAR.color`、
   `STILL.typography.{color,datetimeColor,dividerColor}`、
   `PHOTO.{shadowLayers,outlineColor}` 的色值字段收敛进 `PALETTES.light`
   （字号/间距/时序等非色值字段留在原常量）；`getPhotoShadow` 增加色板参数。
2. **组件接线**：`Diary` 以 `getPalette(meta.background)` 算一次，传给
   `Photo`→`FramedPhoto`、`Subtitle`、`Outro`、`Intro`（签名 color）;
   `Still` 同样以 `props.background` 推导，传 `FramedPhoto`、`ExifPanel`、
   两处 `Signature`。不引 React context——传参链短（最深两层），props 显式。
3. **`cli/options.mjs`**：`parseStillArgs` 增 `--dark` 布尔旗标；USAGE 更新。
4. **`cli/still.mjs`**：`runStill` 在 `loadStillCanvasConfig` 后按
   `opts.dark` 覆盖 `canvas.background = '#000000'`；`resolveJobs` 的
   `variantSuffix` 链追加 `-dark`（exif→sign→dark 顺序固定）。
5. **`cli/menu.mjs`**：still 分支第三问 y/N；`buildArgvFromChoices` 增
   `dark` 参数。
6. **测试**（node:test，cli 侧）：`--dark` 解析、未知组合报错不回归、
   `buildArgvFromChoices` dark 组合、`formatEquivalentCommand` 含 `--dark`、
   `resolveJobs` 后缀矩阵（dark × exif × sign）。渲染器无测试框架，
   `getPalette` 以 `npm run typecheck` + 手工样张验证（见清单)。
7. **文档**：config.md `background` 行补自动暗色说明与示例;README 两语版
   still 选项速查补 `--dark`，可选补一张黑底 still 案例图（与现有
   `still-exif-sign-case.png` 同源照片对照)；docs/tsuzuri-status.md 记录。

## 验证清单

- `cd cli && npm test` 全绿,existing 用例不回归。
- `cd renderer && npm run typecheck`。
- 手工样张（examples/fixture）：
  - `tsuzuri still examples/fixture/photos/001.jpg --dark`：暖纸白落款、
    描边可见、无"白色发光阴影"违和感。
  - `still --dark --exif --sign`：展签四级文字层级清晰,时间行明显弱于
    参数行但可读;分隔线若隐若现;输出名含 `-dark`。
  - fixture 里放 `tsuzuri.toml` 写 `background = "#000000"` 渲染视频：
    片头签名写出为暖纸白、字幕可读、片尾淡至黑、谢幕语浮现正常;
    album 过渡无白色闪缝（盖层已用 meta.background,应天然正确,仍需目验）。
  - 白底回归：删掉 toml 后重渲 fixture,与现有产物目视无差。
- 菜单手工：选 2 三问路径走通,等效命令含 `--dark` 且可直接复制执行。

## 风险与备注

- **`background` 是自由字符串**：只解析 hex（`#RGB`/`#RRGGBB`），`black`、
  `rgb(...)` 等写法回退 light 色板。config.md 注明"请用 hex"；不做 CSS
  颜色名解析（收益配不上复杂度）。
- **中间亮度背景**：按两套主文字对比度择优，避免相对亮度并非中点尺度造成
  浅灰误选暖白文字；两套色板
  在极端自定义色上不保证和谐——边界 2 已声明只承诺黑白两预设。
- **改 toml 触发全量重跑**：`background` 计入 input hash,纯改背景也会
  重新 analyze/plan。现状机制,已知成本,不在本方案内优化。
- **`ANIMATION.whiteFadeDuration` 命名**：语义从"淡至白"泛化为"淡至画布
  色"，实现本就消费 `meta.background`;常量名与 `plan.py`
  `WHITE_FADE_DURATION` 有镜像约束,**只改注释,不改名**。
- **素材自带白边**（拍立得扫描件等）在黑底上会很抢眼——属素材本身特性,
  不做处理,不在方案范围。
- **JPEG 暗部**：照片暗角与纯黑背景交界处的分离完全依赖描边,若调参阶段
  觉得 0.16 不够,只动 dark 色板一处即可,不牵连亮色。
