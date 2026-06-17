import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Verdict } from './Verdict';
import { createMockStory, createMockStoryWithSurprise } from '../../test/fixtures';

describe('Verdict', () => {
  it('hides the winner until the seal is broken, then names the victor with no stamp', async () => {
    const manifest = createMockStory();
    render(<Verdict manifest={manifest} outcomePage={null} signed={{}} />);

    expect(screen.queryByText('Lion')).not.toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole('button', { name: /break the seal/i }));

    expect(screen.getByText('Lion')).toBeInTheDocument();
    expect(screen.getByText('The lion wins due to superior teamwork.')).toBeInTheDocument();
    expect(screen.queryByText('Standard Victory')).not.toBeInTheDocument();
  });

  it('shows the outcome art on top with the verdict text in the panel below', async () => {
    const manifest = createMockStory();
    const outcomePage = {
      index: 32, title: 'Outcome', bodyText: '', visualPrompt: '',
      imageUrl: 'stories/s/32.png', isLeftPage: false,
    };
    render(<Verdict manifest={manifest} outcomePage={outcomePage} signed={{ 'stories/s/32.png': 'https://signed/32.png' }} />);

    const img = screen.getByAltText('The outcome');
    expect(img).toHaveAttribute('src', 'https://signed/32.png');
    expect(img.closest('.rd-hero-art')).not.toBeNull();

    await userEvent.setup().click(screen.getByRole('button', { name: /break the seal/i }));
    expect(screen.getByText('The lion wins due to superior teamwork.').closest('.rd-hero-panel')).not.toBeNull();
  });

  it('reframes a surprise ending as a twist with the ending-type stamp and no victor', async () => {
    const manifest = createMockStoryWithSurprise();
    render(<Verdict manifest={manifest} outcomePage={null} signed={{}} />);

    await userEvent.setup().click(screen.getByRole('button', { name: /break the seal/i }));

    expect(screen.queryByText(/^victor$/i)).not.toBeInTheDocument();
    expect(screen.getByText('External Event')).toBeInTheDocument();
    expect(screen.getByText('An earthquake interrupted the battle.')).toBeInTheDocument();
    expect(screen.getByText(/unexpected turn/i)).toBeInTheDocument();
  });
});
