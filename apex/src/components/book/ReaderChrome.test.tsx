import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReaderChrome } from './ReaderChrome';

const base = {
  matchup: 'Lion & Tiger',
  label: 'Hunting & Diet',
  position: '3 / 11',
  progressPct: 27,
  canPrev: true,
  canNext: true,
  onBack: () => {},
  onPrev: () => {},
  onNext: () => {},
};

describe('ReaderChrome', () => {
  it('renders the title, position, and progress, and wires the controls', async () => {
    const onBack = vi.fn();
    const onPrev = vi.fn();
    const onNext = vi.fn();
    render(<ReaderChrome {...base} onBack={onBack} onPrev={onPrev} onNext={onNext} />);

    expect(screen.getByText('Lion & Tiger')).toBeInTheDocument();
    expect(screen.getByText('3 / 11')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '27');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /library/i }));
    expect(onBack).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /previous page/i }));
    expect(onPrev).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /next page/i }));
    expect(onNext).toHaveBeenCalled();
  });

  it('disables the previous control at the start', () => {
    render(<ReaderChrome {...base} canPrev={false} />);
    expect(screen.getByRole('button', { name: /previous page/i })).toBeDisabled();
  });
});
