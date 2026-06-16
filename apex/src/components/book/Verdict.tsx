import React, { useState } from 'react';
import { IStoryManifest, IPageContent } from '../../types/story.types';

export interface VerdictProps {
  manifest: IStoryManifest;
  outcomePage: IPageContent | null;
  signed: Record<string, string>;
}

function winnerName(manifest: IStoryManifest): string | null {
  const { winnerId } = manifest.outcome;
  if (winnerId === 'animalA') return manifest.animalA.commonName;
  if (winnerId === 'animalB') return manifest.animalB.commonName;
  return null;
}

export const Verdict: React.FC<VerdictProps> = ({ manifest, outcomePage, signed }) => {
  const [revealed, setRevealed] = useState(false);
  const { outcome } = manifest;
  const surprise = outcome.isSurpriseEnding;
  const name = winnerName(manifest);
  const artUrl = outcomePage?.imageUrl ? signed[outcomePage.imageUrl] : undefined;

  return (
    <div className={`rd-verdict ${surprise ? 'rd-verdict--surprise' : ''}`}>
      {artUrl && (
        <img src={artUrl} alt="The outcome" className="rd-verdict-img" loading="lazy" decoding="async" />
      )}
      <div className="rd-verdict-scrim" aria-hidden="true" />

      <div className="rd-verdict-cartouche">
        <div className="rd-verdict-kicker">The Verdict</div>

        {!revealed ? (
          <button
            type="button"
            className="rd-verdict-seal rd-verdict-seal--sealed"
            onClick={() => setRevealed(true)}
          >
            <span className="rd-verdict-seal-mark" aria-hidden="true">&#10022;</span>
            <span className="rd-verdict-seal-label">The verdict is in. Break the seal.</span>
          </button>
        ) : surprise ? (
          <>
            <div className="rd-verdict-seal rd-verdict-seal--surprise">
              <span className="rd-verdict-star" aria-hidden="true">&#10022;</span>
              <span className="rd-verdict-twist">An Unexpected Turn</span>
            </div>
            <span className="rd-verdict-stamp">{outcome.endingType}</span>
            <p className="rd-verdict-reason">{outcome.logicalReasoning}</p>
          </>
        ) : (
          <>
            <div className="rd-verdict-seal rd-verdict-seal--victor">
              <span className="rd-verdict-victor-label">Victor</span>
              <span className="rd-verdict-victor-name">{name}</span>
            </div>
            <p className="rd-verdict-reason">{outcome.logicalReasoning}</p>
          </>
        )}
      </div>
    </div>
  );
};
