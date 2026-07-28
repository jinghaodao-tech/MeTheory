export type QuestionQualityIssue = "multiple_concepts" | "unclear_timeframe" | "leading_question" | "diagnostic_wording" | "subjective_scale_mismatch" | "too_long" | "unclear_subject" | "not_observable";
export type QuestionQualityResult = { valid: boolean; issues: QuestionQualityIssue[]; suggestedRevision?: string };
export function validateQuestionQuality(input: { text: string; timeReference?: string; subject?: string; scaleMinimum?: number; scaleMaximum?: number; scaleLabels?: string[] }): QuestionQualityResult {
  const issues: QuestionQualityIssue[] = []; const text = input.text.trim();
  if (!text || text.length > 240) issues.push("too_long");
  if (!input.timeReference || !/(今|現在|先ほど|今日|昨日|この|直近|予定)/.test(input.timeReference)) issues.push("unclear_timeframe");
  if (!input.subject || !input.subject.trim() || !/(あなた|自分|作業|活動|予定|環境|気分|体調)/.test(input.subject)) issues.push("unclear_subject");
  if (/[、,].*(と|および|または).*[、,]/.test(text) || /と.*と/.test(text)) issues.push("multiple_concepts");
  if (/(あなたは|性格|診断|障害|疾患|うつ|ADHD|必ず|絶対)/i.test(text)) issues.push(/診断|障害|疾患|うつ|ADHD/i.test(text) ? "diagnostic_wording" : "leading_question");
  if (/(きっと|当然|正直に|本当は|なぜできない)/.test(text)) issues.push("leading_question");
  if (/(集中力|性格|内向|外向|能力)/.test(text) && !/(今|今日|作業|活動|時間)/.test(text)) issues.push("not_observable");
  if (input.scaleLabels && input.scaleLabels.length > 0 && (input.scaleMinimum === undefined || input.scaleMaximum === undefined || input.scaleLabels.length !== input.scaleMaximum - input.scaleMinimum + 1)) issues.push("subjective_scale_mismatch");
  return { valid: issues.length === 0, issues: [...new Set(issues)], ...(issues.length ? { suggestedRevision: "対象と時間を一つに絞り、観察できる行動や状態として尋ねてください。" } : {}) };
}
