import {spawnSync} from 'node:child_process';

import {FIXES} from './dependencies.mjs';
import {term} from './term.mjs';

const STAGE_DETAILS = {
  '分析音频': '具体原因见上方 analyzer 输出;首次运行需联网下载模型,网络问题可重试',
  '识别歌词': '具体原因见上方 analyzer 输出;首次运行需联网下载模型,网络问题可重试',
  '规划照片时间线': '具体原因见上方 analyzer 输出',
  '渲染视频': '具体原因见上方输出;依赖问题可先跑 tsuzuri doctor',
};

export const runCommand = (stage, cmd, args, opts = {}, spawn = spawnSync) => {
  const result = spawn(cmd, args, {stdio: 'inherit', ...opts});
  if (result.error) {
    if (result.error.code === 'ENOENT') {
      term.error(`${stage}失败: 找不到命令 ${cmd}(未安装或不在 PATH)`);
      if (FIXES[cmd]) term.detail(FIXES[cmd]);
      term.detail('运行 tsuzuri doctor 可一次检查全部依赖');
    } else {
      term.error(`${stage}失败: 无法执行 ${cmd}: ${result.error.message}`);
    }
    return 1;
  }
  if (result.status !== 0) {
    const code = result.status ?? 1;
    term.error(`${stage}失败(退出码 ${code})`);
    if (STAGE_DETAILS[stage]) term.detail(STAGE_DETAILS[stage]);
    return code;
  }
  return 0;
};

