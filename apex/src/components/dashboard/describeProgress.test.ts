import { describe, it, expect } from 'vitest';
import { describeProgress } from './describeProgress';

describe('describeProgress', () => {
  it('maps the warmup phases to their beats and percents', () => {
    expect(describeProgress('generating', { phase: 'queued' })).toMatchObject({ label: 'Queued', pct: 0 });
    expect(describeProgress('generating', { phase: 'researching' })).toMatchObject({ label: 'Studying the contenders', pct: 5 });
    expect(describeProgress('generating', { phase: 'designing' })).toMatchObject({ label: 'Drawing the plates', pct: 10 });
    expect(describeProgress('generating', { phase: 'simulating' })).toMatchObject({ label: 'Staging the showdown', pct: 15 });
    expect(describeProgress('generating', { phase: 'binding' })).toMatchObject({ label: 'Binding the book', pct: 98 });
  });

  it('ramps the illustrating percent with page/total and exposes the count', () => {
    expect(describeProgress('generating', { phase: 'illustrating', page: 0, total: 14 })).toMatchObject({ label: 'Printing the pages', pct: 25, page: 0, total: 14 });
    expect(describeProgress('generating', { phase: 'illustrating', page: 7, total: 14 }).pct).toBe(60);
    expect(describeProgress('generating', { phase: 'illustrating', page: 14, total: 14 }).pct).toBe(95);
  });

  it('treats null progress as queued', () => {
    expect(describeProgress('generating', null)).toMatchObject({ label: 'Queued', pct: 0 });
  });

  it('maps terminal states from status', () => {
    expect(describeProgress('ready', null)).toMatchObject({ phase: 'ready', label: 'Hot off the press', pct: 100 });
    expect(describeProgress('failed', null)).toMatchObject({ phase: 'failed', label: 'The press jammed' });
  });
});
