const COLORS = {
  info: '39',
  start: '38;2;217;119;87',
  success: '32',
  warn: '33',
  error: '31',
  prompt: '36',
  dim: '2',
};

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

export const ansiEnabled = (stream, env = process.env) =>
  Boolean(stream?.isTTY) &&
  !hasOwn(env, 'NO_COLOR') &&
  String(env.TERM ?? '').toLowerCase() !== 'dumb';

/** 按 ansiEnabled 决定是否包 ANSI;交互提示与状态输出共用同一套降级判断。 */
export const paint = (kind, text, stream = process.stdout, env = process.env) =>
  ansiEnabled(stream, env) ? `\x1b[${COLORS[kind]}m${text}\x1b[0m` : text;

export const dim = (text, stream = process.stdout, env = process.env) =>
  paint('dim', text, stream, env);

/** 提问行前缀:cyan `?`,让"等输入"与"● 输出结果"一眼可分。 */
export const promptPrefix = (stream = process.stdout, env = process.env) =>
  paint('prompt', '?', stream, env);

const linesOf = (message) => {
  const lines = String(message).split(/\r?\n/);
  return lines.length > 0 ? lines : [''];
};

export const createTerminal = ({stdout = process.stdout, stderr = process.stderr, env = process.env} = {}) => {
  const emit = (kind, message, stream) => {
    const dot = ansiEnabled(stream, env) ? `\x1b[${COLORS[kind]}m●\x1b[0m` : '●';
    for (const line of linesOf(message)) stream.write(`${dot} ${line}\n`);
  };

  const detail = (message) => {
    for (const line of linesOf(message)) {
      const output = `└ ${line}`;
      stdout.write(ansiEnabled(stdout, env) ? `\x1b[2m${output}\x1b[0m\n` : `${output}\n`);
    }
  };

  return {
    info: (message) => emit('info', message, stdout),
    start: (message) => emit('start', message, stdout),
    success: (message) => emit('success', message, stdout),
    warn: (message) => emit('warn', message, stderr),
    error: (message) => emit('error', message, stderr),
    detail,
  };
};

export const term = createTerminal();
