// Terrain calibration module: maps image pixels to geographic coordinates using a homography.
// This module is self‑contained and does not depend on external linear‑algebra libraries.

/**
 * Types
 */
export interface ControlPoint {
  /** Pixel coordinates [x, y] */
  pixel: [number, number];
  /** Geographic coordinates [lon, lat] */
  geo: [number, number];
}

export interface Homography {
  /** 3×3 matrix in row‑major order */
  m: number[][]; // m[0][0] .. m[2][2]
}

export interface ValidationResult {
  reprojectionErrors: number[]; // per control point (meters approximation)
  avgError: number;
  maxError: number;
  imageCorners: [number, number][]; // NW, NE, SE, SW
  geoBounds: {
    lonMin: number;
    lonMax: number;
    latMin: number;
    latMax: number;
  };
  matrixValid: boolean;
}

/**
 * Demo geographic envelope for the image (affine calibration).
 */
export const IMAGE_WIDTH = 1072;
export const IMAGE_HEIGHT = 1008;
export const WEST = 81.223;
export const EAST = 81.243;
export const NORTH = 18.623;
export const SOUTH = 18.607;

/**
 * Demo geographic coordinates for the six visual control points.
 * These are approximate positions inside the envelope.
 */
const DEMO_GEO_POINTS: [number, number][] = [
  [81.2252425, 18.6186488], // CP1
  [81.2315429, 18.6198800], // CP2
  [81.2360578, 18.6184464], // CP3
  [81.2387257, 18.6143145], // CP4
  [81.2403675, 18.6111101], // CP5
  [81.2350317, 18.6090863], // CP6
];

/** Fixed pixel control points (image‑space) */
export const IMAGE_CONTROL_POINTS: ControlPoint[] = [
  { pixel: [158, 258], geo: DEMO_GEO_POINTS[0] },
  { pixel: [465, 185], geo: DEMO_GEO_POINTS[1] },
  { pixel: [685, 270], geo: DEMO_GEO_POINTS[2] },
  { pixel: [815, 515], geo: DEMO_GEO_POINTS[3] },
  { pixel: [895, 705], geo: DEMO_GEO_POINTS[4] },
  { pixel: [635, 825], geo: DEMO_GEO_POINTS[5] },
];

/**
 * Compute a homography matrix from a set of control points using least‑squares.
 * Returns a 3×3 matrix where the bottom‑right element is forced to 1.
 * Throws an error if the system is singular or ill‑conditioned.
 */
export function computeHomography(points: ControlPoint[]): Homography {
  if (points.length < 4) {
    throw new Error('At least four control points are required to compute a homography');
  }

  // Build A (2n × 8) and b (2n).
  const rows = points.length * 2;
  const A = new Array(rows).fill(0).map(() => new Array(8).fill(0));
  const b = new Array(rows).fill(0);

  for (let i = 0; i < points.length; i++) {
    const [x, y] = points[i].pixel;
    const [lon, lat] = points[i].geo;
    // first row (lon)
    A[2 * i][0] = x;
    A[2 * i][1] = y;
    A[2 * i][2] = 1;
    A[2 * i][3] = 0;
    A[2 * i][4] = 0;
    A[2 * i][5] = 0;
    A[2 * i][6] = -x * lon;
    A[2 * i][7] = -y * lon;
    b[2 * i] = lon;
    // second row (lat)
    A[2 * i + 1][0] = 0;
    A[2 * i + 1][1] = 0;
    A[2 * i + 1][2] = 0;
    A[2 * i + 1][3] = x;
    A[2 * i + 1][4] = y;
    A[2 * i + 1][5] = 1;
    A[2 * i + 1][6] = -x * lat;
    A[2 * i + 1][7] = -y * lat;
    b[2 * i + 1] = lat;
  }

  // Solve (Aᵀ A) h = Aᵀ b via normal equations.
  const AT = transpose(A);
  const ATA = multiplyMatrices(AT, A);
  const ATb = multiplyMatrixVector(AT, b);

  // Simple Gaussian elimination with partial pivoting.
  const h = solveLinearSystem(ATA, ATb);

  // Append h9 = 1 to build the 3×3 matrix.
  const H = [
    [h[0], h[1], h[2]],
    [h[3], h[4], h[5]],
    [h[6], h[7], 1],
  ];

  // Validate that the matrix is not singular.
  const det = determinant3x3(H);
  if (!isFinite(det) || Math.abs(det) < 1e-12) {
    throw new Error('Computed homography matrix is singular or ill‑conditioned');
  }

  return { m: H };
}

