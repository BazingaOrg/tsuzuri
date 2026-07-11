#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

import {createPercentProgress} from './progress.mjs';

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const RENDERER = path.join(REPO, 'renderer');
const requireRenderer = createRequire(path.join(RENDERER, 'package.json'));

const main = async () => {
  const [timelineArg, outputArg, publicDirArg] = process.argv.slice(2);
  if (!timelineArg || !outputArg || !publicDirArg) {
    throw new Error('用法: render.mjs <timeline.json> <output.mp4> <public-dir>');
  }

  const timelinePath = path.resolve(timelineArg);
  const outputPath = path.resolve(outputArg);
  const publicDir = path.resolve(publicDirArg);
  const inputProps = JSON.parse(fs.readFileSync(timelinePath, 'utf8'));
  const {bundle} = requireRenderer('@remotion/bundler');
  const {renderMedia, selectComposition} = requireRenderer('@remotion/renderer');
  const progress = createPercentProgress();
  let bundleDir = null;

  try {
    const serveUrl = await bundle({
      entryPoint: path.join(RENDERER, 'src/index.ts'),
      publicDir,
      rootDir: RENDERER,
      symlinkPublicDir: true,
      onDirectoryCreated: (directory) => {
        bundleDir = directory;
      },
      onProgress: (value) => progress.update('Bundling code', value),
      webpackOverride: (config) => ({
        ...config,
        module: {
          ...config.module,
          rules: [
            ...(config.module?.rules ?? []),
            {test: /\.(ttf|otf|woff2?)$/, type: 'asset/resource'},
          ],
        },
      }),
    });

    const composition = await selectComposition({
      serveUrl,
      id: 'Diary',
      inputProps,
      logLevel: 'error',
    });
    const totalFrames = composition.durationInFrames;

    await renderMedia({
      serveUrl,
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
    if (bundleDir) fs.rmSync(bundleDir, {recursive: true, force: true});
  }
};

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
