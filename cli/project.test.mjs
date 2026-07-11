import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {scanFolder} from './project.mjs';

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
