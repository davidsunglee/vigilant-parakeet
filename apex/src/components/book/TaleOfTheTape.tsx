import React from 'react';
import { IStoryManifest, IBiologicalStats } from '../../types/story.types';

const STAT_ROWS: { label: string; key: keyof IBiologicalStats }[] = [
  { label: 'Weight', key: 'weight' },
  { label: 'Length', key: 'length' },
  { label: 'Top Speed', key: 'speed' },
  { label: 'Weapons', key: 'weaponry' },
  { label: 'Armor', key: 'armor' },
  { label: 'Brains', key: 'brainSize' },
];

export interface TaleOfTheTapeProps {
  manifest: IStoryManifest;
}

export const TaleOfTheTape: React.FC<TaleOfTheTapeProps> = ({ manifest }) => {
  const a = manifest.animalA;
  const b = manifest.animalB;

  const statRows = STAT_ROWS
    .map((r) => ({ label: r.label, aVal: a.stats[r.key], bVal: b.stats[r.key] }))
    .filter((r) => r.aVal && r.bVal);

  const edges = manifest.checklist.items;
  const aScore = edges.filter((i) => i.animalAAdvantage).length;
  const bScore = edges.filter((i) => i.animalBAdvantage).length;

  return (
    <div className="rd-tape">
      <div className="rd-tape-head">
        <div className="rd-tape-kicker">Before the Verdict</div>
        <h2 className="rd-tape-title">Tale of the Tape</h2>
        <div className="rd-tape-rule" aria-hidden="true" />
      </div>

      <div className="rd-tape-vs">
        <div className="rd-tape-fighter">
          <span className="rd-tape-medal" aria-hidden="true">{a.commonName.charAt(0)}</span>
          <b>{a.commonName}</b>
        </div>
        <span className="rd-tape-amp" aria-hidden="true">&amp;</span>
        <div className="rd-tape-fighter">
          <span className="rd-tape-medal" aria-hidden="true">{b.commonName.charAt(0)}</span>
          <b>{b.commonName}</b>
        </div>
      </div>

      <div className="rd-tape-rows">
        {statRows.map((r) => (
          <div className="rd-tape-row" key={r.label}>
            <span className="rd-tape-val rd-tape-val--l">{r.aVal}</span>
            <span className="rd-tape-trait">{r.label}</span>
            <span className="rd-tape-val rd-tape-val--r">{r.bVal}</span>
          </div>
        ))}
        {edges.map((item, i) => (
          <div className="rd-tape-row rd-tape-row--edge" key={`edge-${i}`}>
            <span className="rd-tape-val rd-tape-val--l">
              {item.animalAAdvantage && <span className="rd-tape-dot" aria-hidden="true" />}
            </span>
            <span className="rd-tape-trait">{item.traitName}</span>
            <span className="rd-tape-val rd-tape-val--r">
              {item.animalBAdvantage && <span className="rd-tape-dot" aria-hidden="true" />}
            </span>
          </div>
        ))}
      </div>

      <div className="rd-tape-tally">
        <div className="rd-tape-score">
          <span>{a.commonName} <strong>{aScore}</strong></span>
          <span className="rd-tape-sep">on paper</span>
          <span><strong className="rd-tape-mute">{bScore}</strong> {b.commonName}</span>
        </div>
        <p className="rd-tape-teaser">Yet the wild keeps its own counsel.</p>
      </div>
    </div>
  );
};
