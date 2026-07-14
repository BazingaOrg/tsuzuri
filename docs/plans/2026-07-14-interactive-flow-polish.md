# 交互流程与提示统一优化

> 状态:方案已确认(三项决策按推荐定稿),待实施。

## 背景

菜单(menu.mjs)、fetch 备料(fetch.mjs)和渲染兜底(offerFetch)构成了三层交互:
菜单选路 → 命令分支 → 分支内的是/否与列表问答。三层是分三次迭代长出来的,
问答约定(默认值、放弃键、标点、readline 生命周期)各自为政,存在语义冲突和
「出错即全部重来」的体验断点。

## 现状问题清单

| # | 问题 | 位置 |
| --- | --- | --- |
| P1 | 同一子流程内「0」「回车」语义相反:关键词提示 `0=放弃/回车=确认`,紧接的候选列表 `0=换关键词/回车=放弃` | fetch.mjs lyricsFlow/audioFlow |
| P2 | 菜单不校验路径,错误在命令层抛出后进程退出,用户需从头重走菜单 | menu.mjs runMenu |
| P3 | 菜单无效序号静默重问、无显式退出键(仅 Ctrl+C) | menu.mjs runMenu |
| P4 | 确认题默认值靠 isYes/isNo/acceptsDefaultYes 三个函数 + 手写文案对齐,标点全角/半角混用 | menu.mjs, fetch.mjs |
| P5 | 兜底流程拒绝下载后紧接 scanFolder 报错,未提示 `tsuzuri fetch` 补救入口 | tsuzuri.mjs + project.mjs 报错文案 |
| P6 | fetch 遇到多个音频只说「手动清理」,不提供交互选择 | fetch.mjs runFetch |
| P7 | fetch 备料完成后没有「下一步渲染」引导 | fetch.mjs runFetch |
| P8 | runMenu 与 withReadline 两套重复的 readline 生命周期(SIGINT/EOF/abort) | menu.mjs, fetch.mjs |

## 设计原则(统一交互语法)

所有问答归为三类,每类固定一套键位与文案模板,由共享 helper 生成,不再手写:

1. **确认题** `ask.confirm(text, {dangerous})`
   - 无害/建议步骤 → `[Y/n,回车=是]`;破坏性(覆盖/替换) → `[y/N,回车=否]`。
   - 由 dangerous 标志决定默认值,文案后缀自动拼接,杜绝漂移。
2. **列表题** `ask.pick(text, items)`
   - 数字选择;`0` 固定 = 返回上一步(如换关键词);回车 固定 = 放弃当前子流程。
   - 无效序号打印一行提示后重问,不静默。
3. **输入题** `ask.line(text, {defaultValue, validate})`
   - 回车 = 接受方括号内展示的默认值;`validate` 失败打印原因并重问(用于路径)。

「放弃子流程」永远是回车空输入,「返回上一步」永远是 0 —— 消除 P1 的键位冲突。
(备选:引入 `q` 作为放弃键;见「待确认决策」。)

## 改动方案

### 1. 新增 `cli/prompts.mjs`:共享问答层(P1/P4/P8)

- 抽取 readline 生命周期(SIGINT、EOF 按放弃退出 130)为 `withPrompts(fn, {input, output})`,
  runMenu 与 fetch 均改用它;删除 fetch.mjs 的 withReadline 与 menu.mjs 内联版本。
- 实现 confirm/pick/line 三个 helper;isYes/isNo/acceptsDefaultYes 收敛为内部实现。
- 统一提示标点为半角逗号 + 全角顿号仅用于中文语句,menu/fetch 全部过一遍文案。

### 2. 菜单层加固(P2/P3)

- 路径题改用 `ask.line` 的 validate:normalizeDroppedPath 后检查存在性
  (菜单项 1/3/5 要求目录;2 允许文件或目录),不存在则提示并重问,不再带病出菜单。
- 无效序号提示「无效选择,请输入 1-5」;序号题支持输入 `q` 直接退出(打印再见语,exit 0)。
- still 三连问保持三问,但文案补一句用途简述(一行内),不新增交互形态。

### 3. fetch 链路梳理(P1/P6/P7)

- lyricsFlow 关键词题改为:回车=确认默认关键词、输入=换词、**空放弃移到列表题**——
  即关键词题不再有「0=放弃」;候选列表题回车=放弃、0=换关键词(与 audioFlow 对齐)。
