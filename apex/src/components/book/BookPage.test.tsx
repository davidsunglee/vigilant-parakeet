import { render, screen } from '@testing-library/react';
import { BookPage } from './BookPage';
import { IPageContent } from '../../types/story.types';

const base: IPageContent = {
  index: 1,
  title: 'Meet the Animal',
  bodyText: 'The lion is a large cat.',
  visualPrompt: 'A majestic lion',
  imageUrl: 'stories/s/1.png',
  funFact: 'Lions can sleep 20 hours a day!',
  isLeftPage: true,
};

describe('BookPage', () => {
  it('renders the title, narration, fun fact, image, and folio', () => {
    render(<BookPage page={base} folio={7} title="Meet the Animal" side="left" signedUrl="https://signed/1.png" imageAlt="Lion" />);

    expect(screen.getByText('Meet the Animal')).toBeInTheDocument();
    expect(screen.getByText('The lion is a large cat.')).toBeInTheDocument();
    expect(screen.getByText('Lions can sleep 20 hours a day!')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();

    const img = screen.getByAltText('Lion');
    expect(img).toHaveAttribute('src', 'https://signed/1.png');
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveAttribute('decoding', 'async');
  });

  it('omits the title and fun fact when not provided', () => {
    const noExtras: IPageContent = { ...base, title: '', funFact: undefined };
    render(<BookPage page={noExtras} folio={8} side="right" signedUrl="https://signed/1.png" />);

    expect(screen.queryByText('Meet the Animal')).not.toBeInTheDocument();
    expect(screen.queryByText('Lions can sleep 20 hours a day!')).not.toBeInTheDocument();
  });

  it('shows the visual-prompt placeholder when no signed URL is available', () => {
    render(<BookPage page={base} folio={1} title="Meet the Animal" side="left" />);

    expect(screen.getByText('A majestic lion')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
