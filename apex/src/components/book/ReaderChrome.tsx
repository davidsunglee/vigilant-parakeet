import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface ReaderChromeProps {
  matchup: string;
  label: string;
  position: string;
  progressPct: number;
  canPrev: boolean;
  canNext: boolean;
  onBack: () => void;
  onPrev: () => void;
  onNext: () => void;
}

export const ReaderChrome: React.FC<ReaderChromeProps> = ({
  matchup,
  label,
  position,
  progressPct,
  canPrev,
  canNext,
  onBack,
  onPrev,
  onNext,
}) => {
  return (
    <>
      <div className="rd-top">
        <button type="button" className="rd-back" onClick={onBack}>
          <ChevronLeft size={18} aria-hidden="true" /> Library
        </button>
        <div className="rd-book-title">{matchup}</div>
      </div>

      <button
        type="button"
        className="rd-nav rd-nav--prev"
        aria-label="Previous page"
        onClick={onPrev}
        disabled={!canPrev}
      >
        <ChevronLeft size={28} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="rd-nav rd-nav--next"
        aria-label="Next page"
        onClick={onNext}
        disabled={!canNext}
      >
        <ChevronRight size={28} aria-hidden="true" />
      </button>

      <div className="rd-bottom">
        {label && <div className="rd-chapter">{label}</div>}
        <div
          className="rd-track"
          role="progressbar"
          aria-valuenow={Math.round(progressPct)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="rd-fill" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="rd-position">{position}</div>
      </div>
    </>
  );
};