- runFetch 多音频分支:用 `ask.pick` 列出音频让用户选保留哪个(其余需确认后删除),
  选择放弃则维持现有「手动清理」提示。
- runFetch 正常结束时,按最终素材状态打印下一步引导:
  素材齐全 → `可运行 node cli/tsuzuri.mjs <folder> 渲染`;缺照片则提示先放照片。

### 4. 兜底与报错衔接(P5)

- offerFetch 中用户拒绝下载音频后,term.info 一句「之后可运行 tsuzuri fetch <folder> 补齐」
  再返回;scanFolder 的缺音频报错文案追加同样的提示行(仅交互终端可见入口,文案通用)。

### 5. 文档同步

- README 中英文若涉及键位描述(0/回车)则同步;docs/tsuzuri-status.md 验证基线更新。

## 影响文件

| 文件 | 改动 |
| --- | --- |
| `cli/prompts.mjs`(新增) | withPrompts + confirm/pick/line |
| `cli/prompts.test.mjs`(新增) | 三类问答默认值/校验/放弃键的注入流测试 |
| `cli/menu.mjs` | 改用 prompts;路径校验重问;无效序号提示;q 退出 |
| `cli/fetch.mjs` | 改用 prompts;键位统一;多音频选择;结束引导 |
| `cli/tsuzuri.mjs` | offerFetch 拒绝后的补救提示 |
| `cli/project.mjs` | 缺音频报错追加 fetch 提示行 |
| `cli/menu.test.mjs`、`cli/fetch.test.mjs` | 键位与文案断言同步 |
| README / status 文档 | 键位描述同步 |

## 步骤

1. prompts.mjs + 测试 → verify: prompts.test.mjs 通过
2. menu.mjs 迁移(路径校验、无效提示、q 退出) → verify: menu.test.mjs 更新后通过
3. fetch.mjs 迁移(键位统一、多音频选择、结束引导) → verify: fetch.test.mjs 更新后通过
4. tsuzuri.mjs / project.mjs 衔接提示 → verify: 相关测试 + 手动走查
5. 文档同步 → verify:通读 + git diff --check
6. `npm --prefix cli test` 全绿;手动冒烟:菜单每个分支、错误路径重问、
   fetch 全链路(含多音频)、非交互管道行为不变

## 已确认决策(2026-07-14)

1. **放弃键 = 回车空输入,上一步 = 0**。不引入 `q` 作为子流程放弃键,沿用并统一
   现有键位习惯;`q` 仅在菜单序号题作为显式退出。
2. **多音频交互选择(P6)照做**:用列表题让用户选保留哪个音频,删除其余文件前
   必须经破坏性确认(`[y/N,回车=否]`);选择放弃则维持现有「手动清理」提示,
   不触碰任何文件。
3. **菜单执行完即退出,不返回菜单**:保持「用一次菜单学会直达命令」的定位,
   不增加「回车返回菜单」交互。

## 风险

- 键位语义变更会让已习惯旧键位的用户(即项目作者)短暂不适;README 同步是缓解。
- 多音频删除路径需要确认 + 测试覆盖,避免误删素材。
- 交互层重构面大,靠注入流测试 + 全分支手动冒烟兜底,非交互行为必须逐项回归。

## 实施记录

- 新增 `cli/prompts.mjs`,由 `withPrompts` 统一 readline、SIGINT/EOF、默认值、列表键位和
  校验重问;menu 与 fetch 已全部迁移,旧的三组 yes/no helper 和两套 readline 生命周期已删除。
- 菜单会原地报告无效序号、缺失路径和错误的文件/目录类型;`q` 返回主入口并以 0 退出。
- fetch 的音频/歌词候选统一为列表题;多音频时可选择保留项,只有破坏性确认通过后才删除
  其余文件。正常完成后按照片/音频状态提示渲染或补照片。
- offerFetch 的拒绝分支和 scanFolder 缺音频错误均增加 `tsuzuri fetch <folder>` 补救入口。
  方案影响表把前者列在 `tsuzuri.mjs`,实际函数位于 `fetch.mjs`,因此提示在函数所在地实现;
  `tsuzuri.mjs` 只增加菜单 `q` 的正常退出衔接。
- README 中英文与项目状态已同步键位、多音频行为和最新验证基线。
- 验证结果:CLI 89 项、analyzer 76 项全部通过,renderer `tsc --noEmit` 通过;
  `git diff --check` 与非交互裸命令回归检查通过。在线 yt-dlp/LRCLIB 未做真实网络下载,
  下载安装、搜索和落盘逻辑由注入测试覆盖。

