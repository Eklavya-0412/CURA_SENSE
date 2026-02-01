import { useState, useEffect } from 'react';
import LandingPage from './components/LandingPage';
import AgentDashboard from './components/AgentDashboard';

/**
 * Main App Component
 * Routes between Landing Page and Support Dashboard based on URL path.
 */
function App() {
  const [route, setRoute] = useState(() => {
    const path = window.location.pathname;
    return (path.includes('/support') || path.includes('dashboard')) ? 'support' : 'landing';
  });

  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      setRoute((path.includes('/support') || path.includes('dashboard')) ? 'support' : 'landing');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  return (
    <div className="min-h-screen bg-[var(--bg-color)]">
      {route === 'landing' ? <LandingPage /> : <AgentDashboard />}
    </div>
  );
}

export default App;
