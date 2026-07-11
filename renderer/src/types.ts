export type TransitionSpec = {
  type: 'album' | 'crossfade' | 'cut' | 'none';
  duration: number; // seconds; cut/none 为 0
};

/**
 * @deprecated 仅用于读取旧版 timeline。渲染器忽略所有 motion 字段,照片几何始终保持不变。
 */
export type MotionSpec = {
  type: 'kenburns' | 'none';
  from: number;
  to: number;
};

export type PhotoClip = {
  src: string;
  start: number; // seconds; switch point = crossfade midpoint
  end: number;
  transition: TransitionSpec;
  /** @deprecated 仅供 timeline v1 兼容;渲染时为 no-op。 */
  motion: MotionSpec;
};

export type SubtitleLine = {
  text: string;
  lang: 'ja' | 'zh' | 'en' | 'mixed';
  start: number;
  end: number;
  confidence: number;
};

export type TimelineMeta = {
  version: number;
  audio: string;
  duration: number; // seconds
  width: number;
  height: number;
  fps: number;
  background: string;
  photo_scale: number;
  input_hash?: string;
};

export type Timeline = {
  meta: TimelineMeta;
  photos: PhotoClip[];
  subtitles: SubtitleLine[];
  beats?: {
    bpm: number;
    downbeats: number[];
  };
};
