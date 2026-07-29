export type QuestionQualityIssue =
  | "multiple_concepts"
  | "unclear_timeframe"
  | "leading_question"
  | "diagnostic_wording"
  | "subjective_scale_mismatch"
  | "too_long"
  | "unclear_subject"
  | "not_observable";

export type QuestionQualityResult = {
  valid: boolean;
  issues: QuestionQualityIssue[];
  suggestedRevision?: string;
};

const timeframePattern = /(現在|今|今日|先ほど|直前|昨夜|この活動|この出来事|過去\d+日)/;
const subjectPattern = /(あなた|自分|作業|活動|出来事|今の状態|周囲の環境)/;
const diagnosticPattern = /(診断|診断名|障害|疾患|病気|ADHD|うつ病|双極症|自閉症)/i;
const leadingPattern = /(あなたは.*(苦手|問題|できない)|なぜ.*(できない|失敗)|きっと|必ず|本当に)/;
const nonObservablePattern = /(性格|本質|才能|意志の強さ|人間性)/;

export function validateQuestionQuality(input: {
  text: string;
  timeReference?: string;
  subject?: string;
  scaleMinimum?: number;
  scaleMaximum?: number;
  scaleLabels?: string[];
}): QuestionQualityResult {
  const issues: QuestionQualityIssue[] = [];
  const text = input.text.trim();
  if (!text || text.length > 240) issues.push("too_long");
  if (!input.timeReference?.trim() || !timeframePattern.test(input.timeReference)) {
    issues.push("unclear_timeframe");
  }
  if (!input.subject?.trim() || !subjectPattern.test(input.subject)) {
    issues.push("unclear_subject");
  }
  if (/(、|と).*(、|と).*(について|を教えて|選んで)/.test(text)) {
    issues.push("multiple_concepts");
  }
  if (diagnosticPattern.test(text)) issues.push("diagnostic_wording");
  else if (leadingPattern.test(text)) issues.push("leading_question");
  if (nonObservablePattern.test(text) && !timeframePattern.test(text)) {
    issues.push("not_observable");
  }
  if (
    input.scaleLabels?.length &&
    (input.scaleMinimum === undefined ||
      input.scaleMaximum === undefined ||
      input.scaleLabels.length !== input.scaleMaximum - input.scaleMinimum + 1)
  ) {
    issues.push("subjective_scale_mismatch");
  }
  const uniqueIssues = [...new Set(issues)];
  return {
    valid: uniqueIssues.length === 0,
    issues: uniqueIssues,
    ...(uniqueIssues.length
      ? {
          suggestedRevision:
            "対象と時間を一つに絞り、中立的で観察できる表現にしてください。"
        }
      : {})
  };
}
