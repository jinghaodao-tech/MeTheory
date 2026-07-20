import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { migrate } from './db';
import { isOnboardingComplete } from './repositories';

const AppContext = createContext({ ready: false, onboarded: false, refresh: async () => {} });
export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [onboarded, setOnboarded] = useState(false);
  const refresh = async () => setOnboarded(await isOnboardingComplete());
  useEffect(() => { migrate().then(async () => { await refresh(); setReady(true); }); }, []);
  return <AppContext.Provider value={{ ready, onboarded, refresh }}>{children}</AppContext.Provider>;
}
export const useApp = () => useContext(AppContext);
