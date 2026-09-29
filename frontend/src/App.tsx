/**
 * NETRA — Mining Safety Command Center
 * Root Application Shell & Master Viewport Orchestrator
 */

import React, { useState, useEffect } from 'react';
import { NavRail } from './components/layout/NavRail';
import { TopStrip } from './components/layout/TopStrip';
import { CommandCenter } from './pages/CommandCenter';
import { Fleet } from './pages/Fleet';
import { Alerts } from './pages/Alerts';
import { Visibility } from './pages/Visibility';
import { Analytics } from './pages/Analytics';
import { Incidents } from './pages/Incidents';
import { useTelemetry } from './hooks/useTelemetry';
import { type PageId, DEFAULT_PAGE, ROUTES } from './app/routes';
import './styles/main.css';

export const App: React.FC = () => {
  // Navigation State with lightweight hash synchronization
  const [activePage, setActivePage] = useState<PageId>(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.replace('#/', '').replace('#', '') as PageId;
      if (ROUTES[hash]) return hash;
    }
    return DEFAULT_PAGE;
  });

  // Authoritative live telemetry state & scenario controls
  const telemetry = useTelemetry();

  // Sync hash changes on navigation
  const handleNavigate = (page: PageId) => {
    setActivePage(page);
    if (typeof window !== 'undefined') {
      window.location.hash = `#/${page}`;
    }
  };

  // Listen for browser back/forward navigation
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#/', '').replace('#', '') as PageId;
      if (ROUTES[hash]) {
        setActivePage(hash);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  return (
    <div style={styles.appContainer}>
      {/* Left Compact Navigation Rail */}
      <NavRail 
        activePage={activePage} 
        onNavigate={handleNavigate} 
      />

      {/* Main Command Center Viewport */}
      <div style={styles.mainViewport}>
        {/* Top Operational Cockpit Status Strip */}
        <TopStrip 
          riskLevel={telemetry.snapshot.riskLevel} 
          isPlaying={telemetry.isPlaying} 
        />

        {/* Dynamic Page Router */}
        {activePage === 'command-center' && <CommandCenter telemetry={telemetry} />}
        {activePage === 'fleet' && <Fleet telemetry={telemetry} />}
        {activePage === 'alerts' && <Alerts telemetry={telemetry} />}
        {activePage === 'visibility' && <Visibility telemetry={telemetry} />}
        {activePage === 'analytics' && <Analytics telemetry={telemetry} />}
        {activePage === 'incidents' && <Incidents telemetry={telemetry} />}
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  appContainer: {
    display: 'flex',
    width: '100vw',
    height: '100vh',
    overflow: 'hidden',
    backgroundColor: 'var(--bg-base)',
  },
  mainViewport: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    height: '100%',
    overflow: 'hidden',
    minWidth: 0,
  },
};

export default App;
