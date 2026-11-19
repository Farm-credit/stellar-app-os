import type { GpsCoordinates } from "./types";

export function formatCoordinates(gps: GpsCoordinates): string {
  const lat = `${Math.abs(gps.latitude).toFixed(5)}\u00b0${gps.latitude >= 0 ? "N" : "S"}`;
  const lon = `${Math.abs(gps.longitude).toFixed(5)}\u00b0${gps.longitude >= 0 ? "E" : "W"}`;
  return `${lat}, ${lon}`;
}

export function formatAltitude(meters: number): string {
  return `${Math.round(meters)} m elevation`;
}

export function formatCapturedAt(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
