import React from 'react';
import {Composition} from 'remotion';
import {Diary} from './Diary';
import fixture from '../../examples/fixture/timeline.json';
import type {Timeline} from './types';
import {CANVAS} from './theme';

// defaultProps 用 M0 fixture,方便 studio 直接预览;
// 正式渲染由 CLI 以 --props=<timeline.json> 整体覆盖。
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
