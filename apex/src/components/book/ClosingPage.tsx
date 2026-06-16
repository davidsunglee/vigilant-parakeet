import React from 'react';
import { IStoryManifest } from '../../types/story.types';

export interface ClosingPageProps {
  manifest: IStoryManifest;
  onReadAgain: () => void;
  onClose: () => void;
}

function formatMonthYear(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export const ClosingPage: React.FC<ClosingPageProps> = ({ manifest, onReadAgain, onClose }) => {
  const a = manifest.animalA.commonName;
  const b = manifest.animalB.commonName;

  return (
    <div className="rd-closing">
      <div className="rd-closing-emblem" aria-hidden="true">&amp;</div>
      <div className="rd-closing-end">The End</div>
      <div className="rd-closing-rule" aria-hidden="true" />
      <div className="rd-closing-colophon">
        <span className="rd-closing-kicker">An Apex Publication</span>
        <span>{a} &amp; {b}</span>
        <span>Conjured {formatMonthYear(manifest.metadata.createdAt)}</span>
      </div>
      <div className="rd-closing-actions">
        <button type="button" className="rd-closing-act rd-closing-act--primary" onClick={onReadAgain}>
          Read it again
        </button>
        <button type="button" className="rd-closing-act rd-closing-act--ghost" onClick={onClose}>
          Back to the Reading Room
        </button>
      </div>
    </div>
  );
};
