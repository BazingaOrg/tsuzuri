import React from 'react';
import {
  AbsoluteFill,
  Audio,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import './fonts';
import {Photo} from './Photo';
import {Subtitle} from './Subtitle';
import {ANIMATION, SUBTITLE} from './theme';
import type {Timeline} from './types';

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

/**
 * 主 Composition:消费 timeline.json(即组件 props)。
 * photos 与 subtitles 是两条独立时间线,各自渲染互不影响。
 */
export const Diary: React.FC<Timeline> = ({meta, photos, subtitles}) => {
  const frame = useCurrentFrame();
  const {fps, height, durationInFrames} = useVideoConfig();
  const t = frame / fps;

  // 视觉规格以 1080p 为基准,非 1080p 输出等比缩放
  const scale = height / 1080;
  const safeWidth = meta.width * meta.photo_scale;
  const safeHeight = meta.height * meta.photo_scale;

  // 字幕带:照片安全框下缘到画布底部,行框垂直居中于此
  const bandCenterFromBottom = (meta.height * (1 - meta.photo_scale)) / 4;

  // 只挂载当前可见的照片(含淡化前后沿)
  const isFade = (ty?: string) => ty === 'crossfade' || ty === 'album';
  const visiblePhotos = photos.filter((p, i) => {
    const dIn = isFade(p.transition.type) ? p.transition.duration : 0;
    const next = photos[i + 1]?.transition;
    const dOut = isFade(next?.type) ? (next?.duration ?? 0) : 0;
    return t >= p.start - dIn / 2 - 1 / fps && t <= p.end + dOut / 2 + 1 / fps;
  });

  const visibleSubtitles = subtitles.filter(
    (l) =>
      l.confidence >= SUBTITLE.confidenceThreshold &&
      t >= l.start - 1 / fps &&
      t <= l.end + SUBTITLE.fadeOutDuration + 1 / fps,
  );

  // 收尾:音频末尾 1.5s 淡出,画面同步淡至白。
  // 下界钳到 0,防止短于 1.5s 的合成从首帧就开始泛白/压音量
  const fadeFrames = Math.round(ANIMATION.endingFadeDuration * fps);
  const fadeStart = Math.max(0, durationInFrames - fadeFrames);
  const whiteFade = interpolate(frame, [fadeStart, durationInFrames - 1], [0, 1], clamp);

  return (
    <AbsoluteFill style={{backgroundColor: meta.background}}>
      <Audio
        src={staticFile(meta.audio.replace(/^\.\//, ''))}
        volume={(f) => interpolate(f, [fadeStart, durationInFrames - 1], [1, 0], clamp)}
      />
      {visiblePhotos.map((p) => {
        const i = photos.indexOf(p);
        return (
          <Photo
            key={`${p.src}-${i}`}
            clip={p}
            nextTransition={photos[i + 1]?.transition ?? null}
            safeWidth={safeWidth}
            safeHeight={safeHeight}
          />
        );
      })}
      {visibleSubtitles.map((l) => (
        <Subtitle
          key={`${l.start}-${l.text}`}
          line={l}
          scale={scale}
          bandCenterFromBottom={bandCenterFromBottom}
        />
      ))}
      {whiteFade > 0 ? (
        <AbsoluteFill style={{backgroundColor: meta.background, opacity: whiteFade}} />
      ) : null}
    </AbsoluteFill>
  );
};
