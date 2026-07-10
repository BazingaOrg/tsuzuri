import {Config} from '@remotion/cli/config';

Config.setEntryPoint('src/index.ts');

// 开发/验收默认指向 M0 fixture;M3 起 CLI 用 --public-dir 指向用户素材文件夹。
// 字体不放 public dir(会被覆盖),走 webpack asset 打进 bundle。
Config.setPublicDir('../examples/fixture');

Config.overrideWebpackConfig((config) => ({
  ...config,
  module: {
    ...config.module,
    rules: [
      ...(config.module?.rules ?? []),
      {test: /\.(ttf|otf|woff2?)$/, type: 'asset/resource'},
    ],
  },
}));
