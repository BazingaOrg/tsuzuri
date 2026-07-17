const quoteArg = (arg) => (/[\s"'()&]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg);

/** 从仓库运行时可直接复制执行的等效命令(含空格的路径加引号)。 */
export const formatEquivalentCommand = (argv) =>
  ['node', 'cli/tsuzuri.mjs', ...argv.map(quoteArg)].join(' ');
