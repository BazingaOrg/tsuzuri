import {Config} from '@remotion/cli/config';

Config.setEntryPoint('src/index.ts');

// Studio 默认读取 fixture 素材;CLI 渲染时用 --public-dir 指向用户素材文件夹。
// 字体不依赖可替换的 public dir,由 webpack asset 打进 bundle。
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
