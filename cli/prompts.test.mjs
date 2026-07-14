import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import test from 'node:test';

import {PICK_BACK, withPrompts} from './prompts.mjs';

const interact = async (answers, fn) => {
  const input = new PassThrough();
  const output = new PassThrough();
  let text = '';
  output.setEncoding('utf8');
  output.on('data', (chunk) => {
    text += chunk;
  });
  const resultPromise = withPrompts(fn, {input, output});
  for (const answer of answers) {
    input.write(`${answer}\n`);
    await new Promise((resolve) => setImmediate(resolve));
  }
  const result = await resultPromise;
  input.end();
  return {result, output: text};
};

test('confirm supports a default independent from dangerous', async () => {
  const {result, output} = await interact(['', '', '', '', 'y', 'n'], async (ask) => [
    await ask.confirm('继续吗?'),
    await ask.confirm('删除吗?', {dangerous: true}),
    await ask.confirm('重试吗?', {defaultValue: false}),
    await ask.confirm('保守覆盖吗?', {dangerous: true, defaultValue: true}),
    await ask.confirm('删除吗?', {dangerous: true}),
    await ask.confirm('继续吗?'),
  ]);
  assert.deepEqual(result, [true, false, false, true, true, false]);
  assert.match(output, /继续吗\? \[Y\/n,回车=是\]/);
  assert.match(output, /删除吗\? \[y\/N,回车=否\]/);
  assert.match(output, /重试吗\? \[y\/N,回车=否\]/);
  assert.match(output, /保守覆盖吗\? \[Y\/n,回车=是\]/);
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
  assert.match(output, /素材路径 \[\/tmp\/photos\]:/);
  assert.match(output, /请输入绝对路径/);
});
