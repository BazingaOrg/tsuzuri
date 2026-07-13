import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {CliError} from './options.mjs';
import {resolveJobs} from './still.mjs';

const fixture = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tsuzuri-still-'));

test('default and EXIF variants use separate output names', () => {
  const dir = fixture();
  const photo = path.join(dir, 'IMG.jpg');
  fs.writeFileSync(photo, 'x');
  assert.equal(path.basename(resolveJobs(photo, null, false).jobs[0].outPath), 'IMG.png');
  assert.equal(path.basename(resolveJobs(photo, null, true).jobs[0].outPath), 'IMG-exif.png');
  assert.equal(path.basename(resolveJobs(photo, null, false, true).jobs[0].outPath), 'IMG-sign.png');
  assert.equal(path.basename(resolveJobs(photo, null, true, true).jobs[0].outPath), 'IMG-exif-sign.png');
});

test('dark variants append a final suffix for every EXIF/sign combination', () => {
  const dir = fixture();
  const photo = path.join(dir, 'IMG.jpg');
  fs.writeFileSync(photo, 'x');
  assert.equal(path.basename(resolveJobs(photo, null, false, false, true).jobs[0].outPath), 'IMG-dark.png');
  assert.equal(path.basename(resolveJobs(photo, null, true, false, true).jobs[0].outPath), 'IMG-exif-dark.png');
  assert.equal(path.basename(resolveJobs(photo, null, false, true, true).jobs[0].outPath), 'IMG-sign-dark.png');
  assert.equal(path.basename(resolveJobs(photo, null, true, true, true).jobs[0].outPath), 'IMG-exif-sign-dark.png');
});

test('single-file non-PNG output extension is rejected', () => {
  const dir = fixture();
  const photo = path.join(dir, 'IMG.jpg');
  fs.writeFileSync(photo, 'x');
  assert.throws(() => resolveJobs(photo, path.join(dir, 'out.jpg')), CliError);
});

test('a trailing separator on -o marks directory intent even before the directory exists', () => {
  const dir = fixture();
  const photo = path.join(dir, 'IMG.jpg');
  fs.writeFileSync(photo, 'x');
  // `\` 结尾只在 win32 视为分隔符(POSIX 上是合法文件名字符),此处只验证 `/`
  const job = resolveJobs(photo, `${path.join(dir, 'cards')}/`, true).jobs[0];
  assert.equal(path.basename(path.dirname(job.outPath)), 'cards');
  assert.equal(path.basename(job.outPath), 'IMG-exif.png');
});

test('same-stem batch sources retain their source extension', () => {
  const dir = fixture();
  fs.writeFileSync(path.join(dir, 'a.jpg'), 'x');
  fs.writeFileSync(path.join(dir, 'a.webp'), 'x');
  const names = resolveJobs(dir, null, false).jobs.map((job) => path.basename(job.outPath));
  assert.deepEqual(names, ['a-jpg.png', 'a-webp.png']);
});
