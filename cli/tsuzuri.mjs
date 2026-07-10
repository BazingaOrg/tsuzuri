#!/usr/bin/env node
/**
 * tsuzuri CLI — 唯一的日常命令:`tsuzuri ./folder`
 *
 * 约定优于配置:文件夹内的图片 + 唯一音频即全部输入;
 * 输出 <folder名>.mp4 与副产物 timeline.json 落在同一文件夹。
 * 仅保留 -o(改输出路径)。其余全部自动决策,见 docs/tsuzuri-implementation-plan.md 第六节。
 */

import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const AUDIO_EXTS = new Set(['.mp3', '.m4a', '.wav', '.flac', '.aac', '.ogg']);

const TTY = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, s) => (TTY ? `\x1b[${code}m${s}\x1b[0m` : s);
const dim = (s) => c('2', s);
const cyan = (s) => c('36', s);
const green = (s) => c('1;32', s);
const yellow = (s) => c('33', s);
const red = (s) => c('1;31', s);

const die = (msg) => {
  console.error(red(`tsuzuri: ${msg}`));
  process.exit(1);
};

const parseArgs = (argv) => {
  const args = {folder: null, output: null};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '-o' || argv[i] === '--output') args.output = argv[++i];
    else if (!args.folder) args.folder = argv[i];
    else die(`未知参数: ${argv[i]}(用法: tsuzuri <folder> [-o out.mp4])`);
  }
  if (!args.folder) die('用法: tsuzuri <folder> [-o out.mp4]\n目录约定:文件夹内放照片(jpg/png/webp)+ 唯一的音频文件(mp3 等)');
  return args;
};

const scanFolder = (folder) => {
  const entries = fs.readdirSync(folder).filter((f) => !f.startsWith('.'));
  const photos = entries.filter((f) => IMAGE_EXTS.has(path.extname(f).toLowerCase())).sort();
  const audios = entries.filter((f) => AUDIO_EXTS.has(path.extname(f).toLowerCase()));
  if (audios.length > 1) die(`文件夹里有多个音频,只能有一个:\n  ${audios.join('\n  ')}`);
  if (audios.length === 0) die(`没有找到音频文件。目录约定:照片 + 唯一的音频文件(${[...AUDIO_EXTS].join(' ')})`);
  if (photos.length === 0) die(`没有找到图片。目录约定:照片(${[...IMAGE_EXTS].join(' ')})+ 唯一的音频文件`);
  return {photos, audio: audios[0]};
};

// 输入 hash:音频 + 全部照片 + tsuzuri.toml 的内容摘要,
// 用于区分"用户手改了 timeline"(跳过分析直接渲染)和"素材变了"(重新规划)
const inputHash = (folder, files) => {
  const h = createHash('sha256');
  for (const f of [...files].sort()) {
    h.update(f + '\0');
    h.update(fs.readFileSync(path.join(folder, f)));
  }
  return h.digest('hex').slice(0, 16);
};

const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, {stdio: 'inherit', ...opts});
  if (r.error) die(`无法执行 ${cmd}: ${r.error.message}`);
  if (r.status !== 0) process.exit(r.status ?? 1);
};

// ---- 响度归一:成片统一到流媒体参考响度,线性增益保留音乐动态 ----
const TARGET_LUFS = -14;
const TARGET_TP = -1.5;

const ffmpegQuiet = (args) => spawnSync('ffmpeg', ['-hide_banner', '-nostats', ...args], {encoding: 'utf8'});

