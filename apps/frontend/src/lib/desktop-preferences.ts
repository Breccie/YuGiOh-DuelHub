export type GraphicsMode = "AUTO" | "BALANCED" | "LOW";

export type DesktopPreferences = {
  reducedMotion: boolean;
  graphicsMode: GraphicsMode;
};

export const desktopPreferencesStorageKey = "duelhub.desktopPreferences";
export const desktopPreferencesEventName = "duelhub:desktop-preferences";

export const defaultDesktopPreferences: DesktopPreferences = {
  reducedMotion: false,
  graphicsMode: "BALANCED",
};

function isGraphicsMode(value: unknown): value is GraphicsMode {
  return value === "AUTO" || value === "BALANCED" || value === "LOW";
}

export function normalizeDesktopPreferences(
  value: Partial<DesktopPreferences> | null | undefined,
): DesktopPreferences {
  return {
    reducedMotion: value?.reducedMotion === true,
    graphicsMode: isGraphicsMode(value?.graphicsMode)
      ? value.graphicsMode
      : defaultDesktopPreferences.graphicsMode,
  };
}

export function applyDesktopPreferencesToDocument(
  preferences: DesktopPreferences,
  root: HTMLElement = document.documentElement,
) {
  root.dataset.motion = preferences.reducedMotion ? "reduced" : "full";
  root.dataset.graphics = preferences.graphicsMode.toLowerCase();
}

export function readDesktopPreferencesFromStorage() {
  if (typeof window === "undefined") {
    return defaultDesktopPreferences;
  }

  try {
    const rawValue = window.localStorage.getItem(desktopPreferencesStorageKey);

    if (!rawValue) {
      return defaultDesktopPreferences;
    }

    return normalizeDesktopPreferences(JSON.parse(rawValue) as Partial<DesktopPreferences>);
  } catch {
    return defaultDesktopPreferences;
  }
}

export function writeDesktopPreferencesToStorage(preferences: DesktopPreferences) {
  if (typeof window === "undefined") {
    return;
  }

  const normalized = normalizeDesktopPreferences(preferences);
  window.localStorage.setItem(desktopPreferencesStorageKey, JSON.stringify(normalized));
  applyDesktopPreferencesToDocument(normalized);
  window.dispatchEvent(
    new CustomEvent(desktopPreferencesEventName, {
      detail: normalized,
    }),
  );
}

export function subscribeToDesktopPreferences(
  listener: (preferences: DesktopPreferences) => void,
) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handleInternalChange = (event: Event) => {
    const detail =
      event instanceof CustomEvent
        ? (event.detail as Partial<DesktopPreferences> | undefined)
        : undefined;

    listener(normalizeDesktopPreferences(detail));
  };

  const handleStorageChange = (event: StorageEvent) => {
    if (event.key !== desktopPreferencesStorageKey) {
      return;
    }

    listener(readDesktopPreferencesFromStorage());
  };

  window.addEventListener(desktopPreferencesEventName, handleInternalChange as EventListener);
  window.addEventListener("storage", handleStorageChange);

  return () => {
    window.removeEventListener(
      desktopPreferencesEventName,
      handleInternalChange as EventListener,
    );
    window.removeEventListener("storage", handleStorageChange);
  };
}
