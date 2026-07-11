import React from 'react';
import {AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {Signature, SIGNATURE_VIEWBOX} from './Signature';
import {INTRO} from './theme';

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

export const introDuration = INTRO.writeDuration + INTRO.hold + INTRO.fadeOut;

/**
 * 片头:白画布上签名居中"写"出来。
 * 字形是轮廓填充路径(无笔画骨架),用带羽化的渐变遮罩沿书写方向揭开——
 * 软边缘读作"墨迹在流",硬边 clip 会暴露连笔字的笔顺错位。
 */
export const Intro: React.FC<{backgroundColor: string; scale: number}> = ({
  backgroundColor,
  scale,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;

  // 运笔进度:慢起 → 匀速 → 缓收
  const progress = interpolate(t, [0, INTRO.writeDuration], [0, 1], {
    ...clamp,
    easing: Easing.bezier(0.35, 0, 0.55, 1),
  });
  // 羽化 12%:黑(可见)边界推进,前沿渐隐模拟墨迹
  const feather = 12;
  const edge = progress * (100 + feather);
  const mask = `linear-gradient(100deg, #000 ${edge - feather}%, transparent ${edge}%)`;

  const cardOpacity = interpolate(
    t,
    [INTRO.writeDuration + INTRO.hold, introDuration],
    [1, 0],
    clamp,
  );

  const height = INTRO.height * scale;
  const width = height * (SIGNATURE_VIEWBOX.width / SIGNATURE_VIEWBOX.height);

  return (
    <AbsoluteFill
      style={{
        backgroundColor,
        justifyContent: 'center',
        alignItems: 'center',
        opacity: cardOpacity,
      }}
    >
      <div style={{WebkitMaskImage: mask, maskImage: mask}}>
        <Signature style={{width, height, color: INTRO.color, opacity: INTRO.opacity, display: 'block'}} />
      </div>
    </AbsoluteFill>
  );
};
