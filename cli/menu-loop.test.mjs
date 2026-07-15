import assert from 'node:assert/strict';
import test from 'node:test';

import {PromptAbortError, PromptQuitError} from './prompts.mjs';
import {runInteractiveMenu} from './tsuzuri.mjs';

test('interactive menu runs consecutive commands until the user exits', async () => {
  const choices = [['doctor'], ['lyrics', '/trip'], null];
  const commands = [];
  let output = '';

  const code = await runInteractiveMenu({
    menuRunner: async () => choices.shift(),
    commandRunner: async (argv) => {
      commands.push(argv);
      return 0;
    },
    output: {write: (text) => { output += text; }},
  });

  assert.equal(code, 0);
  assert.deepEqual(commands, [['doctor'], ['lyrics', '/trip']]);
  assert.equal((output.match(/返回主菜单/g) ?? []).length, 2);
});

test('a command error is reported and does not exit the interactive menu', async () => {
  const choices = [['lyrics', '/missing'], null];
  const errors = [];

  assert.equal(await runInteractiveMenu({
    menuRunner: async () => choices.shift(),
    commandRunner: async () => { throw new Error('找不到路径'); },
    onError: (error) => errors.push(error.message),
    output: {write: () => {}},
  }), 0);
  assert.deepEqual(errors, ['找不到路径']);
});

test('q exits the whole interactive menu while Ctrl+C remains an interruption', async () => {
  assert.equal(await runInteractiveMenu({
    menuRunner: async () => ['fetch', '/trip'],
    commandRunner: async () => { throw new PromptQuitError(); },
    output: {write: () => {}},
  }), 0);

  await assert.rejects(runInteractiveMenu({
    menuRunner: async () => { throw new PromptAbortError(); },
    output: {write: () => {}},
  }), PromptAbortError);
});
