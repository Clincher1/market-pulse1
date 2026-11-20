export interface BriefDelta { kind: 'relative' | 'points'; magnitude: number; label: string; formula: string }
export function briefDelta(base: number, current: number, unit: string): BriefDelta | null;
export function lastSeriesObservation(asset: { sparkline: number[]; sparkDates?: string[] | null }): { value: number; date: string } | null;
export function snapshotSeriesDateLabel(date?: string | null): string;
export function orderBriefComparisons<T extends { kind: 'relative' | 'points'; magnitude: number; item: { id: string } }>(rows: T[]): T[];

export function lastSeriesMove(asset: { sparkline: number[]; sparkDates?: string[] | null }): { change: number; value: number; date: string; previousValue: number; previousDate: string } | null;
