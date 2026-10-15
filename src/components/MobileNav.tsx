import { useEffect, useRef, useState } from 'react';

interface Props {
  links: { href: string; label: string }[];
  current: string;
}

/** Accessible mobile menu: disclosure button + modal panel with focus trap and Escape to close. */
export default function MobileNav({ links, current }: Props) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current!;
    const focusables = () => [...panel.querySelectorAll<HTMLElement>('a, button')];
    focusables()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
      if (e.key === 'Tab') {
        const f = [buttonRef.current!, ...focusables()];
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.documentElement.style.overflow = '';
    };
  }, [open]);

  const isCurrent = (href: string) => current === href || current === href.replace(/\/$/, '');

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="menu-toggle inline-flex size-12 items-center justify-center rounded-full text-olive"
        aria-expanded={open}
        aria-controls="mobile-menu"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="sr-only">{open ? 'Close menu' : 'Open menu'}</span>
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 8h16M4 16h16" />}
        </svg>
      </button>
      {open && (
        <div
          id="mobile-menu"
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Site menu"
          className="on-dark fixed inset-x-0 bottom-0 top-[var(--header-h)] z-40 overflow-y-auto bg-olive text-ivory"
        >
          <nav aria-label="Mobile" className="container-x flex min-h-full flex-col gap-8 py-8">
            <ul className="flex flex-col">
              {links.map((l) => (
                <li key={l.href} className="border-b border-white/15">
                  <a
                    href={l.href}
                    aria-current={isCurrent(l.href) ? 'page' : undefined}
                    className="flex min-h-14 items-center justify-between font-display text-3xl text-ivory aria-[current=page]:italic"
                    onClick={() => setOpen(false)}
                  >
                    {l.label}
                    <span aria-hidden="true" className="text-xl opacity-70">→</span>
                  </a>
                </li>
              ))}
            </ul>
            <div className="flex flex-col gap-3 sm:flex-row">
              <a href="/order/" className="btn btn-primary" onClick={() => setOpen(false)}>Build an Order</a>
              <a href="/order/?type=event" className="btn btn-ghost" onClick={() => setOpen(false)}>Plan an Event</a>
            </div>
          </nav>
        </div>
      )}
    </>
  );
}
