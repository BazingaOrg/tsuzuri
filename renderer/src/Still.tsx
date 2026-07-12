import React from 'react';
import {AbsoluteFill, staticFile} from 'remotion';
import './fonts';
import {FramedPhoto} from './FramedPhoto';
import {Signature, useSignatureData, type SignatureData} from './Signature';
import {CANVAS, STILL} from './theme';

export type StillExif = {
  camera?: string;
  lens?: string;
  params?: string[];
  datetime?: string;
};

export type StillProps = {
  src: string;
  background: string;
  photoScale: number;
  width: number;
  height: number;
  exif?: StillExif | null;
  sign?: boolean;
  signatureSrc?: string;
};

const toStatic = (src: string) => staticFile(src.replace(/^\.\//, ''));

const ExifPanel: React.FC<{exif: StillExif; scale: number; width: number; sign: boolean; signature: SignatureData | null}> = ({
  exif,
  scale,
  width,
  sign,
  signature,
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
      {exif.params?.length ? (
        <>
          <div style={{width: `${t.dividerWidth * 100}%`, height: scale, background: t.dividerColor, marginBottom: t.groupGap * scale}} />
          {exif.params.map((param) => (
            <div key={param} style={{fontFamily: t.fontFamily, fontSize: t.paramsFontSize * scale, fontWeight: 500, letterSpacing: t.letterSpacing, color: t.color, lineHeight: 1.2, marginBottom: t.paramsLineGap * scale}}>{param}</div>
          ))}
        </>
      ) : null}
      {(exif.params && exif.datetime) || ((exif.camera || exif.lens) && exif.datetime) ? (
        <div style={{height: t.groupGap * scale}} />
      ) : null}
      {line(exif.datetime, t.datetimeFontSize, t.datetimeColor, 400)}
      {sign && signature ? (
        <div style={{marginTop: t.groupGap * scale, color: STILL.signature.color, opacity: STILL.signature.opacity}}>
          <Signature data={signature} style={{height: STILL.signature.panelHeight * scale, maxWidth: width}} pathProps={{fill: 'currentColor'}} />
        </div>
      ) : null}
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
  sign = false,
  signatureSrc,
}) => {
  const scale = height / 1080;
  const signature = useSignatureData(sign ? signatureSrc : undefined);
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
        <FramedPhoto src={toStatic(src)} maxWidth={safeW} maxHeight={safeH} renderScale={scale} />
        {sign && signature ? (
          <div style={{position: 'absolute', left: 0, right: 0, bottom: STILL.signature.bottomInset * scale, display: 'flex', justifyContent: 'center', color: STILL.signature.color, opacity: STILL.signature.opacity}}>
            <Signature data={signature} style={{height: STILL.signature.height * scale, maxWidth: safeW}} pathProps={{fill: 'currentColor'}} />
          </div>
        ) : null}
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
        <ExifPanel exif={exif!} scale={scale} width={panelW} sign={sign} signature={signature} />
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
  exif: {
    camera: 'Sony α7 IV',
    lens: 'FE 35mm F1.8',
    params: ['45mm', 'f/22', '1/75s', 'ISO 200'],
    datetime: '2026.05.21 18:42',
  },
};
