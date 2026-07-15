# 执行方案：视频渲染支持 EXIF 展签 / 签名落款 / 黑底

> 状态：已实施（2026-07-15）。结论先行：给视频渲染(默认命令)加 `--exif` / `--sign` / `--dark`
> 三个旗标,与 still 逐一对齐;三者全部做成**渲染时覆盖**,timeline.json 与
> input_hash 零改动;渲染器把 Still 的 EXIF 展签抽成共享组件供 Photo 复用。

## 背景与定位

still 已有三个展陈开关(`--exif` / `--sign` / `--dark`),命令行旗标与交互菜单
问答双入口。视频链路(`tsuzuri <folder>`)目前只有 `-o`,背景只能走
tsuzuri.toml 的 `background`,EXIF 展签与照片落款则完全没有。

本方案修订 2026-07-13 dark-background 方案的边界 3("视频命令面维持零旗标,
暗底视频只走 toml")。当时的前提是视频命令面没有交互入口;常驻菜单
(2026-07-15 persistent-cli-menu)落地后,菜单选项 1 已经是问答式流程,
三个开关与 still 的问答逐字复用即可,旗标对齐反而消除了"still 有、视频没有"
的不一致。toml 的 `background` 仍是持久配置路径,旗标是一次性覆盖,两者并存。

## 设计边界(定案,实施时不再讨论)

1. **渲染时覆盖,不进 timeline.json**——timeline 由 plan.py 产出,参与
   input_hash 缓存与手改保留(`_content_checksum`)。exif/sign/dark 属于
   "怎么展陈",不属于"照片何时出现",写进 timeline 会污染缓存判定,还要在
   Python 侧镜像一份 `cli/exif.mjs` 的格式化逻辑。三个开关都在 render.mjs
   读取 timeline 后、送入 Remotion 前作用于 inputProps。
2. **EXIF 缺失不跳张,降级 + 汇总警告**——still 可以跳过一张图,视频跳了
   clip 时间线就断。EXIF 信息不足的照片照常渲染、不显示展签,渲染前打一行
   `└ N 张照片 EXIF 信息不足,视频中不显示展签`。
3. **签名三处各管各的**——`--sign` 管照片上的落款(展签内嵌或底部居中),
   `intro` 管片头手写动画,`outro_text` 管谢幕语,互不影响。签名 SVG 来源
   维持现状:toml `signature` 键,视频片头与 still `--sign` 共用,本次
   `--sign` 落款同样消费它。
4. **默认路径行为一个不动**——不带旗标的 `tsuzuri <folder>` 输出逐字节等价
   (props 不新增键,组件走原分支);带旗标时默认输出文件名追加变体后缀
   (规则同 still):`output/<folder>-exif-sign-dark.mp4`,避免覆盖普通版;
   `-o` 显式指定时用户说了算,不加后缀。

## 改动明细

### 渲染器(renderer/src)

- `types.ts`:`PhotoClip` 增加 `exif?: StillExif | null`;`TimelineMeta`
  增加 `sign?: boolean`(签名与画布字段同级,`signature` 路径沿用
  `meta.branding.signature`)。
- 新建 `ExifPanel.tsx`:从 `Still.tsx` 平移 `ExifPanel` 与 `StillExif` 类型,
  Still 改为 import,视觉零变化。
- `Photo.tsx`:`clip.exif` 有内容时切换到 Still `withExif` 同款布局(照片左 +
  展签右,整体居中,布局常量复用 `theme.ts` 的 `STILL.withExif`);
  `meta.sign` 开且无展签时,照片下方居中落款(Still 无 EXIF 分支的定位)。
  展签与落款都在 Photo 的 fadeIn 容器内,随过渡一起淡化。
- `Diary.tsx`:把 `meta.sign` / `clip.exif` / 签名数据透传给 Photo;
  `useSignatureData` 在 Diary 层调用一次(hook 不能按 clip 条件调用)。

### CLI(cli/)

- `options.mjs`:`parseRenderArgs` 增加 `--exif` / `--sign` / `--dark`;
  `USAGE` 渲染行改为
  `tsuzuri <folder> [-o out.mp4] [--exif] [--sign] [--dark]`。
- `render.mjs`:位置参数后接受三个旗标。`--dark` 覆盖
  `inputProps.meta.background = '#000000'`;`--exif` 对去重后的 src 逐张
  `extractFormattedExif`,挂回各 clip;`--sign` 置 `meta.sign = true`。
  仍是内部入口,用法字符串同步更新。
- `tsuzuri.mjs`:透传三个旗标给 render.mjs;默认输出路径按旗标组合追加
  变体后缀(改 `resolveProjectPaths` 调用侧,传入后缀);渲染起始行仿 still:
  `渲染视频` 后按开关追加 `, EXIF` / `, 签名` / `, 黑底`。
- `menu.mjs`:选项 1 增加三个确认问答,文案与 still(选项 2)逐字一致;
  `buildArgvFromChoices` 的 choice `'1'` 组装旗标。

### 文档与测试

- `docs/config.md`:`background` / `signature` 条目补一句命令行覆盖说明。
- `README.md` / `README.en.md`:用法示例同步。
- 测试:`options.test.mjs`(新旗标解析、非法组合)、`menu.test.mjs`
  (选项 1 三问、argv 组装)、render.mjs 的 props 覆盖逻辑若可单测则补
  (提取为纯函数 `applyRenderVariants(timeline, opts)` 以便测试)。

## 执行步骤

1. [x] 渲染器:抽 `ExifPanel.tsx`,`types.ts` 加字段 → 验证:`npx tsc --noEmit`,Still Studio 预览无视觉变化 —— fast-worker
2. [x] 渲染器:`Photo.tsx` / `Diary.tsx` 展签与落款布局 → 验证:Studio 里构造带 exif 的 timeline 肉眼过 —— fast-worker,布局争议升级 deep-reasoner
3. [x] CLI:`options.mjs` 旗标 + `USAGE` + 测试 → 验证:`node --test cli/options.test.mjs` —— fast-worker
4. [x] CLI:`render.mjs` 的 `applyRenderVariants` + 旗标解析,`tsuzuri.mjs` 透传与输出后缀 → 验证:单测 + 手跑 —— fast-worker
5. [x] CLI:`menu.mjs` 三问 + argv 组装 + 测试 → 验证:`node --test cli/menu.test.mjs cli/menu-loop.test.mjs` —— fast-worker
6. [x] 文档:config.md / README 双语 → 验证:通读 —— fast-worker
7. [x] 端到端:examples/ 素材渲四版(默认 / --exif / --exif --sign / --dark 组合),核对默认版与改动前一致、变体后缀正确、带字幕时展签不与字幕带打架 —— Fable + 用户确认成片

## 实施记录(2026-07-15)

按计划完成,验证:cli `node --test` 120 pass / 0 fail;renderer `tsc --noEmit` 无错误;
用 fixture 素材经 render.mjs 端到端渲染默认 / `--dark --sign` / 注入 exif /
`--exif`(无 EXIF 素材)四版并抽帧肉眼核对。默认版与 `--exif`(全员信息不足)
版输出**逐字节一致**,确认无旗标路径零回归;EXIF 不足警告行、黑底配色切换、
展签布局均符合预期。

与方案的偏离:

1. **落款位置改为右下角(方案风险 2 应验)**——端到端抽帧发现底部居中落款与
   字幕带直接重叠。deep-reasoner 裁决:照搬 still 居中定位在几何上不可行
   (photo_scale=0.8 下照片下缘到字幕行框顶仅 36px 净空,放不下 56px 字形),
   定案为画布右下角钤印式落款:`right = rightInset(48) * scale`、
   `bottom = bottomInset * scale`、`maxWidth = 画幅宽 × 0.26`,theme.ts 的
   `STILL.signature` 新增 `rightInset` / `maxWidthRatio` 两常量。still 无字幕
   维持居中不变——"底部中线空着就居中,被字幕占用就退居右下"。
2. **Photo.tsx 新增 `canvasWidth`/`canvasHeight` props**——现有 `safeWidth/Height`
   已乘过 photo_scale,不适用 `STILL.withExif` 的画幅比例算式,由 Diary 从
   meta 透传原始宽高。
3. **render.mjs 补 `isMain` 守卫**——为让 `applyRenderVariants` 可被单测 import
   而不触发 main() 副作用,与 still.mjs / tsuzuri.mjs 的既有模式对齐。
4. **`StillExif` 类型迁至 ExifPanel.tsx**,types.ts 直接从那里 import 避免
   循环依赖;Still.tsx 保留 re-export 兼容。

遗留观察(非阻塞):竖版画幅(width < height)下 `STILL.withExif` 布局常量
未专门调参,如需竖版展签视频建议先渲一版确认比例。

## Review 记录(2026-07-15)

复跑 CLI 120 项、analyzer 80 项、renderer typecheck 与 `git diff --check`
均通过,但代码审查发现三个边界问题:

1. 右下角落款与字幕仍处在同一垂直带,长 LRC 行或宽比例自定义
   签名 SVG 仍可发生水平交叠。根因是只改了落款位置,字幕的可用宽度
   没有感知落款实际宽度。
2. 默认命令的第一个未知旗标会被当作素材路径,例如 `tsuzuri --exfi`
   报“找不到路径”而不是“未知参数”。根因是 folder 分支没有先排除 `-`
   开头的 token。
3. EXIF 提取按唯一 src 去重,但缺失警告按 timeline clip 累加,重复使用
   同一照片时会误报“N 张照片”。

修复顺序:先计算落款的实际渲染宽度并为字幕对称预留安全区,再收紧
参数解析,最后把 EXIF 警告改为按去重后的 src 计数。

### Review 修复结果

1. [x] `Signature.tsx` 新增按 viewBox 比例计算实际渲染宽度的纯函数;
   `Photo.tsx` 显式设置落款宽高,`Diary.tsx` 仅在当前可见的无 EXIF 照片
   会显示右下落款时,把落款宽度 + 右边距 + 24px 间距作为字幕对称
   安全区。用 10:1 宽比例自定义 SVG + 超长中文歌词抽帧,字幕与落款
   保留明确空隙。
2. [x] `parseRenderArgs` 在接受 folder 前先拒绝未知 `-` 参数,并覆盖
   旗标出现在 folder 前后的三种回归用例。
3. [x] EXIF 缺失数改为统计 `exifBySrc` 的空值,重复 clip 不再重复计数。

修复后验证:CLI 121 pass / 0 fail,analyzer 80 pass,renderer typecheck 通过,
Remotion 针对性抽帧通过,`git diff --check` 通过。

## 风险

- **展签挤压照片宽度**:视频 `photo_scale` 语义是安全框,展签布局用的是
  `STILL.withExif` 的固定比例常量,横向照片在 16:9 下会比无展签时小一圈——
  与 still 行为一致,属预期;竖版视频(width < height)下展签布局未调过参,
  端到端阶段重点看。
- **字幕与展签**:字幕带在照片安全框下缘以下,展签占横向空间,理论不冲突,
  但展签较长的 params 列表 + 底部落款同时出现时需肉眼确认。
- **性能**:`--exif` 逐张读 EXIF 在 Node 侧一次性完成(still 已这么做),
  对渲染时长影响可忽略。
