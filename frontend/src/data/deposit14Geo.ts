/**
 * MachineMind — Bailadila Deposit-14 Geographic Reference Data
 * 
 * Geographic Source:
 * NMDC / Ministry of Environment, Forest and Climate Change (MoEFCC)
 * Public Lease Survey Documentation for Bailadila Iron Ore Deposit-14 (Kirandul, Dantewada, Chhattisgarh).
 * 
 * IMPORTANT DISCLAIMER:
 * This dataset represents a GEOGRAPHIC REFERENCE POLYGON derived from 4 documented survey boundary
 * markers (A11, A64, A71, A72). It is provided strictly for contextual visualization and spatial
 * anchoring of the simulated safety digital twin. It is NOT claimed to represent a complete,
 * exhaustive, or certified cadastral mining lease boundary.
 */

export interface LeaseSurveyPoint {
  id: string;
  name: string;
  longitude: number;
  latitude: number;
  dmsLongitude: string;
  dmsLatitude: string;
  description: string;
}

export const DEPOSIT_14_SURVEY_POINTS: LeaseSurveyPoint[] = [
  {
    id: 'A11',
    name: 'Survey Boundary Pillar A11',
    longitude: 81.221096,
    latitude: 18.617374,
    dmsLongitude: '81°13\'15.9460" E',
    dmsLatitude: '18°37\'02.5454" N',
    description: 'Western flank lease boundary marker (Kirandul valley approach)',
  },
  {
    id: 'A64',
    name: 'Survey Boundary Pillar A64',
    longitude: 81.231843,
    latitude: 18.626278,
    dmsLongitude: '81°13\'54.6335" E',
    dmsLatitude: '18°37\'34.6006" N',
    description: 'Northern ridge lease boundary marker (Upper Deposit-14 crest)',
  },
  {
    id: 'A71',
    name: 'Survey Boundary Pillar A71',
    longitude: 81.245744,
    latitude: 18.612236,
    dmsLongitude: '81°14\'44.6788" E',
    dmsLatitude: '18°36\'44.0492" N',
    description: 'Eastern escarpment lease boundary marker (Dharampali drop-off)',
  },
  {
    id: 'A72',
    name: 'Survey Boundary Pillar A72',
    longitude: 81.235466,
    latitude: 18.603112,
    dmsLongitude: '81°14\'07.6783" E',
    dmsLatitude: '18°36\'11.2022" N',
    description: 'Southern valley lease boundary marker (Kirandul railway siding approach)',
  },
];

/**
 * 4-Point Geographic Reference Polygon (Closed: A11 -> A64 -> A71 -> A72 -> A11)
 * Expressed as [longitude, latitude] pairs.
 */
export const deposit14ReferencePolygon: [number, number][] = [
  [DEPOSIT_14_SURVEY_POINTS[0].longitude, DEPOSIT_14_SURVEY_POINTS[0].latitude], // A11
  [DEPOSIT_14_SURVEY_POINTS[1].longitude, DEPOSIT_14_SURVEY_POINTS[1].latitude], // A64
  [DEPOSIT_14_SURVEY_POINTS[2].longitude, DEPOSIT_14_SURVEY_POINTS[2].latitude], // A71
  [DEPOSIT_14_SURVEY_POINTS[3].longitude, DEPOSIT_14_SURVEY_POINTS[3].latitude], // A72
  [DEPOSIT_14_SURVEY_POINTS[0].longitude, DEPOSIT_14_SURVEY_POINTS[0].latitude], // A11 (closed)
];

/**
 * Centroid / Geographic Map Anchor for Bailadila Deposit-14 Context
 */
export const DEPOSIT_14_REFERENCE_CENTER: [number, number] = [81.2335, 18.6148];

/**
 * Spatial Bounding Box [minLng, minLat, maxLng, maxLat]
 */
export const DEPOSIT_14_BOUNDING_BOX = {
  minLng: 81.221096,
  minLat: 18.603112,
  maxLng: 81.245744,
  maxLat: 18.626278,
  widthDegrees: 81.245744 - 81.221096,   // ~0.0246° (~2.6 km)
  heightDegrees: 18.626278 - 18.603112, // ~0.0232° (~2.57 km)
};

export const DEPOSIT_14_METADATA = {
  regionName: 'Bailadila Range (Deposit-14)',
  district: 'Dantewada',
  state: 'Chhattisgarh, India',
  sourceAgency: 'NMDC / MoEFCC Environmental Clearance & Survey Records',
  provenance: 'PUBLIC / REFERENCE ONLY',
  disclaimer: 'Representative 4-point reference polygon for spatial twin anchoring. Not certified cadastral boundary.',
  label: 'DEP-14 GEOGRAPHIC REFERENCE • 4 DOCUMENTED POINTS',
} as const;
