export const FLOORS = ['P1', 'P2', 'P3', 'P4'] as const;
export type ParkingFloor = typeof FLOORS[number];

export function buildSpotId(floor: ParkingFloor, number: string): string {
  return `${floor}-${number.trim()}`;
}

export function parseSpotId(spotId: string): { floor: ParkingFloor | null; number: string } {
  const match = spotId.match(/^(P[1-4])-(.+)$/);
  if (match) return { floor: match[1] as ParkingFloor, number: match[2] };
  return { floor: null, number: spotId };
}
