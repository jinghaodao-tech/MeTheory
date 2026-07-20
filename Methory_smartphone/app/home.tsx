import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Card, CardTitle, CardValue } from '@/components/Card';
import { Screen, Section } from '@/components/Screen';
import { getHomeData, type HomeData } from '@/storage/repositories';
import { colors } from '@/theme';

export default function Home() {
  const [data, setData] = useState<HomeData | null>(null);
  useFocusEffect(useCallback(() => { getHomeData().then(setData); }, []));
  return <Screen eyebrow="TODAY" title="観察から、少しずつ"><Section><Card tone="teal"><CardTitle>追跡中の仮説</CardTitle><CardValue>{data?.hypothesis?.statement ?? '読み込み中'}</CardValue><Text style={styles.muted}>{data?.hypothesis?.state === 'tracking' ? 'Tracking' : ''}</Text></Card><View style={styles.row}><Card><CardTitle>評価履歴</CardTitle><CardValue>{data?.evaluations ?? 0} 件</CardValue></Card><Card><CardTitle>直近7日</CardTitle><CardValue>{data?.recentCheckins ?? 0} 観測</CardValue></Card></View><Button label="今すぐチェックイン" onPress={() => router.push('/checkin')} /><Button label="Evidenceを見る" onPress={() => router.push('/evidence')} secondary /><Button label="設定" onPress={() => router.push('/settings')} secondary /></Section></Screen>;
}
const styles = StyleSheet.create({ row: { flexDirection: 'row', gap: 10 }, muted: { color: colors.muted, fontSize: 13 } });
