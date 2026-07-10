import React from 'react';
import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {ANIMATION, PHOTO} from './theme';
import type {PhotoClip, TransitionSpec} from './types';

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

const toStatic = (src: string) => staticFile(src.replace(/^\.\//, ''));

/**
 * 单张照片:居中 + 安全框 fit + 双层阴影 + crossfade(中点对齐 start)+ Ken Burns。
 * 淡入窗口由自身 transition 决定,淡出窗口由下一张的 transition 决定;
 * 即照片实际可见区间为 [start - d/2, end + dNext/2]。
 */
export const Photo: React.FC<{
  clip: PhotoClip;
  nextTransition: TransitionSpec | null;
  safeWidth: number;
  safeHeight: number;
}> = ({clip, nextTransition, safeWidth, safeHeight}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;

  const dIn = clip.transition.type === 'crossfade' ? clip.transition.duration : 0;
  const dOut = nextTransition?.type === 'crossfade' ? nextTransition.duration : 0;

  const fadeIn =
    dIn > 0
      ? interpolate(t, [clip.start - dIn / 2, clip.start + dIn / 2], [0, 1], clamp)
      : t >= clip.start
        ? 1
        : 0;
  const fadeOut =
    dOut > 0
      ? interpolate(t, [clip.end - dOut / 2, clip.end + dOut / 2], [1, 0], clamp)
      : t < clip.end
        ? 1
        : 0;
  const opacity = Math.min(fadeIn, fadeOut);

  // Ken Burns:线性,随停留时长拉伸
  const kenburns =
    clip.motion.type === 'kenburns'
      ? interpolate(t, [clip.start, clip.end], [clip.motion.from, clip.motion.to], clamp)
      : 1;

  // 进场落定:crossfade 期间 1.02 → 1.00
  const enter =
    dIn > 0
      ? interpolate(
          t,
          [clip.start - dIn / 2, clip.start + dIn / 2],
          [ANIMATION.enterScaleFrom, 1],
          clamp,
        )
      : 1;

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems: 'center',
        opacity,
      }}
    >
      <Img
        src={toStatic(clip.src)}
        style={{
          maxWidth: safeWidth,
          maxHeight: safeHeight,
          width: 'auto',
          height: 'auto',
          boxShadow: PHOTO.shadow, // 阴影挂在 img 上,随 transform 同步缩放
          transform: `scale(${kenburns * enter})`,
        }}
      />
    </AbsoluteFill>
  );
};
