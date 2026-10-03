export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(a))
}

export function roundKm(km: number): number {
  return Math.round(km * 100) / 100
}

export function mapsUrl(lat: number, lon: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`
}

export interface Nearby {
  lat: number
  lon: number
}

export function sortByDistance<T extends { lat: number; lon: number }>(
  stores: T[],
  near: Nearby | undefined,
  maxResults: number
): Array<T & { distanceKm?: number }> {
  if (near === undefined) return stores.slice(0, maxResults)
  return stores
    .map((s) => ({ ...s, distanceKm: roundKm(haversineKm(near.lat, near.lon, s.lat, s.lon)) }))
    .sort((a, b) => (a.distanceKm as number) - (b.distanceKm as number))
    .slice(0, maxResults)
}

export function validateNear(
  nearLat: number | undefined,
  nearLon: number | undefined
): { ok: true; near?: Nearby } | { ok: false; error: string } {
  if (nearLat === undefined && nearLon === undefined) return { ok: true }
  if (nearLat === undefined || nearLon === undefined) {
    return { ok: false, error: 'Give both nearLat and nearLon together, or neither.' }
  }
  if (!Number.isFinite(nearLat) || nearLat < -90 || nearLat > 90) {
    return { ok: false, error: 'nearLat must be a latitude between -90 and 90.' }
  }
  if (!Number.isFinite(nearLon) || nearLon < -180 || nearLon > 180) {
    return { ok: false, error: 'nearLon must be a longitude between -180 and 180.' }
  }
  return { ok: true, near: { lat: nearLat, lon: nearLon } }
}
