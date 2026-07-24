export const DAY_START_HOUR = 6;
export const NIGHT_START_HOUR = 18;
export type TimePeriod = 'day' | 'night';
export function classifyTimePeriod(date: Date): TimePeriod { const hour = date.getHours(); return hour >= DAY_START_HOUR && hour < NIGHT_START_HOUR ? 'day' : 'night'; }
