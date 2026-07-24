import { useEffect, useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, Text, TextInput } from 'react-native';
import { router } from 'expo-router';
import { Screen, Section, Label } from '@/components/Screen';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { colors } from '@/theme';
import { cancelMeTheoryNotifications, requestMeTheoryNotificationPermission, scheduleDailyCheckins } from '@/notifications/scheduler';
import { defaultNotificationSettings, getNotificationSettings, setSetting, validateNotificationSettings, type NotificationSettings } from '@/storage/repositories/settingsRepository';
import { clearLocalData, exportLocalData } from '@/storage/dataManagement';

export default function Settings() {
  const [saved, setSaved] = useState<NotificationSettings>(defaultNotificationSettings);
  const [draft, setDraft] = useState<NotificationSettings>(defaultNotificationSettings);
  const [message, setMessage] = useState('');
  useEffect(() => { getNotificationSettings().then((value) => { setSaved(value); setDraft(value); }); }, []);
  async function save() {
    try {
      const next = validateNotificationSettings(draft);
      await cancelMeTheoryNotifications();
      await setSetting('notification_settings', next);
      setSaved(next);
      if (next.notification_enabled) {
        const granted = await requestMeTheoryNotificationPermission();
        if (!granted) { setMessage('Notification permission is disabled in system settings.'); return; }
      }
      await scheduleDailyCheckins();
      setMessage('Saved. Notifications were rescheduled.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save settings.'); }
  }
  async function shareData() { try { await Share.share({ title: 'MeTheory data export', message: await exportLocalData() }); } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not export data.'); } }
  function confirmClear() { Alert.alert('Delete local data?', 'This removes all beliefs, observations, evaluations, and notification records from this device.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => { await cancelMeTheoryNotifications(); await clearLocalData(); router.replace('/onboarding'); } }]); }
  const setDraftValue = (next: Partial<NotificationSettings>) => setDraft((current) => ({ ...current, ...next }));
  const updateQuiet = (index: number, value: Partial<{ start: string; end: string }>) => setDraft((current) => ({ ...current, quiet_periods: current.quiet_periods.map((period, periodIndex) => periodIndex === index ? { ...period, ...value } : period) }));
  return <Screen eyebrow="SETTINGS" title="Notification settings"><Section><Card><Label>Saved settings</Label><Text style={styles.text}>Notifications are scheduled only after pressing Save. Draft edits do not schedule anything.</Text><Text style={styles.muted}>Saved: {saved.window_start} - {saved.window_end}, limit {saved.daily_limit}, interval {saved.minimum_interval_minutes}m</Text></Card><Pressable onPress={() => setDraftValue({ notification_enabled: !draft.notification_enabled })} style={styles.toggle}><Text style={styles.text}>Notifications enabled</Text><Text style={styles.state}>{draft.notification_enabled ? 'ON' : 'OFF'}</Text></Pressable><Label>Window start</Label><TextInput value={draft.window_start} onChangeText={(value) => setDraftValue({ window_start: value })} style={styles.input} /><Label>Window end</Label><TextInput value={draft.window_end} onChangeText={(value) => setDraftValue({ window_end: value })} style={styles.input} /><Label>Daily limit: {draft.daily_limit}</Label><Pressable onPress={() => setDraftValue({ daily_limit: draft.daily_limit >= 5 ? 0 : draft.daily_limit + 1 })} style={styles.stepper}><Text style={styles.text}>Change daily limit</Text></Pressable><Label>Minimum interval: {draft.minimum_interval_minutes} minutes</Label><Pressable onPress={() => setDraftValue({ minimum_interval_minutes: draft.minimum_interval_minutes >= 720 ? 15 : draft.minimum_interval_minutes + 15 })} style={styles.stepper}><Text style={styles.text}>Change interval</Text></Pressable><Card><Label>Quiet periods</Label>{draft.quiet_periods.map((period, index) => <Card key={`${index}-${period.start}`}><TextInput accessibilityLabel="Quiet period start" value={period.start} onChangeText={(value) => updateQuiet(index, { start: value })} style={styles.input} placeholder="Start HH:mm" /><TextInput accessibilityLabel="Quiet period end" value={period.end} onChangeText={(value) => updateQuiet(index, { end: value })} style={styles.input} placeholder="End HH:mm" /><Button label="Remove quiet period" onPress={() => setDraft((current) => ({ ...current, quiet_periods: current.quiet_periods.filter((_, periodIndex) => periodIndex !== index) }))} secondary /></Card>)}<Button label="Add quiet period" onPress={() => setDraft((current) => ({ ...current, quiet_periods: [...current.quiet_periods, { start: '22:00', end: '07:00' }] }))} secondary /></Card><Button label="Save notification settings" onPress={save} />{message ? <Text style={styles.message}>{message}</Text> : null}<Card><Label>Local data</Label><Text style={styles.muted}>MeTheory stores data on this device. Export it for review or delete it to restart onboarding.</Text><Button label="Export local data" onPress={shareData} secondary /><Button label="Delete all local data" onPress={confirmClear} secondary /></Card></Section></Screen>;
}

const styles = StyleSheet.create({ text: { color: colors.ink, fontSize: 15, lineHeight: 23 }, muted: { color: colors.muted, fontSize: 13, lineHeight: 20 }, toggle: { minHeight: 56, paddingHorizontal: 16, borderRadius: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, state: { color: colors.teal, fontWeight: '800' }, input: { minHeight: 48, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, borderRadius: 8, paddingHorizontal: 14, color: colors.ink }, stepper: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line }, message: { color: colors.teal, fontWeight: '700' } });
