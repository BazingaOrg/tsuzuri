import React from 'react';
import {Img} from 'remotion';
import {PHOTO, getPhotoShadow} from './theme';

/**
 * 展陈框照片:Img + 1px 描边 + 三层阴影。视频 Photo 与 still 共用,视觉只改一处。
 */
export const FramedPhoto: React.FC<{
  src: string;
  maxWidth: number;
  maxHeight: number;
  /** height/1080,阴影与描边等比缩放 */
  renderScale: number;
}> = ({src, maxWidth, maxHeight, renderScale}) => {
  const outlineWidth = PHOTO.outlineWidth * renderScale;
  const boxShadow = React.useMemo(() => getPhotoShadow(renderScale), [renderScale]);

  return (
    <Img
      src={src}
      style={{
        maxWidth,
        maxHeight,
        width: 'auto',
        height: 'auto',
        boxShadow,
        outline: `${outlineWidth}px solid ${PHOTO.outlineColor}`,
        outlineOffset: `${-outlineWidth}px`,
      }}
    />
  );
};
