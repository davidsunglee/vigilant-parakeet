import { useState } from 'react';
import { Dashboard } from './components/dashboard/Dashboard';
import { BookViewer } from './components/book/BookViewer';

function App() {
  const [currentStoryId, setCurrentStoryId] = useState<string | null>(null);

  return (
    <main>
      {currentStoryId ? (
        <BookViewer storyId={currentStoryId} onClose={() => setCurrentStoryId(null)} />
      ) : (
        <Dashboard onReadStory={setCurrentStoryId} />
      )}
    </main>
  );
}

export default App;
