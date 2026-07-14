/**
 * tsuzuri fetch <folder> — 在线备料:用用户自装的 yt-dlp 下载音频,用 LRCLIB
 * 公开 API 搜索同步歌词。两者都是可选步骤:yt-dlp 用时才检测(不内置下载器),
 * 歌词搜不到就照旧走本地 Whisper。落盘的 .lrc 与音频同名,下游零改动。
 *
 * 交互约定与 menu.mjs 一致:readline 问答、回车走默认值、Ctrl+C 退出。
 * 决策逻辑抽成纯函数(可测),交互层只负责问答与 spawn。
 */

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {CliError} from './options.mjs';
import {FIXES} from './dependencies.mjs';
import {formatEquivalentCommand} from './menu.mjs';
import {PICK_BACK, withPrompts} from './prompts.mjs';
import {scanFolderLoose} from './project.mjs';
import {term} from './term.mjs';

const LRCLIB_BASE = 'https://lrclib.net/api';
// LRCLIB 要求调用方带可识别的 User-Agent
const LRCLIB_UA = 'tsuzuri (https://github.com/tsuzuri)';
// 歌词与音频时长差超过这个秒数,大概率是不同版本(live/剪辑),时间轴会错位
export const DURATION_WARN_SECONDS = 3;
const SEARCH_LIMIT = 5;
const PREVIEW_LINES = 12;

// ---------------------------------------------------------------------------
// 纯逻辑(fetch.test.mjs 覆盖)
// ---------------------------------------------------------------------------

