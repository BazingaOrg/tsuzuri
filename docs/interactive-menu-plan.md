# 执行方案:裸命令交互菜单 + Windows 兼容性梳理

> 状态:已实施(2026-07-12)。结论先行:不做全屏 TUI、不做箭头键,只把
> `tsuzuri` 裸跑从报错改成数字选择菜单;菜单是教学工具,不是常驻界面。
>
> 实施补记:`-o` 结尾分隔符的 Windows 修正比方案更严——`\` 在 POSIX 是
> 合法文件名字符,只在 `process.platform === 'win32'` 时视为分隔符,
> `/` 两平台通吃(实现见 cli/still.mjs,测试只断言 `/` 分支)。

## 背景与定位

命令面现状:2 个工作流命令(`tsuzuri <folder>`、`still`)+ 2 个辅助
(`doctor`、`lyrics`),数量克制。真实摩擦是 still 的旗标记忆负担与新手
首次上手。参考 Mole(tw93/Mole)的取舍:

- **学**:裸命令着陆给引导而非报错;README 每个功能配真实终端输出。
- **不学**:箭头键/复选框列表。Mole 是"从列表里挑"的交互产品(卸载、磁盘
  钻取),交互即任务本身;tsuzuri 是"文件夹进、文件出"的批处理管道,菜单
  驱动只会让老用户变慢。

三条设计边界(定案,实施时不再讨论):

1. **数字 + 回车,不做箭头键**——`node:readline` 标准库零新依赖;箭头键
   需要 raw mode 或 inquirer 类依赖,Windows 老终端下键码差异还要另起分支,
   收益配不上复杂度。
2. **只在 TTY 且零参数时进菜单**——`process.stdin.isTTY && process.stdout.isTTY`
   双判;管道/脚本/CI 里裸跑仍走现有 USAGE 报错,可脚本性不破坏。
3. **老用户路径零变化**——`tsuzuri ./folder` 等所有带参调用行为一个字不改。

## 菜单交互稿

```
$ tsuzuri
● tsuzuri — 把照片和一首歌缀成影像日记

  1. 渲染相册视频
  2. 导出静态作品图(still)
  3. 预览歌词识别(lyrics)
  4. 检查依赖(doctor)

输入序号 [1-4] 后回车，Ctrl+C 退出:
```

- 选 1/3:提示「输入素材文件夹路径，或拖入后回车」(既支持手输相对/绝对路径，
  也支持 macOS/Windows 拖拽自动填入路径)。
- 选 2:先要路径(文件或文件夹皆可),再三问 `y/N`:「显示 EXIF 拍摄信息?」
  「加入签名落款?」「使用黑色背景（暗色展陈）?」,均明确提示直接回车为否。
  `--scale`/`--skip-existing`/`-o` 不进菜单——低频选项留给命令行。
- 选 4:直接执行。
- **执行前回显等效命令**(菜单的教学使命):
  `└ 等效命令: node cli/tsuzuri.mjs still ./photos --exif --sign`
  用一次菜单就学会直达写法。
- 执行方式:菜单只负责**组装 argv 数组交回 `parseArgs`**,与命令行走完全
  同一条代码路径——不新增第二套参数语义,菜单永远不会与 CLI 行为漂移。
- 收尾提示一句:`└ 进阶配置(分辨率/过渡/字幕/背景…)见素材夹 tsuzuri.toml,参考 docs/config.md`
  ——不做配置向导,"零配置出片"是卖点,不把它做成必答问卷。

### 输入规整(拖拽路径的跨平台差异)

拖拽进终端的路径两平台形态不同,菜单的路径输入统一过一个纯函数
`normalizeDroppedPath`:

| 来源 | 原始输入 | 处理 |
| --- | --- | --- |
| macOS 拖拽(含空格) | `/Users/me/My\ Photos` | 反转义 `\␣` → `␣` |
| Windows 拖拽 | `"C:\Users\me\My Photos"` | 去首尾成对引号(`"` 与 `'`) |
| 手输带引号 | `'./photos'` | 同上 |

处理后 `path.resolve` 即可(Node 在各自平台正确处理分隔符)。该函数放
`cli/menu.mjs` 导出,node:test 覆盖上述矩阵。

## Windows 兼容性梳理

### 菜单本身

- `node:readline` 的 question/close 在 cmd / PowerShell / Windows Terminal
  下都可用,数字 + 回车无键码问题——这正是不做箭头键的主要理由之一。
- **Ctrl+C**:Windows 上 readline 接管 stdin 后,中断经由 rl 的 `SIGINT`
  事件而非 process 信号,必须 `rl.on('SIGINT', () => { rl.close(); process.exit(130); })`,
  否则 Windows 下 Ctrl+C 可能无响应。
