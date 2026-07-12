#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import {bundleRenderer, loadRemotionRenderer} from './bundle.mjs';
import {createPercentProgress} from './progress.mjs';

const main = async () => {
  const [timelineArg, outputArg, publicDirArg] = process.argv.slice(2);
  if (!timelineArg || !outputArg || !publicDirArg) {
    throw new Error('用法: render.mjs <timeline.json> <output.mp4> <public-dir>');
  }

  const timelinePath = path.resolve(timelineArg);
  const outputPath = path.resolve(outputArg);
  const publicDir = path.resolve(publicDirArg);
  const inputProps = JSON.parse(fs.readFileSync(timelinePath, 'utf8'));
  const {renderMedia, selectComposition} = loadRemotionRenderer();
  const progress = createPercentProgress();
  let cleanup = () => {};

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

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
