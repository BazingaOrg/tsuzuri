import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {scanFolderLoose} from './project.mjs';

export const SEARCH_LIMIT = 5;

/** 解析 yt-dlp --print "%(id)s\t%(title)s\t%(duration_string)s\t%(channel,uploader)s" 的一行。 */
export const parseSearchLine = (line) => {
  const parts = String(line ?? '').split('\t');
  if (parts.length < 2 || !parts[0].trim()) return null;
  const clean = (s) => (s && s !== 'NA' ? s.trim() : null);
  return {
    id: parts[0].trim(),
    title: clean(parts[1]) ?? '(无标题)',
    duration: clean(parts[2]) ?? '?:??',
    uploader: clean(parts[3]) ?? '未知频道',
  };
};

export const checkYtDlp = (spawn = spawnSync) => {
  const r = spawn('yt-dlp', ['--version'], {encoding: 'utf8'});
  if (r.error || r.status !== 0) return {ok: false};
  return {ok: true, version: (r.stdout ?? '').trim()};
};

export const searchYtDlp = (query) => {
  const r = spawnSync(
    'yt-dlp',
    [
      `ytsearch${SEARCH_LIMIT}:${query}`,
      '--flat-playlist',
      '--print', '%(id)s\t%(title)s\t%(duration_string)s\t%(channel,uploader)s',
    ],
    {encoding: 'utf8'},
  );
  if (r.error || r.status !== 0) {
    return {ok: false, stderr: (r.stderr ?? '').trim()};
  }
  const candidates = (r.stdout ?? '').split('\n').map(parseSearchLine).filter(Boolean);
  return {ok: true, candidates};
};

/**
 * 始终下载到素材目录外的临时目录。这既能强制同 URL 重新下载,
 * 也保证 yt-dlp/转码失败时不会碰到已有素材。
 */
export const downloadWithYtDlp = (
  url,
  {spawn = spawnSync, tempParent = os.tmpdir(), stdio = 'inherit'} = {},
) => {
  const tempDir = fs.mkdtempSync(path.join(tempParent, 'tsuzuri-fetch-'));
  const r = spawn(
    'yt-dlp',
    ['-x', '--audio-format', 'm4a', '--no-playlist', '-o', path.join(tempDir, '%(title)s.%(ext)s'), url],
    {stdio},
  );
  if (r.error || r.status !== 0) {
    fs.rmSync(tempDir, {recursive: true, force: true});
    return {ok: false};
  }
  const audios = scanFolderLoose(tempDir).audios;
  if (audios.length !== 1) {
    fs.rmSync(tempDir, {recursive: true, force: true});
    return {ok: false};
  }
  return {
    ok: true,
    tempDir,
    audio: audios[0],
    source: path.join(tempDir, audios[0]),
  };
};
