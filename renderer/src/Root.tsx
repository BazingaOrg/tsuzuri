import React from 'react';
import {Composition} from 'remotion';
import {Diary} from './Diary';
import fixture from '../../examples/fixture/timeline.json';
import type {Timeline} from './types';
import {CANVAS} from './theme';

// Studio 默认加载 fixture 便于直接预览;
// CLI 渲染时用 --props=<timeline.json> 覆盖完整时间线。
const defaultTimeline = fixture as unknown as Timeline;

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="Diary"
      component={Diary}
      defaultProps={defaultTimeline}
      width={CANVAS.width}
      height={CANVAS.height}
      fps={CANVAS.fps}
      durationInFrames={Math.round(defaultTimeline.meta.duration * defaultTimeline.meta.fps)}
      calculateMetadata={({props}) => ({
        durationInFrames: Math.round(props.meta.duration * props.meta.fps),
        fps: props.meta.fps,
        width: props.meta.width,
        height: props.meta.height,
      })}
    />
  );
};
