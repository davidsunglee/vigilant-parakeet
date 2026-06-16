import React from 'react';
import { IPageContent } from '../../types/story.types';
import { BookPage } from './BookPage';

export interface StorySpreadProps {
  title: string;
  left: IPageContent;
  right: IPageContent | null;
  leftFolio: number;
  rightFolio: number | null;
  signed: Record<string, string>;
  leftAlt?: string;
  rightAlt?: string;
}

export const StorySpread: React.FC<StorySpreadProps> = ({
  title,
  left,
  right,
  leftFolio,
  rightFolio,
  signed,
  leftAlt,
  rightAlt,
}) => {
  return (
    <div className="rd-spread">
      <BookPage
        page={left}
        folio={leftFolio}
        side="left"
        title={title}
        signedUrl={left.imageUrl ? signed[left.imageUrl] : undefined}
        imageAlt={leftAlt}
      />
      {right && (
        <BookPage
          page={right}
          folio={rightFolio ?? leftFolio + 1}
          side="right"
          signedUrl={right.imageUrl ? signed[right.imageUrl] : undefined}
          imageAlt={rightAlt}
        />
      )}
    </div>
  );
};
