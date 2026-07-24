export type QuestionBudgetSettings = { maximumQuestionsPerDay: number; maximumQuestionsPerHour: number; maximumQuestionsPerHypothesisPerDay: number; minimumMinutesBetweenQuestions: number; pauseAfterConsecutiveSkips: number; pauseDurationMinutes: number; quietHoursStart?: string; quietHoursEnd?: string; minimumRecentResponseRate?: number };
export const DEFAULT_QUESTION_BUDGET: QuestionBudgetSettings = { maximumQuestionsPerDay: 6, maximumQuestionsPerHour: 2, maximumQuestionsPerHypothesisPerDay: 4, minimumMinutesBetweenQuestions: 30, pauseAfterConsecutiveSkips: 3, pauseDurationMinutes: 240, minimumRecentResponseRate: 0.2 };
export type QuestionBudgetReason = 'daily_budget_exceeded' | 'hourly_budget_exceeded' | 'hypothesis_budget_exceeded' | 'quiet_hours' | 'cooldown' | 'consecutive_skips' | 'pause_active' | 'low_recent_response_rate' | 'notification_permission_missing' | 'hypothesis_inactive' | 'no_valid_question';
export type QuestionBudgetInput = { now: string; todayCount: number; hourCount: number; hypothesisTodayCount: number; lastQuestionAt?: string | null; consecutiveSkips: number; pauseUntil?: string | null; quietHoursStart?: string; quietHoursEnd?: string; recentResponseRate?: number; notificationPermissionGranted?: boolean; hypothesisActive?: boolean; settings?: Partial<QuestionBudgetSettings> };
function minutesOfDay(value: string) { const match = /^(\d{2}):(\d{2})$/.exec(value); return match ? Number(match[1]) * 60 + Number(match[2]) : null; }
function isQuiet(now: Date, start?: string, end?: string) { if (!start || !end) return false; const current = now.getHours() * 60 + now.getMinutes(); const from = minutesOfDay(start); const to = minutesOfDay(end); if (from === null || to === null || from === to) return false; return from < to ? current >= from && current < to : current >= from || current < to; }
export function evaluateQuestionBudget(input: QuestionBudgetInput) {
  const settings = { ...DEFAULT_QUESTION_BUDGET, ...input.settings }; const now = new Date(input.now);
  if (input.notificationPermissionGranted === false) return { allowed: false, reason: 'notification_permission_missing' as const };
  if (input.hypothesisActive === false) return { allowed: false, reason: 'hypothesis_inactive' as const };
  if (input.pauseUntil && new Date(input.pauseUntil) > now) return { allowed: false, reason: 'pause_active' as const, pauseUntil: input.pauseUntil };
  if (isQuiet(now, input.quietHoursStart ?? settings.quietHoursStart, input.quietHoursEnd ?? settings.quietHoursEnd)) return { allowed: false, reason: 'quiet_hours' as const };
  if (input.recentResponseRate !== undefined && input.recentResponseRate < (settings.minimumRecentResponseRate ?? 0)) return { allowed: false, reason: 'low_recent_response_rate' as const };
  if (input.todayCount >= settings.maximumQuestionsPerDay) return { allowed: false, reason: 'daily_budget_exceeded' as const };
  if (input.hourCount >= settings.maximumQuestionsPerHour) return { allowed: false, reason: 'hourly_budget_exceeded' as const };
  if (input.hypothesisTodayCount >= settings.maximumQuestionsPerHypothesisPerDay) return { allowed: false, reason: 'hypothesis_budget_exceeded' as const };
  if (input.lastQuestionAt && now.getTime() - new Date(input.lastQuestionAt).getTime() < settings.minimumMinutesBetweenQuestions * 60000) return { allowed: false, reason: 'cooldown' as const };
  if (input.consecutiveSkips >= settings.pauseAfterConsecutiveSkips) return { allowed: false, reason: 'pause_active' as const, pauseUntil: new Date(now.getTime() + settings.pauseDurationMinutes * 60000).toISOString() };
  return { allowed: true, reason: null };
}
