export type Session = {
  id: number;
  closeTs: number;
  openTs: number;
  fallbackDeadline: number;
  printBandSecs: number;
  early: boolean;
};

export function etToUnix(year: number, month: number, day: number, hour: number, minute: number): number;
export function buildSessions(from?: [number, number, number], to?: [number, number, number]): Session[];
