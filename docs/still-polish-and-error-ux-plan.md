# 执行方案:报错文案人性化 + still 命名/覆盖语义 + still 签名与 EXIF 展示优化

> 状态:已实施(2026-07-12)。承接 branding-and-still-export-plan.md 的实现,
> 含该实现 code review 的待修项。不含代码,只定方案与步骤。

## 零、Review 待修项(来自本轮 code review)

按严重度排序,修复步骤并入下方各阶段:

| # | 位置 | 问题 | 处置 |
| --- | --- | --- | --- |
| R1 | `renderer/src/Signature.tsx` `useSignatureData` | 组件卸载时 cleanup 只置 `cancelled = true`,未清理 pending 的 `delayRender` handle → fetch 完成后既不 `continueRender` 也不 `cancelRender`,Studio 里拖动时间轴可触发 "delayRender was not cleared" 30s 超时报错(headless 渲染因首帧阻塞机制不受影响) | cleanup 里对未决 handle 调 `continueRender` |
| R2 | `analyzer/plan.py` DEFAULTS | `outro_text` 默认值字面量复制了 `theme.ts` 的 `OUTRO.text`,且 plan 把默认值也写进每份 timeline 的 `meta.branding` → 渲染器的默认值对新 timeline 永远不生效,形成第二事实来源,将来改默认文案会静默漂移 | plan 只写用户在 toml 里**显式设置过**的键;未设置的键不进 meta,默认值单一来源留在渲染器(intro 同理) |
| R3 | `cli/still.mjs` 输出命名 | ①普通版与 `--exif` 版同名互相覆盖;②同名不同扩展名的源图(`a.jpg` + `a.webp`)在批量导出时静默互相覆盖 | 见"第二部分"命名方案 |
| R4 | `cli/still.mjs` `-o out.jpg` | 单文件模式传非 .png 扩展名被静默改写成 `out.jpg.png` | 直接报错:"still 只导出 PNG,-o 请以 .png 结尾或传目录" |
| R5 | `cli/still.mjs` `loadStillCanvasConfig` | 手写 flat-TOML 解析与 `plan.py` 的 tomllib 是两套解析器,`[table]`/多行字符串会静默读错(当前 config.md 只有平铺键,风险休眠) | 加镜像注释互指;config.md 明示"配置须平铺";v2 再考虑统一 |
| R6 | `cli/still.mjs` 批量循环 | 每张都调一次 `selectComposition`,但全部 job 的画布元数据相同 | 提到循环外调一次;每次 render 必须用当前 `inputProps` 更新 `composition.props`,否则首次的 `exif:null` 会覆盖动态 EXIF |
| R7 | `cli/still.mjs` | 进度条活跃期间用 `term.detail` 打印输出路径,可能与进度行交错 | 改用 `progress.println`(render.mjs 已有先例) |

Review 通过项(不动):hooks 顺序安全;老 timeline 无 `branding` 字段的向后
兼容;`intro=false` 的 plan/渲染两端联动与测试;`FramedPhoto` 抽取;
exif 格式化函数与测试;最终验证(cli 46 test / typecheck / analyzer 75 test)全绿。

---

## 第一部分:报错文案与系统性排查(问题 1)

### 审计结论

全仓路径解析都基于 `import.meta.url` / 绝对路径,**cwd 不影响正确性**;
`renderer/cli/tsuzuri.mjs` 转发垫片已覆盖"在 renderer/ 下误跑"的 cwd 陷阱。
问题集中在四类报错文案,逐一定位:

**E1 命令未安装 → Node 式 ENOENT 泄漏**

- `cli/tsuzuri.mjs` `run()` 与 `cli/lyrics.mjs` 同款:`分析音频失败: 无法执行 uv: spawnSync uv ENOENT`
  ——用户看不懂 ENOENT,也不知道下一步。
- `normalizeLoudness` 更隐蔽:ffmpeg 未装时只报"响度测量失败,保留原始响度",
  把"依赖缺失"伪装成"测量失败",用户不知道装 ffmpeg 就能好。

改进原则:`spawnSync` 的 `error.code === 'ENOENT'` 单独分支,输出三段式
——**发生了什么 + 怎么修 + 排查入口**:

```
● 分析音频失败: 找不到命令 uv(未安装或不在 PATH)
└ 安装: curl -LsSf https://astral.sh/uv/install.sh | sh
└ 运行 tsuzuri doctor 可一次检查全部依赖
```

