import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildAudioFilename,
  buildLyricsQuery,
  buildNextStepMessage,
  checkYtDlp,
  chooseSingleAudio,
  detectLyricsScript,
  downloadWithYtDlp,
  durationDelta,
  filterSyncedRecords,
  formatDuration,
  formatLrcPageTitle,
  formatLrcPreview,
  formatLyricsCandidate,
  installDownloadedAudio,
  installDownloadedLyrics,
  lyricsFlow,
  parseCurlResponse,
  parseLrc,
  parseSearchLine,
  planOffers,
  probeAudio,
  preferSimplifiedChineseLrc,
  sanitizeFilePart,
  searchLyricsRecords,
} from './fetch.mjs';

test('parseSearchLine splits yt-dlp print output and tolerates NA fields', () => {
  assert.deepEqual(parseSearchLine('abc123\t晴天 (官方MV)\t4:29\t周杰倫'), {
    id: 'abc123',
    title: '晴天 (官方MV)',
    duration: '4:29',
    uploader: '周杰倫',
  });
  assert.deepEqual(parseSearchLine('abc123\tTitle\tNA\tNA'), {
    id: 'abc123',
    title: 'Title',
    duration: '?:??',
    uploader: '未知频道',
  });
  assert.equal(parseSearchLine(''), null);
  assert.equal(parseSearchLine('only-one-field'), null);
});

test('buildLyricsQuery prefers tags and falls back to a cleaned filename', () => {
  assert.equal(buildLyricsQuery({title: '晴天', artist: '周杰伦'}), '晴天 周杰伦');
  assert.equal(buildLyricsQuery({title: '晴天', artist: null}), '晴天');
  assert.equal(buildLyricsQuery({audioFile: 'jay_chou-qing.tian.mp3'}), 'jay chou qing tian');
  assert.equal(buildLyricsQuery({audioFile: '晴天 - 周杰伦.m4a'}), '晴天 周杰伦');
});

test('durationDelta compares only when both durations are known', () => {
  assert.equal(durationDelta(269, 272), 3);
  assert.equal(durationDelta(null, 272), null);
  assert.equal(durationDelta(269, undefined), null);
});

test('formatLyricsCandidate warns when the duration gap exceeds the threshold', () => {
  const record = {trackName: '晴天', artistName: '周杰伦', duration: 269};
  assert.equal(formatLyricsCandidate(record, 269), '晴天 - 周杰伦 (4:29)');
  assert.match(formatLyricsCandidate(record, 281), /⚠ 与音频时长差 12s/);
  assert.equal(formatLyricsCandidate(record, null), '晴天 - 周杰伦 (4:29)');
});

test('filterSyncedRecords drops instrumental and lyrics without a timeline', () => {
  const synced = {syncedLyrics: '[00:01.00] hi', instrumental: false};
  assert.deepEqual(
    filterSyncedRecords([synced, {syncedLyrics: null}, {syncedLyrics: '  '}, {syncedLyrics: '[0:1]x', instrumental: true}, null]),
    [synced],
  );
  assert.deepEqual(filterSyncedRecords(null), []);
});

test('parseLrc reads timestamps, skips metadata, and sorts by time', () => {
  const lrc = '[ti:晴天]\n[00:32.10]第二句\n[00:27.5]第一句\n[01:00.00][02:00.00]重复句\n[00:40.00]\n';
  assert.deepEqual(parseLrc(lrc), [
    {time: 27.5, text: '第一句'},
    {time: 32.1, text: '第二句'},
    {time: 60, text: '重复句'},
    {time: 120, text: '重复句'},
  ]);
});

test('formatLrcPreview pages through all lyrics without truncating rows', () => {
  const entries = Array.from({length: 15}, (_, i) => ({time: i * 10, text: `行${i}`}));
  const lines = formatLrcPreview(entries, {offset: 3, limit: 3});
  assert.deepEqual(lines, ['[00:30.0] 行3', '[00:40.0] 行4', '[00:50.0] 行5']);
  assert.equal(formatLrcPageTitle(15, 3, 3), '歌词预览 4-6/共 15 行');
  assert.equal(formatLrcPreview(entries.slice(0, 2)).length, 2);
});

