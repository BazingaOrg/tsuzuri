# fetch:在线获取音频(yt-dlp)与同步歌词(LRCLIB)

## 背景与目标

目前音频和 `.lrc` 完全靠用户自备。目标:降低备料门槛——

- 音频:借助用户**自装**的 yt-dlp 按 URL 或关键词搜索下载(项目不内置下载器,规避版权与维护风险);
- 歌词:调用 LRCLIB 公开 API(免 key)按「歌名 + 歌手 + 时长」搜索同步歌词,预览确认后落盘为 `.lrc`,下游走既有「.lrc 优先于 Whisper」逻辑,零改动。

在线歌词搜索是可选步骤,跳过后行为与现状完全一致,不破坏「全程本地」承诺。

## 交互设计(已与用户确认)

1. **懒检测**:yt-dlp 在用户走到"下载音频"时才 `spawnSync` 检测,未装则打印安装提示并退回;doctor 增加一行可选依赖报告(未装不算失败)。
2. **两个入口**:
   - 新命令 `tsuzuri fetch <folder>` + 菜单项 5「获取音频/歌词」——任何文件夹状态可进,覆盖需显式确认;
   - 渲染 / lyrics 主流程兜底:交互终端下先宽松扫描,缺音频 → 问是否下载;有音频缺 `.lrc` → 问是否在线搜歌词;都齐 → 不打扰。非交互(管道/脚本)保持现状直接报错。
3. **音频下载**:输入以 `http` 开头当 URL 直接下载;否则 `ytsearch5:` 列候选(标题/时长/频道)让用户选序号,`0` 换关键词,回车取消。下载格式 `-x --audio-format m4a`。
4. **失败提示**:未安装 → 安装命令;搜索无结果 → 换关键词或手动放入;下载失败 → 透传 stderr 摘要 + 常见原因(代理/地区限制),给一次重试/换候选/放弃,不自动重试循环。
5. **歌词搜索**:默认关键词取音频 tag(ffprobe)或文件名,展示可修改;先 `/api/get` 按时长精确匹配,miss 退 `/api/search` 列候选;候选与音频时长差 >3s 显示警告;**落盘前 preview**(带时间戳打印,问「保存? [Y/n]」);搜不到/放弃 → info 提示走 Whisper,不算错误。
6. **重复下载**:fetch 里永远允许,但已有音频/`.lrc` 时必须确认覆盖;替换音频后建议重搜歌词。

## 影响文件

| 文件 | 改动 |
| --- | --- |
| `cli/fetch.mjs` | 新增:yt-dlp 检测/搜索/下载、LRCLIB 匹配、LRC 预览、`runFetch` 与 `offerFetch` |
| `cli/fetch.test.mjs` | 新增:纯函数测试(候选解析、查询构造、时长校验、LRC 预览、状态决策) |
| `cli/options.mjs` | `parseFetchArgs` + USAGE 增加 fetch |
| `cli/menu.mjs` | 菜单项 5;序号提示改为按 MENU_ITEMS 动态生成 |
| `cli/doctor.mjs` | 可选依赖 yt-dlp 报告行 |
| `cli/dependencies.mjs` | `FIXES['yt-dlp']` |
| `cli/project.mjs` | 新增 `scanFolderLoose`(不 throw,返回数组),`scanFolder` 复用 |
| `cli/tsuzuri.mjs` | 注册 fetch 命令;渲染/lyrics 前交互终端下调用 `offerFetch` |
| `cli/menu.test.mjs`、`cli/options.test.mjs` | 同步更新 |
| `README.md` / `README.en.md` | 使用表增加 fetch,备料说明 |

## 步骤

1. `project.mjs` 抽出 `scanFolderLoose` → verify: project.test.mjs 通过
2. `fetch.mjs` 纯逻辑(候选解析、LRCLIB URL 构造、时长校验、LRC 预览格式化、文件夹状态→建议动作) → verify: fetch.test.mjs
3. `fetch.mjs` 交互层(readline 问答、yt-dlp spawn、LRCLIB fetch、落盘/覆盖) → verify: 手动走查
4. 接线 options/menu/doctor/tsuzuri.mjs → verify: menu/options 测试更新后通过
5. README 更新 → verify: 通读
6. `npm --prefix cli test` 全绿;手动冒烟:空文件夹 fetch、只有音频搜歌词、非交互管道行为不变

