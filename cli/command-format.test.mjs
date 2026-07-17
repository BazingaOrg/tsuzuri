import assert from 'node:assert/strict';
import test from 'node:test';

import {formatEquivalentCommand} from './command-format.mjs';

test('formatEquivalentCommand quotes arguments containing spaces', () => {
  assert.equal(
    formatEquivalentCommand(['still', './p', '--exif']),
    'node cli/tsuzuri.mjs still ./p --exif',
  );
  assert.equal(
    formatEquivalentCommand(['still', './p', '--exif', '--sign', '--dark']),
    'node cli/tsuzuri.mjs still ./p --exif --sign --dark',
  );
  assert.equal(
    formatEquivalentCommand(['still', '/Users/me/My Photos']),
    'node cli/tsuzuri.mjs still "/Users/me/My Photos"',
  );
});
