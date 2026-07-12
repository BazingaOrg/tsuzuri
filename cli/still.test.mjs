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

test('single-file non-PNG output extension is rejected', () => {
  const dir = fixture();
  const photo = path.join(dir, 'IMG.jpg');
  fs.writeFileSync(photo, 'x');
  assert.throws(() => resolveJobs(photo, path.join(dir, 'out.jpg')), CliError);
});

test('same-stem batch sources retain their source extension', () => {
  const dir = fixture();
  fs.writeFileSync(path.join(dir, 'a.jpg'), 'x');
  fs.writeFileSync(path.join(dir, 'a.webp'), 'x');
  const names = resolveJobs(dir, null, false).jobs.map((job) => path.basename(job.outPath));
  assert.deepEqual(names, ['a-jpg.png', 'a-webp.png']);
});
