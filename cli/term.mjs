const COLORS = {
  info: '39',
  start: '38;2;217;119;87',
  success: '32',
  warn: '33',
  error: '31',
};

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

export const ansiEnabled = (stream, env = process.env) =>
  Boolean(stream?.isTTY) &&
  !hasOwn(env, 'NO_COLOR') &&
  String(env.TERM ?? '').toLowerCase() !== 'dumb';

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
