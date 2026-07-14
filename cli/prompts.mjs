import readline from 'node:readline';

export const PICK_BACK = Symbol('pick-back');

const isYes = (answer) => /^y(es)?$/i.test(String(answer ?? '').trim());
const isNo = (answer) => /^n(o)?$/i.test(String(answer ?? '').trim());

/**
 * 共享交互问答层。SIGINT 与输入流提前关闭都按用户放弃处理,退出码为 130。
 * fn 收到的 ask 提供 confirm / pick / line 三种固定语义的问答。
 */
export const withPrompts = async (
  fn,
  {input = process.stdin, output = process.stdout} = {},
) => {
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
  const question = (prompt) => new Promise((resolve) => rl.question(prompt, resolve));

  const ask = {
    async confirm(text, {dangerous = false, defaultValue = !dangerous} = {}) {
      const suffix = defaultValue ? '[Y/n,回车=是]' : '[y/N,回车=否]';
      const answer = (await question(`${text} ${suffix} `)).trim();
      if (!answer) return defaultValue;
      return isYes(answer) ? true : isNo(answer) ? false : defaultValue;
    },

    async pick(text, items, {allowBack = true} = {}) {
      for (const [index, item] of items.entries()) {
        output.write(`  ${index + 1}. ${item}\n`);
      }
      for (;;) {
        const answer = (
          await question(
            `${text} [1-${items.length}],${allowBack ? '0 返回上一步,' : ''}回车放弃: `,
          )
        ).trim();
        if (!answer) return null;
        if (allowBack && answer === '0') return PICK_BACK;
        if (/^\d+$/.test(answer)) {
          const index = Number(answer) - 1;
          if (index >= 0 && index < items.length) return {index, item: items[index]};
        }
        output.write(
          `无效选择,请输入 1-${items.length},${allowBack ? '0 返回上一步,或' : '或'}回车放弃\n`,
        );
      }
    },

    async line(text, {defaultValue, validate} = {}) {
      const hasDefault = defaultValue !== undefined && defaultValue !== null;
      const prompt = `${text}${hasDefault ? ` [${defaultValue}]` : ''}: `;
      for (;;) {
        const answer = (await question(prompt)).trim();
        const value = answer || (hasDefault ? String(defaultValue) : '');
        const result = validate ? await validate(value) : true;
        if (result === true || result === undefined) return value;
        output.write(`${typeof result === 'string' ? result : '输入无效'}\n`);
      }
    },
  };

  try {
    return await fn(ask);
  } finally {
    finished = true;
    rl.close();
  }
};
