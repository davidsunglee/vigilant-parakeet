import { render, screen } from '@testing-library/react';
import { StorySpread } from './StorySpread';
import { IPageContent } from '../../types/story.types';

const left: IPageContent = {
  index: 1, title: 'Meet the Animal', bodyText: 'The lion is a large cat.',
  visualPrompt: 'A lion', imageUrl: 'stories/s/1.png', isLeftPage: true,
};
const right: IPageContent = {
  index: 2, title: '', bodyText: 'The tiger is the largest cat.',
  visualPrompt: 'A tiger', imageUrl: 'stories/s/2.png', isLeftPage: false,
};

describe('StorySpread', () => {
  it('renders the chapter title once and both pages with their images', () => {
    render(
      <StorySpread
        title="Meet the Animal"
        left={left}
        right={right}
        leftFolio={1}
        rightFolio={2}
        signed={{ 'stories/s/1.png': 'https://signed/1.png', 'stories/s/2.png': 'https://signed/2.png' }}
        leftAlt="Lion"
        rightAlt="Tiger"
      />,
    );

    expect(screen.getByText('Meet the Animal')).toBeInTheDocument();
    expect(screen.getByText('The lion is a large cat.')).toBeInTheDocument();
    expect(screen.getByText('The tiger is the largest cat.')).toBeInTheDocument();
    expect(screen.getByAltText('Lion')).toHaveAttribute('src', 'https://signed/1.png');
    expect(screen.getByAltText('Tiger')).toHaveAttribute('src', 'https://signed/2.png');
  });
});
