import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Text } from 'react-native';
import { Card, CardTitle, CardValue } from '@/components/Card';
import { Screen, Section } from '@/components/Screen';
import { listEvaluations } from '@/storage/repositories';
import { colors } from '@/theme';
type Evaluation = { id: string; result: string; observed_effect: number | null; evaluated_at: string; cohort_metrics_json: string };
export default function Evidence() { const [items, setItems] = useState<Evaluation[]>([]); useFocusEffect(useCallback(() => { listEvaluations().then(setItems); }, [])); return <Screen eyebrow="EVIDENCE" title="評価履歴"><Section>{items.length === 0 ? <Card tone="amber"><CardTitle>まだ評価はありません</CardTitle><Text style={{ color: colors.muted }}>観測を重ねると、比較評価がここに表示されます。</Text></Card> : items.map((item) => <Card key={item.id}><CardTitle>{item.result}</CardTitle><CardValue>{item.observed_effect === null ? '効果を判定できません' : `観測効果 ${item.observed_effect > 0 ? '+' : ''}${item.observed_effect.toFixed(2)}`}</CardValue><Text style={{ color: colors.muted }}>evaluator: comparison-v1</Text><Text style={{ color: colors.muted }}>{new Date(item.evaluated_at).toLocaleString()}</Text></Card>)}</Section></Screen>; }
