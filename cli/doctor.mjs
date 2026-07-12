/**
 * tsuzuri doctor — <2s 依赖预检,不联网、不触发 `uv sync`(那可能很慢)。
 */

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {term} from './term.mjs';
import {FIXES} from './dependencies.mjs';

export {FIXES} from './dependencies.mjs';

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const nodeCheck = () => {
  const major = Number(process.version.slice(1).split('.')[0]);
  if (Number.isFinite(major) && major >= 18) {
    return {ok: true, line: `node ${process.version} 可用`};
  }
  return {
    ok: false,
    line: `node 版本过低: ${process.version}(需要 >= 18)`,
    fix: '安装 Node 18+ (https://nodejs.org)',
  };
};

const commandCheck = (label, cmd, args, {versionRegex, fix}) => {
  const r = spawnSync(cmd, args, {encoding: 'utf8'});
  if (r.error || r.status !== 0) {
    return {ok: false, line: `${label} 未找到`, fix};
  }
  const text = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const match = versionRegex.exec(text);
  const version = match ? match[1] : text.trim().split('\n')[0];
  return {ok: true, line: `${label} ${version}`};
};

const uvCheck = () =>
  commandCheck('uv', 'uv', ['--version'], {
    versionRegex: /uv (\S+)/,
    fix: FIXES.uv,
  });

const ffmpegCheck = () =>
  commandCheck('ffmpeg', 'ffmpeg', ['-version'], {
    versionRegex: /ffmpeg version (\S+)/,
    fix: FIXES.ffmpeg,
  });

const rendererCheck = (repo) => {
  const dir = path.join(repo, 'renderer', 'node_modules', '@remotion', 'renderer');
  if (fs.existsSync(dir)) {
    return {ok: true, line: '渲染器依赖已安装'};
  }
  return {ok: false, line: '渲染器依赖未安装', fix: FIXES.renderer};
};

/** 分析器 Python 环境:仅提示,从不判定失败(uv 会在首次运行时自动构建)。 */
const reportAnalyzerEnv = (repo) => {
  const venv = path.join(repo, 'analyzer', '.venv');
  if (fs.existsSync(venv)) {
    term.success('analyzer 环境已就绪');
  } else {
    term.info('analyzer 环境将在首次运行时由 uv 自动构建');
  }
};

export const runDoctor = ({repo = REPO} = {}) => {
  const checks = [nodeCheck(), uvCheck(), ffmpegCheck(), rendererCheck(repo)];

  let hasFailure = false;
  for (const check of checks) {
    if (check.ok) {
      term.success(check.line);
    } else {
      hasFailure = true;
      term.error(check.line);
      term.detail(check.fix);
    }
  }
  reportAnalyzerEnv(repo);

  return hasFailure ? 1 : 0;
};
