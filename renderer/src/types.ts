export type TransitionSpec = {
  type: 'crossfade' | 'none';
  duration: number; // seconds
};

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
