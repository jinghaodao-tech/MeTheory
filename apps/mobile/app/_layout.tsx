import { Stack, router } from 'expo-router';
import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { AppProvider } from '@/storage/AppProvider';

export default function Layout() {
  useEffect(() => { const subscription = Notifications.addNotificationResponseReceivedListener((response) => { const data = response.notification.request.content.data as { checkinId?: string }; router.push(data.checkinId ? `/checkin?checkinId=${data.checkinId}` : '/checkin'); }); return () => subscription.remove(); }, []);
  return <AppProvider><StatusBar style="dark" /><Stack screenOptions={{ headerShown: false }} /></AppProvider>;
}
