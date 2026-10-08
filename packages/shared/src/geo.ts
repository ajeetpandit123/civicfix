export function roundPublicCoordinates(lat: number, lng: number, decimals = 3): {
  latitude: number;
  longitude: number;
} {
  const f = 10 ** decimals;
  return {
    latitude: Math.round(lat * f) / f,
    longitude: Math.round(lng * f) / f,
  };
}

export function pointInBounds(
  lat: number,
  lng: number,
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number },
): boolean {
  return lat >= bounds.minLat && lat <= bounds.maxLat && lng >= bounds.minLng && lng <= bounds.maxLng;
}

export function boundsArea(bounds: {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}): number {
  return Math.max(0, bounds.maxLat - bounds.minLat) * Math.max(0, bounds.maxLng - bounds.minLng);
}
