import { render, screen, within } from '@testing-library/react';
import { TaleOfTheTape } from './TaleOfTheTape';
import { createMockStory } from '../../test/fixtures';

describe('TaleOfTheTape', () => {
  it('renders the header, both names, the available stat values, and the edge rows', () => {
    const { container } = render(<TaleOfTheTape manifest={createMockStory()} />);

    expect(screen.getByText('Tale of the Tape')).toBeInTheDocument();

    // Names appear in the contender header (they also recur in the tally below).
    const vs = container.querySelector('.rd-tape-vs') as HTMLElement;
    expect(within(vs).getByText('Lion')).toBeInTheDocument();
    expect(within(vs).getByText('Tiger')).toBeInTheDocument();

    // Stat values (the fixture has weight, length, speed for both).
    expect(screen.getByText('190 kg')).toBeInTheDocument();
    expect(screen.getByText('220 kg')).toBeInTheDocument();
    expect(screen.getByText('80 km/h')).toBeInTheDocument();

    // Edge rows from the checklist (Speed favours A, Strength favours B).
    expect(screen.getByText('Speed')).toBeInTheDocument();
    expect(screen.getByText('Strength')).toBeInTheDocument();
    expect(container.querySelectorAll('.rd-tape-dot')).toHaveLength(2);
  });

  it('tallies the checklist advantages for each animal', () => {
    render(<TaleOfTheTape manifest={createMockStory()} />);
    // One edge each => 1 and 1.
    const tally = screen.getByText('on paper').closest('.rd-tape-score');
    expect(tally).toHaveTextContent('Lion');
    expect(tally).toHaveTextContent('Tiger');
    expect(tally?.textContent).toMatch(/1/);
  });
});
