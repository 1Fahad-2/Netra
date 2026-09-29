
import {
  computeHomography,
  pixelToGeo,
  getImageCornerCoordinates,
  IMAGE_CONTROL_POINTS,
} from './terrainCalibration.ts';

function approxEqual(a: number, b: number, tol = 1e-3) {
  return Math.abs(a - b) <= tol;
}

function runTests() {
  // 1. computeHomography
  const H = computeHomography(IMAGE_CONTROL_POINTS);
  // matrix shape 3x3
  if (!Array.isArray(H.m) || H.m.length !== 3 || H.m.some(row => row.length !== 3)) {
    console.error('Homography shape invalid');
    process.exit(1);
  }
  // check for NaN/Infinity
  for (const row of H.m) {
    for (const v of row) {
      if (!Number.isFinite(v)) {
        console.error('Homography contains non‑finite value');
        process.exit(1);
      }
    }
  }
  // simple determinant check
  const det = H.m[0][0] * (H.m[1][1] * H.m[2][2] - H.m[1][2] * H.m[2][1]) -
    H.m[0][1] * (H.m[1][0] * H.m[2][2] - H.m[1][2] * H.m[2][0]) +
    H.m[0][2] * (H.m[1][0] * H.m[2][1] - H.m[1][1] * H.m[2][0]);
  if (Math.abs(det) < 1e-12) {
    console.error('Homography matrix is singular');
    process.exit(1);
  }

  // 2. pixelToGeo on control points
  const expected = [
    [81.2252425, 18.6186488],
    [81.2315429, 18.6198800],
    [81.2360578, 18.6184464],
    [81.2387257, 18.6143145],
    [81.2403675, 18.6111101],
    [81.2350317, 18.6090863],
  ];
  const errors: number[] = [];
  for (let i = 0; i < IMAGE_CONTROL_POINTS.length; i++) {
    const cp = IMAGE_CONTROL_POINTS[i];
    const [lon, lat] = pixelToGeo(cp.pixel[0], cp.pixel[1]);
    const err = Math.hypot(lon - expected[i][0], lat - expected[i][1]);
    errors.push(err);
    if (!approxEqual(lon, expected[i][0], 5e-3) || !approxEqual(lat, expected[i][1], 5e-3)) {
      console.error(`Control point ${i + 1} out of tolerance`);
      process.exit(1);
    }
  }

  const avgError = errors.reduce((a, b) => a + b, 0) / errors.length;
  const maxError = Math.max(...errors);
  console.log('Reprojection errors:', errors);
  console.log('Average error:', avgError);
  console.log('Maximum error:', maxError);

  // 3. Image corners
  const corners = getImageCornerCoordinates();
  if (corners.length !== 4) {
    console.error('Incorrect number of image corners');
    process.exit(1);
  }
  for (const [lon, lat] of corners) {
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      console.error('Image corner contains non‑finite value');
      process.exit(1);
    }
  }

  const lons = corners.map(c => c[0]);
  const lats = corners.map(c => c[1]);
  const bounds = {
    lonMin: Math.min(...lons),
    lonMax: Math.max(...lons),
    latMin: Math.min(...lats),
    latMax: Math.max(...lats),
  };
  console.log('Geographic bounds:', bounds);

  // check demo area approximate
  if (bounds.lonMin < 81.223 || bounds.lonMax > 81.243 || bounds.latMin < 18.607 || bounds.latMax > 18.623) {
    console.error('Geographic extent out of expected demo range');
    process.exit(1);
  }

  console.log('All calibration tests passed');
  process.exit(0);
}

runTests();
