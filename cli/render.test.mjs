import assert from 'node:assert/strict';
import test from 'node:test';

import {applyRenderVariants} from './render.mjs';

const timeline = () => ({
  meta: {duration: 10, audio: './song.mp3'},
  photos: [
    {src: 'a.jpg', start: 0},
    {src: 'b.jpg', start: 1},
    {src: 'a.jpg', start: 2},
  ],
  subtitles: [],
});

test('no flags leaves the timeline untouched', async () => {
  const tl = timeline();
  const result = await applyRenderVariants(tl, {}, {resolvePhotoPath: (src) => src});
  assert.equal(result.meta.background, undefined);
  assert.equal(result.meta.sign, undefined);
  assert.equal(result.photos[0].exif, undefined);
});

test('dark sets meta.background to black', async () => {
  const result = await applyRenderVariants(timeline(), {dark: true}, {resolvePhotoPath: (src) => src});
  assert.equal(result.meta.background, '#000000');
});

test('sign sets meta.sign to true', async () => {
  const result = await applyRenderVariants(timeline(), {sign: true}, {resolvePhotoPath: (src) => src});
  assert.equal(result.meta.sign, true);
});

test('exif extracts once per unique src and attaches to every matching clip', async () => {
  const calls = [];
  const extractExif = async (absPath) => {
    calls.push(absPath);
    return absPath.includes('a.jpg') ? {camera: 'Test Camera'} : null;
  };
  const result = await applyRenderVariants(
    timeline(),
    {exif: true},
    {resolvePhotoPath: (src) => `/public/${src}`, extractExif},
  );
  assert.deepEqual(calls, ['/public/a.jpg', '/public/b.jpg']);
  assert.deepEqual(result.photos[0].exif, {camera: 'Test Camera'});
  assert.equal(result.photos[1].exif, null);
  assert.deepEqual(result.photos[2].exif, {camera: 'Test Camera'});
});

test('exif shortage is reported once with the count of unique photos missing EXIF', async () => {
  let shortageCount = null;
  const extractExif = async () => null;
  await applyRenderVariants(
    timeline(),
    {exif: true},
    {
      resolvePhotoPath: (src) => src,
      extractExif,
      onExifShortage: (count) => { shortageCount = count; },
    },
  );
  assert.equal(shortageCount, 2);
});
