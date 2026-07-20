import { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, shadow } from '@/theme';

export function Card({ children, tone = 'surface' }: { children: ReactNode; tone?: 'surface' | 'teal' | 'amber' }) {
  return <View style={[styles.card, tone === 'teal' && styles.teal, tone === 'amber' && styles.amber]}>{children}</View>;
}
export function CardTitle({ children }: { children: ReactNode }) { return <Text style={styles.title}>{children}</Text>; }
export function CardValue({ children }: { children: ReactNode }) { return <Text style={styles.value}>{children}</Text>; }
const styles = StyleSheet.create({ card: { backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.line, padding: 18, gap: 8, ...shadow }, teal: { backgroundColor: colors.tealSoft, borderColor: '#B9DDD4' }, amber: { backgroundColor: colors.amberSoft, borderColor: '#E9CCAA' }, title: { color: colors.ink, fontSize: 15, fontWeight: '800' }, value: { color: colors.ink, fontSize: 18, fontWeight: '800' } });
