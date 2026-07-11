import assert from 'node:assert/strict';
import test from 'node:test';

import {formatLyricsPreview} from './lyrics.mjs';

test('zero segments produces the pure-music info line', () => {
  const lines = formatLyricsPreview({backend: 'lrc', language: 'en', segments: []});

  assert.equal(lines.length, 2);
  assert.equal(lines[0].kind, 'info');
  assert.match(lines[0].text, /来源: lrc · 语言: en/);
  assert.deepEqual(lines[1], {kind: 'info', text: '未识别到人声(纯音乐?),渲染时将跳过字幕'});
});

test('segments at or above the confidence threshold render as plain lines', () => {
  const lines = formatLyricsPreview({
    backend: 'lrc',
    language: 'ja',
    segments: [{text: '夜空', start: 1.5, end: 63.4, confidence: 1.0}],
  });

  assert.deepEqual(lines[1], {kind: 'line', text: '[00:01.5 → 01:03.4] 夜空'});
});

test('segments below the confidence threshold render as warnings with the render-skip note', () => {
  const lines = formatLyricsPreview(
    {
      backend: 'faster-whisper',
      language: 'ja',
      segments: [{text: 'low', start: 0, end: 1, confidence: 0.42}],
    },
    {confidenceThreshold: 0.6},
  );

  assert.equal(lines[1].kind, 'warn');
  assert.match(lines[1].text, /置信度 0\.42 低于渲染阈值 0\.6/);
  assert.match(lines[1].text, /不会显示/);
});

test('the confidence threshold is configurable and defaults to the renderer value', () => {
  const lines = formatLyricsPreview({
    backend: 'lrc',
    language: 'en',
    segments: [{text: 'borderline', start: 0, end: 1, confidence: 0.6}],
  });

  // exactly at the default 0.6 threshold counts as shown (>=), matching Diary.tsx's `>=` check
  assert.equal(lines[1].kind, 'line');
});