## 关键决策

- **不内置任何下载器依赖**:yt-dlp 是用户自装的外部工具,项目只 shell out;LRCLIB 只用标准 `fetch`,零新 npm 依赖。
- **歌词文件名** = 音频同名 `.lrc`(`music.mp3` → `music.lrc`),与目录约定(唯一 lrc)一致。
- **覆盖顺序**:先确认、下载成功后再删旧文件,失败不破坏现有素材。
- **LRCLIB 请求带 User-Agent**(API 方要求),失败提示中说明 Node fetch 不走系统代理(本机是 SOCKS 代理环境)。

## 风险

- yt-dlp 各发行版输出格式差异 → 用 `--print` 固定字段 + `\t` 分隔,解析容错。
- LRCLIB 中文歌覆盖有限 → 搜不到属预期路径,提示走 Whisper,不算失败。
- 交互问答难以自动化测试 → 交互层薄、决策逻辑抽成纯函数覆盖测试。

## Implementation notes(2026-07-14)

按计划完成,两处与计划的偏差:

1. **LRCLIB 请求从 Node `fetch` 改为 spawn `curl`**。实机验证发现本机(SOCKS/HTTP
   代理环境)直连 lrclib.net 超时,而 Node 的 `fetch` 不读 `http_proxy` 等环境变量
   (`NODE_USE_ENV_PROXY` 要 Node 24+,项目基线是 18)。curl 天然跟随系统代理、
   macOS 与 Windows 10+ 自带,且与项目 spawnSync 外部命令的风格一致。响应用
   `-w '\n%{http_code}'` 携带状态码,`parseCurlResponse` 负责拆分(有测试)。
2. **`runFetch`/`offerFetch` 增加 `{input, output}` 流注入**(与 `runMenu` 同款签名)。
   起因是端到端验证需要驱动问答;顺带修复了 stdin 中途 EOF(Ctrl+D)导致
   `rl.question` 永不结算、顶层 await 挂起的缺陷——现与 menu 一致按放弃退出(130)。

已验证:

- `npm --prefix cli test` 73 项全绿(新增 fetch.test.mjs 13 项,menu/options 测试同步更新)。
- 真实端到端:带 tag 的测试音频走完「确认关键词 → LRCLIB 搜索 → 候选列表(时长差
  警告正确触发)→ preview → 确认落盘 music.lrc」全流程,`晴天 周杰伦` 命中同步歌词。
- 兜底行为:素材齐备时零提问;缺 .lrc 提议搜索、输 0 放弃后提示走 Whisper 并正常返回。
- 非交互回归:管道下 `fetch` 报「需要交互终端」;渲染命令缺音频仍是原报错,行为未变。
- doctor 输出 yt-dlp 可选依赖行(已装显示版本,未装仅提示不判失败)。
- yt-dlp 真实下载路径未跑通完整用例(避免真实抓取平台内容),已验证:未安装检测、
  搜索候选解析(单测)、下载失败提示路径的代码走查。

## Review issues(2026-07-14)

真实使用用户授权的 Bilibili URL 和 `the winner is` 关键词验证后,发现:

1. **同名音频的「重新下载并替换」实际为 no-op**:yt-dlp 报
   `has already been downloaded`,文件 mtime 和 SHA-256 均未变,但 CLI 仍报「音频已就绪」。
   根因是直接下载到素材目录,并用「是否新增文件名」推断替换结果。
2. **LRCLIB 精确结果不可用时未回退 `/search`**:`/get` 返回对象但无
   `syncedLyrics` 或为纯音乐时,会直接进入「未找到」,与「精确 miss 再搜索」的目标不符。
