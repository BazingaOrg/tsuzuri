import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {maybePersistTrimChoice} from './trim.mjs';

const makeFolder = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tsuzuri-trim-'));
const timeline = {
  meta: {trim: {mode: 'auto', applied: true, full_duration: 60, trimmed_duration: 24}},
  photos: [{}, {}, {}],
};

test('interactive first auto trim persists the accepted default', async () => {
  const folder = makeFolder();
  let question = '';
  try {
    const result = await maybePersistTrimChoice({
      folder,
      timeline,
      interactive: true,
      promptRunner: async (run) => run({
        pick: async (text) => {
          question = text;
          return {index: 0, item: '接受裁剪'};
        },
      }),
    });
    assert.equal(result, 'auto');
    assert.match(question, /24\.0 秒重拍处截断.*平均每张 8\.0 秒/);
    assert.equal(fs.readFileSync(path.join(folder, 'tsuzuri.toml'), 'utf8'), 'trim = "auto"\n');
  } finally {
    fs.rmSync(folder, {recursive: true, force: true});
  }
});

test('interactive choice can persist full-song playback', async () => {
  const folder = makeFolder();
  try {
    const result = await maybePersistTrimChoice({
      folder,
      timeline,
      interactive: true,
      promptRunner: async (run) => run({pick: async () => ({index: 1, item: '播完整首歌'})}),
    });
    assert.equal(result, 'full');
    assert.equal(fs.readFileSync(path.join(folder, 'tsuzuri.toml'), 'utf8'), 'trim = "full"\n');
  } finally {
    fs.rmSync(folder, {recursive: true, force: true});
  }
});

test('non-interactive, explicit config, override, and unapplied trim do not prompt', async () => {
  for (const scenario of [
    {interactive: false},
    {interactive: true, planOutcome: 'preserved_manual_edit'},
    {interactive: true, trimOverride: 'full'},
    {interactive: true, timeline: {...timeline, meta: {trim: {...timeline.meta.trim, applied: false}}}},
  ]) {
    const folder = makeFolder();
    let prompted = false;
    try {
      const result = await maybePersistTrimChoice({
        folder,
        timeline: scenario.timeline ?? timeline,
        interactive: scenario.interactive,
        planOutcome: scenario.planOutcome ?? 'generated',
        trimOverride: scenario.trimOverride ?? null,
        promptRunner: async () => {
          prompted = true;
        },
      });
      assert.equal(result, null);
      assert.equal(prompted, false);
    } finally {
      fs.rmSync(folder, {recursive: true, force: true});
    }
  }

  const folder = makeFolder();
  fs.writeFileSync(path.join(folder, 'tsuzuri.toml'), 'trim = "auto"\n');
  try {
    let prompted = false;
    const result = await maybePersistTrimChoice({
      folder,
      timeline,
      interactive: true,
      promptRunner: async () => {
        prompted = true;
      },
    });
    assert.equal(result, null);
    assert.equal(prompted, false);
  } finally {
    fs.rmSync(folder, {recursive: true, force: true});
  }
});
