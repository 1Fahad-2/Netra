import React, { useState } from 'react';
import { Layers, X, Globe, HardHat, ShieldAlert, Check } from 'lucide-react';
import type { LayerVisibilityState } from '../../types/map';

interface LayerControlProps {
  visibility: LayerVisibilityState;
  onToggleLayer: (layerKey: keyof LayerVisibilityState) => void;
  onToggleAll?: (enable: boolean) => void;
}

interface LayerItem {
  key: keyof LayerVisibilityState;
  label: string;
}

interface CategoryGroup {
  name: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  items: LayerItem[];
}

export const LayerControl: React.FC<LayerControlProps> = ({
  visibility,
  onToggleLayer,
}) => {
  const [isOpen, setIsOpen] = useState(true);

  const categories: CategoryGroup[] = [
    {
      name: 'Mine Map',
      icon: HardHat,
      items: [
        { key: 'baseMap', label: 'Generated Mine Map' },
        { key: 'haulRoads', label: 'Haul Corridor' },
        { key: 'routeSections', label: 'Route Sections' },
      ],
    },
    {
      name: 'Safety',
      icon: ShieldAlert,
      items: [
        { key: 'hazardFeatures', label: 'Hazard Features' },
        { key: 'vehicleTrails', label: 'Vehicle Trails' },
      ],
    },
    {
      name: 'Fleet',
      icon: HardHat,
      items: [
        { key: 'vehicles', label: 'HEMM Vehicles' },
        { key: 'riskHalos', label: 'Vehicle Direction' },
      ],
    },
    {
      name: 'Geographic',
      icon: Globe,
      items: [
        { key: 'deposit14Boundary', label: 'Coordinates' },
      ],
    },
  ];

  if (!isOpen) {
    return (
      <button
        style={styles.collapsedButton}
        onClick={() => setIsOpen(true)}
        title="Open Layer Control"
      >
        <Layers size={14} color="#3B82F6" />
        <span>Layers</span>
      </button>
    );
  }

  return (
    <div style={styles.card}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerTitleContainer}>
          <Layers size={15} color="#3B82F6" />
          <span style={styles.headerTitle}>Layer Control</span>
        </div>
        <button
          style={styles.closeBtn}
          onClick={() => setIsOpen(false)}
          title="Close Layer Control"
          aria-label="Close Layer Control"
        >
          <X size={14} color="#94A3B8" />
        </button>
      </div>

      {/* Category Groups */}
      <div style={styles.content}>
        {categories.map((cat) => {
          const CatIcon = cat.icon;
          return (
            <div key={cat.name} style={styles.categorySection}>
              <div style={styles.categoryHeader}>
                <CatIcon size={12} color="#38BDF8" />
                <span>{cat.name}</span>
              </div>
              <div style={styles.itemList}>
                {cat.items.map((item) => {
                  const isChecked = Boolean(visibility[item.key]);
                  return (
                    <div
                      key={item.key}
                      style={styles.itemRow}
                      onClick={() => onToggleLayer(item.key)}
                    >
                      <div
                        style={{
                          ...styles.checkbox,
                          ...(isChecked ? styles.checkboxChecked : {}),
                        }}
                      >
                        {isChecked && <Check size={11} color="#FFFFFF" strokeWidth={3} />}
                      </div>
                      <span
                        style={{
                          ...styles.itemLabel,
                          color: isChecked ? '#F1F5F9' : '#94A3B8',
                        }}
                      >
                        {item.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Attribution Footer */}
      <div style={styles.footer}>
        <span>Generated Mine Map • SIH 2026</span>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  collapsedButton: {
    position: 'absolute',
    top: '16px',
    left: '16px',
    zIndex: 15,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '7px 12px',
    backgroundColor: 'rgba(9, 14, 23, 0.88)',
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    borderRadius: '6px',
    color: '#F8FAFC',
    fontSize: '12px',
    fontWeight: 600,
    fontFamily: 'Inter, system-ui, sans-serif',
    cursor: 'pointer',
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
  },
  card: {
    position: 'absolute',
    top: '16px',
    left: '16px',
    zIndex: 15,
    width: '235px',
    backgroundColor: 'rgba(9, 14, 23, 0.88)',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '8px',
    boxShadow: '0 12px 36px rgba(0, 0, 0, 0.55)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    userSelect: 'none',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
  },
  headerTitleContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
  },
  headerTitle: {
    fontSize: '12.5px',
    fontWeight: 700,
    color: '#FFFFFF',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  closeBtn: {
    backgroundColor: 'transparent',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    padding: '2px',
    borderRadius: '4px',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    padding: '12px 14px',
    maxHeight: '480px',
    overflowY: 'auto',
  },
  categorySection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  categoryHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    fontSize: '11px',
    fontWeight: 700,
    color: '#38BDF8',
    fontFamily: 'Inter, system-ui, sans-serif',
    letterSpacing: '0.02em',
  },
  itemList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '5px',
    paddingLeft: '4px',
  },
  itemRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer',
    padding: '2px 0',
  },
  checkbox: {
    width: '14px',
    height: '14px',
    borderRadius: '3px',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.25)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    transition: 'all 0.12s ease',
  },
  checkboxChecked: {
    backgroundColor: '#2563EB',
    borderColor: '#3B82F6',
  },
  itemLabel: {
    fontSize: '11px',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontWeight: 500,
    lineHeight: '1.2',
  },
  footer: {
    padding: '8px 14px',
    borderTop: '1px solid rgba(255, 255, 255, 0.06)',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    fontSize: '9.5px',
    color: '#64748B',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
};