export const formatDuration = (totalSeconds) => {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '?:??';
  const rounded = Math.round(totalSeconds);
  const minutes = Math.floor(rounded / 60);
  const seconds = rounded % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

/** 生成跨平台安全的单个文件名片段。 */
export const sanitizeFilePart = (value) =>
  String(value ?? '')
    .replace(/[\x00-\x1f<>:"/\\|?*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim();

export const buildAudioFilename = ({title, artist, ext}) => {
  const cleanTitle = sanitizeFilePart(title);
  const cleanArtist = sanitizeFilePart(artist);
  if (!cleanTitle) throw new CliError('歌曲名不能为空');
  const suffix = String(ext ?? '').startsWith('.') ? String(ext) : `.${ext}`;
  return `${cleanTitle}${cleanArtist ? ` - ${cleanArtist}` : ''}${suffix.toLowerCase()}`;
};

/** 解析 yt-dlp --print "%(id)s\t%(title)s\t%(duration_string)s\t%(channel,uploader)s" 的一行。 */
export const parseSearchLine = (line) => {
  const parts = String(line ?? '').split('\t');
  if (parts.length < 2 || !parts[0].trim()) return null;
  const clean = (s) => (s && s !== 'NA' ? s.trim() : null);
  return {
    id: parts[0].trim(),
    title: clean(parts[1]) ?? '(无标题)',
    duration: clean(parts[2]) ?? '?:??',
    uploader: clean(parts[3]) ?? '未知频道',
  };
};

/** 从 ffprobe tags / 文件名推默认歌词关键词。 */
export const buildLyricsQuery = ({title, artist, audioFile}) => {
  if (title && artist) return `${title} ${artist}`;
  if (title) return title;
  const base = path.basename(audioFile ?? '', path.extname(audioFile ?? ''));
  return base.replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim();
};

/** 歌词候选与音频时长差(秒);无法比较返回 null。 */
export const durationDelta = (candidateSeconds, audioSeconds) => {
  if (!Number.isFinite(candidateSeconds) || !Number.isFinite(audioSeconds)) return null;
  return Math.abs(candidateSeconds - audioSeconds);
};

export const formatLyricsCandidate = (record, audioSeconds) => {
  const delta = durationDelta(record.duration, audioSeconds);
  const base = `${record.trackName} - ${record.artistName} (${formatDuration(record.duration)})`;
  if (delta !== null && delta > DURATION_WARN_SECONDS) {
    return `${base} ⚠ 与音频时长差 ${Math.round(delta)}s,时间轴可能错位`;
  }
  return base;
};

/** 只保留带同步时间轴的候选(纯文本歌词对踩点字幕没有用)。 */
export const filterSyncedRecords = (records) =>
  (Array.isArray(records) ? records : []).filter(
    (r) => r && typeof r.syncedLyrics === 'string' && r.syncedLyrics.trim() && !r.instrumental,
  );

/** 解析 LRC 文本为 [{time, text}](秒),忽略元数据行;用于落盘前 preview。 */
export const parseLrc = (text) => {
  const entries = [];
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const tags = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    if (tags.length === 0) continue;
    const content = raw.replace(/\[[^\]]*\]/g, '').trim();
    if (!content) continue;
    for (const tag of tags) {
      entries.push({time: Number(tag[1]) * 60 + Number(tag[2]), text: content});
    }
  }
  return entries.sort((a, b) => a.time - b.time);
};

export const formatLrcPreview = (entries, {limit = PREVIEW_LINES} = {}) => {
  const lines = entries.slice(0, limit).map((e) => {
    const minutes = Math.floor(e.time / 60);
    const seconds = (e.time - minutes * 60).toFixed(1).padStart(4, '0');
    return `[${String(minutes).padStart(2, '0')}:${seconds}] ${e.text}`;
  });
  if (entries.length > limit) lines.push(`… 共 ${entries.length} 行`);
  return lines;
};

/**
 * 只用于决定是否做繁转简:日文歌词通常含假名,必须原样保留;
 * 有汉字但无假名时按中文处理,英文等其他脚本不处理。
 */
export const detectLyricsScript = (lrc) => {
  const entries = parseLrc(lrc);
  const text = entries.length > 0 ? entries.map((entry) => entry.text).join('\n') : String(lrc ?? '');
  if (/\p{Script=Hiragana}|\p{Script=Katakana}/u.test(text)) return 'ja';
  if (/\p{Script=Han}/u.test(text)) return 'zh';
  return 'other';
};

let simplifiedChineseConverterPromise = null;
const getSimplifiedChineseConverter = () => {
  simplifiedChineseConverterPromise ??= import('opencc-js/t2cn').then(({default: OpenCC}) => {
    const convertCharacters = OpenCC.Converter({from: 'tw', to: 'cn'});
    const normalizePronoun = OpenCC.CustomConverter([['妳', '你']]);
    return (text) => normalizePronoun(convertCharacters(text));
  });
  return simplifiedChineseConverterPromise;
};

/** LRCLIB 中文歌词优先简体;英文/日文及其他脚本原样返回。 */
export const preferSimplifiedChineseLrc = async (lrc) => {
  const lyrics = String(lrc ?? '');
  const script = detectLyricsScript(lyrics);
  if (script !== 'zh') return {lyrics, script, converted: false};
  const converter = await getSimplifiedChineseConverter();
  const simplified = converter(lyrics);
  return {lyrics: simplified, script, converted: simplified !== lyrics};
};

/** 解析 `curl -w '\n%{http_code}'` 的输出:末行是状态码,其余是 body。 */
export const parseCurlResponse = (stdout) => {
  const text = String(stdout ?? '');
  const cut = text.lastIndexOf('\n');
  if (cut < 0) return null;
  const status = Number(text.slice(cut + 1).trim());
  if (!Number.isInteger(status) || status < 100) return null;
  return {status, body: text.slice(0, cut)};
};

/** 按文件夹现状决定兜底流程该提议什么(主流程只补缺,不打扰已备齐的)。 */
export const planOffers = ({audios, lyrics}) => ({
  offerAudio: audios.length === 0,
  offerLyrics: audios.length === 1 && lyrics.length === 0,
});

// ---------------------------------------------------------------------------
// 外部进程:yt-dlp / ffprobe
// ---------------------------------------------------------------------------

export const checkYtDlp = (spawn = spawnSync) => {
  const r = spawn('yt-dlp', ['--version'], {encoding: 'utf8'});
  if (r.error || r.status !== 0) return {ok: false};
  return {ok: true, version: (r.stdout ?? '').trim()};
};

const searchYtDlp = (query) => {
  const r = spawnSync(
    'yt-dlp',
    [
      `ytsearch${SEARCH_LIMIT}:${query}`,
      '--flat-playlist',
      '--print', '%(id)s\t%(title)s\t%(duration_string)s\t%(channel,uploader)s',
    ],
    {encoding: 'utf8'},
  );
  if (r.error || r.status !== 0) {
    return {ok: false, stderr: (r.stderr ?? '').trim()};
  }
  const candidates = (r.stdout ?? '').split('\n').map(parseSearchLine).filter(Boolean);
  return {ok: true, candidates};
};

/**
 * 始终下载到素材目录外的临时目录。这既能强制同 URL 重新下载,
 * 也保证 yt-dlp/转码失败时不会碰到已有素材。
 */
export const downloadWithYtDlp = (
  url,
  {spawn = spawnSync, tempParent = os.tmpdir(), stdio = 'inherit'} = {},
) => {
  const tempDir = fs.mkdtempSync(path.join(tempParent, 'tsuzuri-fetch-'));
  const r = spawn(
    'yt-dlp',
    ['-x', '--audio-format', 'm4a', '--no-playlist', '-o', path.join(tempDir, '%(title)s.%(ext)s'), url],
    {stdio},
  );
  if (r.error || r.status !== 0) {
    fs.rmSync(tempDir, {recursive: true, force: true});
    return {ok: false};
  }
  const audios = scanFolderLoose(tempDir).audios;
  if (audios.length !== 1) {
    fs.rmSync(tempDir, {recursive: true, force: true});
    return {ok: false};
  }
  return {
    ok: true,
    tempDir,
    audio: audios[0],
    source: path.join(tempDir, audios[0]),
  };
};

/**
 * 先把下载结果复制到素材目录内的隐藏 staging 目录,再替换。
 * 任何一步失败都尽力回滚,保留旧音频。
 */
export const installDownloadedAudio = ({source, folder, filename, existing = null}) => {
  const destination = path.join(folder, filename);
  const existingPath = existing ? path.join(folder, existing) : null;
  const destinationIsExisting = existingPath && path.resolve(existingPath) === path.resolve(destination);
  if (fs.existsSync(destination) && !destinationIsExisting) {
    throw new CliError(`目标文件已存在: ${filename}`);
  }

  const stagingDir = fs.mkdtempSync(path.join(folder, '.tsuzuri-fetch-'));
  const staged = path.join(stagingDir, filename);
  const backup = path.join(stagingDir, `previous${path.extname(filename)}`);
  let installed = false;
  let backedUp = false;
  try {
    fs.copyFileSync(source, staged);
    if (destinationIsExisting) {
      fs.renameSync(destination, backup);
      backedUp = true;
    }
    fs.renameSync(staged, destination);
    installed = true;
    if (existingPath && !destinationIsExisting) fs.rmSync(existingPath);
    if (backedUp) fs.rmSync(backup, {force: true});
    return filename;
  } catch (error) {
    if (installed) fs.rmSync(destination, {force: true});
    if (backedUp && fs.existsSync(backup)) fs.renameSync(backup, destination);
    throw error;
  } finally {
    fs.rmSync(stagingDir, {recursive: true, force: true});
  }
};

/** 读音频 tag 与时长;ffprobe 失败不致命,返回空对象走文件名兜底。 */
export const probeAudio = (file, spawn = spawnSync) => {
  const r = spawn(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration:format_tags=title,artist', '-of', 'json', file],
    {encoding: 'utf8'},
  );
  if (r.error || r.status !== 0) return {};
  try {
    const format = JSON.parse(r.stdout ?? '{}').format ?? {};
    const tags = Object.fromEntries(
      Object.entries(format.tags ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
    );
    return {
      title: tags.title ?? null,
      artist: tags.artist ?? null,
      duration: Number.parseFloat(format.duration) || null,
    };
  } catch {
    return {};
  }
};

// ---------------------------------------------------------------------------
// LRCLIB
// ---------------------------------------------------------------------------

// 用 curl 而非 Node fetch:curl 跟随系统代理环境变量(http_proxy 等),
// 且与本项目 spawnSync 外部命令的风格一致;macOS 与 Windows 10+ 均自带。
const lrclibFetch = (pathname, params) => {
  const url = new URL(`${LRCLIB_BASE}${pathname}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined) url.searchParams.set(key, value);
  }
  const r = spawnSync(
    'curl',
    ['-sS', '--max-time', '20', '-H', `User-Agent: ${LRCLIB_UA}`, '-w', '\n%{http_code}', url.toString()],
    {encoding: 'utf8'},
  );
  if (r.error?.code === 'ENOENT') throw new Error('找不到命令 curl');
  const parsed = parseCurlResponse(r.stdout);
  if (r.error || r.status !== 0 || !parsed) {
    throw new Error((r.stderr ?? '').trim().split('\n').pop() || '请求失败');
  }
  if (parsed.status === 404) return null;
  if (parsed.status < 200 || parsed.status >= 300) throw new Error(`LRCLIB 返回 ${parsed.status}`);
  return JSON.parse(parsed.body);
};

/** 精确记录必须真的含同步歌词;否则继续用关键词宽松搜索。 */
export const searchLyricsRecords = async (
  {query, title, artist, duration, customized = false},
  fetcher = lrclibFetch,
) => {
  if (!customized && title && artist && duration) {
    const exact = await fetcher('/get', {
      track_name: title,
      artist_name: artist,
      duration: Math.round(duration),
    });
    if (filterSyncedRecords(exact ? [exact] : []).length > 0) return [exact];
  }
  return await fetcher('/search', {q: query});
};

const NETWORK_HINT = '检查网络是否可达 lrclib.net(请求经 curl 发出,走系统代理设置)';

// ---------------------------------------------------------------------------
// 交互层
// ---------------------------------------------------------------------------

/** 音频下载子流程;成功时返回用户确认的文件名/歌曲信息。 */
const audioFlow = async (ask, out, folder, {existing = null} = {}) => {
  const ytdlp = checkYtDlp();
  if (!ytdlp.ok) {
    term.error('未找到 yt-dlp(下载音频需要它,由你自行安装)');
    term.detail(FIXES['yt-dlp']);
    return false;
  }

  for (;;) {
    const input = await ask.line('粘贴歌曲 URL,或输入歌名搜索(回车跳过)');
    if (!input) return false;

    let url = null;
    if (/^https?:\/\//i.test(input)) {
      url = input;
    } else {
      term.start(`搜索「${input}」`);
      const search = searchYtDlp(input);
      if (!search.ok) {
        term.error('搜索失败');
        if (search.stderr) term.detail(search.stderr.split('\n').slice(-3).join('\n'));
        term.detail('常见原因:网络需要代理、yt-dlp 版本过旧(yt-dlp -U 可更新)');
        if (!(await ask.confirm('换个关键词再试?', {defaultValue: false}))) return false;
        continue;
      }
      if (search.candidates.length === 0) {
        term.warn(`没有找到「${input}」,换个关键词试试,或手动放入音频文件`);
        continue;
      }
      const choice = await ask.pick(
        '选择要下载的结果',
        search.candidates.map((c) => `${c.title} | ${c.duration} | ${c.uploader}`),
      );
      if (choice === null) return false;
      if (choice === PICK_BACK) continue;
      const picked = search.candidates[choice.index];
      url = `https://www.youtube.com/watch?v=${picked.id}`;
    }

    term.start('下载音频');
    const result = downloadWithYtDlp(url);
    if (!result.ok) {
      term.error('下载失败(具体原因见上方 yt-dlp 输出)');
      term.detail('常见原因:网络需要代理、视频地区受限或已下架;可换一个结果或 URL');
      if (!(await ask.confirm('再试一次(可换关键词/URL)?', {defaultValue: false}))) return false;
      continue;
    }

    try {
      term.info(`下载文件: ${result.audio}`);
      const probe = probeAudio(result.source);
      const suggestedTitle = sanitizeFilePart(
        probe.title || path.basename(result.audio, path.extname(result.audio)),
      );
      const suggestedArtist = sanitizeFilePart(probe.artist || '');

      for (;;) {
        const titleInput = await ask.line('歌曲名', {defaultValue: suggestedTitle});
        const title = sanitizeFilePart(titleInput);
        if (!title) {
          term.warn('歌曲名不能为空');
          continue;
        }
        const artistPrompt = suggestedArtist ? '歌手(输入 0 留空)' : '歌手(可留空)';
        const artistInput = await ask.line(artistPrompt, {
          defaultValue: suggestedArtist || undefined,
        });
        const artist = artistInput === '0' ? '' : sanitizeFilePart(artistInput || suggestedArtist);
        const filename = buildAudioFilename({title, artist, ext: path.extname(result.audio)});
        out.write(`  将保存为: ${filename}\n`);
        if (!(await ask.confirm('歌曲信息和文件名正确吗?'))) continue;

        const destination = path.join(folder, filename);
        const sameAsExisting = existing && path.resolve(destination) === path.resolve(path.join(folder, existing));
        if (fs.existsSync(destination) && !sameAsExisting) {
          term.error(`目标文件已存在: ${filename}`);
          term.detail('请换一个歌曲名或歌手,不会静默覆盖');
          continue;
        }

        installDownloadedAudio({source: result.source, folder, filename, existing});
        term.success(`音频已就绪: ${filename}`);
        return {audio: filename, title, artist};
      }
    } finally {
      fs.rmSync(result.tempDir, {recursive: true, force: true});
    }
  }
};

/** 歌词搜索子流程;audio 必须存在(要按时长匹配、按音频名落盘)。 */
const lyricsFlow = async (
  ask,
  out,
  folder,
  audio,
  {existingLrc = null, confirmedTitle = null, confirmedArtist = null} = {},
) => {
  const probe = probeAudio(path.join(folder, audio));
  const title = confirmedTitle || probe.title;
  const artist = confirmedArtist ?? probe.artist;
  const defaultQuery = buildLyricsQuery({title, artist, audioFile: audio});

  let query = defaultQuery;
  let queryCustomized = false;
  for (;;) {
    const input = await ask.line('歌词搜索关键词', {defaultValue: query});
    if (input !== query) {
      query = input;
      queryCustomized = true;
    }

    term.start('搜索同步歌词(lrclib.net)');
    let records;
    try {
      records = await searchLyricsRecords({
        query,
        title,
        artist,
        duration: probe.duration,
        customized: queryCustomized,
      });
    } catch (error) {
      term.error(`歌词搜索失败: ${error.message}`);
      term.detail(NETWORK_HINT);
      return false;
    }

    const synced = filterSyncedRecords(records).slice(0, SEARCH_LIMIT);
    if (synced.length === 0) {
      term.warn(`未找到「${query}」的同步歌词`);
      if (!(await ask.confirm('换个关键词再搜?', {defaultValue: false}))) return false;
      continue;
    }

    const choice = await ask.pick(
      '选择要预览的歌词',
      synced.map((record) => formatLyricsCandidate(record, probe.duration)),
    );
    if (choice === null) return false;
    if (choice === PICK_BACK) continue;
    const picked = synced[choice.index];

    const preferred = await preferSimplifiedChineseLrc(picked.syncedLyrics);
    if (preferred.converted) term.info('中文歌词已转为简体,以下为最终保存预览');
    const entries = parseLrc(preferred.lyrics);
    for (const line of formatLrcPreview(entries)) out.write(`  ${line}\n`);
    const lrcName = `${path.basename(audio, path.extname(audio))}.lrc`;
    if (!(await ask.confirm(`歌词看起来对吗?保存为 ${lrcName}?`))) continue;

    fs.writeFileSync(path.join(folder, lrcName), preferred.lyrics, 'utf8');
    if (existingLrc && existingLrc !== lrcName) fs.rmSync(path.join(folder, existingLrc), {force: true});
    term.success(`歌词已保存: ${lrcName}`);
    term.detail(`可运行 node cli/tsuzuri.mjs lyrics ${folder} 预览完整对轴效果`);
    return true;
  }
};

const resolveFolder = (folderArg) => {
  const folder = path.resolve(folderArg);
  if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
    throw new CliError(`不是文件夹: ${folder}`);
  }
  return folder;
};

