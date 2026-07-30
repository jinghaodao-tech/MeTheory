import { useCallback, useState } from "react";
import { Text, TextInput } from "react-native";
import { useFocusEffect } from "expo-router";
import { Button } from "@/components/Button";
import { Card, CardTitle, CardValue } from "@/components/Card";
import { Screen, Section } from "@/components/Screen";
import {
  acceptExperimentDraft,
  evaluateExperimentForUser,
  experimentQuestions,
  latestExperimentEvaluation,
  listExperimentDrafts,
  listExperiments,
  transitionExperimentForUser,
  updateExperimentDraft
} from "@/storage/repositories/experimentRepository";
import { colors } from "@/theme";

const USER_ID = "local-user";
type DraftRow = { id: string; title: string; statement: string; durationDays: number; minimumObservations: number; minimumPerGroup: number };
type ExperimentRow = { id: string; status: string; title: string; statement: string; minimumObservations: number; minimumPerGroup: number };
type QuestionRow = { parameterId: string; text: string; minimumSamples: number; askable: boolean; reason: string };
type EvaluationRow = Awaited<ReturnType<typeof latestExperimentEvaluation>>;

type DraftEdit = { title: string; statement: string };

export default function Experiments() {
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [experiments, setExperiments] = useState<ExperimentRow[]>([]);
  const [questions, setQuestions] = useState<Record<string, QuestionRow[]>>({});
  const [evaluations, setEvaluations] = useState<Record<string, EvaluationRow>>({});
  const [draftEdits, setDraftEdits] = useState<Record<string, DraftEdit>>({});
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const nextDrafts = await listExperimentDrafts({ userId: USER_ID, status: "draft" });
      const nextExperiments = await listExperiments({ userId: USER_ID });
      const evaluationEntries = await Promise.all(nextExperiments.map(async (experiment) => [experiment.id, await latestExperimentEvaluation({ userId: USER_ID, experimentId: experiment.id })] as const));
      setDrafts(nextDrafts);
      setExperiments(nextExperiments);
      setEvaluations(Object.fromEntries(evaluationEntries));
      setDraftEdits((current) => Object.fromEntries(nextDrafts.map((draft) => [draft.id, current[draft.id] ?? { title: draft.title, statement: draft.statement }] )));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "実験を読み込めませんでした");
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function accept(draft: DraftRow) {
    try {
      const edit = draftEdits[draft.id];
      if (edit && (edit.title !== draft.title || edit.statement !== draft.statement)) await updateExperimentDraft({ userId: USER_ID, draftId: draft.id, patch: edit });
      await acceptExperimentDraft({ userId: USER_ID, draftId: draft.id });
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "実験を承認できませんでした");
    }
  }

  async function transition(experimentId: string, status: "active" | "paused" | "completed" | "cancelled") {
    try { await transitionExperimentForUser({ userId: USER_ID, experimentId, status }); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "実験の状態を変更できませんでした"); }
  }

  async function showQuestions(experimentId: string) {
    try { const items = await experimentQuestions({ userId: USER_ID, experimentId }); setQuestions((current) => ({ ...current, [experimentId]: items })); }
    catch (error) { setMessage(error instanceof Error ? error.message : "質問を読み込めませんでした"); }
  }

  async function evaluate(experimentId: string) {
    try { const result = await evaluateExperimentForUser({ userId: USER_ID, experimentId }); setMessage(`評価: ${result.status} / ${result.observationCount} observations`); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "実験を評価できませんでした"); }
  }

  return <Screen eyebrow="EXPERIMENTS" title="仮説検証"><Section>
    <Text style={{ color: colors.ink, lineHeight: 22 }}>仮説を小さな観測として確認します。承認前のドラフトは実験や通知を開始しません。</Text>
    {message ? <Text style={{ color: colors.amber }}>{message}</Text> : null}
    {drafts.map((draft) => {
      const edit = draftEdits[draft.id] ?? { title: draft.title, statement: draft.statement };
      return <Card key={draft.id} tone="amber">
        <CardTitle>実験ドラフト</CardTitle>
        <TextInput value={edit.title} onChangeText={(title) => setDraftEdits((current) => ({ ...current, [draft.id]: { ...edit, title } }))} style={{ color: colors.ink, borderBottomColor: colors.line, borderBottomWidth: 1, paddingVertical: 8 }} />
        <TextInput value={edit.statement} onChangeText={(statement) => setDraftEdits((current) => ({ ...current, [draft.id]: { ...edit, statement } }))} multiline style={{ color: colors.ink, borderBottomColor: colors.line, borderBottomWidth: 1, paddingVertical: 8 }} />
        <Text style={{ color: colors.muted }}>期間 {draft.durationDays}日 / 最低 {draft.minimumObservations}件 / 各群 {draft.minimumPerGroup}件</Text>
        <Button label="内容を確認して承認" onPress={() => void accept(draft)} />
      </Card>;
    })}
    {experiments.map((experiment) => {
      const evaluation = evaluations[experiment.id];
      return <Card key={experiment.id} tone="teal">
        <CardTitle>{experiment.status}</CardTitle>
        <CardValue>{experiment.title}</CardValue>
        <Text style={{ color: colors.ink }}>{experiment.statement}</Text>
        <Text style={{ color: colors.muted }}>必要件数 {experiment.minimumObservations} / グループごと {experiment.minimumPerGroup}</Text>
        <Button label="必要な質問を見る" onPress={() => void showQuestions(experiment.id)} secondary />
        {questions[experiment.id]?.map((question) => <Text key={question.parameterId} style={{ color: colors.muted }}>質問: {question.text} ({question.reason})</Text>)}
        {experiment.status === "ready" ? <Button label="実験を開始" onPress={() => void transition(experiment.id, "active")} /> : null}
        {experiment.status === "active" ? <><Button label="一時停止" onPress={() => void transition(experiment.id, "paused")} secondary /><Button label="実験を完了" onPress={() => void transition(experiment.id, "completed")} /><Button label="実験を中止" onPress={() => void transition(experiment.id, "cancelled")} secondary /></> : null}
        {experiment.status === "paused" ? <Button label="再開" onPress={() => void transition(experiment.id, "active")} /> : null}
        {experiment.status === "completed" ? <Button label="決定論的に評価" onPress={() => void evaluate(experiment.id)} /> : null}
        {evaluation ? <><Text style={{ color: colors.ink }}>評価: {evaluation.status} / 対象 {evaluation.observationCount}件</Text><Text style={{ color: colors.muted }}>{evaluation.sensitivitySummary.explanation}</Text><Text style={{ color: colors.muted }}>次の選択肢: {evaluation.nextOptions.join(", ")}</Text></> : null}
      </Card>;
    })}
  </Section></Screen>;
}