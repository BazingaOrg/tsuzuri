# 音频裁剪选择权交给用户

## 背景与现状

`analyzer/plan.py` 中"图少歌长"的裁剪只有一条自动路径：

- 平均每张展示 > `trim_avg_threshold`(10s) 时，在 `n × trim_target_avg`(8s) 附近
  的最近重拍处截断 timeline 的 `duration`(不真裁音频文件，渲染端收尾淡出)。
- 找不到合法重拍点(`candidates` 为空)时**静默**放弃裁剪，用整首歌 —— 现状缺陷，
  应至少打印一行。
- 反向情况(图多歌短)是丢照片，不属于本任务范围。

用户目前无法选择"播完整首歌"。

## 设计决策

### 配置：`tsuzuri.toml` 新增 `trim` 键

```toml
trim = "auto"   # 默认，现行为
trim = "full"   # 禁用截断，播完整首歌
trim = 120      # 目标时长(秒)，仍吸附到最近重拍(保住踩点收尾)
```

- `trim = <秒数>` 时无视 `trim_avg_threshold` 直接生效；候选重拍仍受
  `n × min_gap` 下界约束，若给的秒数塞不下所有照片，按现有丢照片逻辑处理并警告。
- 非法值(负数、其他字符串)校验报错退出，与 `_validate_branding` 同风格。
- `trim_avg_threshold` / `trim_target_avg` 保留为高级配置，仅在 `auto` 下生效。

### 交互：只在触发裁剪时问一次，答案写回 toml

不在 Python 里做 TTY 提示(交互 UX 统一在 Node CLI 的 `prompts.mjs`)。采用两段式：

1. `plan.py` 在 timeline 写入 `meta.trim` 说明字段：
   `{"mode": "auto"|"full"|"seconds", "applied": true|false, "full_duration": X, "trimmed_duration": Y}`。
2. CLI(`tsuzuri.mjs`)在 plan 成功后读 timeline：若 `applied === true` 且
   用户没有显式配置(toml 无 `trim` 键、无 CLI 覆盖)且处于交互终端，
   用 `prompts.mjs` 问一次：
   > 歌长图少，已在 X 秒重拍处截断(平均每张 Y 秒)。接受裁剪 / 播完整首歌？
   - 选"接受"：把 `trim = "auto"` 写入 `tsuzuri.toml`(下次不再问)。
   - 选"完整"：把 `trim = "full"` 写入 toml，并以新配置**重跑 plan**(plan 很快)。
3. 非交互(管道/脚本)不问，维持 auto 行为 —— 与"素材齐备则不打扰"哲学一致。

写回 toml 是关键：`input_hash` 包含 `tsuzuri.toml`，选择持久化后，后续运行的
hash 一致性、plan 手改保护逻辑(`plan_checksum`)全部自然成立，不需要特判。
若 toml 不存在则创建最小文件；若存在则追加/替换 `trim` 行(保留其余内容与注释，
用逐行文本处理而非 toml 序列化重写)。

### CLI 一次性覆盖(可选、低优先)

`tsuzuri <folder> --trim full|auto|<秒>`：透传 `plan.py --trim`，仅本次生效、
不写 toml、跳过交互询问。文档注明：一次性覆盖不持久化，下次运行按 toml 决定。

## 执行步骤

1. [x] `plan.py`：`DEFAULTS` 加 `trim: "auto"`；`load_config` 校验合法值
       → verify: 新增校验单测(非法值退出、数字/full/auto 通过)
2. [x] `plan.py` `build_timeline`：按 `trim` 三种模式分派；`full` 跳过截断；
       数字模式吸附重拍；无合法候选时打印 `term.info`(修静默缺陷)；
       timeline 写入 `meta.trim` 说明字段
       → verify: 单测覆盖 auto 触发/不触发、full、数字吸附、无候选告警
3. [x] `plan.py` `main`：加 `--trim` 参数覆盖 toml
       → verify: 单测
