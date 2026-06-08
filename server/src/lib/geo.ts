import { sql, type SQL } from "drizzle-orm";

/**
 * Geospatial utilities using the Haversine formula.
 * Used for nearby produce listing queries without requiring PostGIS extension.
 * Optimised for Nigerian and African coordinates.
 */

const EARTH_RADIUS_KM = 6371;

export function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Build a bounding-box SQL condition to pre-filter rows before exact distance
 * calculation. 1 degree latitude ≈ 111 km; 1 degree longitude ≈ 111·cos(lat) km.
 */
export function latLngBoundingBox(
  lat: number,
  lng: number,
  radiusKm: number,
): { minLat: number; maxLat: number; minLng: number; maxLng: number } {
  const latDelta = radiusKm / 111;
  const lngDelta = radiusKm / (111 * Math.cos(toRad(lat)));
  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLng: lng - lngDelta,
    maxLng: lng + lngDelta,
  };
}

/**
 * Build PostGIS SQL fragments for a nearby search query.
 * Returns a filter condition using ST_DWithin on geography cast,
 * and a distance expression using ST_Distance.
 */
export function buildPostgisNearbyQuery(
  lat: number,
  lng: number,
  radiusKm: number,
): { filter: SQL; distanceSql: SQL } {
  const radiusMeters = radiusKm * 1000;
  const point = sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)`;
  return {
    filter: sql`ST_DWithin(geography(${sql.identifier("location")}), geography(${point}), ${radiusMeters})`,
    distanceSql: sql`ST_Distance(geography(${sql.identifier("location")}), geography(${point})) / 1000`,
  };
}
