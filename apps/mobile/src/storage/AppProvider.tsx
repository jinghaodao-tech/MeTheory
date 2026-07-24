import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { migrate } from './db';
import { isOnboardingComplete } from './repositories';
import { scheduleNextCheckin } from '@/notifications/scheduler';
import { expireOverdueCheckins } from './repositories/checkinRepository';

const AppContext = createContext({ ready: false, onboarded: false, refresh: async () => {} });
export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [onboarded, setOnboarded] = useState(false);
  const refresh = async () => setOnboarded(await isOnboardingComplete());
  useEffect(() => { migrate().then(async () => { await expireOverdueCheckins(); await refresh(); setReady(true); if (await isOnboardingComplete()) void scheduleNextCheckin(); }); }, []);
  useEffect(() => { if (!ready || !onboarded) return; const sync = () => { void expireOverdueCheckins().then(() => scheduleNextCheckin()); }; const subscription = AppState.addEventListener('change', (state: AppStateStatus) => { if (state === 'active') sync(); }); return () => subscription.remove(); }, [ready, onboarded]);
  return <AppContext.Provider value={{ ready, onboarded, refresh }}>{children}</AppContext.Provider>;
}
export const useApp = () => useContext(AppContext);
