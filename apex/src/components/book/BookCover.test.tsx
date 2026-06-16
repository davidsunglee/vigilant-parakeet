import { render, screen } from '@testing-library/react';
import { BookCover } from './BookCover';
import { createMockStory } from '../../test/fixtures';

describe('BookCover', () => {
  it('renders the matchup, the question, the kicker, and the cover image', () => {
    const manifest = createMockStory({ coverImageUrl: 'stories/s/cover.png' });
    render(<BookCover manifest={manifest} signed={{ 'stories/s/cover.png': 'https://signed/cover.png' }} />);

    expect(screen.getByText('Who Would Win?')).toBeInTheDocument();
    expect(screen.getByText('An Apex Publication')).toBeInTheDocument();
    expect(screen.getByText('Lion')).toBeInTheDocument();
    expect(screen.getByText('Tiger')).toBeInTheDocument();

    const img = screen.getByAltText('Lion versus Tiger');
    expect(img).toHaveAttribute('src', 'https://signed/cover.png');
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveAttribute('decoding', 'async');
  });

  it('renders without an image when the manifest has no cover', () => {
    const manifest = createMockStory({ coverImageUrl: undefined });
    render(<BookCover manifest={manifest} signed={{}} />);

    expect(screen.getByText('Who Would Win?')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
