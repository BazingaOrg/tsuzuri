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
  // 2026-07-10 修订:Apple Music 歌词感 —— 更大字重、带状区域垂直居中、模糊消散动效
  fontSize: 44, // ≈ 画面高度 4.1%
  fontWeight: 600, // 半粗,变量字体直接支持
  color: '#2E2E2B', // 深墨
  letterSpacing: '0.18em',
  letterSpacingCompact: '0.08em', // 单行超过约 18 个全角字符时回退
  compactThreshold: 18, // 全角字符等效数
  confidenceThreshold: 0.6, // Whisper 段置信度低于此值不渲染
  // 进场:淡入 + 上浮 + 模糊聚焦;退场:淡出 + 继续上行 + 化雾(Apple 歌词行语言)
  fadeInDuration: 0.45,
  fadeOutDuration: 0.3,
  riseDistance: 16, // px,进场上浮
  exitRise: 12, // px,退场继续上行
  blurIn: 10, // px,进场起始模糊
  blurOut: 6, // px,退场终点模糊
} as const;

export const INFO_BAR = {
  // 可选右下角信息条(配置开关,默认关)
  fontSize: 20,
  color: '#B0AEA6',
} as const;

export const ANIMATION = {
  crossfadeDuration: 0.6, // 秒;淡化中点对齐节拍点
  enterScaleFrom: 1.02, // crossfade 进场 scale 1.02 → 1.00 落定
  // album(默认):Apple Music 切歌感 —— 进场 0.95 放大浮现,出场微缩退去,无过冲
  albumEnterFrom: 0.95,
  albumExitTo: 0.97,
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
