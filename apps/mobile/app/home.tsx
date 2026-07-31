import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Card, CardTitle, CardValue } from '@/components/Card';
import { Screen, Section } from '@/components/Screen';
import { getHomeData, type HomeData } from '@/storage/repositories';
import { listExperiments } from '@/storage/repositories/experimentRepository';
import { colors } from '@/theme';

type ActiveExperiment = { id: string; title: string; status: string; startedAt: string | null; durationDays: number };

function remainingDays(experiment: ActiveExperiment): number | null {
  if (!experiment.startedAt) return null;
  const elapsed = Math.floor((Date.now() - Date.parse(experiment.startedAt)) / 86400000);
  return Math.max(0, experiment.durationDays - elapsed);
}

export default function Home() {
  const [data, setData] = useState<HomeData | null>(null);
  const [activeExperiments, setActiveExperiments] = useState<ActiveExperiment[]>([]);
  useFocusEffect(useCallback(() => {
    let mounted = true;
    void Promise.all([getHomeData(), listExperiments({ userId: 'local-user', status: 'active' })]).then(([home, experiments]) => {
      if (!mounted) return;
      setData(home);
      setActiveExperiments(experiments);
    });
    return () => { mounted = false; };
  }, []));
  return <Screen eyebrow="METHEORY / TODAY" title="観察から、少しずつ"><Section>
    <Card tone="teal"><CardTitle>追跡中の仮説</CardTitle><CardValue>{data?.hypothesis?.statement ?? '読み込み中'}</CardValue><Text style={styles.muted}>{data?.hypothesis?.state === 'tracking' ? 'Tracking' : ''}</Text></Card>
    <Card><CardTitle>実行中の実験</CardTitle>{activeExperiments.length ? activeExperiments.map((experiment) => <View key={experiment.id}><CardValue>{experiment.title}</CardValue><Text style={styles.muted}>残り {remainingDays(experiment) ?? '-'}日 / 今日の観測は実験画面から</Text></View>) : <Text style={styles.muted}>実行中の実験はありません</Text>}<Button label="実験を見る" onPress={() => router.push('/experiments')} secondary /></Card>
    <View style={styles.row}><Card><CardTitle>評価履歴</CardTitle><CardValue>{data?.evaluations ?? 0} 件</CardValue></Card><Card><CardTitle>直近7日</CardTitle><CardValue>{data?.recentCheckins ?? 0} 観測</CardValue></Card></View>
    <Button label="今すぐチェックイン" onPress={() => router.push('/checkin')} /><Button label="仮説候補を見る" onPress={() => router.push('/hypotheses' as never)} secondary /><Button label="Evidenceを見る" onPress={() => router.push('/evidence')} secondary /><Button label="Self Modelを見る" onPress={() => router.push('/self-model')} secondary /><Button label="設定" onPress={() => router.push('/settings')} secondary />
  </Section></Screen>;
}
const styles = StyleSheet.create({ row: { flexDirection: 'row', gap: 10 }, muted: { color: colors.muted, fontSize: 13 } });