安装指引直接复用 `doctor.mjs` 里已有的 fix 文案(单一来源:把
uv/ffmpeg 的 fix 字符串从 doctor.mjs 导出共享,避免两处漂移)。

**E2 阶段失败信息过简**

- `${stage}失败(退出码 ${code})`:子进程 stderr 因 stdio:inherit 已在上方,
  但用户不知道"往上看"。每个阶段补一行 detail 指路:
  - 分析音频失败 → `└ 具体原因见上方 analyzer 输出;首次运行需联网下载模型,网络问题可重试`
  - 渲染视频失败 → `└ 具体原因见上方输出;依赖问题可先跑 tsuzuri doctor`
- `render.mjs` 顶层 catch 只打 `error.message`,深层 Remotion 错误缺上下文
  → 支持 `DEBUG=1`(或 `TSUZURI_DEBUG=1`)时打印完整 stack,平时保持一行。
  专业人员据此排查,普通用户不受噪音干扰。

**E3 把单张照片当视频入口**

- `tsuzuri photo.jpg` → `不是文件夹: /path/photo.jpg`,现在有 still 了,
  应当引导:目标是**存在的图片文件**时,追加
  `└ 要导出单张静态图?用: tsuzuri still photo.jpg`;
  是存在的音频文件时,提示"把音频和照片放进一个文件夹后传文件夹"。
- 反向同理:`tsuzuri still <folder>` 落到"文件夹里没有图片"已可读,不动。

**E4 内部命令名泄漏**

- `analyzer/plan.py:330`:`找不到 beats.json: ...(先跑 tsuzuri-analyze)`
  ——`tsuzuri-analyze` 是 uv 内部脚本名,用户应被告知跑 `tsuzuri <folder>`。
  文案改为:`(正常流程由 tsuzuri <folder> 自动生成;单独调试可用 uv run tsuzuri-analyze)`
  ——用户看主句,专业人员看括号。
- `cli/render.mjs` 用法错误 `用法: render.mjs <timeline.json> ...` 只在被
  手动调用时出现,保留但补一句"此为内部入口,日常请用 tsuzuri <folder>"。

**E5 附带发现(低优先,列入待办不阻塞)**

- `computeInputHash` 读文件若中途文件被删,裸 Node ENOENT 冒到顶层
  `tsuzuri: ENOENT: no such file or directory, open '...'`——罕见,可在顶层
  catch 里把 `error.code === 'ENOENT'` 翻译成"文件在处理过程中消失/无法读取"。

### 实施步骤(阶段 A)

1. **共享依赖修复文案**:`doctor.mjs` 导出 `FIXES = {uv, ffmpeg, renderer}`;
   doctor 自身与 E1 分支共用。
2. **`run()` 三段式报错**:`tsuzuri.mjs` 与 `lyrics.mjs` 的 `run()` 收拢为一处
   (放 `term.mjs` 旁的小模块或 project.mjs),ENOENT 分支 + 各阶段 detail 指
   路;`normalizeLoudness` 先探测 ffmpeg 存在性,缺失时明说。补 node:test
   用例(mock spawnSync error.code)。
3. **入口误用引导**:`tsuzuri.mjs` 的"不是文件夹"分支按目标类型(图片/音频/
   不存在)给差异化提示;补测试。
4. **analyzer 文案**:plan.py:330 与同类消息改"用户主句 + 括号内专业指引";
   `uv run pytest` 回归。
5. **DEBUG stack**:render.mjs / still.mjs / tsuzuri.mjs 顶层 catch 统一支持
   `TSUZURI_DEBUG=1` 打 stack;README 排障一节提一句。

---

## 第二部分:still 的文件名与覆盖语义(问题 2)

### 现状回答

- 文件名 = 源图去扩展名 + `.png`(`IMG_001.jpg` → `IMG_001.png`),与源文件
  **不同名**(扩展名变了),不会碰源图;写到 `output/stills/` 子目录。
- `renderStill({overwrite: true})`:**重复导出会静默覆盖**。
- 普通版和 `--exif` 版**同名**:后导出的覆盖先导出的(R3①)。
- 隐藏坑:`a.jpg` 与 `a.webp` 批量导出都写 `a.png`,互相覆盖(R3②)。

### 语义决策:默认覆盖,不做"存在即跳过"

你担心的完全对:**"存在即跳过"会重演视频那次的陈旧缓存问题**(视频导出后
才做的片头文案,再导出因缓存跳过而依旧没有)。那次的根因是"跳过重算"的
判断不知道算法/配置变了;still 若按"文件存在"跳过,布局改了、签名加了、
EXIF 开了都不会刷新,同一类 bug。

