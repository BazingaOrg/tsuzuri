/**
 * tsuzuri still — 纯 Node 管道:扫描照片 → 可选 EXIF → renderStill PNG。
 * 不碰 analyzer / uv。
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {extractFormattedExif} from './exif.mjs';
import {CliError} from './options.mjs';
import {bundleRenderer, loadRemotionRenderer, RENDERER} from './bundle.mjs';
import {createPercentProgress} from './progress.mjs';
import {term} from './term.mjs';

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const DEFAULT_CANVAS = {
  width: 1920,
  height: 1080,
  background: '#FFFFFF',
  photo_scale: 0.8,
};

/**
 * 极简 flat toml 读取(tsuzuri.toml 仅一层 key = value)。
 * 只取 still 需要的画布字段;解析失败时回退默认并警告。
 */
export const loadStillCanvasConfig = (folder) => {
  const cfg = {...DEFAULT_CANVAS};
  const tomlPath = path.join(folder, 'tsuzuri.toml');
  if (!fs.existsSync(tomlPath)) return cfg;
  try {
    const text = fs.readFileSync(tomlPath, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const m = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
      if (!m) continue;
      const key = m[1];
      let raw = m[2].trim();
      if (raw.startsWith('#') || raw.includes(' #')) {
        raw = raw.replace(/\s+#.*$/, '').trim();
      }
      if (key === 'width' || key === 'height') {
        const n = Number(raw);
        if (Number.isFinite(n) && n > 0) cfg[key] = Math.round(n);
      } else if (key === 'photo_scale') {
        const n = Number(raw);
        if (Number.isFinite(n) && n > 0 && n <= 1) cfg.photo_scale = n;
      } else if (key === 'background') {
        const s = raw.replace(/^["']|["']$/g, '');
        if (s) cfg.background = s;
      }
    }
  } catch {
    term.warn('tsuzuri.toml 无法解析,still 使用默认画布');
  }
  return cfg;
};

const listPhotosInFolder = (folder) => {
  const entries = fs.readdirSync(folder).filter((f) => !f.startsWith('.'));
  return entries
    .filter((f) => IMAGE_EXTS.has(path.extname(f).toLowerCase()))
    .sort()
    .map((f) => path.join(folder, f));
};

const resolveJobs = (target, output) => {
  const resolved = path.resolve(target);
  if (!fs.existsSync(resolved)) {
    throw new CliError(`找不到路径: ${resolved}`);
  }
  const stat = fs.statSync(resolved);

  if (stat.isFile()) {
    const ext = path.extname(resolved).toLowerCase();
    if (!IMAGE_EXTS.has(ext)) {
      throw new CliError(`不是支持的图片格式: ${resolved}(支持 ${[...IMAGE_EXTS].join(' ')})`);
    }
    const publicDir = path.dirname(resolved);
    const base = path.basename(resolved, path.extname(resolved));
    let outPath;
    if (output) {
      const outResolved = path.resolve(output);
      if (outResolved.endsWith(path.sep) || (fs.existsSync(outResolved) && fs.statSync(outResolved).isDirectory())) {
        outPath = path.join(outResolved, `${base}.png`);
      } else if (path.extname(outResolved).toLowerCase() === '.png' || path.extname(outResolved) === '') {
        outPath = path.extname(outResolved) ? outResolved : `${outResolved}.png`;
      } else {
        outPath = outResolved.endsWith('.png') ? outResolved : `${outResolved}.png`;
      }
    } else {
      outPath = path.join(publicDir, 'output', 'stills', `${base}.png`);
    }
    return {
      publicDir,
      canvasFolder: publicDir,
      jobs: [{src: path.basename(resolved), absPath: resolved, outPath}],
    };
  }

  if (stat.isDirectory()) {
    const photos = listPhotosInFolder(resolved);
    if (photos.length === 0) {
      throw new CliError(`文件夹里没有图片: ${resolved}`);
    }
    const outDir = output
      ? path.resolve(output)
      : path.join(resolved, 'output', 'stills');
    return {
      publicDir: resolved,
      canvasFolder: resolved,
      jobs: photos.map((absPath) => {
        const base = path.basename(absPath, path.extname(absPath));
        return {
          src: path.basename(absPath),
          absPath,
          outPath: path.join(outDir, `${base}.png`),
        };
      }),
    };
  }

  throw new CliError(`不是文件或文件夹: ${resolved}`);
};

/**
 * @param {{target: string, output: string | null, exif: boolean, scale: number}} opts
 */
export const runStill = async (opts) => {
  const rendererPackage = path.join(RENDERER, 'node_modules', '@remotion', 'renderer');
  if (!fs.existsSync(rendererPackage)) {
    throw new CliError('渲染器依赖未安装,先执行: cd renderer && npm install');
  }

  const {publicDir, canvasFolder, jobs} = resolveJobs(opts.target, opts.output);
  const canvas = loadStillCanvasConfig(canvasFolder);
  const {renderStill, selectComposition} = loadRemotionRenderer();
  const progress = createPercentProgress();
  let cleanup = () => {};

  term.start(`导出 still(${jobs.length} 张, scale=${opts.scale}${opts.exif ? ', EXIF' : ''})`);

  try {
    const bundled = await bundleRenderer(publicDir, {
      onProgress: (value) => progress.update('Bundling code', value),
    });
    cleanup = bundled.cleanup;

    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      let exifProps;
      if (opts.exif) {
        exifProps = await extractFormattedExif(job.absPath);
        if (!exifProps) {
          term.warn(`${path.basename(job.absPath)}: 无可用 EXIF,回退到无信息面板布局`);
        }
      }

      const inputProps = {
        src: job.src,
        background: canvas.background,
        photoScale: canvas.photo_scale,
        width: canvas.width,
        height: canvas.height,
        ...(exifProps ? {exif: exifProps} : {}),
      };

      const composition = await selectComposition({
        serveUrl: bundled.serveUrl,
        id: 'Still',
        inputProps,
        logLevel: 'error',
      });

      fs.mkdirSync(path.dirname(job.outPath), {recursive: true});

      await renderStill({
        serveUrl: bundled.serveUrl,
        composition,
        inputProps,
        output: job.outPath,
        imageFormat: 'png',
        scale: opts.scale,
        overwrite: true,
        logLevel: 'error',
        onBrowserLog: ({type, text}) => {
          if (type === 'error' || type === 'warning') {
            progress.println(`[browser ${type}] ${text}`);
          }
        },
      });

      const label =
        jobs.length === 1
          ? 'Rendering still'
          : `Rendering still ${i + 1}/${jobs.length}`;
      progress.update(label, (i + 1) / jobs.length);
      term.detail(`→ ${job.outPath}`);
    }
    progress.update('Rendering still', 1);
  } finally {
    progress.finish();
    cleanup();
  }

  term.success(`still 完成 → ${jobs.length === 1 ? jobs[0].outPath : path.dirname(jobs[0].outPath)}`);
  return 0;
};

const isMain =
  process.argv[1] &&
  fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
if (isMain) {
  // 便于单独调试:node cli/still.mjs <target> ...
  const {parseArgs} = await import('./options.mjs');
  try {
    const parsed = parseArgs(['still', ...process.argv.slice(2)]);
    process.exitCode = await runStill(parsed);
  } catch (error) {
    term.error(`tsuzuri still: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
