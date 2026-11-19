import { lazy, Suspense, useEffect, useState } from 'react';
import PlannerApp from './planner/PlannerApp';

// The metro algorithm lab (phase 1) loads only when its tab is opened.
const MetroLab = lazy(() => import('./MetroLab'));

type View = 'plan' | 'lab';
const viewFromHash = (): View => (window.location.hash.startsWith('#lab') ? 'lab' : 'plan');

export default function App() {
  const [view, setView] = useState<View>(viewFromHash);
  useEffect(() => {
    const on = () => setView(viewFromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = (v: View) => { window.location.hash = v; setView(v); };

  return (
    <div className="shell">
      <nav className="topnav" aria-label="Sections">
        <button className={view === 'plan' ? 'on' : ''} aria-current={view === 'plan'} onClick={() => go('plan')}>Trip planner</button>
        <button className={view === 'lab' ? 'on' : ''} aria-current={view === 'lab'} onClick={() => go('lab')}>Metro algorithm lab</button>
      </nav>
      <div className="view">
        {view === 'plan' ? <PlannerApp /> : <Suspense fallback={<div className="card loading">Loading…</div>}><MetroLab /></Suspense>}
      </div>
    </div>
  );
}
