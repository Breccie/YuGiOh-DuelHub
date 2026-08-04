"use client";

export type ViewerPresentation = {
  displayName?: string;
  duelistId?: string | null;
  avatarImageUrl?: string | null;
};

const eventName = "duelhub:viewer-presentation";

export function publishViewerPresentation(viewer: ViewerPresentation) {
  window.dispatchEvent(new CustomEvent<ViewerPresentation>(eventName, { detail: viewer }));
}

export function subscribeViewerPresentation(listener: (viewer: ViewerPresentation) => void) {
  const handler = (event: Event) => {
    listener((event as CustomEvent<ViewerPresentation>).detail);
  };
  window.addEventListener(eventName, handler);
  return () => window.removeEventListener(eventName, handler);
}
