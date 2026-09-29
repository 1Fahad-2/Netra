import React, { createContext, useState } from 'react';
import type { ReactNode } from 'react';
import type { MapCameraState } from '../types/map';
import { ACTIVE_ROUTE_CENTER } from '../data/activeHaulRoute';

type MapCameraContextType = {
  center: [number, number];
  setCenter: (camera: MapCameraState) => void;
};

export const MapCameraContext = createContext<MapCameraContextType>({
  center: ACTIVE_ROUTE_CENTER,
  setCenter: () => {},
});

interface ProviderProps {
  children: ReactNode;
}

export const MapCameraProvider: React.FC<ProviderProps> = ({ children }) => {
  const [center, setCenterState] = useState<[number, number]>(ACTIVE_ROUTE_CENTER);

  const setCenter = (camera: MapCameraState) => {
    setCenterState([camera.longitude, camera.latitude]);
  };

  return (
    <MapCameraContext.Provider value={{ center, setCenter }}>
      {children}
    </MapCameraContext.Provider>
  );
};
