import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {FONT_FAMILY, getVisualScale, type Palette} from './theme';
import type {ChapterClip} from './types';

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

export const ChapterCard: React.FC<{clip: ChapterClip; background: string; palette: Palette}> = ({clip, background, palette}) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const t = frame / fps;
  const fade = Math.min(interpolate(t, [clip.start, clip.start + 0.35], [0, 1], clamp), interpolate(t, [clip.end - 0.35, clip.end], [1, 0], clamp));
  const scale = getVisualScale(width, height);
  return <AbsoluteFill style={{backgroundColor: background, opacity: fade, justifyContent: 'center', alignItems: 'center'}}><div style={{fontFamily: FONT_FAMILY.mixed, color: palette.text, fontSize: 46 * scale, letterSpacing: '0.1em', transform: `translateY(${(1 - fade) * 10 * scale}px)`}}>{clip.text}</div></AbsoluteFill>;
};
