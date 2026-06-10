// PWA 注册与更新提示。
// 发现新版本时不偷偷刷新,而是通知 UI 弹「发现新版本」,用户点了再切换。

let waitingWorker: ServiceWorker | null = null;

export const registerPwa = (onUpdate?: () => void) => {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', async () => {
    const swUrl = new URL(`${import.meta.env.BASE_URL}sw.js`, window.location.href);
    try {
      const registration = await navigator.serviceWorker.register(swUrl.href);

      const notifyIfWaiting = () => {
        if (registration.waiting && navigator.serviceWorker.controller) {
          waitingWorker = registration.waiting;
          onUpdate?.();
        }
      };

      notifyIfWaiting();
      registration.addEventListener('updatefound', () => {
        const next = registration.installing;
        next?.addEventListener('statechange', () => {
          if (next.state === 'installed') notifyIfWaiting();
        });
      });

      // 回到前台时顺手检查一次更新。
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          registration.update().catch(() => undefined);
        }
      });
    } catch {
      // 注册失败就当普通网页用,不打扰。
    }
  });
};

export const applyUpdate = () => {
  if (!waitingWorker) {
    window.location.reload();
    return;
  }
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });
  waitingWorker.postMessage('SKIP_WAITING');
};
