type MobileRefreshListener = () => void | Promise<void>;

const listeners = new Set<MobileRefreshListener>();

export function subscribeToMobileRefresh(listener: MobileRefreshListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function requestMobileRefresh() {
  await Promise.allSettled(
    Array.from(listeners, (listener) => Promise.resolve().then(listener)),
  );
}
