import {cancelRender, continueRender, delayRender} from 'remotion';
import notoSerifJP from './fonts/NotoSerifJP-VF.ttf';
import notoSerifSC from './fonts/NotoSerifSC-VF.ttf';
import notoSerif from './fonts/NotoSerif-VF.ttf';

// 字体随 bundle 打包(webpack asset/resource),不走 public dir——
// public dir 在 M3 由 CLI 指向用户素材文件夹,不能依赖它存放字体。

const loadFont = (family: string, url: string) => {
  if (typeof document === 'undefined') return;
  const handle = delayRender(`loading font ${family}`);
  const face = new FontFace(family, `url(${url}) format('truetype-variations')`, {
    weight: '200 900',
  });
  face
    .load()
    .then(() => {
      // 部分 TS lib.dom 版本缺 FontFaceSet.add 定义,运行时存在
      (document.fonts as unknown as {add(f: FontFace): void}).add(face);
      continueRender(handle);
    })
    .catch((err) => cancelRender(err));
};

loadFont('Noto Serif JP', notoSerifJP);
loadFont('Noto Serif SC', notoSerifSC);
loadFont('Noto Serif', notoSerif);
