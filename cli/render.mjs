#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {bundleRenderer, loadRemotionRenderer} from './bundle.mjs';
import {extractFormattedExif} from './exif.mjs';
import {createPercentProgress} from './progress.mjs';

/**
 * 渲染时覆盖 inputProps(timeline.json 本身绝不改写):
 * dark → 黑底;sign → 落款;exif → 按 src 去重逐张提取展签,信息不足置 null。
 * @param {object} timeline
 * @param {{exif?: boolean, sign?: boolean, dark?: boolean}} flags
 * @param {{resolvePhotoPath: (src: string) => string, extractExif?: typeof extractFormattedExif, onExifShortage?: (count: number) => void}} deps
 */
export const applyRenderVariants = async (
  timeline,
  {exif = false, sign = false, dark = false} = {},
  {resolvePhotoPath, extractExif = extractFormattedExif, onExifShortage} = {},
) => {
  if (dark) {
    timeline.meta = {...timeline.meta, background: '#000000'};
  }
  if (sign) {
    timeline.meta = {...timeline.meta, sign: true};
  }
  if (exif) {
    const exifBySrc = new Map();
    for (const photo of timeline.photos ?? []) {
      if (exifBySrc.has(photo.src)) continue;
      exifBySrc.set(photo.src, await extractExif(resolvePhotoPath(photo.src)));
    }
    timeline.photos = (timeline.photos ?? []).map((photo) => {
      const formatted = exifBySrc.get(photo.src) ?? null;
      return {...photo, exif: formatted};
    });
    const shortage = [...exifBySrc.values()].filter((formatted) => !formatted).length;
    if (shortage > 0) onExifShortage?.(shortage);
  }
  return timeline;
};

const main = async () => {
  const [timelineArg, outputArg, publicDirArg, ...flagArgs] = process.argv.slice(2);
  if (!timelineArg || !outputArg || !publicDirArg) {
    throw new Error(
      '用法: render.mjs <timeline.json> <output.mp4> <public-dir> [--exif] [--sign] [--dark]\n' +
        '此为内部入口,日常请用 tsuzuri <folder>',
    );
  }
  const flags = {
    exif: flagArgs.includes('--exif'),
    sign: flagArgs.includes('--sign'),
    dark: flagArgs.includes('--dark'),
  };

  const timelinePath = path.resolve(timelineArg);
  const outputPath = path.resolve(outputArg);
  const publicDir = path.resolve(publicDirArg);
  const timeline = JSON.parse(fs.readFileSync(timelinePath, 'utf8'));
  const {renderMedia, selectComposition} = loadRemotionRenderer();
  const progress = createPercentProgress();
  let cleanup = () => {};

  const inputProps = await applyRenderVariants(timeline, flags, {
    resolvePhotoPath: (src) => path.join(publicDir, src),
    onExifShortage: (count) => progress.println(`└ ${count} 张照片 EXIF 信息不足,视频中不显示展签`),
  });

  try {
    const bundled = await bundleRenderer(publicDir, {
      onProgress: (value) => progress.update('Bundling code', value),
    });
    cleanup = bundled.cleanup;

    const composition = await selectComposition({
      serveUrl: bundled.serveUrl,
      id: 'Diary',
      inputProps,
      logLevel: 'error',
    });
    const totalFrames = composition.durationInFrames;

    await renderMedia({
      serveUrl: bundled.serveUrl,
      composition,
      inputProps,
      codec: 'h264',
      crf: 16,
      jpegQuality: 100,
      audioCodec: 'aac',
      pixelFormat: 'yuv420p',
      outputLocation: outputPath,
      overwrite: true,
      logLevel: 'error',
      // 接管浏览器控制台输出:不再与进行中的进度行挤在同一行
      onBrowserLog: ({type, text, stackTrace}) => {
        if (type !== 'error' && type !== 'warning') return;
        const at = stackTrace?.[0]?.url
          ? ` (${stackTrace[0].url}:${stackTrace[0].lineNumber ?? '?'})`
          : '';
        progress.println(`[browser ${type}] ${text}${at}`);
      },
      onProgress: ({renderedFrames, encodedFrames}) => {
        if (renderedFrames < totalFrames) {
          progress.update('Rendering frames', renderedFrames / totalFrames);
        } else {
          progress.update('Encoding video', encodedFrames / totalFrames);
        }
      },
    });
    progress.update('Encoding video', 1);
  } finally {
    progress.finish();
    cleanup();
  }
};

const isMain =
  process.argv[1] &&
  fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    if ((process.env.TSUZURI_DEBUG === '1' || process.env.DEBUG === '1') && error instanceof Error && error.stack) console.error(error.stack);
    process.exitCode = 1;
  }
}
