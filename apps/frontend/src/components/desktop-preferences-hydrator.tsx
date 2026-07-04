"use client";

import { useDesktopPreferences } from "@/hooks/use-desktop-preferences";

export function DesktopPreferencesHydrator() {
  useDesktopPreferences();
  return null;
}
