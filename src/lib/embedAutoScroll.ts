import { prefersReducedMotion } from './reducedMotion';

/**
 * Auto-scroll for when this site is shown as a live preview inside another
 * page (an <iframe>, e.g. the portfolio's showreel). Opt-in: it only runs when
 * the page is framed AND the URL has `?autoscroll`, so normal visitors never
 * see it. Loop: short pause at the top -> eased, steady scroll down -> pause
 * at the bottom -> eased scroll back up -> repeat.
 */
export function initEmbedAutoScroll() {
  if (typeof window === 'undefined') return;
  if (window.self === window.top) return;
  if (!/[?&]autoscroll(=|&|$)/.test(window.location.search)) return;
  if (prefersReducedMotion()) return;

  const SPEED = 230; // px per second while scrolling down (page body)
  // Inside the 300vh video-scrub hero the footage advances with the scroll. Scrolling at
  // exactly (2 x viewport) / (remaining seconds) plays it back in real time (~24 frames/s);
  // slower means fewer frames per second and reads as choppy, faster skips frames.
  const heroSpeed = () => {
    const v = document.querySelector('video');
    const left = v && v.duration ? v.duration - v.currentTime : 0;
    return left > 1 ? (2 * window.innerHeight) / left : 280;
  };
  let heroSpeedPx = 280;
  const TOP_PAUSE = 1.4; // s
  const BOTTOM_PAUSE = 1.6; // s
  const UP_TIME = 2.2; // s to ease back to the top
  const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  type Phase = 'top' | 'down' | 'bottom' | 'up' | 'restart';
  let phase: Phase = 'top';
  let phaseStart = performance.now();
  let y = 0;
  let upFrom = 0;
  let vel = 0; // px/s, smoothed
  let last = performance.now();
  const pageStart = performance.now();

  const maxY = () => Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  const go = (p: Phase, now: number) => {
    phase = p;
    phaseStart = now;
  };

  // Back at the top: start over from the very beginning (headlight switching on,
  // then the full turntable circle). The hero intro only plays on page load, so
  // fade to the hero's own dark tone and reload the framed page.
  const restart = (now: number) => {
    go('restart', now);
    const veil = document.createElement('div');
    veil.style.cssText =
      'position:fixed;inset:0;z-index:2147483000;background:#221f17;opacity:0;pointer-events:none;transition:opacity .45s ease';
    document.body.appendChild(veil);
    requestAnimationFrame(() => requestAnimationFrame(() => (veil.style.opacity = '1')));
    window.setTimeout(() => window.location.reload(), 520);
  };

  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const el = (now - phaseStart) / 1000;
    if (!document.hidden) {
      if (phase === 'top') {
        y = 0;
        // the hero plays its own intro first and keeps scroll locked until it
        // pauses (INTRO_END); don't start before that or the move is swallowed
        const hv = document.querySelector('video');
        const introDone = !hv || (hv.paused && hv.currentTime > 3.5) || now - pageStart > 12000;
        if (!introDone) phaseStart = now;
        else if (el > TOP_PAUSE) {
          heroSpeedPx = heroSpeed();
          vel = 0;
          go('down', now);
        }
      } else if (phase === 'down') {
        // Velocity is low-pass filtered, so every change of speed (start, hero ->
        // page body, braking before the bottom) is a smooth curve, never a step.
        const dist = maxY() - y;
        const base = y < window.innerHeight * 3 ? heroSpeedPx : SPEED;
        const k = Math.min(1, dist / 350);
        const brake = Math.max(0.12, k * k * (3 - 2 * k));
        vel += (base * brake - vel) * (1 - Math.exp(-dt / 0.32));
        y += vel * dt;
        if (dist < 1.5) {
          y = maxY();
          go('bottom', now);
        }
      } else if (phase === 'bottom') {
        if (el > BOTTOM_PAUSE) {
          upFrom = y;
          go('up', now);
        }
      } else if (phase === 'up') {
        const t = Math.min(1, el / UP_TIME);
        y = upFrom * (1 - ease(t));
        if (t >= 1) {
          y = 0;
          restart(now);
        }
      }
      window.scrollTo(0, y);
    }
    requestAnimationFrame(frame);
  };

  // wait until the page has laid out before the first move
  window.addEventListener('load', () => {
    last = performance.now();
    phaseStart = last;
    requestAnimationFrame(frame);
  });
  if (document.readyState === 'complete') {
    last = performance.now();
    phaseStart = last;
    requestAnimationFrame(frame);
  }
}