/** Validate the calibration and produce diagnostics. */
export function validateCalibration(): ValidationResult {
  // Compute reprojection errors using the affine pixelToGeo mapping.
  const reprojectionErrors: number[] = [];
  for (const cp of IMAGE_CONTROL_POINTS) {
    const [lonEst, latEst] = pixelToGeo(cp.pixel[0], cp.pixel[1]);
    const err = Math.hypot(lonEst - cp.geo[0], latEst - cp.geo[1]);
    reprojectionErrors.push(err);
  }
  const avgError = reprojectionErrors.reduce((a, b) => a + b, 0) / reprojectionErrors.length;
  const maxError = Math.max(...reprojectionErrors);

  const corners = getImageCornerCoordinates();
  const lons = corners.map(c => c[0]);
  const lats = corners.map(c => c[1]);

  return {
    reprojectionErrors,
    avgError,
    maxError,
    imageCorners: corners,
    geoBounds: {
      lonMin: Math.min(...lons),
      lonMax: Math.max(...lons),
      latMin: Math.min(...lats),
      latMax: Math.max(...lats),
    },
    matrixValid: true,
  };
}

/** Convert a pixel location to geographic coordinates using the calibrated homography. */
export function pixelToGeo(x: number, y: number): [number, number] {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error('pixelToGeo received non‑finite coordinates');
  }
  const lon = WEST + (x / IMAGE_WIDTH) * (EAST - WEST);
  const lat = NORTH - (y / IMAGE_HEIGHT) * (NORTH - SOUTH);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    throw new Error('Result of pixelToGeo contains NaN or Infinity');
  }
  return [lon, lat];
}

/** Convert geographic coordinates to a pixel location using the inverse calibrated homography. */
export function geoToPixel(lon: number, lat: number): [number, number] {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    throw new Error('geoToPixel received non‑finite coordinates');
  }
  const x = ((lon - WEST) / (EAST - WEST)) * IMAGE_WIDTH;
  const y = ((NORTH - lat) / (NORTH - SOUTH)) * IMAGE_HEIGHT;
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error('Result of geoToPixel contains NaN or Infinity');
  }
  return [x, y];
}

export function getImageCornerCoordinates(): [number, number][] {
  // Use the four surveyed boundary points A11 (west), A64 (north), A71 (east), A72 (south)
  // to define the image corners in the order required by MapLibre:
  // [westLng, northLat], [eastLng, northLat], [eastLng, southLat], [westLng, southLat]
  const westLng = 81.221096; // A11 longitude
  const eastLng = 81.245744; // A71 longitude
  const northLat = 18.626278; // A64 latitude
  const southLat = 18.603112; // A72 latitude
  return [
    [westLng, northLat], // NW
    [eastLng, northLat], // NE
    [eastLng, southLat], // SE
    [westLng, southLat], // SW
  ];
}







/** Linear‑algebra utilities (no external deps) */
function transpose(matrix: number[][]): number[][] {
  return matrix[0].map((_, colIndex) => matrix.map(row => row[colIndex]));
}

function multiplyMatrices(a: number[][], b: number[][]): number[][] {
  const rowsA = a.length;
  const colsA = a[0].length;
  const colsB = b[0].length;
  const result = Array.from({ length: rowsA }, () => new Array(colsB).fill(0));
  for (let i = 0; i < rowsA; i++) {
    for (let k = 0; k < colsA; k++) {
      const aik = a[i][k];
      for (let j = 0; j < colsB; j++) {
        result[i][j] += aik * b[k][j];
      }
    }
  }
  return result;
}

function multiplyMatrixVector(matrix: number[][], vector: number[]): number[] {
  const rows = matrix.length;
  const cols = matrix[0].length;
  const result = new Array(rows).fill(0);
  for (let i = 0; i < rows; i++) {
    let sum = 0;
    for (let j = 0; j < cols; j++) {
      sum += matrix[i][j] * vector[j];
    }
    result[i] = sum;
  }
  return result;
}

/** Solve a linear system Ax = b using Gaussian elimination with partial pivoting. */
function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = A.length;
  // Augmented matrix
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    // Pivot
    let pivotRow = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivotRow][col])) {
        pivotRow = r;
      }
    }
    if (Math.abs(M[pivotRow][col]) < 1e-12) {
      throw new Error('Singular matrix encountered during solve');
    }
    // Swap rows if needed
    if (pivotRow !== col) {
      const temp = M[col];
      M[col] = M[pivotRow];
      M[pivotRow] = temp;
    }
    // Normalize pivot row
    const pivotVal = M[col][col];
    for (let j = col; j <= n; j++) {
      M[col][j] /= pivotVal;
    }
    // Eliminate other rows
    for (let r = 0; r < n; r++) {
      if (r !== col) {
        const factor = M[r][col];
        for (let j = col; j <= n; j++) {
          M[r][j] -= factor * M[col][j];
        }
      }
    }
  }
  // Extract solution
  return M.map(row => row[n]);
}

/** Determinant of a 3×3 matrix */
function determinant3x3(m: number[][]): number {
  const a = m[0][0], b = m[0][1], c = m[0][2];
  const d = m[1][0], e = m[1][1], f = m[1][2];
  const g = m[2][0], h = m[2][1], i = m[2][2];
  return a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
}

/** Simple tolerant equality for test comparisons */
export function approxEqual(a: number, b: number, tol = 1e-5): boolean {
  return Math.abs(a - b) <= tol;
}

/** Export the computed homography for external use (e.g., debug overlay) */
export const CALIBRATION_HOMOGRAPHY = computeHomography(IMAGE_CONTROL_POINTS);

/** End of terrainCalibration module */
