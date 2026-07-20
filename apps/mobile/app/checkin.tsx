import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Screen, Section, Label } from '@/components/Screen';
import { createCheckin, saveResponse } from '@/storage/repositories';
import { setCheckinStatus } from '@/storage/repositories/checkinRepository';
import { colors } from '@/theme';

const choices = ['work', 'rest', 'move', 'eat', 'other'];
export default function Checkin() {
  const { checkinId } = useLocalSearchParams<{ checkinId?: string }>(); const [activity, setActivity] = useState(''); const [started, setStarted] = useState<boolean | null>(null); const [completed, setCompleted] = useState<boolean | null>(null); const [energy, setEnergy] = useState(3); const [saving, setSaving] = useState(false);
  async function submit() { if (!activity || started === null || completed === null || saving) return; setSaving(true); const checkin = checkinId ? { id: checkinId } : await createCheckin(); await saveResponse(checkin.id, { activity_type: activity, started, completed, energy }); router.replace('/evidence'); }
  async function skip() { const checkin = checkinId ? { id: checkinId } : await createCheckin(); await setCheckinStatus(checkin.id, 'skipped', 'user_skipped'); router.replace('/home'); }
  return <Screen eyebrow="CHECK-IN" title="短く記録する"><Section><Label>今の活動</Label><View style={styles.choices}>{choices.map((choice) => <Pressable key={choice} onPress={() => setActivity(choice)} style={[styles.choice, activity === choice && styles.selected]}><Text style={activity === choice ? styles.selectedText : styles.choiceText}>{choice}</Text></Pressable>)}</View><Label>活動を始めた？</Label><View style={styles.row}><Button label="はい" onPress={() => setStarted(true)} secondary={started !== true} /><Button label="いいえ" onPress={() => setStarted(false)} secondary={started !== false} /></View><Label>終えられた？</Label><View style={styles.row}><Button label="はい" onPress={() => setCompleted(true)} secondary={completed !== true} /><Button label="いいえ" onPress={() => setCompleted(false)} secondary={completed !== false} /></View><Label>エネルギー {energy}/5</Label><View style={styles.row}>{[1,2,3,4,5].map((value) => <Pressable key={value} onPress={() => setEnergy(value)} style={[styles.energy, energy === value && styles.energySelected]}><Text>{value}</Text></Pressable>)}</View><Button label="保存して評価する" onPress={submit} /><Button label="今回はスキップ" onPress={skip} secondary /></Section></Screen>;
}
const styles = StyleSheet.create({ choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, choice: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface }, selected: { backgroundColor: colors.teal, borderColor: colors.teal }, choiceText: { color: colors.ink }, selectedText: { color: '#FFF', fontWeight: '800' }, row: { flexDirection: 'row', gap: 8 }, energy: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: 8, backgroundColor: colors.surface }, energySelected: { backgroundColor: colors.amberSoft, borderColor: colors.amber } });
