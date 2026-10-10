// Geo helper — ONLY place that converts Mongo [lng,lat] <-> Leaflet [lat,lng].
export function mongoToLeaflet(location: {
  coordinates: [number, number];
}): [number, number] {
  const [lng, lat] = location.coordinates;
  return [lat, lng];
}

export function leafletToMongo(
  lat: number,
  lng: number,
): { type: "Point"; coordinates: [number, number] } {
  return { type: "Point", coordinates: [lng, lat] };
}

export const DEMO_CENTER: [number, number] = [12.9784, 77.6412]; // Indiranagar, Bengaluru
