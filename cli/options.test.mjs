import assert from 'node:assert/strict';
import test from 'node:test';

import {CliError, parseArgs} from './options.mjs';

test('bare folder argument routes to the render command', () => {
  assert.deepEqual(parseArgs(['album']), {command: 'render', folder: 'album', output: null});
  assert.deepEqual(parseArgs(['album', '-o', 'out.mp4']), {
    command: 'render',
    folder: 'album',
    output: 'out.mp4',
  });
});

test('a leading `doctor` token routes to the doctor command', () => {
  assert.deepEqual(parseArgs(['doctor']), {command: 'doctor'});
});

test('extra arguments after doctor are a usage error', () => {
  assert.throws(() => parseArgs(['doctor', 'extra']), CliError);
  assert.throws(() => parseArgs(['doctor', 'extra']), /doctor 不接受额外参数/);
});

test('a leading `lyrics` token routes to the lyrics command', () => {
  assert.deepEqual(parseArgs(['lyrics', 'album']), {command: 'lyrics', folder: 'album'});
});

test('lyrics without a folder is a usage error', () => {
  assert.throws(() => parseArgs(['lyrics']), CliError);
  assert.throws(() => parseArgs(['lyrics']), /用法: tsuzuri lyrics <folder>/);
});

test('lyrics does not accept -o', () => {
  assert.throws(() => parseArgs(['lyrics', 'album', '-o', 'out.mp4']), CliError);
  assert.throws(() => parseArgs(['lyrics', 'album', '-o', 'out.mp4']), /不支持 -o/);
});

test('a leading `help` token (or -h / --help) routes to the help command', () => {
  assert.deepEqual(parseArgs(['help']), {command: 'help'});
  assert.deepEqual(parseArgs(['-h']), {command: 'help'});
  assert.deepEqual(parseArgs(['--help']), {command: 'help'});
});

test('a path-qualified folder named doctor/lyrics/help is the escape hatch, not a verb', () => {
  assert.deepEqual(parseArgs(['./lyrics']), {command: 'render', folder: './lyrics', output: null});
  assert.deepEqual(parseArgs(['./doctor']), {command: 'render', folder: './doctor', output: null});
  assert.deepEqual(parseArgs(['./help']), {command: 'render', folder: './help', output: null});
  assert.deepEqual(parseArgs(['/abs/path/lyrics']), {
    command: 'render',
    folder: '/abs/path/lyrics',
    output: null,
  });
});

test('missing folder in the default command reports usage listing all three forms', () => {
  assert.throws(() => parseArgs([]), /tsuzuri <folder> \[-o out\.mp4\]/);
  assert.throws(() => parseArgs([]), /tsuzuri doctor/);
  assert.throws(() => parseArgs([]), /tsuzuri lyrics <folder>/);
});
