import assert from 'node:assert/strict';
import os from 'node:os';
import test from 'node:test';

import {
  buildArgvFromChoices,
  formatEquivalentCommand,
  isYes,
  normalizeDroppedPath,
} from './menu.mjs';

test('normalizeDroppedPath unescapes macOS drag-and-drop sequences', () => {
  assert.equal(normalizeDroppedPath('/Users/me/My\\ Photos'), '/Users/me/My Photos');
  assert.equal(normalizeDroppedPath('/Users/me/Photos\\ \\(2024\\)'), '/Users/me/Photos (2024)');
});

test('normalizeDroppedPath strips paired quotes from Windows drag-and-drop', () => {
  assert.equal(normalizeDroppedPath('"C:\\Users\\me\\My Photos"'), 'C:\\Users\\me\\My Photos');
  assert.equal(normalizeDroppedPath("'./photos'"), './photos');
});

test('normalizeDroppedPath keeps Windows separators and UNC prefixes intact', () => {
  assert.equal(normalizeDroppedPath('C:\\Users\\me\\trip'), 'C:\\Users\\me\\trip');
  assert.equal(normalizeDroppedPath('\\\\server\\share\\trip'), '\\\\server\\share\\trip');
});

test('normalizeDroppedPath expands a leading tilde and trims whitespace', () => {
  assert.equal(normalizeDroppedPath('  ~/photos  '), `${os.homedir()}/photos`);
  assert.equal(normalizeDroppedPath('~'), os.homedir());
});

test('buildArgvFromChoices maps each menu entry onto CLI argv', () => {
  assert.deepEqual(buildArgvFromChoices({choice: '1', target: './trip'}), ['./trip']);
  assert.deepEqual(buildArgvFromChoices({choice: '2', target: './p', exif: true, sign: true}), [
    'still',
    './p',
    '--exif',
    '--sign',
  ]);
  assert.deepEqual(buildArgvFromChoices({choice: '2', target: './p'}), ['still', './p']);
  assert.deepEqual(buildArgvFromChoices({choice: '2', target: './p', dark: true}), [
    'still',
    './p',
    '--dark',
  ]);
  assert.deepEqual(buildArgvFromChoices({choice: '3', target: './trip'}), ['lyrics', './trip']);
  assert.deepEqual(buildArgvFromChoices({choice: '4'}), ['doctor']);
  assert.equal(buildArgvFromChoices({choice: '9'}), null);
});

test('formatEquivalentCommand quotes arguments containing spaces', () => {
  assert.equal(formatEquivalentCommand(['still', './p', '--exif']), 'tsuzuri still ./p --exif');
  assert.equal(
    formatEquivalentCommand(['still', './p', '--exif', '--sign', '--dark']),
    'tsuzuri still ./p --exif --sign --dark',
  );
  assert.equal(
    formatEquivalentCommand(['still', '/Users/me/My Photos']),
    'tsuzuri still "/Users/me/My Photos"',
  );
});

test('isYes accepts y/yes case-insensitively and defaults to no', () => {
  assert.equal(isYes('y'), true);
  assert.equal(isYes('YES'), true);
  assert.equal(isYes(''), false);
  assert.equal(isYes('n'), false);
  assert.equal(isYes(undefined), false);
});
