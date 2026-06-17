import { render, screen } from '@testing-library/react';
import { Showdown } from './Showdown';
import { IPageContent } from '../../types/story.types';

const page: IPageContent = {
  index: 31,
  title: 'The Showdown',
  bodyText: 'They face off!',
  visualPrompt: 'Both animals staring',
  imageUrl: 'stories/s/31.png',
  isLeftPage: true,
};

describe('Showdown', () => {
  it('renders the art on top and the intro text in the panel below', () => {
    render(<Showdown page={page} signed={{ 'stories/s/31.png': 'https://signed/31.png' }} />);

    const img = screen.getByAltText('The showdown');
    expect(img).toHaveAttribute('src', 'https://signed/31.png');
    expect(img.closest('.rd-hero-art')).not.toBeNull();
    expect(screen.getByText('They face off!').closest('.rd-hero-panel')).not.toBeNull();
    expect(screen.getByText('The Showdown')).toBeInTheDocument();
  });

  it('renders without an image when no signed URL is available', () => {
    render(<Showdown page={page} signed={{}} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('They face off!')).toBeInTheDocument();
  });
});
