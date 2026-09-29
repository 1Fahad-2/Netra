// Navigation related type definitions

export type WarningLevel =
  | 'OFF_ROUTE'
  | 'ADVISORY'
  | 'CAUTION'
  | 'WARNING'
  | 'CRITICAL';

export interface VehicleTelemetry {
  vehicle_id: string;
  vehicle_type: string;
  timestamp: string; // ISO string
  position: {
    latitude: number;
    longitude: number;
    altitude?: number;
  };
  heading: number; // degrees clockwise from north
  speed: number; // km/h
  visibility_condition?: string;
  object_detected?: boolean;
  object_type?: string | null;
  object_distance?: number | null;
  relative_speed?: number | null;
  ttc?: number | null;
  risk_score?: number;
  risk_level?: string;
  recommended_action?: string;
  sensor_health?: Record<string, string>;
  network_status?: string;
  data_mode?: string;
  source_metadata?: string;
}

export interface CurveInfo {
  id: string;
  segmentId: number; // index of first segment of the curve
  chainage: number; // meters from route start to the curve point (mid curve)
  coordinate: [number, number]; // [lng, lat]
  headingChange: number; // absolute change in degrees
  severity: 'GENTLE' | 'MODERATE' | 'SHARP';
  advisorySpeedKmh: number; // DEMO / CONFIGURABLE VALUES ONLY. Not DGMS-certified operating limits.
}

export interface V2VInfo {
  otherVehicleId: string;
  distanceMeters: number;
  relativeSpeedMs: number; // m/s (positive if other is ahead relative to our vehicle's direction)
  closingSpeedMs: number; // m/s absolute closing speed (always positive)
  status: 'APPROACHING' | 'RECEDING' | 'STATIC';
}

export interface NavigationState {
  vehicleId: string;
  position: [number, number]; // [lng, lat]
  heading: number; // degrees
  onRoute: boolean;
  chainage?: number; // meters along route when onRoute
  nextCurve?: CurveInfo;
  distanceToCurve?: number; // meters, undefined if no next curve or off‑route
  warningLevel: WarningLevel;
  v2v?: V2VInfo[];
}
