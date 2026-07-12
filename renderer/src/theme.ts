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
  audioFadeDuration: 1.5, // 秒;片尾音频淡出
  // 镜像见 analyzer/plan.py WHITE_FADE_DURATION——plan 据此为末张照片预留可见时长,
  // 改这里需要同步改那边
  whiteFadeDuration: 2.5, // 秒;片尾画面淡至白(比音频长,给谢幕语留可读时间)
} as const;

export const INTRO = {
  // 片头:白画布上手写签名沿笔迹描边写出,再上墨填充,随后整卡淡出
  height: 120, // 签名字形高度(px,1080p 基准)
  color: '#37332D', // 与字幕同级的墨色
  opacity: 0.9,
  strokeWidth: 2.5, // viewBox 单位;书写阶段的笔迹粗细
  // drawDuration + inkDuration + hold + fadeOut 之和镜像见
  // analyzer/plan.py INTRO_DURATION——plan 据此把理想切换网格整体右移,
  // 四者任一变化都需要同步改那边的常量
  drawDuration: 1.4, // 秒;描边沿笔迹画出
  inkDuration: 0.35, // 秒;填充淡入(上墨)
  hold: 0.4, // 秒;写完停留
  fadeOut: 0.5, // 秒;整卡淡出
  // 镜像见 analyzer/plan.py MIN_PHOTO_VISIBLE
  minPhotoVisible: 0.8, // 秒;第一张照片在片头结束后至少可见时长,不足则跳过片头
} as const;

export const OUTRO = {
  // 片尾谢幕语:白场过半后居中浮现,持续到最后一帧;沿用字幕的题签样式
  text: 'Thanks for watching :)',
  fontSize: 36,
  fontWeight: 500,
  color: '#37332D',
  letterSpacing: '0.12em',
  fontFamily: `'Noto Serif', serif`, // 与英文字幕同字体
  fadeRange: [0.5, 0.85] as const, // 随白场进度淡入的区间
  riseDistance: 6,
} as const;

export const FONT_FAMILY = {
  ja: `'Noto Serif JP', 'Noto Serif SC', 'Noto Serif', serif`,
  zh: `'Noto Serif SC', 'Noto Serif JP', 'Noto Serif', serif`,
  en: `'Noto Serif', serif`,
  mixed: `'Noto Serif', 'Noto Serif JP', 'Noto Serif SC', serif`,
} as const;

/** still 导出布局(1080p 基准比例;非 1080p 输出随画布自然缩放)。 */
export const STILL = {
  // 无 EXIF:与视频照片页一致,用 meta.photo_scale(默认 0.8)
  // 有 EXIF:展签布局——照片限位收紧,给右侧信息面板留位
  withExif: {
    photoMaxHeight: 0.72, // × 画布高
    photoMaxWidth: 0.52, // × 画布宽
    panelWidth: 0.24, // × 画布宽
    gap: 0.05, // × 画布宽
  },
  signature: {
    height: 56,
    panelHeight: 44,
    bottomInset: 26,
    opacity: 0.65,
    color: INTRO.color,
  },
  typography: {
    // 参数行为视觉主角(字号同字幕 36);相机/镜头次之;时间最小用 INFO_BAR 灰
    paramsFontSize: 30,
    cameraFontSize: 28,
    lensFontSize: 24,
    datetimeFontSize: 20,
    lineGap: 10, // 行间距(px,1080p)
    groupGap: 28, // 相机组与参数组、参数组与时间之间
    paramsLineGap: 8,
    dividerColor: '#E4E2DC',
    dividerWidth: 0.5,
    fontFamily: `'Noto Serif', 'Noto Serif JP', 'Noto Serif SC', serif`,
    color: '#37332D',
    datetimeColor: '#B0AEA6', // INFO_BAR
    letterSpacing: '0.12em',
  },
} as const;
