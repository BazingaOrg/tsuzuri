import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {CliError} from './options.mjs';

const LEGACY_JSON = ['beats.json', 'lyrics.json', 'timeline.json'];
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const AUDIO_EXTS = new Set(['.mp3', '.m4a', '.wav', '.flac', '.aac', '.ogg']);
const LYRIC_EXTS = new Set(['.lrc']);
// 视频素材暂不支持;单列出来让调用方显式提醒,而不是静默忽略
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v']);

/**
 * 宽松扫描:只按扩展名分类,不校验数量。fetch 用它判断文件夹缺什么、有什么
 * 可覆盖;严格校验仍由 scanFolder 负责。
 */
export const scanFolderLoose = (folder) => {
  const entries = fs.readdirSync(folder).filter((f) => !f.startsWith('.'));
  const byExt = (exts) => entries.filter((f) => exts.has(path.extname(f).toLowerCase())).sort();
  return {
    photos: byExt(IMAGE_EXTS),
    audios: byExt(AUDIO_EXTS),
    lyrics: byExt(LYRIC_EXTS),
    videos: byExt(VIDEO_EXTS),
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
    throw new CliError(`没有找到音频文件。目录约定:照片 + 唯一的音频文件(${[...AUDIO_EXTS].join(' ')})`);
  }
  if (requirePhotos && photos.length === 0) {
    throw new CliError(`没有找到图片。目录约定:照片(${[...IMAGE_EXTS].join(' ')})+ 唯一的音频文件`);
  }
  if (lyrics.length > 1) {
    throw new CliError(`文件夹里有多个 LRC 歌词,只能有一个:\n${lyrics.join('\n')}`);
  }
  return {photos, audio: audios[0], lyrics: lyrics[0] ?? null, videos};
};

export const resolveProjectPaths = (folder, output = null) => {
  const metadataDir = path.join(folder, 'metadata');
  const defaultOutputDir = path.join(folder, 'output');
  return {
    metadataDir,
    beatsPath: path.join(metadataDir, 'beats.json'),
    lyricsPath: path.join(metadataDir, 'lyrics.json'),
    timelinePath: path.join(metadataDir, 'timeline.json'),
    outputPath: path.resolve(output ?? path.join(defaultOutputDir, `${path.basename(folder)}.mp4`)),
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
