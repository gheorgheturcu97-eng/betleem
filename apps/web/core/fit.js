// ⤢ The whole song on one screen (phone, tablet): the biggest letters at which every line fits, in one column on a
// phone held upright, in 2–3 columns when it is held sideways or on a tablet. Nothing to scroll while you sing/play.
// fitWhole(el): el must already hold the song; its sections should be blocks (they are never cut between columns).
// unfit(el): back to the normal page that scrolls.

const KEEP = '[data-fit-keep]';                  // blocks that must stay whole (a section, a slide)

// own: the element already has its height (a flex child that fills the space); below: a bar fixed under it (buttons)
export function fitWhole(el, { min = 7, max = 34, pad = 8, own = false, below = null } = {}) {
  if (!el || !el.isConnected || el.hidden) return;
  const top = el.getBoundingClientRect().top;
  const bottom = below && !below.hidden && below.getClientRects().length ? below.getBoundingClientRect().top : (visualViewport?.height || innerHeight);
  const h = own ? el.clientHeight : Math.max(160, Math.floor(bottom - top - pad));
  el.classList.add('fit-whole');
  Object.assign(el.style, { height: h + 'px', maxHeight: h + 'px', overflow: 'hidden', columnFill: 'auto', columnGap: '22px' });
  el.querySelectorAll(KEEP).forEach(b => { b.style.breakInside = 'avoid'; });
  const w = el.clientWidth;
  const tries = w < 520 ? [1, 2] : w < 900 ? [2, 1, 3] : [3, 2, 4];
  let best = { px: min, cols: tries[0] };
  for (const cols of tries) {
    el.style.columnCount = String(cols);
    let lo = min, hi = max;
    while (hi - lo > 0.5) {                       // the largest size at which nothing spills out (down or to the right)
      const mid = (lo + hi) / 2;
      el.style.fontSize = mid + 'px';
      if (fits(el)) lo = mid; else hi = mid;
    }
    if (lo > best.px) best = { px: lo, cols };
  }
  el.style.columnCount = String(best.cols);
  el.style.fontSize = best.px + 'px';
  if (!fits(el)) el.style.overflow = 'auto';     // too little room even at the smallest letters (phone sideways): scroll, never cut
  el.scrollTop = 0;
}

// nothing spills out: not by scrolling, and no block cut by the bottom/right edge (a block taller than a column is clipped
// without making the box scroll, so every block is measured too)
function fits(el) {
  if (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) return false;
  const r = el.getBoundingClientRect();
  const blocks = el.querySelectorAll(KEEP);
  for (const b of blocks.length ? blocks : el.children) {
    const q = b.getBoundingClientRect();
    if (q.height && (q.bottom > r.bottom + 1 || q.right > r.right + 1)) return false;
  }
  return true;
}

export function unfit(el) {
  if (!el || !el.classList.contains('fit-whole')) return;
  el.classList.remove('fit-whole');
  for (const k of ['height', 'maxHeight', 'overflow', 'columnFill', 'columnGap', 'columnCount', 'fontSize']) el.style[k] = '';
}
