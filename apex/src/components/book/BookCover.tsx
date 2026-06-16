import React from 'react';
import { IStoryManifest } from '../../types/story.types';

export interface BookCoverProps {
  manifest: IStoryManifest;
  signed: Record<string, string>;
}

export const BookCover: React.FC<BookCoverProps> = ({ manifest, signed }) => {
  const coverUrl = manifest.coverImageUrl ? signed[manifest.coverImageUrl] : undefined;
  const a = manifest.animalA.commonName;
  const b = manifest.animalB.commonName;

  return (
    <div className="rd-cover">
      {coverUrl && (
        <img
          src={coverUrl}
          alt={`${a} versus ${b}`}
          className="rd-cover-img"
          loading="lazy"
          decoding="async"
        />
      )}
      <div className="rd-cover-scrim" aria-hidden="true" />
      <div className="rd-cover-kicker">An Apex Publication</div>
      <div className="rd-cover-cartouche">
        <div className="rd-cover-emblem" aria-hidden="true">&amp;</div>
        <div className="rd-cover-q">Who Would Win?</div>
        <div className="rd-cover-match">
          <span className="rd-cover-name">{a}</span>
          <span className="rd-cover-amp" aria-hidden="true">&amp;</span>
          <span className="rd-cover-name">{b}</span>
        </div>
      </div>
    </div>
  );
};
