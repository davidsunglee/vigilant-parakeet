import type { StoryProgress, StoryStatus } from '../../types/story.types';

export interface ProgressView {
  phase: StoryProgress['phase'] | 'ready' | 'failed';
  label: string;
  pct: number;
  page?: number;
  total?: number;
}

const PHASE_PCT: Record<Exclude<StoryProgress['phase'], 'illustrating'>, number> = {
  queued: 0,
  researching: 5,
  designing: 10,
  simulating: 15,
  binding: 98,
};

const PHASE_LABEL: Record<StoryProgress['phase'], string> = {
  queued: 'Queued',
  researching: 'Studying the contenders',
  designing: 'Drawing the plates',
  simulating: 'Staging the showdown',
  illustrating: 'Printing the pages',
  binding: 'Binding the book',
};

/**
 * The single home for generation-progress wording. Maps the canonical row state
 * (status + progress) to the on-brand beat label, the derived percent for the
 * bar and aria-valuenow, and the page count while illustrating.
 */
export function describeProgress(
  status: StoryStatus,
  progress: StoryProgress | null,
): ProgressView {
  if (status === 'ready') return { phase: 'ready', label: 'Hot off the press', pct: 100 };
  if (status === 'failed') return { phase: 'failed', label: 'The press jammed', pct: 0 };

  const p: StoryProgress = progress ?? { phase: 'queued' };

  if (p.phase === 'illustrating') {
    const total = p.total > 0 ? p.total : 1;
    const pct = Math.min(95, Math.round(25 + (p.page / total) * 70));
    return { phase: 'illustrating', label: PHASE_LABEL.illustrating, pct, page: p.page, total: p.total };
  }

  return { phase: p.phase, label: PHASE_LABEL[p.phase], pct: PHASE_PCT[p.phase] };
}
