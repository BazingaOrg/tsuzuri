import readline from 'node:readline';

export const PICK_BACK = Symbol('pick-back');
export const GLOBAL_PROMPT_HELP = '全局: 回车执行默认动作 · 0 返回(可用时) · q 退出 · Ctrl+C 中断';

export class PromptAbortError extends Error {
  constructor() {
    super('用户取消');
    this.name = 'PromptAbortError';
    this.exitCode = 130;
  }
}

export class PromptQuitError extends Error {
  constructor() {
    super('用户退出');
    this.name = 'PromptQuitError';
    this.exitCode = 0;
  }
}

export const writeGlobalPromptHelp = (output = process.stdout) => {
  output.write(`${GLOBAL_PROMPT_HELP}\n`);
};

const isQuit = (answer) => String(answer ?? '').trim().toLowerCase() === 'q';

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
  let abortError = null;
  let rejectQuestion = null;
  const abort = () => {
    if (finished || abortError) return;
    abortError = new PromptAbortError();
    output.write('\n');
    rejectQuestion?.(abortError);
    rl.close();
  };
  rl.on('SIGINT', abort);
  rl.on('close', () => {
    if (!finished) abort();
  });
  const question = (prompt) => {
    if (abortError) return Promise.reject(abortError);
    return new Promise((resolve, reject) => {
      rejectQuestion = reject;
      rl.question(prompt, (answer) => {
        rejectQuestion = null;
        resolve(answer);
      });
    });
  };

  const ask = {
    async confirm(
      text,
      {
        defaultValue = true,
        defaultLabel = defaultValue ? '确认' : '取消',
        alternateKey = defaultValue ? 'n' : 'y',
        alternateLabel = defaultValue ? '取消' : '执行',
      } = {},
    ) {
      for (;;) {
        const answer = (await question(
          `${text} [回车${defaultLabel},${alternateKey}=${alternateLabel}]: `,
        )).trim();
        if (isQuit(answer)) throw new PromptQuitError();
        if (!answer) return defaultValue;
        if (answer.toLowerCase() === alternateKey.toLowerCase()) return !defaultValue;
        output.write(`无效输入,请直接回车${defaultLabel},或输入 ${alternateKey} ${alternateLabel}\n`);
      }
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
        if (isQuit(answer)) throw new PromptQuitError();
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

    async line(
      text,
      {defaultValue, validate, allowBack = false, allowQuit = true, enterLabel} = {},
    ) {
      const hasDefault = defaultValue !== undefined && defaultValue !== null;
      const actions = [];
      if (hasDefault) actions.push(`回车${enterLabel ?? '使用默认值'}`);
      if (allowBack) actions.push('0 返回');
      const prompt = `${text}${hasDefault ? ` [${defaultValue}]` : ''}` +
        `${actions.length > 0 ? ` · ${actions.join(' · ')}` : ''}: `;
      for (;;) {
        const answer = (await question(prompt)).trim();
        if (allowQuit && isQuit(answer)) throw new PromptQuitError();
        if (allowBack && answer === '0') return PICK_BACK;
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
