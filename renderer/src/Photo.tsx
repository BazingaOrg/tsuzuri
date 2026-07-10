import React from 'react';
import {AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
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

  const isFade = (ty?: string) => ty === 'crossfade' || ty === 'album';
  const dIn = isFade(clip.transition.type) ? clip.transition.duration : 0;
  const dOut = isFade(nextTransition?.type) ? (nextTransition?.duration ?? 0) : 0;

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

  // 进出场缩放:
  // album —— 进场 0.95 → 1.00 放大浮现(easeOut,无过冲),出场微缩到 0.97 退去;
  // crossfade —— 保留旧语义 1.02 → 1.00 落定;cut —— 纯硬切,无附加动画
  let enter = 1;
  if (clip.transition.type === 'album' && dIn > 0) {
    enter = interpolate(
      t,
      [clip.start - dIn / 2, clip.start + dIn / 2],
      [ANIMATION.albumEnterFrom, 1],
      {...clamp, easing: Easing.out(Easing.cubic)},
    );
  } else if (clip.transition.type === 'crossfade' && dIn > 0) {
    enter = interpolate(
      t,
      [clip.start - dIn / 2, clip.start + dIn / 2],
      [ANIMATION.enterScaleFrom, 1],
      clamp,
    );
  }
  let exit = 1;
  if (nextTransition?.type === 'album' && dOut > 0) {
    exit = interpolate(
      t,
      [clip.end - dOut / 2, clip.end + dOut / 2],
      [1, ANIMATION.albumExitTo],
      {...clamp, easing: Easing.in(Easing.cubic)},
    );
  }

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
          transform: `scale(${kenburns * enter * exit})`,
        }}
      />
    </AbsoluteFill>
  );
};
