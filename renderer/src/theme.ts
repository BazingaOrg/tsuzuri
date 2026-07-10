/**
 * 视觉规格常量 — 实现方案第二节(已冻结,1080p 基准)。
 * 所有像素值以 1080p 为基准;非 1080p 输出按 height/1080 等比缩放。
 */

export const CANVAS = {
  width: 1920,
  height: 1080,
  fps: 60,
  background: '#FFFFFF',
} as const;

export const PHOTO = {
  scale: 0.8, // 默认安全框占比,可被 meta.photo_scale 覆盖
  shadow:
    '0 10px 28px rgba(0,0,0,0.16), 0 2px 8px rgba(0,0,0,0.08)', // 双层,近实远虚
} as const;

export const SUBTITLE = {
  fontSize: 40, // ≈ 画面高度 3.7%
  color: '#3D3D3A', // 墨灰
  baselineFromBottom: 34, // 基线距底边
  // Noto Serif 系 descender ≈ 0.29em;用于把"基线距底 34px"换算为盒模型 bottom 值
  descentRatio: 0.29,
  letterSpacing: '0.18em',
  letterSpacingCompact: '0.08em', // 单行超过约 18 个全角字符时回退
  compactThreshold: 18, // 全角字符等效数
  confidenceThreshold: 0.6, // Whisper 段置信度低于此值不渲染
  fadeInDuration: 0.4, // 秒,淡入 + 上浮
  fadeOutDuration: 0.3,
  riseDistance: 8, // px,上浮距离
} as const;

export const INFO_BAR = {
  // 可选右下角信息条(配置开关,默认关)
  fontSize: 20,
  color: '#B0AEA6',
} as const;

export const ANIMATION = {
  crossfadeDuration: 0.6, // 秒;淡化中点对齐节拍点
  enterScaleFrom: 1.02, // crossfade 进场 scale 1.02 → 1.00 落定
  cutScaleFrom: 1.045, // cut 硬切进场的落定回弹幅度
  cutSettleDuration: 0.28, // 秒;回弹落定时长(easeOut)
  kenburnsFrom: 1.0,
  kenburnsTo: 1.035,
  endingFadeDuration: 1.5, // 秒;音频淡出 + 画面淡至白
} as const;

export const FONT_FAMILY = {
  ja: `'Noto Serif JP', 'Noto Serif SC', 'Noto Serif', serif`,
  zh: `'Noto Serif SC', 'Noto Serif JP', 'Noto Serif', serif`,
  en: `'Noto Serif', serif`,
  mixed: `'Noto Serif', 'Noto Serif JP', 'Noto Serif SC', serif`,
} as const;
