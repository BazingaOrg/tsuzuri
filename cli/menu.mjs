/**
 * tsuzuri 裸命令交互菜单:数字 + 回车,只在 TTY 且零参数时进入(入口判断在
 * tsuzuri.mjs)。菜单只组装 argv 交回 parseArgs,与命令行走同一条代码路径;
 * 执行前回显等效命令,用一次菜单就能学会直达写法。
 */

import os from 'node:os';
import readline from 'node:readline';

import {term} from './term.mjs';

export const MENU_ITEMS = [
  {key: '1', label: '渲染相册视频', pathPrompt: '素材文件夹'},
  {key: '2', label: '导出静态作品图(still)', pathPrompt: '照片或文件夹'},
  {key: '3', label: '预览歌词识别(lyrics)', pathPrompt: '素材文件夹'},
  {key: '4', label: '检查依赖(doctor)', pathPrompt: null},
];

/**
 * 规整拖拽/手输路径。macOS 拖拽会反斜杠转义空格与括号(`My\ Photos`),
 * Windows 拖拽会整体带引号(`"C:\Users\me\My Photos"`);Windows 路径分隔符
 * `\` 后面只会跟字母数字,不会命中"反斜杠 + 特殊字符"的反转义规则。
 */
export const normalizeDroppedPath = (input) => {
  let s = String(input ?? '').trim();
  if (
    s.length >= 2 &&
    ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))
  ) {
    s = s.slice(1, -1).trim();
  }
  s = s.replace(/\\([^A-Za-z0-9_\\])/g, '$1');
  if (s === '~' || s.startsWith('~/')) {
    s = os.homedir() + s.slice(1);
  }
  return s;
};

export const isYes = (answer) => /^y(es)?$/i.test(String(answer ?? '').trim());

/** 由菜单选择组装 argv,与命令行同一语义;未知选择返回 null。 */
export const buildArgvFromChoices = ({choice, target, exif = false, sign = false, dark = false}) => {
  if (choice === '1') return [target];
  if (choice === '2') {
    const argv = ['still', target];
    if (exif) argv.push('--exif');
    if (sign) argv.push('--sign');
    if (dark) argv.push('--dark');
    return argv;
  }
  if (choice === '3') return ['lyrics', target];
  if (choice === '4') return ['doctor'];
  return null;
};

const quoteArg = (arg) => (/[\s"'()&]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg);

/** 从仓库运行时可直接复制执行的等效命令(含空格的路径加引号)。 */
export const formatEquivalentCommand = (argv) =>
  ['node', 'cli/tsuzuri.mjs', ...argv.map(quoteArg)].join(' ');

/**
 * 交互层:问答收集选择,返回 argv 数组。Windows 上 readline 接管 stdin 后
 * Ctrl+C 经由 rl 的 SIGINT 事件而非进程信号,必须在 rl 上监听才能退出。
 */
export const runMenu = async ({input = process.stdin, output = process.stdout} = {}) => {
  const rl = readline.createInterface({input, output});
  let finished = false;
  const abort = () => {
    output.write('\n');
    process.exit(130);
  };
  rl.on('SIGINT', abort);
  rl.on('close', () => {
    if (!finished) abort();
  });
  const ask = (prompt) => new Promise((resolve) => rl.question(prompt, resolve));

  try {
    term.info('tsuzuri — 把照片和一首歌缀成影像日记');
    output.write('\n');
    for (const item of MENU_ITEMS) output.write(`  ${item.key}. ${item.label}\n`);
    output.write('\n');

    let item;
    for (;;) {
      const choice = (await ask('输入序号 [1-4] 后回车，Ctrl+C 退出: ')).trim();
      item = MENU_ITEMS.find((i) => i.key === choice);
      if (item) break;
    }

    let target = null;
    if (item.pathPrompt) {
      for (;;) {
        target = normalizeDroppedPath(
          await ask(`输入${item.pathPrompt}路径，或拖入后回车: `),
        );
        if (target) break;
      }
    }

    let exif = false;
    let sign = false;
    let dark = false;
    if (item.key === '2') {
      exif = isYes(await ask('显示 EXIF 拍摄信息? [y/N，回车=否] '));
      sign = isYes(await ask('加入签名落款? [y/N，回车=否] '));
      dark = isYes(await ask('使用黑色背景（暗色展陈）? [y/N，回车=否] '));
    }

    const argv = buildArgvFromChoices({choice: item.key, target, exif, sign, dark});
    term.detail(`等效命令: ${formatEquivalentCommand(argv)}`);
    if (item.key !== '4') {
      term.detail('进阶配置(分辨率/过渡/字幕/背景…)见素材夹 tsuzuri.toml,参考 docs/config.md');
    }
    return argv;
  } finally {
    finished = true;
    rl.close();
  }
};