export const buildNextStepMessage = (folder, {photos, audios}) => {
  if (photos.length === 0) return '下一步:先把照片放入素材文件夹';
  if (audios.length === 1) {
    return `下一步:可运行 ${formatEquivalentCommand([folder])} 渲染`;
  }
  return null;
};

export const chooseSingleAudio = async (ask, folder, audios) => {
  const choice = await ask.pick('文件夹里有多个音频,选择要保留的一个', audios, {
    allowBack: false,
  });
  if (choice === null || choice === PICK_BACK) {
    term.warn('未选择保留项,请手动清理到一个音频;未改动任何文件');
    return audios;
  }
  const keep = audios[choice.index];
  const remove = audios.filter((audio) => audio !== keep);
  if (!(await ask.confirm(`保留 ${keep},删除其余 ${remove.length} 个音频?`, {dangerous: true}))) {
    term.warn('已取消删除,请手动清理到一个音频;未改动任何文件');
    return audios;
  }
  for (const audio of remove) fs.rmSync(path.join(folder, audio));
  term.success(`已保留唯一音频: ${keep}`);
  return [keep];
};

/** `tsuzuri fetch <folder>`:显式备料入口,任何状态可进,覆盖需确认。 */
export const runFetch = async (folderArg, {input = process.stdin, output = process.stdout} = {}) => {
  if (input === process.stdin && (!process.stdin.isTTY || !process.stdout.isTTY)) {
    throw new CliError('fetch 是交互命令,需要在交互终端中运行');
  }
  const folder = resolveFolder(folderArg);

  await withPrompts(async (ask) => {
    let {audios, lyrics} = scanFolderLoose(folder);
    let downloadedInfo = null;
    term.info(
      `当前素材 — 音频: ${audios[0] ?? '无'}${audios.length > 1 ? `(共 ${audios.length} 个,渲染前需清理到一个)` : ''} · 歌词: ${lyrics[0] ?? '无'}`,
    );

    if (audios.length > 1) {
      audios = await chooseSingleAudio(ask, folder, audios);
    } else if (audios.length === 1) {
      if (await ask.confirm(`已有 ${audios[0]},重新下载并替换?`, {dangerous: true})) {
        downloadedInfo = await audioFlow(ask, output, folder, {existing: audios[0]});
        if (downloadedInfo && lyrics.length > 0) {
          term.warn('音频已更换,现有 .lrc 时间轴可能不再匹配,建议重新搜索歌词');
        }
      }
    } else if (await ask.confirm('文件夹里没有音频,现在下载?')) {
      downloadedInfo = await audioFlow(ask, output, folder);
    }

    ({audios, lyrics} = scanFolderLoose(folder));
    if (audios.length !== 1) {
      term.info('没有唯一音频,歌词需按时长匹配,跳过歌词搜索');
      return;
    }
    if (lyrics.length > 0) {
      if (await ask.confirm(`已有 ${lyrics[0]},重新搜索并替换?`, {dangerous: true})) {
        await lyricsFlow(ask, output, folder, audios[0], {
          existingLrc: lyrics[0],
          confirmedTitle: downloadedInfo?.title,
          confirmedArtist: downloadedInfo?.artist,
        });
      }
    } else if (await ask.confirm('没有 .lrc,在线搜索同步歌词?')) {
      const saved = await lyricsFlow(ask, output, folder, audios[0], {
        confirmedTitle: downloadedInfo?.title,
        confirmedArtist: downloadedInfo?.artist,
      });
      if (!saved) term.info('未保存歌词,渲染时将用本地 Whisper 识别;之后也可手动放入 .lrc');
    }
    const nextStep = buildNextStepMessage(folder, scanFolderLoose(folder));
    if (nextStep) term.info(nextStep);
  }, {input, output});
  return 0;
};