test('traditional Chinese LRCLIB lyrics are converted to simplified Chinese', async () => {
  const source = '[ar:周傑倫]\n[00:01.00]故事的小黃花\n[00:02.00]從出生那年就飄著\n[00:03.00]為妳翹課';
  assert.equal(detectLyricsScript(source), 'zh');
  assert.deepEqual(await preferSimplifiedChineseLrc(source), {
    lyrics: '[ar:周杰伦]\n[00:01.00]故事的小黄花\n[00:02.00]从出生那年就飘着\n[00:03.00]为你翘课',
    script: 'zh',
    converted: true,
  });
});

test('already-simplified Chinese lyrics remain unchanged', async () => {
  const source = '[00:01.00]故事的小黄花\n[00:02.00]从出生那年就飘着';
  assert.deepEqual(await preferSimplifiedChineseLrc(source), {
    lyrics: source,
    script: 'zh',
    converted: false,
  });
});

test('English and Japanese lyrics bypass Chinese conversion', async () => {
  const english = '[00:01.00]Come along with me';
  const japanese = '[00:01.00]晴れた空に君を思う';
  assert.deepEqual(await preferSimplifiedChineseLrc(english), {
    lyrics: english,
    script: 'other',
    converted: false,
  });
  assert.deepEqual(await preferSimplifiedChineseLrc(japanese), {
    lyrics: japanese,
    script: 'ja',
    converted: false,
  });
});

test('formatDuration renders m:ss and tolerates unknown values', () => {
  assert.equal(formatDuration(269), '4:29');
  assert.equal(formatDuration(60), '1:00');
  assert.equal(formatDuration(59.6), '1:00');
  assert.equal(formatDuration(119.6), '2:00');
  assert.equal(formatDuration(null), '?:??');
});

test('downloaded audio names use confirmed song metadata and remove unsafe characters', () => {
  assert.equal(sanitizeFilePart('  A/B: Song?  '), 'A B Song');
  assert.equal(
    buildAudioFilename({title: 'The Winner Is', artist: 'DeVotchKa / Mychael Danna', ext: '.M4A'}),
    'The Winner Is - DeVotchKa Mychael Danna.m4a',
  );
  assert.equal(buildAudioFilename({title: '晴天', artist: '', ext: 'mp3'}), '晴天.mp3');
  assert.throws(() => buildAudioFilename({title: ' / ', artist: '', ext: 'mp3'}), /歌曲名不能为空/);
});

test('LRCLIB falls back to search when an exact record has no synced lyrics', async () => {
  const calls = [];
  const searchResult = [{syncedLyrics: '[00:01]ok'}];
  const fetcher = async (pathname, params) => {
    calls.push({pathname, params});
    return pathname === '/get' ? {plainLyrics: 'text only'} : searchResult;
  };
  const result = await searchLyricsRecords(
    {query: 'Song Artist', title: 'Song', artist: 'Artist', duration: 100},
    fetcher,
  );
  assert.deepEqual(result, searchResult);
  assert.deepEqual(calls.map((c) => c.pathname), ['/get', '/search']);
});

test('LRCLIB keeps a usable exact synced record without searching again', async () => {
  const calls = [];
  const exact = {syncedLyrics: '[00:01]ok', instrumental: false};
  const result = await searchLyricsRecords(
    {query: 'Song Artist', title: 'Song', artist: 'Artist', duration: 100},
    async (pathname) => {
      calls.push(pathname);
      return exact;
    },
  );
  assert.deepEqual(result, [exact]);
  assert.deepEqual(calls, ['/get']);
});

