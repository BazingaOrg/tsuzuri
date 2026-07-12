#!/usr/bin/env node
/**
 * tsuzuri CLI — 日常入口:`tsuzuri ./folder`
 *
 * 约定优于配置:文件夹内的图片 + 唯一音频是必需输入,可选唯一 LRC;
 * JSON 写入 metadata/,默认视频写入 output/。
 * -o 可覆盖输出路径,其余选项按素材自动决策。
 */

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {CliError, USAGE, parseArgs} from './options.mjs';
import {computeInputHash, copyLegacyJson, ensureProjectDirs, resolveProjectPaths, scanFolder} from './project.mjs';
import {runDoctor} from './doctor.mjs';
import {runLyrics} from './lyrics.mjs';
import {runMenu} from './menu.mjs';
import {runStill} from './still.mjs';
import {term} from './term.mjs';
import {FIXES} from './dependencies.mjs';
import {runCommand} from './run-command.mjs';

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

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
  if (probe.error?.code === 'ENOENT') {
    term.warn('找不到命令 ffmpeg,已跳过响度检查');
    term.detail(FIXES.ffmpeg);
    term.detail('运行 tsuzuri doctor 可一次检查全部依赖');
    return;
  }
  if (probe.error || probe.status !== 0 || !match) {
    term.warn('响度测量失败,保留原始响度');
    return;
  }
  let m;
  try {
    m = JSON.parse(match[0]);
  } catch {
    term.warn('响度测量结果无法解析,保留原始响度');
    return;
  }
  const measured = parseFloat(m.input_i);
  if (Math.abs(measured - TARGET_LUFS) <= 1.0 && parseFloat(m.input_tp) <= -1.0) {
    term.success('响度已符合目标,无需调整');
    term.detail(`${measured.toFixed(1)} LUFS,目标 ${TARGET_LUFS} LUFS`);
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
    term.warn('响度归一失败,保留原始响度');
    return;
  }
  fs.renameSync(tmp, file);
  term.success('响度归一完成');
  term.detail(`${measured.toFixed(1)} → ${TARGET_LUFS} LUFS(真峰值 ≤ ${TARGET_TP}dB)`);
};

