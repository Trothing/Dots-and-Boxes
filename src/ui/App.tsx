import { useEffect, useState } from 'react';
import { GamePage } from './GamePage';
import { LabPage } from './LabPage';

const pageFromHash = (): 'game' | 'lab' => (window.location.hash === '#/lab' ? 'lab' : 'game');

export function App() {
  const [page, setPage] = useState<'game' | 'lab'>(pageFromHash);

  useEffect(() => {
    const onHash = (): void => setPage(pageFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <h1>Dots and Boxes</h1>
        <nav aria-label="Sections">
          <a href="#/" aria-current={page === 'game' ? 'page' : undefined}>
            Game
          </a>
          <a href="#/lab" aria-current={page === 'lab' ? 'page' : undefined}>
            Experiments
          </a>
        </nav>
      </header>
      {page === 'game' ? <GamePage /> : <LabPage />}
    </div>
  );
}