const normalizeLoudness = (file) => {
  const probe = ffmpegQuiet([
    '-i', file, '-map', 'a:0',
    '-af', `loudnorm=I=${TARGET_LUFS}:TP=${TARGET_TP}:LRA=11:print_format=json`,
    '-f', 'null', '-',
  ]);
  const match = probe.stderr?.match(/\{[\s\S]*?\}/);
  if (probe.error || !match) {
    console.log(yellow('loudness: 测量失败,保留原始响度'));
    return;
  }
  const m = JSON.parse(match[0]);
  const measured = parseFloat(m.input_i);
  if (Math.abs(measured - TARGET_LUFS) <= 1.0 && parseFloat(m.input_tp) <= -1.0) {
    console.log(dim(`loudness: ${measured.toFixed(1)} LUFS,已接近 ${TARGET_LUFS},跳过归一`));
    return;
  }
  const tmp = `${file}.loudnorm.mp4`;
  const af =
    `loudnorm=I=${TARGET_LUFS}:TP=${TARGET_TP}:LRA=11:linear=true` +
    `:measured_I=${m.input_i}:measured_TP=${m.input_tp}` +
    `:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}` +
    `:offset=${m.target_offset}`;
  const enc = ffmpegQuiet(['-y', '-i', file, '-c:v', 'copy', '-af', af, '-c:a', 'aac', '-b:a', '256k', tmp]);
  if (enc.error || enc.status !== 0 || !fs.existsSync(tmp)) {
    fs.rmSync(tmp, {force: true});
    console.log(yellow('loudness: 归一失败,保留原始响度'));
    return;
  }
  fs.renameSync(tmp, file);
  console.log(dim(`loudness: ${measured.toFixed(1)} → ${TARGET_LUFS} LUFS(真峰值 ≤ ${TARGET_TP}dB)`));
};

const main = () => {
  const {folder: folderArg, output} = parseArgs(process.argv.slice(2));
  const folder = path.resolve(folderArg);
  if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) die(`不是文件夹: ${folder}`);

  const {photos, audio} = scanFolder(folder);
  const hashFiles = [audio, ...photos];
  if (fs.existsSync(path.join(folder, 'tsuzuri.toml'))) hashFiles.push('tsuzuri.toml');
  const hash = inputHash(folder, hashFiles);

  const timelinePath = path.join(folder, 'timeline.json');
  let skipPlan = false;
  if (fs.existsSync(timelinePath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(timelinePath, 'utf8'));
      if (existing?.meta?.input_hash === hash) {
        skipPlan = true;
        console.log(yellow('输入未变 → 跳过分析,直接渲染现有 timeline.json(手改生效)'));
      } else {
        console.log(dim(existing?.meta?.input_hash ? '素材有变化 → 重新分析规划' : 'timeline.json 缺少 input_hash → 重新分析规划'));
      }
    } catch {
      console.log(dim('timeline.json 无法解析 → 重新分析规划'));
    }
  }

  if (!skipPlan) {
    const analyzer = path.join(REPO, 'analyzer');
    run('uv', ['run', '--project', analyzer, 'tsuzuri-analyze', path.join(folder, audio)]);
    run('uv', ['run', '--project', analyzer, 'tsuzuri-plan', folder, '--input-hash', hash]);
  }

  // 渲染前打印计划摘要(不询问确认,直接开始)
  const tl = JSON.parse(fs.readFileSync(timelinePath, 'utf8'));
  const n = tl.photos.length;
  console.log(`${cyan('photos')} : ${n} 张,人均 ${(tl.meta.duration / n).toFixed(1)}s`);
  console.log(`${cyan('audio ')} : ${tl.meta.audio.replace(/^\.\//, '')},${Math.round(tl.meta.duration)}s`);
  console.log(`${cyan('lyrics')} : ${tl.subtitles.length > 0 ? `${tl.subtitles.length} 行` : '无(纯音乐或未识别)'}`);

  const outPath = path.resolve(output ?? path.join(folder, `${path.basename(folder)}.mp4`));
  run('npx', ['remotion', 'render', 'Diary', outPath, `--props=${timelinePath}`, `--public-dir=${folder}`], {
    cwd: path.join(REPO, 'renderer'),
  });
  normalizeLoudness(outPath);
  console.log(green(`✓ 完成 -> ${outPath}`));
};

main();