/**
 * 渲染 / lyrics 主流程兜底:交互终端下缺什么补什么,备齐则一句话不问。
 * 用户拒绝或失败后直接返回,由随后的 scanFolder 给出既有的清晰报错。
 */
export const offerFetch = async (folder, {input = process.stdin, output = process.stdout} = {}) => {
  if (input === process.stdin && (!process.stdin.isTTY || !process.stdout.isTTY)) return;
  const {offerAudio, offerLyrics} = planOffers(scanFolderLoose(folder));
  if (!offerAudio && !offerLyrics) return;

  await withPrompts(async (ask) => {
    let downloadedInfo = null;
    if (offerAudio) {
      term.info('文件夹里没有音频');
      if (!(await ask.confirm('用 yt-dlp 搜索下载一个?', {defaultValue: false}))) {
        term.info(`之后可运行 ${formatEquivalentCommand(['fetch', folder])} 补齐`);
        return;
      }
      downloadedInfo = await audioFlow(ask, output, folder);
      if (!downloadedInfo) return;
    }
    const {audios, lyrics} = scanFolderLoose(folder);
    if (audios.length === 1 && lyrics.length === 0) {
      if (await ask.confirm('没有 .lrc,先在线搜索同步歌词吗?搜不到会用本地 Whisper')) {
        const saved = await lyricsFlow(ask, output, folder, audios[0], {
          confirmedTitle: downloadedInfo?.title,
          confirmedArtist: downloadedInfo?.artist,
        });
        if (!saved) term.info('未保存歌词,将用本地 Whisper 识别');
      }
    }
  }, {input, output});
};
