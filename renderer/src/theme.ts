/** 视觉规格以 1080p 为基准,非 1080p 输出按 height/1080 等比缩放。 */

export const CANVAS = {
  width: 1920,
  height: 1080,
  fps: 60,
  background: '#FFFFFF',
} as const;

export const PHOTO = {
  // 中性冷黑三层阴影:贴合层定边缘,中层给体积,远层给纵深;白底上不偏色
  shadowLayers: [
    {x: 0, y: 3, blur: 8, spread: -1, color: 'rgba(10, 12, 16, 0.32)'},
    {x: 0, y: 16, blur: 36, spread: -8, color: 'rgba(10, 12, 16, 0.28)'},
    {x: 0, y: 36, blur: 72, spread: -16, color: 'rgba(10, 12, 16, 0.18)'},
  ],
  outlineWidth: 1,
  outlineColor: 'rgba(16, 20, 26, 0.10)',
} as const;

export const getPhotoShadow = (scale: number): string =>
  PHOTO.shadowLayers
    .map(
      ({x, y, blur, spread, color}) =>
        `${x * scale}px ${y * scale}px ${blur * scale}px ${spread * scale}px ${color}`,
    )
    .join(', ');

export const SUBTITLE = {
  // 低干扰的摄影画展题签:纤细、小字号、缓入缓出,避免抢夺照片视觉焦点。
  fontSize: 36,
  fontWeight: 500,
  color: '#37332D',
  letterSpacing: '0.12em',
  letterSpacingCompact: '0.06em', // 单行超过约 18 个全角字符时回退
  compactThreshold: 18, // 全角字符等效数
  confidenceThreshold: 0.6, // Whisper 段置信度低于此值不渲染
  fadeInDuration: 0.35,
  fadeOutDuration: 0.25,
  riseDistance: 6,
  exitRise: 4,
} as const;

export const INFO_BAR = {
  // 可选右下角信息条(配置开关,默认关)
  fontSize: 20,
  color: '#B0AEA6',
} as const;

export const ANIMATION = {
  endingFadeDuration: 1.5, // 秒;音频淡出 + 画面淡至白
} as const;

export const SIGNATURE = {
  // 右下角落款:低两级于字幕的存在感;片尾淡白后保留(层级在白场之上)
  height: 56, // 字形高度(px,1080p 基准;含上下笔画环,视觉主体更小)
  margin: 48, // 右/下边距,落在照片安全框外留白区
  color: '#8F8C85',
  opacity: 0.8,
  viewBox: {x: 2, y: 2, width: 320, height: 129}, // 按字形实际边界裁剪
} as const;

export const FONT_FAMILY = {
  ja: `'Noto Serif JP', 'Noto Serif SC', 'Noto Serif', serif`,
  zh: `'Noto Serif SC', 'Noto Serif JP', 'Noto Serif', serif`,
  en: `'Noto Serif', serif`,
  mixed: `'Noto Serif', 'Noto Serif JP', 'Noto Serif SC', serif`,
} as const;
