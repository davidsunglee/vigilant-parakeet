import React from 'react';
import { IPageContent } from '../../types/story.types';

export interface ShowdownProps {
  page: IPageContent;
  signed: Record<string, string>;
}

export const Showdown: React.FC<ShowdownProps> = ({ page, signed }) => {
  const url = page.imageUrl ? signed[page.imageUrl] : undefined;

  return (
    <div className="rd-hero rd-hero--showdown">
      <div className="rd-hero-art">
        {url && <img src={url} alt="The showdown" loading="lazy" decoding="async" />}
      </div>
      <div className="rd-hero-panel rd-showdown-panel">
        <span className="rd-showdown-kicker">The Showdown</span>
        <p className="rd-showdown-text">{page.bodyText}</p>
      </div>
    </div>
  );
};