决策:

- **默认永远覆盖**——still 是显式动作,"我要现在这份视觉的结果",确定性
  高于省时间;单张秒级,成本可接受。
- **变体分离命名**,扩展名始终只有 `.png`,四种结果可在同一目录共存:
  - 普通:`IMG_001.png`
  - EXIF:`IMG_001-exif.png`
  - 签名:`IMG_001-sign.png`
  - EXIF + 签名:`IMG_001-exif-sign.png`
- **同名冲突消歧**:resolveJobs 后按 outPath 分组,冲突的 job 自动把原扩展名
  并入 basename,如 `a-jpg.png` / `a-webp.png`,并 `term.warn` 一行;不报错中断。
- **`--skip-existing` 显式选项**(批量续跑场景):明示跳过并输出
  `└ 跳过 N 张已存在(--skip-existing)`;默认关。陈旧风险由"显式打开 +
  明示计数"兜住——用户主动要的跳过,和静默缓存不是一回事。

### 实施步骤(阶段 B)

6. **命名与冲突**:`resolveJobs` 产出 outPath 时按 `--exif` 加 `.exif` 段;
   加冲突检测与消歧 warn;`-o` 非 .png 扩展名改报错(R4);补测试
   (jpg/webp 同名、exif 与普通并存、`-o out.jpg` 报错)。
7. **`--skip-existing`**:options.mjs 解析 + still.mjs 跳过逻辑 + 计数输出;
   补测试。
8. **顺手修 R6/R7**:`selectComposition` 提到循环外,render 时以当前 job 的
   `inputProps` 覆盖 `composition.props`;路径打印改 `progress.println`。

---

## 第三部分:still 上的个性签名 + EXIF 展示优化(问题 3)

### 签名要不要放?放哪?

要放——still 的定位是"可分享的作品卡",签名就是落款。静态渲染:
`Signature` 组件现成支持(fill 满、无描边动画,`pathProps` 传空即可);
签名来源与视频同源:文件夹 `tsuzuri.toml` 的 `signature` 键,有自定义用
自定义,没有用内置。

开关:`--sign` 命令行开关,默认关(保持现有输出不变;想常开的用户在
alias 里带上即可,v2 若呼声高再考虑 toml 键)。

**无 EXIF 布局的位置**,三个候选的取舍:

| 候选 | 评价 |
| --- | --- |
| **照片下缘与画布底边之间的带状区,水平居中(推荐)** | 与视频字幕带同一位置语言,"画展作品下的署名牌";组合体视觉重心稳 |
| 照片上方带状区居中 | 头重脚轻,签名会先于照片被读到,喧宾夺主 |
| 画布右下角 | 是"水印"的语言而不是"落款",和整个展陈语汇冲突;且靠角切割留白 |

推荐参数(1080p 基准,进 `theme.ts` STILL 常量,Studio 里微调):photo_scale
0.8 时下带高 108px,签名字形高取 **~56px**、垂直居中于下带;颜色用 INTRO
的墨色 `#37332D`,实测后透明度定为 **0.65**(清晰但仍低于正文层级)。注意竖图时下带不变(照片按
高度顶满),横图很宽时照片按宽度限制、下带会变高——签名仍锚定"照片下缘
到画布底"的实际间隙居中,而不是固定坐标。

**带 EXIF 布局的位置**:放**信息面板内部底部**(datetime 之后,隔一个
groupGap,与面板文字左对齐,字形高 **~44px**、同样降透明度)。理由:展签
被"签署"是自然的视觉隐喻;面板本身参与组合体居中,签名进面板不破坏几何;
若放画布右下角或照片下方,会出现第三个视觉锚点,和"照片 + 面板"的双元
结构打架。

### 参数行改四行

同意。单行 `45mm · f/22 · 1/75s · ISO 200` 在窄面板(0.24 × 画布宽)里
接近撑满,长焦段(`105mm`)+ 高 ISO(`ISO 12800`)时必换行,断点不可控。
改四行竖排:

```
Sony α7 IV
FE 35mm F1.8

45mm
f/22
1/75s
ISO 200

2026.05.21 18:42
```

**行首不加 "·"**:中点是"同行分隔符",拆行后它的职责消失了;行首加点会
读成 bullet list,和衬线展签的气质冲突,左对齐本身就是结构。若想强化
"参数组"的整体感,用**参数组上方一条细分隔线**(1px、浅灰 `#E4E2DC`、宽
约面板一半)代替,更展签。

