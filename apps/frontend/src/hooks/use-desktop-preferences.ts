"use client";

import { useEffect, useState } from "react";
import {
  applyDesktopPreferencesToDocument,
  defaultDesktopPreferences,
  readDesktopPreferencesFromStorage,
  subscribeToDesktopPreferences,
  type DesktopPreferences,
} from "@/lib/desktop-preferences";

export function useDesktopPreferences() {
  const [preferences, setPreferences] = useState<DesktopPreferences>(() =>
    typeof window === "undefined"
      ? defaultDesktopPreferences
      : readDesktopPreferencesFromStorage(),
  );

  useEffect(() => {
    applyDesktopPreferencesToDocument(preferences);

    return subscribeToDesktopPreferences((nextPreferences) => {
      applyDesktopPreferencesToDocument(nextPreferences);
      setPreferences(nextPreferences);
    });
  }, [preferences]);

  return preferences;
}
