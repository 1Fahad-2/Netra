/**
 * MachineMind — Route & Navigation Definitions
 * Architectural page boundaries for SIH 2026 Mine Safety Command Center.
 */

export type PageId = 
  | 'command-center' 
  | 'fleet' 
  | 'alerts' 
  | 'visibility' 
  | 'analytics' 
  | 'incidents';

export interface RouteConfig {
  id: PageId;
  label: string;
  path: string;
  description: string;
}

export const ROUTES: Record<PageId, RouteConfig> = {
  'command-center': {
    id: 'command-center',
    label: 'Command Center',
    path: '/command-center',
    description: 'Real-time 3D mine map, live telemetry, and collision proximity monitoring.',
  },
  'fleet': {
    id: 'fleet',
    label: 'Fleet Overview',
    path: '/fleet',
    description: 'HEMM registered prototype status, speed profiles, and active locations.',
  },
  'alerts': {
    id: 'alerts',
    label: 'Safety Alerts',
    path: '/alerts',
    description: 'Safety alert ledger, proximity hazard history, and operational advisories.',
  },
  'visibility': {
    id: 'visibility',
    label: 'Fog & Visibility',
    path: '/visibility',
    description: 'Pit atmospheric visibility monitoring and sensor health diagnostics.',
  },
  'analytics': {
    id: 'analytics',
    label: 'Mine Analytics',
    path: '/analytics',
    description: 'Haul road traffic density, safe headway compliance, and TTC trends.',
  },
  'incidents': {
    id: 'incidents',
    label: 'Incident Records',
    path: '/incidents',
    description: 'Near-miss investigation records and chronological event replay.',
  },
};

export const DEFAULT_PAGE: PageId = 'command-center';