3. **菜单编号与已确认设计不一致**:计划为 fetch 第 5 项,实现为第 4 项。
4. **歌词保存默认值与已确认设计不一致**:计划为 `[Y/n]`,实现为 `[y/N]`。
5. **时长格式化进位异常**:`formatDuration(59.6)` 输出 `0:60`,
   `formatDuration(119.6)` 输出 `1:60`。

补充观察:Bilibili 下载的 m4a 没有 title/artist tag,因此默认歌词关键词回退到
完整视频文件名。这不阻断流程(用户可在提示处修改关键词),暂不引入平台特定的标题清洗规则。

## Review remediation plan(2026-07-14,待确认)

1. 将 yt-dlp 输出改到素材目录外的临时目录;成功后确认唯一音频,再替换旧文件。
   失败时删除临时目录,不触碰旧音频。
   → verify:同 URL 重下会真正执行下载;成功替换;失败保留旧文件。
2. 将 LRCLIB 精确命中条件改为「存在可用同步歌词」,否则回退 `/search`。
   → verify:无同步歌词/纯音乐的精确记录会继续搜索。
3. 恢复已确认交互:doctor 第 4 项、fetch 第 5 项;歌词预览后保存默认为是。
   → verify:menu/fetch 交互测试覆盖默认值。
4. 时长先对总秒整体取整,再拆分分钟/秒。
   → verify:补充 59.6、119.6 进位边界测试。
5. 增加可注入 spawn/下载目录的交互层测试,覆盖成功替换、失败保留和 LRCLIB 回退;
   复跑 `npm --prefix cli test`、非交互回归及用户授权 URL 的真实冒烟。

### 下载后的歌曲信息确认(补充设计,待确认)

不对用户原有音频强制文件名格式,避免破坏兼容性;只对 yt-dlp 新下载的音频增加整理步骤:

1. 下载成功后显示原视频标题/下载文件名。
2. 分开询问「歌曲名」和「歌手」,而不是让用户输入一个需再解析的
   `歌曲名 - 歌手`字符串;歌手可留空。
3. 生成规范文件名 `歌曲名 - 歌手.ext`(歌手为空时仅 `歌曲名.ext`),保留下载后的
   音频扩展名,清理路径分隔符等不可用文件名字符,落盘前显示结果并确认。
4. 将用户确认的歌曲名/歌手直接传给本次 LRCLIB 查询,不再从视频文件名反向猜测;
   之后单独运行 `lyrics`/`fetch` 时仍可从规范文件名回退出可用关键词。
5. 如用户选择保留原文件名,仍允许继续,并在歌词搜索提示处手动修改关键词。

→ verify:视频标题含频道文案/特殊字符时可整理成规范音频名;确认的歌曲名/歌手用于
LRCLIB 精确查询;保留原名和旧音频均不受强制限制。

### Review remediation execution status

- [x] 临时目录下载、安全替换与歌曲信息确认
- [x] LRCLIB 精确结果不可用时回退搜索
- [x] 菜单编号、歌词保存默认值、时长进位
- [x] 自动化测试与用户授权 URL 真实冒烟

## Review remediation implementation notes(2026-07-14)

- yt-dlp 输出改到系统临时目录;只在完成下载并确认唯一音频后,才复制到
  素材目录的隐藏 staging 目录并替换旧文件。替换失败会回滚,下载临时目录在
  成功/失败后都清理。
- 下载后分开确认歌曲名和歌手,生成 `歌曲名 - 歌手.ext`;歌手可留空,路径分隔符等
  不可用字符会被清理,目标冲突时不静默覆盖。已确认的信息直接传给本次 LRCLIB 查询。
- LRCLIB `/get` 只有在返回可用 `syncedLyrics` 时才算命中;否则继续 `/search`。
- fetch 恢复为菜单第 5 项;歌词预览后保存恢复为回车默认是;时长先整体取整再拆分,
  不再出现 `0:60`。
- README 中英文同步补充下载后的歌曲信息确认与命名规则。

验证结果:

