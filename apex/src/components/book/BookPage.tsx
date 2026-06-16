import React from 'react';
import { IPageContent } from '../../types/story.types';

export interface BookPageProps {
  page: IPageContent;
  folio: number;
  side: 'left' | 'right';
  title?: string;
  signedUrl?: string;
  imageAlt?: string;
}

export const BookPage: React.FC<BookPageProps> = ({
  page,
  folio,
  side,
  title,
  signedUrl,
  imageAlt,
}) => {
  return (
    <div className={`rd-page rd-page--${side}`}>
      {title ? (
        <div className="rd-page-head">
          <h3 className="rd-page-title">{title}</h3>
          <div className="rd-page-rule" aria-hidden="true" />
        </div>
      ) : (
        <div className="rd-page-head rd-page-head--empty" aria-hidden="true" />
      )}

      <div className="rd-vignette">
        {signedUrl ? (
          <img
            src={signedUrl}
            alt={imageAlt ?? title ?? 'Story illustration'}
            className="rd-vignette-img"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="rd-vignette-placeholder">{page.visualPrompt}</div>
        )}
      </div>

      <p className="rd-narration">{page.bodyText}</p>

      {page.funFact && <p className="rd-fieldnote">{page.funFact}</p>}

      <span className="rd-folio" aria-hidden="true">{folio}</span>
    </div>
  );
};
