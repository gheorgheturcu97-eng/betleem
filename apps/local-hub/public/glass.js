// The live background, blurred behind the app; its average colour tints the glass.
let current = null;
export function backdrop(name) {
  name = name || '';
  if (name === current) return;
  current = name;
  let el = document.querySelector('.backdrop');
  if (!el) { el = Object.assign(document.createElement('div'), { className: 'backdrop' }); document.body.prepend(el); }
  document.body.classList.toggle('has-bg', !!name);
  if (!name) { el.innerHTML = ''; document.documentElement.style.removeProperty('--tint'); return; }
  const src = '/media/' + encodeURIComponent(name);
  const video = /\.(mp4|webm|mov)$/i.test(name);
  // a still picture is enough (a second playing video would cost the computer for nothing)
  const media = video ? Object.assign(document.createElement('video'), { src, muted: true, preload: 'auto', playsInline: true })
    : Object.assign(document.createElement('img'), { src, alt: '' });
  const tint = () => {
    try {
      const c = Object.assign(document.createElement('canvas'), { width: 16, height: 9 }), x = c.getContext('2d');
      x.drawImage(media, 0, 0, 16, 9);
      const d = x.getImageData(0, 0, 16, 9).data; let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) { const w = 1 + Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]); r += d[i] * w; g += d[i + 1] * w; b += d[i + 2] * w; n += w; }
      const k = 150 / Math.max(1, Math.max(r, g, b) / n);                                    // keep the hue, even out the brightness
      document.documentElement.style.setProperty('--tint', [r, g, b].map(v => Math.round(Math.min(255, v / n * k))).join(','));
    } catch {}
  };
  if (video) media.addEventListener('loadeddata', () => { media.currentTime = Math.min(1, media.duration / 2 || 0); media.addEventListener('seeked', tint, { once: true }); }, { once: true });
  else media.onload = tint;
  el.replaceChildren(media);
}