- `npm --prefix cli test`:78/78 通过(由 73 项增加到 78 项)。
- `git diff --check` 通过;doctor 全部就绪;非交互 fetch 仍拒绝,非交互缺音频仍返回原错误。
- 用户授权的 Bilibili URL 真实下载两次:两次均下载到不同临时目录,第二次不再报
  `has already been downloaded`;整理为 `The Winner Is - DeVotchKa & Mychael Danna.m4a`,
  替换后 mtime 更新,且无 staging/下载临时目录残留。
- 带 tag 音频的 LRCLIB 精确搜索命中 25 行同步歌词;预览后直接回车成功保存 LRC,
  随后 `lyrics` 命令返回 0。
- 原始 `/Users/zhangyouxiu/Downloads/Downloads/demo` 音频与 LRC 的 SHA-256 均未变。

## Simplified Chinese lyrics preference plan(2026-07-14,已确认)

实测 LRCLIB 的《晴天》搜索结果有多个同步歌词候选,但全部是繁体;仅调整候选排序无法实现
「优先简体」。采用保存前本地转换:

1. 新增 `opencc-js` CLI 依赖,使用纯 JavaScript `t2cn` 转换器;无原生编译、无额外依赖,
   且只在需要转换中文歌词时懒加载。
2. 语种判断只作转换开关:无汉字则原样保留;包含日文平假名/片假名则按日文原样保留;
   有汉字且无日文假名时按中文处理。英文、日文 LRC 不进入 OpenCC。
3. 中文 LRC 在预览前转为简体,预览展示最终将落盘的内容;转换发生时打印
   「已转为简体中文预览」。现有「保存? [Y/n]」仍是最终人工把关。
4. 保存转换后的 LRC,不修改 LRCLIB 响应、音频、英文/日文歌词或用户已有的 LRC。
5. 增加纯函数测试:繁体中文转简体、已是简体的幂等性、英文不变、含假名的日文不变;
   复跑 CLI 全套测试并用《晴天》真实 LRC 验证预览/落盘为简体。

### Simplified Chinese lyrics execution status

- [x] 增加 `opencc-js` 依赖与中文/日文脚本判断
- [x] LRCLIB 歌词在预览和保存前转为简体
- [x] 繁体、简体、英文、日文自动化覆盖
- [x] 《晴天》真实 LRCLIB 预览/落盘验证

## Simplified Chinese lyrics implementation notes(2026-07-14)

- CLI 增加 `opencc-js` 依赖;转换器只在检测到中文 LRCLIB 歌词时动态加载。
- 判断顺序为日文假名优先、其次汉字、最后其他脚本;因此包含汉字的日文歌词不会进入
  繁转简,英文等无汉字歌词也保持原样。
- 中文歌词在 preview 之前使用台湾繁体到简体字符转换;补充将台湾常用女性第二人称
  `妳` 规范为简体通用的 `你`。转换后的文本同时用于预览和最终 `.lrc` 落盘。
- 只处理本次从 LRCLIB 取得的歌词,不改写用户已有 `.lrc`。
- 自检时发现规范文件名 `晴天 - 周杰伦.m4a` 回退出的查询词包含连续空格;根因是替换
  分隔符后只做了首尾 trim。现已压缩连续空白,默认查询显示为 `晴天 周杰伦`,并补测试。
- README 中英文同步说明中文优先简体、英文和日文保持原文。

验证结果:

- `npm --prefix cli test`:81/81 通过;覆盖繁体转简体、简体幂等、英文不变、日文不变。
- `node --check cli/fetch.mjs` 与 `git diff --check` 通过。
- 用户授权的 Bilibili《晴天》素材真实执行 `fetch`:LRCLIB 返回 5 个候选,选择 4:29
  候选后 preview 显示简体,回车成功保存 42 行 `晴天 - 周杰伦.lrc`;检查未发现已知繁体字。
- 随后执行 `node cli/tsuzuri.mjs lyrics <测试素材夹>` 返回 0,完整输出 42 行简体歌词。
