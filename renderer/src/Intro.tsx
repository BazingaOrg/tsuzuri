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
 * 多 path 自定义签名按 path 顺序依次书写(约定:path 顺序即笔顺),
 * 各笔画时间窗按自身长度占比分配;总时长仍为 introDuration,
 * plan 侧 INTRO_DURATION 无需改动,单 path(含内置签名)行为不变。
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

  // 整体书写进度 0→1;各 path 按长度占比在总进度上占据连续时间窗,依次书写
  const drawProgress = interpolate(t, [0, INTRO.drawDuration], [0, 1], {
    ...clamp,
    easing: Easing.bezier(0.35, 0, 0.55, 1),
  });
  const totalLength = signature.paths.reduce((sum, p) => sum + p.length, 0);
  const prefixLengths: number[] = [];
  let prefix = 0;
  for (const p of signature.paths) {
    prefixLengths.push(prefix);
    prefix += p.length;
  }

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
        pathProps={(path, index) => {
          const local = Math.min(
            1,
            Math.max(0, (drawProgress * totalLength - prefixLengths[index]) / path.length),
          );
          return {
            fillOpacity,
            stroke: 'currentColor',
            strokeWidth: INTRO.strokeWidth,
            strokeDasharray: path.length,
            strokeDashoffset: path.length * (1 - local),
          };
        }}
      />
    </AbsoluteFill>
  );
};
