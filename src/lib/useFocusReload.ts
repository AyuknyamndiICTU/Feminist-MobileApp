import { useIsFocused } from 'expo-router';
import { useEffect } from 'react';

/** Runs `load` whenever the screen gains focus or the shared data version changes while focused. */
export function useFocusReload(load: () => void, dataVersion: number): void {
  const focused = useIsFocused();
  useEffect(() => {
    if (focused) load();
  }, [focused, load, dataVersion]);
}
