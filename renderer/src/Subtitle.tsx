import React from 'react';
import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {FONT_FAMILY, SUBTITLE} from './theme';
import type {SubtitleLine} from './types';

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

const KANA_RE = /[぀-ヿ]/; // ひらがな + カタカナ
const CJK_RE = /[㐀-䶿一-鿿豈-﫿]/;
const LATIN_ONLY_RE = /^[ -ɏ -⁯]*$/;
const FULLWIDTH_RE = /[　-〿＀-￯]/;

/**
 * 逐行字体路由(实现方案第二节):
 * 含假名 → JP;纯 CJK 无假名 → SC(Whisper 标 ja 时用 JP 双重校验);
 * 纯拉丁 → Noto Serif;混合行走 font stack 自然回退。
 */
export const resolveFontFamily = (text: string, lang: SubtitleLine['lang']): string => {
  if (KANA_RE.test(text)) return FONT_FAMILY.ja;
  if (CJK_RE.test(text)) return lang === 'ja' ? FONT_FAMILY.ja : FONT_FAMILY.zh;
  if (LATIN_ONLY_RE.test(text)) return FONT_FAMILY.en;
  return FONT_FAMILY[lang] ?? FONT_FAMILY.mixed;
};

/** 全角等效字符数:CJK/假名/全角符号计 1,其余计 0.5 */
export const fullwidthLength = (text: string): number => {
  let n = 0;
  for (const ch of text) {
    n += KANA_RE.test(ch) || CJK_RE.test(ch) || FULLWIDTH_RE.test(ch) ? 1 : 0.5;
  }
  return n;
};

export const Subtitle: React.FC<{line: SubtitleLine; scale: number}> = ({line, scale}) => {
  const frame = useCurrentFrame();
  const {fps, width} = useVideoConfig();
  const t = frame / fps;

  const fadeIn = interpolate(t, [line.start, line.start + SUBTITLE.fadeInDuration], [0, 1], clamp);
  const fadeOut = interpolate(t, [line.end, line.end + SUBTITLE.fadeOutDuration], [1, 0], clamp);
  const opacity = Math.min(fadeIn, fadeOut);
  const rise = interpolate(
    t,
    [line.start, line.start + SUBTITLE.fadeInDuration],
    [SUBTITLE.riseDistance * scale, 0],
    clamp,
  );

  const letterSpacing =
    fullwidthLength(line.text) > SUBTITLE.compactThreshold
      ? SUBTITLE.letterSpacingCompact
      : SUBTITLE.letterSpacing;

  // 超宽兜底:analyze 层已按词拆行,但手改 timeline 等场景仍可能出现超长行,
  // 按估算宽度等比缩小字号,保证不溢出画布(估算:全角 1em、半角 0.5em + 字距)
  const spacingEm = parseFloat(letterSpacing);
  const units = fullwidthLength(line.text);
  const baseSize = SUBTITLE.fontSize * scale;
  const estWidth = baseSize * (units + line.text.length * spacingEm);
  const maxWidth = width * 0.92;
  const fontSize = estWidth > maxWidth ? baseSize * (maxWidth / estWidth) : baseSize;

  // 把"基线距底 34px"换算为盒模型 bottom(descentRatio 为经验值,视觉验收时校准)
  const bottom = (SUBTITLE.baselineFromBottom - SUBTITLE.fontSize * SUBTITLE.descentRatio) * scale;

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom,
        textAlign: 'center',
        opacity,
        transform: `translateY(${rise}px)`,
      }}
    >
      <span
        style={{
          fontFamily: resolveFontFamily(line.text, line.lang),
          fontSize,
          fontWeight: 400,
          color: SUBTITLE.color,
          lineHeight: 1,
          letterSpacing,
          // letter-spacing 会在末字符后多出一份间距,负 margin 抵消以保持视觉居中
          marginRight: `-${letterSpacing}`,
          whiteSpace: 'nowrap',
        }}
      >
        {line.text}
      </span>
    </div>
  );
};
