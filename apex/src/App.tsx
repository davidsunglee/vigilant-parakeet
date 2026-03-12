import { useState } from 'react';
import { Dashboard } from './components/dashboard/Dashboard';
import { BookViewer } from './components/book/BookViewer.tsx';
import { AiConfigProvider } from './contexts/AiConfigContext';

function App() {
  const [currentStoryId, setCurrentStoryId] = useState<string | null>(null);

  return (
    <AiConfigProvider>
      <main>
        {currentStoryId ? (
          <BookViewer storyId={currentStoryId} onClose={() => setCurrentStoryId(null)} />
        ) : (
          <Dashboard onReadStory={setCurrentStoryId} />
        )}
      </main>
    </AiConfigProvider>
  );
}

export default App;