test('lyrics preview can return to candidates without repeating the network search', async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'tsuzuri-fetch-test-'));
  fs.writeFileSync(path.join(folder, 'song.wav'), Buffer.alloc(44));
  const syncedLyrics = Array.from({length: 13}, (_, i) =>
    `[00:${String(i).padStart(2, '0')}.00]行${i}`,
  ).join('\n');
  let fetchCount = 0;
  let pickCount = 0;
  const previewActions = ['0', 's'];
  try {
    const saved = await lyricsFlow({
      line: async (text) => text === '歌词搜索关键词' ? 'song' : previewActions.shift(),
      pick: async () => {
        pickCount += 1;
        return {index: 0};
      },
      confirm: async () => true,
    }, {write: () => {}}, folder, 'song.wav', {
      fetcher: async () => {
        fetchCount += 1;
        return [{
          trackName: 'Song', artistName: 'Artist', duration: 13,
          syncedLyrics, instrumental: false,
        }];
      },
    });

    assert.equal(saved, true);
    assert.equal(fetchCount, 1);
    assert.equal(pickCount, 2);
    assert.equal(fs.readFileSync(path.join(folder, 'audio', 'song.lrc'), 'utf8'), syncedLyrics);
  } finally {
    fs.rmSync(folder, {recursive: true, force: true});
  }
});

test('yt-dlp downloads outside the material folder and safely replaces a same-name audio', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tsuzuri-fetch-test-'));
  const folder = path.join(root, 'material');
  fs.mkdirSync(folder);
  const oldFile = path.join(folder, 'Song - Artist.m4a');
  fs.writeFileSync(oldFile, 'old audio');

  let spawnCount = 0;
  const result = downloadWithYtDlp('https://example.test/video', {
    tempParent: root,
    stdio: 'pipe',
    spawn: (_command, args) => {
      spawnCount += 1;
      const template = args[args.indexOf('-o') + 1];
      const output = template.replace('%(title)s', 'remote-video-title').replace('%(ext)s', 'm4a');
      fs.writeFileSync(output, 'new audio');
      return {status: 0};
    },
  });

  try {
    assert.equal(result.ok, true);
    assert.equal(spawnCount, 1);
    assert.equal(fs.readFileSync(oldFile, 'utf8'), 'old audio');
    assert.notEqual(path.dirname(result.source), folder);
    const installed = installDownloadedAudio({
      source: result.source,
      folder,
      filename: 'Song - Artist.m4a',
      existing: 'Song - Artist.m4a',
    });
    assert.equal(installed, 'audio/Song - Artist.m4a');
    assert.equal(fs.existsSync(oldFile), false);
    assert.equal(fs.readFileSync(path.join(folder, installed), 'utf8'), 'new audio');
    assert.deepEqual(fs.readdirSync(folder), ['audio']);
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
});

test('a failed staged install preserves the existing audio', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tsuzuri-fetch-test-'));
  const oldFile = path.join(root, 'Song.m4a');
  fs.writeFileSync(oldFile, 'old audio');
  try {
    assert.throws(() => installDownloadedAudio({
      source: path.join(root, 'missing.m4a'),
      folder: root,
      filename: 'Song.m4a',
      existing: 'Song.m4a',
    }));
    assert.equal(fs.readFileSync(oldFile, 'utf8'), 'old audio');
    assert.deepEqual(fs.readdirSync(root), ['Song.m4a']);
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
});

test('a failed staged lyrics replacement preserves the existing lyrics', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tsuzuri-fetch-test-'));
  const audioFolder = path.join(root, 'audio');
  fs.mkdirSync(audioFolder);
  const oldFile = path.join(audioFolder, 'Song.lrc');
  fs.writeFileSync(oldFile, 'old lyrics');
  try {
    assert.throws(() => installDownloadedLyrics({
      lyrics: Symbol('invalid contents'),
      folder: root,
      filename: 'Song.lrc',
      existing: 'audio/Song.lrc',
    }));
    assert.equal(fs.readFileSync(oldFile, 'utf8'), 'old lyrics');
    assert.deepEqual(fs.readdirSync(audioFolder), ['Song.lrc']);
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
});