- `y/N` 问答默认取否(直接回车 = 否),避免平台间回车键序差异造成误触。

### 既有输出与命令的 Windows 审计(顺带核对)

- **ANSI 颜色**(term.mjs / progress.mjs 的 `\x1b[…`):libuv 在 Win10+ 会
  为控制台启用 VT 处理,Node 输出 ANSI 可用;`ansiEnabled` 已有 isTTY /
  NO_COLOR 门。Win8 及更老的 conhost 不支持——不专门兼容,README 平台声明
  已注明仅 macOS 实测。
- **Unicode 符号**(`●` / `└` / `→`):中文 Windows 传统 conhost 默认代码页
  CP936,UTF-8 字节会乱码。处置:不做 ASCII 双轨(维护两套符号不值),在
  README Windows 段建议使用 Windows Terminal(默认 UTF-8);可选加一句
  `chcp 65001` 提示。
- **spawnSync 外部命令**:`uv` / `ffmpeg` 在 Windows 是真实 .exe,
  `spawnSync` 无 shell 可直接解析(`.cmd`/`.bat` 垫片才需要 `shell: true`,
  我们没有这种依赖);`process.execPath` 自派生调用天然可用。✓
- **路径构造**:全仓 `path.join`/`path.resolve`/`fileURLToPath`,无硬编码
  `/` 拼接;timeline 里的 `./photo.jpg` 是 POSIX 风格约定,渲染器
  `staticFile` 消费,与 OS 分隔符无关。✓
- **大小写不敏感文件系统**:still 批量冲突检测已按 `toLowerCase()` 分组,
  Windows(NTFS 默认不敏感)与 macOS 行为一致。✓
- **已知小坑(本次顺带修)**:`cli/still.mjs:93` 判断 `-o` 目录意图用
  `endsWith(path.sep)`——Windows 上 `path.sep` 是 `\`,但用户在 PowerShell
  里习惯敲 `out/`;改为同时接受 `/` 与 `\` 结尾。
- **遗留声明不变**:analyzer 侧(faster-whisper CPU/CUDA、demucs torch)
  代码层兼容但未真机实测,维持 docs/tsuzuri-status.md 的现有说明,不在本
  方案范围内扩大承诺。

## 实施步骤

1. **`cli/menu.mjs`**:纯函数层(`normalizeDroppedPath`、`buildArgvFromChoices(choices) → string[]`)
   与交互层(readline 问答)分离;交互层薄到不值得测,纯函数层全部
   node:test 覆盖(路径矩阵、四个选项 → argv、y/N 组合)。
2. **入口接线**:`tsuzuri.mjs` 在 `parseArgs` 之前判断
   `argv 为空 && stdin.isTTY && stdout.isTTY` → `runMenu()` 返回 argv 数组,
   仍交给 `parseArgs` 走原路;非 TTY 保持现有 USAGE 报错。补测试:空 argv
   非 TTY 路径行为不变。
3. **等效命令回显 + toml 提示**:执行前 `term.detail` 输出;still 分支三个
   y/N 问答，均提示直接回车为否。
4. **Windows 小修**:still.mjs `-o` 结尾分隔符同时认 `/` 与 `\`;menu 的
   `rl.on('SIGINT')`;两处都补测试(分隔符可测,SIGINT 写进手工清单)。
5. **文档**:README 两语版——命令速查上方加一句「不带参数运行 `tsuzuri`
   进入交互菜单」;新增 Windows 小节(Windows Terminal 建议、`chcp 65001`、
   未真机实测声明);Commands 节补一段渲染管道真实终端输出示例(学 Mole)。
   docs/tsuzuri-status.md 记录。

## 验证清单

- `cd cli && npm test`(新增 menu 纯函数用例全绿,existing 46+ 不回归)。
- 手工矩阵(macOS):裸跑 4 个选项各走通;拖拽含空格路径;Ctrl+C 在菜单
  各层退出干净;`tsuzuri | cat` 确认非 TTY 走 USAGE 报错;等效命令回显可
  直接复制执行。
- 手工矩阵(Windows,有条件时):Windows Terminal + PowerShell 下菜单、
  拖拽带引号路径、Ctrl+C、中文符号显示;无条件则维持"未真机实测"声明。

## 风险与备注

- 菜单文案出现在 stdout,注意与 `term.start` 的进度体系衔接:菜单结束后
  才进入既有管道输出,无交错风险。
- `runMenu` 引入 async readline,`main()` 已是 async,无结构改动。
- 不加任何新依赖;若将来真要箭头键/多选(比如 still 挑选部分照片),再评
  估 inquirer 类库,那是独立方案。
