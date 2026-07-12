import assert from 'node:assert/strict';
import test from 'node:test';

import {runCommand} from './run-command.mjs';

test('missing command is translated without leaking spawn ENOENT', () => {
  const error = Object.assign(new Error('spawnSync uv ENOENT'), {code: 'ENOENT'});
  assert.equal(runCommand('分析音频', 'uv', [], {}, () => ({error})), 1);
});

test('stage command preserves a non-zero exit code', () => {
  assert.equal(runCommand('渲染视频', 'node', [], {}, () => ({status: 7})), 7);
});
