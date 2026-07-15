import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import test from 'node:test';

import {PICK_BACK, PromptAbortError, PromptQuitError, withPrompts} from './prompts.mjs';

const interact = async (answers, fn) => {
  const input = new PassThrough();
  const output = new PassThrough();
  let text = '';
  output.setEncoding('utf8');
  output.on('data', (chunk) => {
    text += chunk;
  });
  const resultPromise = withPrompts(fn, {input, output});
  const observed = resultPromise.then(
    (result) => ({result}),
    (error) => ({error}),
  );
  for (const answer of answers) {
    input.write(`${answer}\n`);
    await new Promise((resolve) => setImmediate(resolve));
  }
  const settled = await observed;
  input.end();
  if (settled.error) throw settled.error;
  return {result: settled.result, output: text};
};

test('confirm names the safe default and accepts only its explicit alternate key', async () => {
  const {result, output} = await interact(['', 'x', 'd', 'r'], async (ask) => [
    await ask.confirm('歌曲信息正确吗?', {defaultLabel: '确认', alternateKey: 'r', alternateLabel: '修改'}),
    await ask.confirm('删除其余音频?', {
      defaultValue: false,
      defaultLabel: '取消',
      alternateKey: 'd',
      alternateLabel: '删除',
    }),
    await ask.confirm('歌曲信息正确吗?', {defaultLabel: '确认', alternateKey: 'r', alternateLabel: '修改'}),
  ]);
  assert.deepEqual(result, [true, true, false]);
  assert.match(output, /歌曲信息正确吗\? \[回车确认,r=修改\]/);
  assert.match(output, /删除其余音频\? \[回车取消,d=删除\]/);
  assert.match(output, /无效输入,请直接回车取消,或输入 d 删除/);
});

test('pick handles invalid input, back, abandon, and a valid item', async () => {
  const first = await interact(['9', '2'], (ask) => ask.pick('选一个', ['甲', '乙']));
  assert.deepEqual(first.result, {index: 1, item: '乙'});
  assert.match(first.output, /无效选择,请输入 1-2/);
  assert.equal((await interact(['0'], (ask) => ask.pick('选一个', ['甲']))).result, PICK_BACK);
  assert.equal((await interact([''], (ask) => ask.pick('选一个', ['甲']))).result, null);

  const noBack = await interact(['0', ''], (ask) =>
    ask.pick('选一个', ['甲'], {allowBack: false}),
  );
  assert.equal(noBack.result, null);
  assert.doesNotMatch(noBack.output, /返回上一步/);
  assert.match(noBack.output, /无效选择/);
});

test('line accepts a default and repeats after validation failure', async () => {
  const {result, output} = await interact(['bad', ''], (ask) =>
    ask.line('素材路径', {
      defaultValue: '/tmp/photos',
      validate: (value) => value.startsWith('/') || '请输入绝对路径',
    }),
  );
  assert.equal(result, '/tmp/photos');
  assert.match(output, /素材路径 \[\/tmp\/photos\] · 回车使用默认值:/);
  assert.match(output, /请输入绝对路径/);
});

test('line shows its enter action and can return without consuming the default', async () => {
  const {result, output} = await interact(['0'], (ask) =>
    ask.line('歌词搜索关键词', {
      defaultValue: 'Yellow Coldplay',
      enterLabel: '搜索',
      allowBack: true,
    }),
  );
  assert.equal(result, PICK_BACK);
  assert.match(output, /歌词搜索关键词 \[Yellow Coldplay\] · 回车搜索 · 0 返回:/);
});

test('q exits globally from line, confirm, and pick prompts', async () => {
  await assert.rejects(interact(['q'], (ask) => ask.line('输入')), PromptQuitError);
  await assert.rejects(interact(['q'], (ask) => ask.confirm('继续吗?')), PromptQuitError);
  await assert.rejects(interact(['q'], (ask) => ask.pick('选择', ['甲'])), PromptQuitError);
});

test('q unwinds caller cleanup before exiting', async () => {
  let cleaned = false;
  await assert.rejects(interact(['q'], async (ask) => {
    try {
      await ask.line('等待输入');
    } finally {
      cleaned = true;
    }
  }), PromptQuitError);
  assert.equal(cleaned, true);
});

test('EOF rejects with PromptAbortError so caller finally blocks can run', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  let cleaned = false;
  const pending = withPrompts(async (ask) => {
    try {
      await ask.line('等待输入');
    } finally {
      cleaned = true;
    }
  }, {input, output});
  input.end();
  await assert.rejects(pending, PromptAbortError);
  assert.equal(cleaned, true);
});
