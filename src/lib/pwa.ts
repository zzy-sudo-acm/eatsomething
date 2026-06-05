export const registerPwa = () => {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    const swUrl = new URL(`${import.meta.env.BASE_URL}sw.js`, window.location.href);
    navigator.serviceWorker.register(swUrl.href);
  });
};
