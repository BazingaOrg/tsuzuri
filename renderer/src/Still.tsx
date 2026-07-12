import React from 'react';
import {AbsoluteFill, staticFile} from 'remotion';
import './fonts';
import {FramedPhoto} from './FramedPhoto';
import {CANVAS, STILL} from './theme';

export type StillExif = {
  camera?: string;
  lens?: string;
  params?: string;
  datetime?: string;
};

export type StillProps = {
  src: string;
  background: string;
  photoScale: number;
  width: number;
  height: number;
  exif?: StillExif;
};

const toStatic = (src: string) => staticFile(src.replace(/^\.\//, ''));

const ExifPanel: React.FC<{exif: StillExif; scale: number; width: number}> = ({
  exif,
  scale,
  width,
}) => {
  const t = STILL.typography;
  const line = (text: string | undefined, fontSize: number, color: string, weight = 500) =>
    text ? (
      <div
        style={{
          fontFamily: t.fontFamily,
          fontSize: fontSize * scale,
          fontWeight: weight,
          letterSpacing: t.letterSpacing,
          color,
          lineHeight: 1.35,
          marginBottom: t.lineGap * scale,
        }}
      >
        {text}
      </div>
    ) : null;

  return (
    <div
      style={{
        width,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        textAlign: 'left',
      }}
    >
      {line(exif.camera, t.cameraFontSize, t.color)}
      {line(exif.lens, t.lensFontSize, t.color)}
      {(exif.camera || exif.lens) && (exif.params || exif.datetime) ? (
        <div style={{height: t.groupGap * scale}} />
      ) : null}
      {line(exif.params, t.paramsFontSize, t.color)}
      {(exif.params && exif.datetime) || ((exif.camera || exif.lens) && exif.datetime) ? (
        <div style={{height: t.groupGap * scale}} />
      ) : null}
      {line(exif.datetime, t.datetimeFontSize, t.datetimeColor, 400)}
    </div>
  );
};

/**
 * 静态导出 composition:与视频同款展陈框;可选 EXIF 展签(照片左 + 信息右,整体居中)。
 */
export const Still: React.FC<StillProps> = ({
  src,
  background,
  photoScale,
  width,
  height,
  exif,
}) => {
  const scale = height / 1080;
  const hasExif = Boolean(exif && (exif.camera || exif.lens || exif.params || exif.datetime));

  if (!hasExif) {
    const safeW = width * photoScale;
    const safeH = height * photoScale;
    return (
      <AbsoluteFill
        style={{
          backgroundColor: background,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <FramedPhoto
          src={toStatic(src)}
          maxWidth={safeW}
          maxHeight={safeH}
          renderScale={scale}
        />
      </AbsoluteFill>
    );
  }

  const layout = STILL.withExif;
  const photoMaxW = width * layout.photoMaxWidth;
  const photoMaxH = height * layout.photoMaxHeight;
  const panelW = width * layout.panelWidth;
  const gap = width * layout.gap;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: background,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap,
          maxWidth: '100%',
          maxHeight: '100%',
        }}
      >
        <FramedPhoto
          src={toStatic(src)}
          maxWidth={photoMaxW}
          maxHeight={photoMaxH}
          renderScale={scale}
        />
        <ExifPanel exif={exif!} scale={scale} width={panelW} />
      </div>
    </AbsoluteFill>
  );
};

export const defaultStillProps: StillProps = {
  src: 'photos/001.jpg',
  background: CANVAS.background,
  photoScale: 0.8,
  width: CANVAS.width,
  height: CANVAS.height,
};
