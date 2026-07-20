import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Screen, Section, Label } from '@/components/Screen';
import { Card } from '@/components/Card';
import { colors } from '@/theme';
import { scheduleDailyCheckin } from '@/notifications/scheduler';
export default function Settings() { const [enabled, setEnabled] = useState(false); async function toggle() { const next = !enabled; setEnabled(next); if (next) await scheduleDailyCheckin(); } return <Screen eyebrow="SETTINGS" title="自分のペース"><Section><Card><Label>ローカル保存</Label><Text style={styles.text}>Self Belief、観測、評価履歴はこの端末のSQLiteに保存されます。</Text></Card><Pressable onPress={toggle} style={styles.toggle}><Text style={styles.text}>チェックイン通知</Text><Text style={styles.state}>{enabled ? 'ON' : 'OFF'}</Text></Pressable><Text style={styles.note}>通知時間帯、上限、静かな時間を次のMVPで編集できます。</Text></Section></Screen>; }
const styles = StyleSheet.create({ text: { color: colors.ink, fontSize: 15, lineHeight: 23 }, toggle: { minHeight: 56, paddingHorizontal: 16, borderRadius: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, state: { color: colors.teal, fontWeight: '800' }, note: { color: colors.muted, fontSize: 13 } });