test('planOffers only proposes what the folder is missing', () => {
  assert.deepEqual(planOffers({audios: [], lyrics: []}), {offerAudio: true, offerLyrics: false});
  assert.deepEqual(planOffers({audios: ['a.mp3'], lyrics: []}), {offerAudio: false, offerLyrics: true});
  assert.deepEqual(planOffers({audios: ['a.mp3'], lyrics: ['a.lrc']}), {offerAudio: false, offerLyrics: false});
  // 多个音频交给 scanFolder 的既有报错,不在兜底流程里处理
  assert.deepEqual(planOffers({audios: ['a.mp3', 'b.mp3'], lyrics: []}), {offerAudio: false, offerLyrics: false});
});

test('next-step guidance follows the final material state', () => {
  assert.equal(
    buildNextStepMessage('/my trip', {photos: ['a.jpg'], audios: ['song.m4a']}),
    '下一步:可运行 node cli/tsuzuri.mjs "/my trip" 渲染',
  );
  assert.equal(
    buildNextStepMessage('/trip', {photos: [], audios: ['song.m4a']}),
    '下一步:先把照片放入素材文件夹',
  );
  assert.equal(buildNextStepMessage('/trip', {photos: ['a.jpg'], audios: []}), null);
});

test('multiple-audio cleanup deletes only after dangerous confirmation', async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'tsuzuri-fetch-test-'));
  for (const name of ['a.mp3', 'b.m4a']) fs.writeFileSync(path.join(folder, name), name);
  try {
    const calls = [];
    const result = await chooseSingleAudio({
      pick: async (text, items, options) => {
        calls.push({text, items, options});
        return {index: 1, item: items[1]};
      },
      confirm: async (text, options) => {
        calls.push({text, options});
        return true;
      },
    }, folder, ['a.mp3', 'b.m4a']);
    assert.deepEqual(result, ['b.m4a']);
    assert.deepEqual(fs.readdirSync(folder), ['b.m4a']);
    assert.deepEqual(calls[0], {
      text: '文件夹里有多个音频,选择要保留的一个',
      items: ['a.mp3', 'b.m4a'],
      options: {allowBack: false},
    });
    assert.deepEqual(calls[1].options, {dangerous: true});
  } finally {
    fs.rmSync(folder, {recursive: true, force: true});
  }
});

test('multiple-audio cleanup abandon leaves files untouched', async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'tsuzuri-fetch-test-'));
  for (const name of ['a.mp3', 'b.m4a']) fs.writeFileSync(path.join(folder, name), name);
  try {
    const result = await chooseSingleAudio({pick: async () => null}, folder, ['a.mp3', 'b.m4a']);
    assert.deepEqual(result, ['a.mp3', 'b.m4a']);
    assert.deepEqual(fs.readdirSync(folder).sort(), ['a.mp3', 'b.m4a']);
  } finally {
    fs.rmSync(folder, {recursive: true, force: true});
  }
});

test('parseCurlResponse splits body from the trailing status code', () => {
  assert.deepEqual(parseCurlResponse('[{"id":1}]\n200'), {status: 200, body: '[{"id":1}]'});
  assert.deepEqual(parseCurlResponse('{"a":"多\n行"}\n404'), {status: 404, body: '{"a":"多\n行"}'});
  assert.equal(parseCurlResponse('no-status-line'), null);
  assert.equal(parseCurlResponse(''), null);
  assert.equal(parseCurlResponse('body\nabc'), null);
});

test('checkYtDlp reports missing binary without throwing', () => {
  assert.deepEqual(checkYtDlp(() => ({error: new Error('ENOENT')})), {ok: false});
  assert.deepEqual(checkYtDlp(() => ({status: 0, stdout: '2026.01.01\n'})), {ok: true, version: '2026.01.01'});
});

test('probeAudio lowercases tag keys and swallows ffprobe failures', () => {
  const stdout = JSON.stringify({format: {duration: '269.4', tags: {TITLE: '晴天', Artist: '周杰伦'}}});
  assert.deepEqual(probeAudio('a.mp3', () => ({status: 0, stdout})), {
    title: '晴天',
    artist: '周杰伦',
    duration: 269.4,
  });
  assert.deepEqual(probeAudio('a.mp3', () => ({status: 1, stdout: ''})), {});
  assert.deepEqual(probeAudio('a.mp3', () => ({status: 0, stdout: 'not json'})), {});
});
