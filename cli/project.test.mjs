import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {scanFolder, scanFolderLoose} from './project.mjs';

const makeFolder = (files) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsuzuri-scan-'));
  for (const name of files) fs.writeFileSync(path.join(dir, name), '');
  return dir;
};

test('scanFolder lists unsupported video files for the caller to warn about', () => {
  const dir = makeFolder(['a.jpg', 'b.png', 'music.mp3', 'clip.mp4', 'IMG_0001.MOV']);
  const result = scanFolder(dir);
  assert.deepEqual(result.videos, ['IMG_0001.MOV', 'clip.mp4']);
  assert.deepEqual(result.photos, ['a.jpg', 'b.png']);
  assert.equal(result.audio, 'music.mp3');
});

test('scanFolder returns an empty videos list when none are present', () => {
  const dir = makeFolder(['a.jpg', 'music.mp3']);
  assert.deepEqual(scanFolder(dir).videos, []);
});

test('missing audio error points to the fetch recovery command', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tsuzuri-scan-'));
  const dir = path.join(root, 'my trip');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'a.jpg'), '');
  try {
    assert.throws(
      () => scanFolder(dir),
      (error) => error.message.includes(`node cli/tsuzuri.mjs fetch "${dir}"`),
    );
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
});

test('scanFolder discovers audio and lyrics in audio/ as relative paths', () => {
  const dir = makeFolder(['photo.jpg']);
  fs.mkdirSync(path.join(dir, 'audio'));
  fs.writeFileSync(path.join(dir, 'audio', 'song.m4a'), 'audio');
  fs.writeFileSync(path.join(dir, 'audio', 'song.lrc'), 'lyrics');
  try {
    assert.deepEqual(scanFolder(dir), {
      photos: ['photo.jpg'],
      audio: 'audio/song.m4a',
      lyrics: 'audio/song.lrc',
      videos: [],
    });
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});

test('root and audio/ files are counted together without a silent priority', () => {
  const dir = makeFolder(['root.mp3', 'root.lrc']);
  fs.mkdirSync(path.join(dir, 'audio'));
  fs.writeFileSync(path.join(dir, 'audio', 'nested.m4a'), 'audio');
  fs.writeFileSync(path.join(dir, 'audio', 'nested.lrc'), 'lyrics');
  try {
    assert.deepEqual(scanFolderLoose(dir).audios, ['audio/nested.m4a', 'root.mp3']);
    assert.throws(() => scanFolder(dir), /audio\/nested\.m4a.*root\.mp3/s);
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});
