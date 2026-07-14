import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  buildArgvFromChoices,
  formatEquivalentCommand,
  normalizeDroppedPath,
  runMenu,
} from './menu.mjs';

const interact = async ({lines, confirms = []}) => {
  let text = '';
  const output = {write: (chunk) => { text += chunk; }};
  const confirmCalls = [];
  const promptRunner = (fn) => fn({
    line: async (_prompt, options = {}) => {
      for (;;) {
        const value = lines.shift();
        const valid = options.validate ? await options.validate(value) : true;
        if (valid === true || valid === undefined) return value;
        text += `${valid}\n`;
      }
    },
    confirm: async (prompt, options = {}) => {
      confirmCalls.push({prompt, options});
      return confirms.shift();
    },
  });
  const result = await runMenu({output, promptRunner});
  return {result, output: text, confirmCalls};
};

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
  assert.deepEqual(buildArgvFromChoices({choice: '5', target: './trip'}), ['fetch', './trip']);
  assert.equal(buildArgvFromChoices({choice: '9'}), null);
});

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

test('runMenu reports invalid choices and q exits cleanly', async () => {
  const {result, output} = await interact({lines: ['9', 'q']});
  assert.equal(result, null);
  assert.match(output, /无效选择,请输入 1-5/);
  assert.match(output, /再见/);
});

test('runMenu repeats missing and wrong-type folder paths', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tsuzuri-menu-test-'));
  const file = path.join(root, 'photo.jpg');
  fs.writeFileSync(file, 'photo');
  try {
    const {result, output} = await interact({
      lines: ['1', path.join(root, 'missing'), file, root],
    });
    assert.deepEqual(result, [root]);
    assert.match(output, /找不到路径:/);
    assert.match(output, /不是文件夹:/);
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
});

test('still accepts a file path and defaults presentation choices to off', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tsuzuri-menu-test-'));
  const file = path.join(root, 'photo.jpg');
  fs.writeFileSync(file, 'photo');
  try {
    const {result, confirmCalls} = await interact({
      lines: ['2', file],
      confirms: [false, false, false],
    });
    assert.deepEqual(result, ['still', file]);
    assert.deepEqual(confirmCalls.map((call) => call.options), [
      {defaultValue: false},
      {defaultValue: false},
      {defaultValue: false},
    ]);
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
});
