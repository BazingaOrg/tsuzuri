import {cancelRender, continueRender, delayRender} from 'remotion';
import notoSerifJP from './fonts/NotoSerifJP-VF.ttf';
import notoSerifSC from './fonts/NotoSerifSC-VF.ttf';
import notoSerif from './fonts/NotoSerif-VF.ttf';

// 字体随 bundle 打包(webpack asset/resource),不走 public dir——
// CLI 渲染时 public dir 指向用户素材文件夹,不能依赖它存放字体。

const loadFont = (family: string, url: string, descriptors?: FontFaceDescriptors, format = 'truetype-variations') => {
  if (typeof document === 'undefined') return;
  // CJK 变量字体 13–25MB,渲染多页并发时解析可能远超默认 30s 超时
  const handle = delayRender(`loading font ${family}`, {
    timeoutInMilliseconds: 180_000,
    retries: 2,
  });
  const face = new FontFace(family, `url(${url}) format('${format}')`, descriptors);
  face
    .load()
    .then(() => {
      // 部分 TS lib.dom 版本缺 FontFaceSet.add 定义,运行时存在
      (document.fonts as unknown as {add(f: FontFace): void}).add(face);
      continueRender(handle);
    })
    .catch((err) => cancelRender(err));
};

loadFont('Noto Serif JP', notoSerifJP, {weight: '200 900'});
loadFont('Noto Serif SC', notoSerifSC, {weight: '200 900'});
loadFont('Noto Serif', notoSerif, {weight: '200 900'});
