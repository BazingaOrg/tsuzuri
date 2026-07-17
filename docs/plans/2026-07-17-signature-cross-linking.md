# 与 animated-signature 的互引与笔顺联动

来源:2026-07-17 讨论。结论:两个项目通过"一份 SVG 文件"解耦,不做代码集成,
只做 README 互引(含对方预览图热链)+ 笔顺约定 + 片头顺序书写增强。

## 步骤

1. [x] animated-signature 补预览资产:浅色主题工作室截图提交为
       `docs/assets/preview.jpg`(约 60KB;`.playwright-cli/` 已在 gitignore)
2. [x] README 互引(图用 raw.githubusercontent.com 热链对方 main 分支):
       - tsuzuri README.md / README.en.md:`--sign` 段落后新增制作工作流
         (静态 SVG、tight bounds、固定色或 currentColor;不需要动画版)+ 预览图
       - animated-signature README:顶部加自身预览图;新增 "Works with tsuzuri"
         节,配 tsuzuri `still-sign-case.png` 热链
3. [x] 笔顺联动:
       - 约定写入两边文档:签名 SVG 的 path 顺序即书写笔顺
       - `renderer/src/Intro.tsx`:多 path 从并行书写改为按 path 顺序依次书写,
         各笔画时间窗按长度占比分配;总时长 introDuration 不变,plan 侧
         INTRO_DURATION 镜像常量无需改动;单 path(含内置签名)数学上逐帧不变
       - `docs/config.md` 约束段同步("并行书写"→"顺序书写"),并加推荐工作流

## 验证

- renderer `tsc --noEmit` 通过。
- 端到端:examples/fixture + 三笔画多 path 测试 SVG 渲 `--draft`,抽帧
  0.3s / 0.7s / 1.1s 确认三笔严格依次书写、时间窗随长度分配。
- 内置签名为单 path,新旧公式等价(dashoffset = length × (1 − progress)),
  默认输出逐帧一致。

## 备注

- 热链图指向对方仓库 main 分支,属可变引用;两仓库同属一人,图片改名时需
  同步更新引用。
- animated-signature 侧的 README 改动在其自身仓库提交,不在本仓库 diff 内。
