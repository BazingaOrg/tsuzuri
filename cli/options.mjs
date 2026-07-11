export class CliError extends Error {}

export const USAGE =
  '用法:\n' +
  '  tsuzuri <folder> [-o out.mp4]   渲染相册视频(默认命令)\n' +
  '  tsuzuri doctor                  检查依赖是否就绪\n' +
  '  tsuzuri lyrics <folder>         只识别歌词并预览(不渲染)\n' +
  '  tsuzuri help                    显示本说明(同 -h / --help)\n' +
  '目录约定:文件夹内放照片(jpg/png/webp)+ 唯一的音频文件(mp3 等)\n' +
  '若文件夹名恰好叫 doctor / lyrics / help,用路径前缀转义,如 tsuzuri ./lyrics';

const parseRenderArgs = (argv) => {
  const args = {command: 'render', folder: null, output: null};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '-o' || argv[i] === '--output') {
      if (i + 1 >= argv.length || argv[i + 1].startsWith('-')) {
        throw new CliError(`${argv[i]} 需要输出文件路径`);
      }
      args.output = argv[++i];
    } else if (!args.folder) {
      args.folder = argv[i];
    } else {
      throw new CliError(`未知参数: ${argv[i]}(用法: tsuzuri <folder> [-o out.mp4])`);
    }
  }
  if (!args.folder) {
    throw new CliError(USAGE);
  }
  return args;
};

const parseDoctorArgs = (rest) => {
  if (rest.length > 0) {
    throw new CliError(`doctor 不接受额外参数: ${rest.join(' ')}\n用法: tsuzuri doctor`);
  }
  return {command: 'doctor'};
};

const parseLyricsArgs = (rest) => {
  const args = {command: 'lyrics', folder: null};
  for (const token of rest) {
    if (token === '-o' || token === '--output') {
      throw new CliError('lyrics 不支持 -o(只在终端预览,不生成文件)\n用法: tsuzuri lyrics <folder>');
    }
    if (!args.folder) {
      args.folder = token;
    } else {
      throw new CliError(`未知参数: ${token}(用法: tsuzuri lyrics <folder>)`);
    }
  }
  if (!args.folder) {
    throw new CliError('用法: tsuzuri lyrics <folder>');
  }
  return args;
};

/**
 * A leading token exactly equal to `doctor`, `lyrics` or `help` is always the verb.
 * Any path-qualified token (`./lyrics`, `/abs/path`, ...) is not a bare verb
 * string, so it never matches here and falls through to the render command —
 * that's the escape hatch for a folder that happens to be named after a verb.
 */
export const parseArgs = (argv) => {
  const [first, ...rest] = argv;
  if (first === 'doctor') return parseDoctorArgs(rest);
  if (first === 'lyrics') return parseLyricsArgs(rest);
  if (first === 'help' || first === '-h' || first === '--help') return {command: 'help'};
  return parseRenderArgs(argv);
};
