export const WORKSPACE_CHANGED = "corro:workspace-changed";
export function notifyWorkspaceChanged(sessionId?: string | null) {
  window.dispatchEvent(
    new CustomEvent(WORKSPACE_CHANGED, {
      detail: { sessionId: sessionId ?? null },
    }),
  );
}
export function onWorkspaceChanged(
  sessionId: string | null | undefined,
  refresh: () => void,
) {
  const listener = (event: Event) => {
    if ((event as CustomEvent).detail?.sessionId === (sessionId ?? null))
      refresh();
  };
  window.addEventListener(WORKSPACE_CHANGED, listener);
  return () => window.removeEventListener(WORKSPACE_CHANGED, listener);
}