实现面:`StillExif.params` 从 `string` 改为 `string[]`(CLI 侧
`formatParams` 返回数组,渲染器逐行画);字号从 36 降到 **~30**(四行后
参数组块变高,原字号会压过相机行),行距用现有 lineGap 略收(~8)。
`Root.tsx` 的 `defaultStillProps` 同步给一组示例值方便 Studio 调。

### EXIF 残缺的分级策略(微信保存等)

微信/微博等转存会剥离机型与拍摄参数,常只剩(甚至伪造)时间。分级规则:

- **a. camera / lens / params 至少一项存在** → 正常出展签,缺行省略
  (现状已如此)。
- **b. 只剩 datetime** → **跳过 EXIF 变体导出**,并 warn:
  `└ IMG_x.jpg: EXIF 信息不足,已跳过导出`。EXIF 命令不生成名不副实的普通布局文件。
  孤零零一行时间的面板视觉是破的;且转存图的时间常是"保存时间"而非
  拍摄时间,展示反而误导。
- **c. 全空** → 同 b,提示并跳过。
- **明确不做**:不用文件 mtime 兜底"拍摄时间"——微信保存时间没有意义,
  宁缺毋滥。

判定实现:`extractFormattedExif` 返回后,调用方检查
`camera || lens || params`,不满足视为 null(逻辑放 exif.mjs,可单测)。

### 实施步骤(阶段 C)

9. **R1/R2 先修**(改动最小、独立可验):Signature cleanup 清 handle;
   plan.py 只写显式设置的 branding 键(改 `test_plan_branding.py` 断言:
   默认配置下 meta.branding 不含 outro_text/intro,或整个键缺省)。
   注意:R2 改后渲染器行为不变(`?? OUTRO.text` 兜底已在),但 fixture
   timeline 若已含 branding 需同步。
10. **参数四行 + 分隔线**:exif.mjs `formatParams` 返回 `string[]`;
    Still.tsx 逐行渲染 + 可选细线;theme.ts 调字号/行距;exif.test.mjs 与
    Studio 目检。
11. **EXIF 分级**:exif.mjs 加"datetime-only 视为无效"判定 + 单测;
    still.mjs warn 文案统一。
12. **签名落款**:Still.tsx 接 `sign?: boolean` + `signatureSrc?: string`
    props(静态 Signature);两种布局各自的位置常量进 STILL;options.mjs
    加 `--sign`;still.mjs 从 canvasFolder 的 toml 读 signature 键(复用
    loadStillCanvasConfig,注意 R5 的平铺约束)传给 props;自定义 SVG 复用
    useSignatureData(fetch + delayRender 在 still 渲染同样生效)。
13. **文档**:README 两语版 still 一节、config.md、tsuzuri-status.md 更新;
    docs/branding-and-still-export-plan.md 标注被本方案取代的段落。

---

## 验证清单

- `cd cli && npm test`;`cd renderer && npm run typecheck`;
  `cd analyzer && uv run pytest`。
- 报错文案手工触发矩阵:临时改 PATH 去掉 uv / ffmpeg 各跑一次;
  `tsuzuri photo.jpg`;`tsuzuri still x.txt`;`-o out.jpg`;删 beats.json 后
  直接跑 plan。
- still 语义:同一张图四种组合导出后 `IMG.png` / `IMG-exif.png` /
  `IMG-sign.png` / `IMG-exif-sign.png` 并存且内容对应;`a.jpg`+`a.webp` 批量冲突消歧 warn;
  `--skip-existing` 计数正确。
- 视觉:Studio 目检四种组合(±exif × ±sign)+ 竖图/横图/全景各一张;
  微信转存图(datetime-only)走 b 分支。
- 回归:examples/fixture 跑视频管道,确认 R2 改动后片头片尾不变。

## 风险与备注

- R2(plan 不再写默认 branding)会改变新生成 timeline.json 的内容 →
  `plan_checksum` 变化属预期;手改保护逻辑不受影响,但要跑
  `test_plan_hand_edit_preservation.py` 实证。
- `--sign` 用自定义 SVG 时,still 渲染路径首次引入 useSignatureData 的
  fetch(之前只有视频 Intro 用),R1 修复应先行。
- 展签分隔线/字号是审美参数,方案值是起点,以 Studio 目检为准;定稿后
  记得同步 defaultStillProps 示例。
- E1/E2 改 `run()` 时注意 lyrics.mjs 与 tsuzuri.mjs 收拢后行为一致
  (退出码透传、stdio inherit 不变)。