4. [x] `cli/tsuzuri.mjs`：plan 后读 `meta.trim`，满足条件时经 `prompts.mjs`
       询问；实现 toml 写回 helper(新文件或放 `project.mjs`)与重跑 plan
       → verify: `cli` 单测(mock prompts / fs)，覆盖交互与非交互分支
5. [x] `options.mjs` + USAGE + README：`--trim` 与 toml `trim` 文档
       → verify: `npm --prefix cli test`
6. [x] 全量验证：`uv run --project analyzer pytest`、`npm --prefix cli test`、
       对 examples 素材夹跑一次端到端

## 风险

- toml 写回若实现成"解析后整体重写"会丢用户注释 —— 用文本级追加/替换。
- `meta.trim` 新字段进入 `plan_checksum` 计算范围，属预期(整份文档校验)。
- 询问后重跑 plan 与"手改保护"不冲突：重跑发生在同一次运行内、文件刚由
  plan 生成，校验和必然吻合。

## 实施记录

- `analyzer/plan.py` 已支持 `auto` / `full` / 正数秒数三种配置与同语义的
  `--trim` 一次性覆盖；非法 TOML 值直接报错，非法 CLI 值由 argparse 拒绝。
- 每份新 timeline 都写入 `meta.trim`。自动或秒数模式找不到合法重拍时会明确告知
  并保留整首；目标秒数受照片最小间隔约束，仍放不下时沿用既有丢图告警。
- 新增 `cli/trim.mjs` 统一首次裁剪问答。只有双 TTY、自动裁剪已实际生效、且 TOML
  与 CLI 都未显式指定时才询问；答案通过文本级 helper 写回，保留原配置顺序、空行、
  注释与换行风格。
- 与原步骤 4 的一处实现差异：接受 `auto` 后也会重新计算 input hash 并快速重跑
  plan；否则新增或修改 TOML 后 timeline 会保留旧 hash，下一次运行产生一次无谓重分析。
- README、配置参考和 timeline schema 已同步 `trim`、`--trim` 与 `meta.trim`。
- 最终独立 QA：analyzer 102/102、CLI 128/128、renderer TypeScript 检查、
  `git diff --check`、`node --check cli/tsuzuri.mjs` 与 `cli/trim.mjs` 全部通过。
- 端到端使用复制到 `/tmp` 的 `examples/fixture` 素材运行
  `node cli/tsuzuri.mjs <folder> --trim full`：分析、规划、渲染、编码和响度归一全部成功；
  timeline 为 `mode=full` / `applied=false`，且未写入 TOML，符合一次性覆盖语义。

## 复核记录

- 发现 Node 的 `Number(value)` 会把 `0x10` 当作合法秒数，而 Python `float()` 不接受；
  根因是两端数字词法范围不一致。CLI 已改用十进制/科学计数法格式校验并补回归测试。
- 发现目标秒数等于或长于原歌曲时，按“最近重拍”会反而截到歌曲末尾前的最后一个重拍；
  根因是秒数模式无条件进入裁剪。现仅在目标短于原曲时寻找裁剪点，并补等于/超过原曲测试。
- 发现 planner 因手改保护而保留 timeline 后，CLI 仍可能询问并写 TOML；第二次 plan 因 hash
  改变会重建 timeline、覆盖手改。根因是 CLI 只看到退出码 0，无法区分“已生成”和“已保留”。
  现由 planner 通过临时状态文件报告 outcome，只有 `generated` 才允许首次问答；同时覆盖
  缺失 beats 的保留分支，并补 planner 状态与问答跳过测试。
- `meta.trim` 已同步到 renderer 的 `TimelineMeta` 类型，并补上同一契约中已有但遗漏的
  `plan_checksum` 可选字段，避免 schema 与 TypeScript 类型继续漂移。
- 复核 TOML 写回、非交互分支、显式配置/覆盖跳问、秒数过短丢图告警、旧 timeline
  手改保护和 input hash 重算路径，未发现剩余阻断问题。