const main = async () => {
  let argv = process.argv.slice(2);
  // 裸跑 + 交互终端 → 数字菜单;管道/脚本里仍走 USAGE 报错,不破坏可脚本性
  if (argv.length === 0 && process.stdin.isTTY && process.stdout.isTTY) {
    argv = await runMenu();
  }
  const parsed = parseArgs(argv);
  if (parsed.command === 'help') {
    console.log(USAGE);
    return 0;
  }
  if (parsed.command === 'doctor') return runDoctor();
  if (parsed.command === 'lyrics') return runLyrics(parsed.folder);
  if (parsed.command === 'still') return runStill(parsed);

  const {folder: folderArg, output} = parsed;
  const folder = path.resolve(folderArg);
  if (!fs.existsSync(folder)) throw new CliError(`找不到路径: ${folder}`);
  if (!fs.statSync(folder).isDirectory()) {
    const ext = path.extname(folder).toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
      throw new CliError(`不是文件夹: ${folder}\n└ 要导出单张静态图?用: tsuzuri still ${folderArg}`);
    }
    if (['.mp3', '.m4a', '.wav', '.flac', '.aac', '.ogg'].includes(ext)) {
      throw new CliError(`不是文件夹: ${folder}\n└ 请把音频和照片放进一个文件夹后传入该文件夹`);
    }
    throw new CliError(`不是文件夹: ${folder}`);
  }

  const {photos, audio, lyrics, videos} = scanFolder(folder);
  if (videos.length > 0) {
    term.warn(`发现视频文件,tsuzuri 目前只处理照片,已忽略: ${videos.join(', ')}`);
  }
  const project = resolveProjectPaths(folder, output);
  ensureProjectDirs(project);
  const copied = copyLegacyJson(folder, project.metadataDir);
  if (copied.length > 0) {
    term.warn(`已复制旧版 JSON 到 metadata/: ${copied.join(', ')}(原文件保留)`);
  }

  const hashFiles = [audio, ...photos];
  if (fs.existsSync(path.join(folder, 'tsuzuri.toml'))) hashFiles.push('tsuzuri.toml');
  if (lyrics) hashFiles.push(lyrics);
  const hash = computeInputHash(folder, hashFiles);

  const timelinePath = project.timelinePath;
  let skipAnalyze = false;
  if (fs.existsSync(timelinePath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(timelinePath, 'utf8'));
      if (existing?.meta?.input_hash === hash) {
        skipAnalyze = true;
        term.detail('输入未变,跳过音频分析');
      } else {
        term.detail(existing?.meta?.input_hash ? '素材有变化,重新分析规划' : 'timeline.json 缺少 input_hash,重新分析规划');
      }
    } catch {
      term.detail('timeline.json 无法解析,重新分析规划');
    }
  }

  const analyzer = path.join(REPO, 'analyzer');
  if (!skipAnalyze) {
    term.start('分析音频');
    const analyzeArgs = [
      'run', '--project', analyzer, 'tsuzuri-analyze', path.join(folder, audio),
      '-o', project.beatsPath,
      '--lyrics-output', project.lyricsPath,
    ];
    if (lyrics) analyzeArgs.push('--lyrics-file', path.join(folder, lyrics));
    const code = runCommand('分析音频', 'uv', analyzeArgs);
    if (code !== 0) return code;
    term.success('音频分析完成');
  }

  // 规划步骤总是运行,即便素材未变:是否需要用最新算法刷新 timeline.json
  // 交给 plan.py 自己判断——它靠内容校验和识别文件是否被手动改过,手改过就
  // 原样保留,没被动过就悄悄升级到最新分配算法(见 plan.py _content_checksum)
  term.start('规划照片时间线');
  const planCode = runCommand('规划照片时间线', 'uv', [
    'run', '--project', analyzer, 'tsuzuri-plan', folder,
    '--beats', project.beatsPath,
    '--lyrics', project.lyricsPath,
    '--input-hash', hash,
    '-o', project.timelinePath,
  ]);
  if (planCode !== 0) return planCode;
  term.success('照片时间线规划完成');

  const tl = JSON.parse(fs.readFileSync(timelinePath, 'utf8'));
  const n = tl.photos.length;
  term.info('渲染计划');
  term.detail(
    `照片: ${n} 张,人均 ${(tl.meta.duration / n).toFixed(1)}s\n` +
      `音频: ${tl.meta.audio.replace(/^\.\//, '')},${Math.round(tl.meta.duration)}s\n` +
      `歌词: ${tl.subtitles.length > 0 ? `${tl.subtitles.length} 行` : '无(纯音乐或未识别)'}`,
  );

  const outPath = project.outputPath;
  const rendererPackage = path.join(REPO, 'renderer', 'node_modules', '@remotion', 'renderer');
  if (!fs.existsSync(rendererPackage)) throw new CliError('渲染器依赖未安装,先执行: cd renderer && npm install');

  term.start('渲染视频');
  const renderCode = runCommand('渲染视频', process.execPath, [
    path.join(REPO, 'cli', 'render.mjs'),
    timelinePath,
    outPath,
    folder,
  ]);
  if (renderCode !== 0) return renderCode;
  term.success('视频渲染完成');

  term.start('检查成片响度');
  normalizeLoudness(outPath);
  term.success(`完成 → ${outPath}`);
  return 0;
};

const isMain = process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    process.exitCode = await main();
  } catch (error) {
    term.error(`tsuzuri: ${error instanceof Error ? error.message : String(error)}`);
    if ((process.env.TSUZURI_DEBUG === '1' || process.env.DEBUG === '1') && error instanceof Error && error.stack) {
      term.detail(error.stack);
    }
    process.exitCode = 1;
  }
}
