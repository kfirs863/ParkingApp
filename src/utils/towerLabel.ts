export const TOWER_LABELS: Record<string, string> = {
  '1': 'מגדל A (צפוני)',
  '2': 'מגדל B (דרומי)',
};

export function towerLabel(tower: string | null | undefined): string {
  if (!tower) return '';
  return TOWER_LABELS[tower] ?? `מגדל ${tower}`;
}
