import { useState, lazy, Suspense } from 'react';
import { Dashboard } from './components/dashboard/Dashboard';
import { AiConfigProvider } from './contexts/AiConfigContext';

const BookViewer = lazy(() =>
  import('./components/book/BookViewer').then((m) => ({ default: m.BookViewer }))
);

function App() {
  const [currentStoryId, setCurrentStoryId] = useState<string | null>(null);

  return (
    <AiConfigProvider>
      <main>
        {currentStoryId ? (
          <Suspense fallback={<div>Loading book...</div>}>
            <BookViewer storyId={currentStoryId} onClose={() => setCurrentStoryId(null)} />
          </Suspense>
        ) : (
          <Dashboard onReadStory={setCurrentStoryId} />
        )}
      </main>
    </AiConfigProvider>
  );
}

export default App;
