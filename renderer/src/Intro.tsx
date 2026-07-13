import React from 'react';
import {AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {Signature, useSignatureData} from './Signature';
import {INTRO, type Palette} from './theme';

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

export const introDuration =
  INTRO.drawDuration + INTRO.inkDuration + INTRO.hold + INTRO.fadeOut;

/**
 * 片头:白画布上签名沿笔迹"写"出来,再"上墨"填充。
 * 经典虚线偏移手法:stroke-dasharray = 路径总长,dashoffset 从总长到 0,
 * 实线段沿路径滑入,视觉上如笔沿字迹书写;CSS animation 在 Remotion
 * 不可用,由 useCurrentFrame 逐帧驱动同一原理。
 *
 * 多 path 自定义签名时各笔画并行书写(各自 dasharray = 自身长度),
 * 总时长仍为 introDuration,plan 侧 INTRO_DURATION 无需改动。
 */
export const Intro: React.FC<{
  backgroundColor: string;
  scale: number;
  /** 素材文件夹内签名 SVG 相对路径;缺省用内置签名 */
  signatureSrc?: string;
  palette: Palette;
}> = ({backgroundColor, scale, signatureSrc, palette}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const signature = useSignatureData(signatureSrc);

  // 上墨:书写收尾后填充淡入,如墨水晕开;描边同步让位
  const inkStart = INTRO.drawDuration;
  const fillOpacity = interpolate(t, [inkStart, inkStart + INTRO.inkDuration], [0, 1], clamp);

  const cardOpacity = interpolate(
    t,
    [introDuration - INTRO.fadeOut, introDuration],
    [1, 0],
    clamp,
  );

  // 自定义签名尚未测长完成时先占位空卡(delayRender 会挡住真正出帧)
  if (!signature) {
    return <AbsoluteFill style={{backgroundColor, opacity: cardOpacity}} />;
  }

  const height = INTRO.height * scale;
  const width = height * (signature.viewBox.width / signature.viewBox.height);

  // 书写进度 1→0(dashoffset 系数),各 path 乘以自身 length
  const drawProgress = interpolate(t, [0, INTRO.drawDuration], [1, 0], {
    ...clamp,
    easing: Easing.bezier(0.35, 0, 0.55, 1),
  });

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
        data={signature}
        style={{width, height, color: palette.text, opacity: INTRO.opacity, display: 'block'}}
        pathProps={(path) => ({
          fillOpacity,
          stroke: 'currentColor',
          strokeWidth: INTRO.strokeWidth,
          strokeDasharray: path.length,
          strokeDashoffset: path.length * drawProgress,
        })}
      />
    </AbsoluteFill>
  );
};
