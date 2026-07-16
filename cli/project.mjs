import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {CliError} from './options.mjs';
import {formatEquivalentCommand} from './menu.mjs';

const LEGACY_JSON = ['beats.json', 'lyrics.json', 'timeline.json'];
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const AUDIO_EXTS = new Set(['.mp3', '.m4a', '.wav', '.flac', '.aac', '.ogg']);
const LYRIC_EXTS = new Set(['.lrc']);
// 视频素材暂不支持;单列出来让调用方显式提醒,而不是静默忽略
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v']);
export const AUDIO_DIR = 'audio';

const listFiles = (folder) =>
  fs.readdirSync(folder, {withFileTypes: true})
    .filter((entry) => !entry.name.startsWith('.') && (entry.isFile() || entry.isSymbolicLink()))
    .map((entry) => entry.name);

/**
 * 宽松扫描:只按扩展名分类,不校验数量。fetch 用它判断文件夹缺什么、有什么
 * 可覆盖;严格校验仍由 scanFolder 负责。
 */
export const scanFolderLoose = (folder) => {
  const entries = listFiles(folder);
  const audioFolder = path.join(folder, AUDIO_DIR);
  const nestedEntries = fs.existsSync(audioFolder) && fs.statSync(audioFolder).isDirectory()
    ? listFiles(audioFolder).map((name) => path.posix.join(AUDIO_DIR, name))
    : [];
  const byExt = (files, exts) => files.filter((f) => exts.has(path.extname(f).toLowerCase())).sort();
  return {
    photos: byExt(entries, IMAGE_EXTS),
    audios: byExt([...entries, ...nestedEntries], AUDIO_EXTS),
    lyrics: byExt([...entries, ...nestedEntries], LYRIC_EXTS),
    videos: byExt(entries, VIDEO_EXTS),
  };
};

/**
 * Scan a folder for the photo/audio/lyrics inputs tsuzuri needs.
 * `requirePhotos: false` lets commands that don't render a video (e.g. `lyrics`)
 * reuse the same audio/lrc discovery rules without requiring photos to be present.
 * `videos` lists unsupported video files so callers can warn about them.
 */
export const scanFolder = (folder, {requirePhotos = true} = {}) => {
  const {photos, audios, lyrics, videos} = scanFolderLoose(folder);
  if (audios.length > 1) throw new CliError(`文件夹里有多个音频,只能有一个:\n${audios.join('\n')}`);
  if (audios.length === 0) {
    throw new CliError(
      `没有找到音频文件。目录约定:照片 + 唯一的音频文件(${[...AUDIO_EXTS].join(' ')})` +
      `\n└ 可运行 ${formatEquivalentCommand(['fetch', folder])} 补齐`,
    );
  }
  if (requirePhotos && photos.length === 0) {
    throw new CliError(`没有找到图片。目录约定:照片(${[...IMAGE_EXTS].join(' ')})+ 唯一的音频文件`);
  }
  if (lyrics.length > 1) {
    throw new CliError(`文件夹里有多个 LRC 歌词,只能有一个:\n${lyrics.join('\n')}`);
  }
  return {photos, audio: audios[0], lyrics: lyrics[0] ?? null, videos};
};

/**
 * `outputSuffix`(如 `-exif-sign-dark`)只在 `output` 未显式指定时追加到默认
 * 文件名,避免变体覆盖普通版;`-o` 显式指定时用户说了算,不加后缀。
 */
export const resolveProjectPaths = (folder, output = null, outputSuffix = '') => {
  const metadataDir = path.join(folder, 'metadata');
  const defaultOutputDir = path.join(folder, 'output');
  return {
    metadataDir,
    beatsPath: path.join(metadataDir, 'beats.json'),
    lyricsPath: path.join(metadataDir, 'lyrics.json'),
    timelinePath: path.join(metadataDir, 'timeline.json'),
    outputPath: path.resolve(
      output ?? path.join(defaultOutputDir, `${path.basename(folder)}${outputSuffix}.mp4`),
    ),
  };
};

export const ensureProjectDirs = ({metadataDir, outputPath}) => {
  fs.mkdirSync(metadataDir, {recursive: true});
  fs.mkdirSync(path.dirname(outputPath), {recursive: true});
};

/** Copy legacy root-level JSON once. Originals stay untouched for a safe rollback. */
export const copyLegacyJson = (folder, metadataDir) => {
  const copied = [];
  for (const name of LEGACY_JSON) {
    const source = path.join(folder, name);
    const destination = path.join(metadataDir, name);
    if (fs.existsSync(source) && !fs.existsSync(destination)) {
      fs.copyFileSync(source, destination);
      copied.push(name);
    }
  }
  return copied;
};

export const computeInputHash = (folder, files) => {
  const hash = createHash('sha256');
  for (const file of [...files].sort()) {
    hash.update(file + '\0');
    hash.update(fs.readFileSync(path.join(folder, file)));
  }
  return hash.digest('hex').slice(0, 16);
};

const trimKeyPattern = /^\s*(?:trim|"trim"|'trim')\s*=/;

export const hasExplicitTrimConfig = (folder) => {
  const tomlPath = path.join(folder, 'tsuzuri.toml');
  if (!fs.existsSync(tomlPath)) return false;
  return fs.readFileSync(tomlPath, 'utf8').split(/\r?\n/).some((line) => trimKeyPattern.test(line));
};

const trailingTomlComment = (line) => {
  let quote = null;
  let escaped = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote === '"' && char === '\\') {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '#') return line.slice(i);
  }
  return '';
};

/** 文本级写回 trim，避免 TOML 序列化丢掉用户的顺序、空行和注释。 */
export const writeTrimConfig = (folder, value) => {
  if (!['auto', 'full'].includes(value)) throw new TypeError(`不支持的 trim 配置: ${value}`);
  const tomlPath = path.join(folder, 'tsuzuri.toml');
  const source = fs.existsSync(tomlPath) ? fs.readFileSync(tomlPath, 'utf8') : '';
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const lines = source.split(/\r?\n/);
  const index = lines.findIndex((line) => trimKeyPattern.test(line));
  const configLine = `trim = "${value}"`;

  if (index >= 0) {
    const indent = lines[index].match(/^\s*/)?.[0] ?? '';
    const comment = trailingTomlComment(lines[index]);
    lines[index] = `${indent}${configLine}${comment ? ` ${comment}` : ''}`;
    fs.writeFileSync(tomlPath, lines.join(newline), 'utf8');
    return;
  }

  const prefix = source.length === 0 || source.endsWith('\n') ? source : `${source}${newline}`;
  fs.writeFileSync(tomlPath, `${prefix}${configLine}${newline}`, 'utf8');
};
