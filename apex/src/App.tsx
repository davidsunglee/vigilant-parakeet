import { useState, lazy, Suspense } from 'react';
import { Dashboard } from './components/dashboard/Dashboard';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SignIn } from './components/auth/SignIn';

const BookViewer = lazy(() =>
  import('./components/book/BookViewer').then((m) => ({ default: m.BookViewer }))
);

function AppContent() {
  const { user, loading } = useAuth();
  const [currentStoryId, setCurrentStoryId] = useState<string | null>(null);

  if (loading) return null;

  if (!user) return <SignIn />;

  return (
    <main>
      {currentStoryId ? (
        <Suspense fallback={<div>Loading book...</div>}>
          <BookViewer storyId={currentStoryId} onClose={() => setCurrentStoryId(null)} />
        </Suspense>
      ) : (
        <Dashboard onReadStory={setCurrentStoryId} />
      )}
    </main>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
