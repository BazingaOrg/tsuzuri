import React from 'react';
import {AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {Signature, SIGNATURE_VIEWBOX} from './Signature';
import {INTRO} from './theme';

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

export const introDuration =
  INTRO.drawDuration + INTRO.inkDuration + INTRO.hold + INTRO.fadeOut;

// 签名路径总长(渲染所用 chrome-headless-shell 中 getTotalLength() 实测值)。
// 注意不能用 pathLength="100" 归一化:Chrome 对多子路径 <path> 设置
// pathLength 后会整体禁用虚线(实测),故直接采用真实长度。
const SIGNATURE_PATH_TOTAL_LENGTH = 2109.58;

/**
 * 片头:白画布上签名沿笔迹"写"出来,再"上墨"填充。
 * 经典虚线偏移手法:stroke-dasharray = 路径总长,dashoffset 从总长到 0,
 * 实线段沿路径滑入,视觉上如笔沿字迹书写;CSS animation 在 Remotion
 * 不可用,由 useCurrentFrame 逐帧驱动同一原理。
 */
export const Intro: React.FC<{backgroundColor: string; scale: number}> = ({
  backgroundColor,
  scale,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;

  // 书写:描边沿笔迹画出(慢起 → 匀速 → 缓收)
  const dashOffset = interpolate(
    t,
    [0, INTRO.drawDuration],
    [SIGNATURE_PATH_TOTAL_LENGTH, 0],
    {...clamp, easing: Easing.bezier(0.35, 0, 0.55, 1)},
  );
  // 上墨:书写收尾后填充淡入,如墨水晕开;描边同步让位
  const inkStart = INTRO.drawDuration;
  const fillOpacity = interpolate(t, [inkStart, inkStart + INTRO.inkDuration], [0, 1], clamp);

  const cardOpacity = interpolate(
    t,
    [introDuration - INTRO.fadeOut, introDuration],
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
      <Signature
        style={{width, height, color: INTRO.color, opacity: INTRO.opacity, display: 'block'}}
        pathProps={{
          fillOpacity,
          stroke: 'currentColor',
          strokeWidth: INTRO.strokeWidth,
          strokeDasharray: SIGNATURE_PATH_TOTAL_LENGTH,
          strokeDashoffset: dashOffset,
        }}
      />
    </AbsoluteFill>
  );
};