## 评审记录

- 初版多音频测试在包含 OpenCC 动态导入的测试文件中启动真实 PassThrough/readline 流时,
  Node 并行 test worker 偶发 `Unable to deserialize cloned data`,但业务断言单独运行稳定通过。
  为消除测试夹具的非确定性,改为直接注入 `ask.pick/confirm`;确认后删除与放弃不改文件的
  覆盖保持不变,定向与全量测试均稳定通过。
- menu 的真实 PassThrough 测试在定向并行运行时也出现同一 worker 序列化错误。`runMenu`
  因此增加等价的 prompt runner 注入点:menu 测试覆盖选择、路径校验与确认调用,
  `prompts.test.mjs` 单独覆盖真实 readline 流和提示后缀,避免重复集成层造成抖动。
- 自审未发现未处理的逻辑错误。删除范围严格来自扫描得到的其余音频文件,默认确认是否定;
  用户既有的 `cli/doctor.mjs` 修改未触碰。
- 自审曾发现“重试搜索”和 still 展示选项被误标为 `dangerous`,会让无害操作错误地默认否;
  已按设计原则改为默认是。覆盖、替换和删除仍全部默认否。

### 外部评审发现(2026-07-14,待处理)

1. **lyricsFlow 回车无出口**:旧 `isNo = !isYes` 使「换个关键词再搜?」回车即退出;
   改为默认是后,回车=重试 + 关键词题回车=沿用原关键词,连续回车会无限循环地
   重发相同的 LRCLIB 请求(每轮 /get+/search,--max-time 20s),唯一出口是显式输 n。
   根因:把「失败后重试」当作无害建议步骤套了默认是,没有考虑与关键词默认值的组合效应。
2. **菜单 still 三连问默认值与 CLI 默认值背离**:回车三次现在得到
   `--exif --sign --dark`(含黑底+落款),而 `tsuzuri still` 直跑全关。根因:confirm 的
   dangerous 二元开关把「是否破坏性」和「默认答案」绑死,表达不了「无害但默认关」的
   偏好开关。
3. **chooseSingleAudio 的「0 返回上一步」是假承诺**:pick 的后缀写死,该处无上一步,
   0 与回车同为放弃。根因:pick 未提供关闭返回项的形参。
4. **三处新命令提示未引用/拼写漂移**:fetch 下一步、offerFetch 补救、scanFolder 报错
   分别手写 `node cli/tsuzuri.mjs ...` 与 `tsuzuri fetch ...`,路径含空格时粘贴即碎;
   menu.mjs 已有 formatEquivalentCommand/quoteArg 未复用。
5. **withPrompts 的 `exit` 注入参数无任何调用方使用**,属未被要求的可配置性(Simplicity First)。

另:offerFetch「缺音频是否下载」的默认值由否翻转为是、歌词关键词题移除「0=放弃」,
经核实均可追溯到本计划已确认的设计原则,记为有意变更,不算缺陷。

### 外部评审处理结果(2026-07-14)

1. **已修复**:`ask.confirm` 增加独立的 `defaultValue`,文案由默认值生成,`dangerous`
   只提供默认回退。歌词/音频失败后的重试均显式默认否,回车恢复为退出子流程,
   不会重复发送相同请求。
2. **已修复**:still 的 EXIF、签名、暗色背景三项均显式默认否,空回车与 CLI 直跑默认一致。
   同时将 offerFetch 的缺音频下载恢复为旧的保守默认否;runFetch 显式备料入口仍默认是。
3. **已修复**:`ask.pick` 增加 `allowBack`;多音频首层选择关闭返回项,提示不再承诺不存在的
   上一步,输入 0 会作为无效选择原地重问。
4. **已修复**:fetch 下一步、offerFetch 补救和 scanFolder 缺音频报错统一复用
   `formatEquivalentCommand`;含空格路径会加双引号,三处均使用仓库内可直接执行的
   `node cli/tsuzuri.mjs ...` 形式。
5. **已修复**:删除 `withPrompts` 未使用的 `exit` 注入参数,中断直接使用 `process.exit(130)`。

回归测试新增独立默认值、关闭列表返回项、still 空回车默认、含空格命令路径及多音频
`allowBack:false` 断言。原评审发现保留不改写,以上记录其实际处置。
