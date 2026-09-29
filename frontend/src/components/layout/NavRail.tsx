import React from 'react';
import { 
  Layers, 
  Truck, 
  AlertTriangle, 
  FileText, 
  Settings 
} from 'lucide-react';
import type { PageId } from '../../app/routes';

interface NavRailProps {
  activePage?: PageId;
  onNavigate?: (pageId: PageId) => void;
}

interface NavItem {
  id: PageId;
  label: string;
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  badge?: number;
}

export const NavRail: React.FC<NavRailProps> = ({ 
  activePage = 'command-center', 
  onNavigate 
}) => {
  const navItems: NavItem[] = [
    { id: 'command-center', label: 'Map', icon: Layers },
    { id: 'fleet', label: 'Fleet', icon: Truck },
    { id: 'alerts', label: 'Alerts', icon: AlertTriangle, badge: 3 },
    { id: 'incidents', label: 'Reports', icon: FileText },
    { id: 'analytics', label: 'Settings', icon: Settings },
  ];

  return (
    <aside style={styles.aside} aria-label="Primary Navigation">
      <nav style={styles.navList}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.id === activePage;

          return (
            <button
              key={item.id}
              style={{
                ...styles.navButton,
                ...(isActive ? styles.navButtonActive : {}),
              }}
              title={item.label}
              onClick={() => onNavigate?.(item.id)}
            >
              <div style={styles.iconContainer}>
                <Icon 
                  size={19} 
                  color={isActive ? '#FFFFFF' : '#94A3B8'} 
                  strokeWidth={isActive ? 2.2 : 1.8} 
                />
                {item.badge && (
                  <span style={styles.badge}>{item.badge}</span>
                )}
              </div>
              <span 
                style={{
                  ...styles.navLabel,
                  color: isActive ? '#FFFFFF' : '#94A3B8',
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
};

const styles: Record<string, React.CSSProperties> = {
  aside: {
    width: '64px',
    height: '100%',
    backgroundColor: '#090E17',
    borderRight: '1px solid rgba(255, 255, 255, 0.08)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '16px 0',
    flexShrink: 0,
    zIndex: 25,
    userSelect: 'none',
    boxSizing: 'border-box',
  },
  navList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    width: '100%',
    alignItems: 'center',
  },
  navButton: {
    width: '50px',
    height: '52px',
    borderRadius: '8px',
    backgroundColor: 'transparent',
    border: 'none',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    cursor: 'pointer',
    position: 'relative',
    transition: 'all 0.15s ease',
  },
  navButtonActive: {
    backgroundColor: '#2563EB',
    boxShadow: '0 4px 12px rgba(37, 99, 235, 0.35)',
  },
  iconContainer: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navLabel: {
    fontSize: '10px',
    fontFamily: 'Inter, system-ui, sans-serif',
    letterSpacing: '-0.01em',
  },
  badge: {
    position: 'absolute',
    top: '-6px',
    right: '-10px',
    backgroundColor: '#EF4444',
    color: '#FFFFFF',
    fontSize: '9px',
    fontWeight: 700,
    width: '14px',
    height: '14px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1.5px solid #090E17',
  },
};
