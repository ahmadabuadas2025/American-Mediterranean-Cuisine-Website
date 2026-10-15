/**
 * Scroll motion: Lenis smooth scroll + GSAP ScrollTrigger. Loaded lazily and
 * skipped entirely for prefers-reduced-motion. Re-initialised after each
 * Astro view transition and torn down before the next swap.
 *
 * Hooks (data attributes):
 *   data-reveal            fade-and-rise, staggered with siblings in view
 *   data-reveal-words      headline revealed word by word (keeps <em>)
 *   data-parallax="0.15"   gentle vertical drift inside a rounded mask
 *   data-pin-steps         pinned "How it works" sequence (children: [data-step])
 *   data-hscroll           horizontal-scroll gallery (child: [data-hscroll-track])
 *   data-count-to="24"     animated counter
 */
import type Lenis from 'lenis';

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let lenis: Lenis | null = null;
let cleanup: (() => void)[] = [];
let rafId = 0;

function splitWords(el: HTMLElement) {
  if (el.dataset.split) return;
  el.dataset.split = '1';
  const walk = (node: Node) => {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        const frag = document.createDocumentFragment();
        (child.textContent ?? '').split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) frag.appendChild(document.createTextNode(part));
          else {
            const span = document.createElement('span');
            span.className = 'word';
            span.textContent = part;
            frag.appendChild(span);
          }
        });
        child.replaceWith(frag);
      } else if (child.nodeType === Node.ELEMENT_NODE) walk(child);
    });
  };
  walk(el);
}

export async function initMotion() {
  teardown();
  if (reduced()) return;

  document.documentElement.classList.add('js-motion');
  const [{ gsap }, { ScrollTrigger }, { default: LenisCtor }] = await Promise.all([
    import('gsap'),
    import('gsap/ScrollTrigger'),
    import('lenis'),
  ]);
  gsap.registerPlugin(ScrollTrigger);

  lenis = new LenisCtor({ duration: 1.05, smoothWheel: true });
  lenis.on('scroll', ScrollTrigger.update);
  const raf = (t: number) => { lenis?.raf(t); rafId = requestAnimationFrame(raf); };
  rafId = requestAnimationFrame(raf);

  const ctx = gsap.context(() => {
    // Headlines, word by word
    gsap.utils.toArray<HTMLElement>('[data-reveal-words]').forEach((el) => {
      splitWords(el);
      gsap.to(el.querySelectorAll('.word'), {
        opacity: 1, y: 0, duration: 0.9, ease: 'power3.out', stagger: 0.06,
        scrollTrigger: { trigger: el, start: 'top 88%', once: true },
      });
    });

    // Fade and rise, batched so siblings stagger
    ScrollTrigger.batch('[data-reveal]', {
      start: 'top 90%',
      once: true,
      onEnter: (els) => gsap.to(els, { opacity: 1, y: 0, duration: 0.85, ease: 'power3.out', stagger: 0.09, overwrite: true }),
    });

    // Parallax inside rounded masks
    gsap.utils.toArray<HTMLElement>('[data-parallax]').forEach((el) => {
      const amount = Number(el.dataset.parallax || 0.12);
      gsap.fromTo(el, { yPercent: -amount * 50 }, {
        yPercent: amount * 50, ease: 'none',
        scrollTrigger: { trigger: el.parentElement, start: 'top bottom', end: 'bottom top', scrub: true },
      });
    });

    // Pinned three-step sequence (desktop and tablet only)
    const mm = gsap.matchMedia();
    mm.add('(min-width: 768px)', () => {
      gsap.utils.toArray<HTMLElement>('[data-pin-steps]').forEach((section) => {
        const steps = gsap.utils.toArray<HTMLElement>('[data-step]', section);
        const bar = section.querySelector<HTMLElement>('[data-step-progress]');
        const setActive = (i: number) => steps.forEach((s, j) => s.toggleAttribute('data-active', i === j));
        setActive(0);
        ScrollTrigger.create({
          trigger: section,
          start: 'top top+=80',
          end: `+=${steps.length * 55}%`,
          pin: true,
          scrub: 0.4,
          onUpdate: (self) => {
            const i = Math.min(steps.length - 1, Math.floor(self.progress * steps.length));
            setActive(i);
            if (bar) bar.style.transform = `scaleX(${self.progress})`;
          },
        });
        return () => steps.forEach((s) => s.removeAttribute('data-active'));
      });

      // Horizontal-scroll gallery
      gsap.utils.toArray<HTMLElement>('[data-hscroll]').forEach((section) => {
        const track = section.querySelector<HTMLElement>('[data-hscroll-track]');
        if (!track) return;
        const distance = () => Math.max(0, track.scrollWidth - section.clientWidth);
        gsap.to(track, {
          x: () => -distance(),
          ease: 'none',
          scrollTrigger: { trigger: section, start: 'top top+=60', end: () => `+=${distance()}`, pin: true, scrub: 0.6, invalidateOnRefresh: true },
        });
      });
    });

    // Counters
    gsap.utils.toArray<HTMLElement>('[data-count-to]').forEach((el) => {
      const to = Number(el.dataset.countTo);
      const obj = { v: 0 };
      gsap.to(obj, {
        v: to, duration: 1.4, ease: 'power2.out',
        onUpdate: () => { el.textContent = Math.round(obj.v).toString(); },
        scrollTrigger: { trigger: el, start: 'top 90%', once: true },
      });
    });
  });

  // Recalculate after fonts/images settle so pins measure correctly.
  const refresh = () => ScrollTrigger.refresh();
  window.addEventListener('load', refresh, { once: true });
  document.fonts?.ready.then(refresh);

  cleanup.push(() => {
    ctx.revert();
    ScrollTrigger.getAll().forEach((t) => t.kill());
    window.removeEventListener('load', refresh);
  });
}

export function teardown() {
  cleanup.forEach((fn) => fn());
  cleanup = [];
  cancelAnimationFrame(rafId);
  lenis?.destroy();
  lenis = null;
}

/** Lets other scripts (e.g. the builder) scroll without fighting Lenis. */
export function scrollToEl(el: Element) {
  if (lenis) lenis.scrollTo(el as HTMLElement, { offset: -96 });
  else el.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
}
