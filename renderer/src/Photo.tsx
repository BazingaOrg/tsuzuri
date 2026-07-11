import React from 'react';
import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {PHOTO, getPhotoShadow} from './theme';
import {getFadeDuration} from './transition';
import type {PhotoClip} from './types';

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

const toStatic = (src: string) => staticFile(src.replace(/^\.\//, ''));

/**
 * 单页照片:画布背景 + 居中安全框 + 中性展陈光影。
 * 新页整体淡入并覆盖仍不透明的旧页,避免两张照片同时半透明时泄漏白底。
 */
export const Photo: React.FC<{
  clip: PhotoClip;
  backgroundColor: string;
  safeWidth: number;
  safeHeight: number;
}> = ({clip, backgroundColor, safeWidth, safeHeight}) => {
  const frame = useCurrentFrame();
  const {fps, height} = useVideoConfig();
  const t = frame / fps;

  const dIn = getFadeDuration(clip.transition);
  const fadeIn =
    dIn > 0
      ? interpolate(t, [clip.start - dIn / 2, clip.start + dIn / 2], [0, 1], clamp)
      : t >= clip.start
        ? 1
        : 0;
  const renderScale = height / 1080;
  const outlineWidth = PHOTO.outlineWidth * renderScale;
  const boxShadow = React.useMemo(() => getPhotoShadow(renderScale), [renderScale]);

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor,
        opacity: fadeIn,
      }}
    >
      <Img
        src={toStatic(clip.src)}
        style={{
          maxWidth: safeWidth,
          maxHeight: safeHeight,
          width: 'auto',
          height: 'auto',
          boxShadow,
          outline: `${outlineWidth}px solid ${PHOTO.outlineColor}`,
          outlineOffset: `${-outlineWidth}px`,
        }}
      />
    </AbsoluteFill>
  );
};
