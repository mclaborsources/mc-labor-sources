'use client';

import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { popupPosition, type PopupAnchor } from './popup-position';

let lastTrigger: { rect: PopupAnchor; time: number } | null = null;
let listeners = 0;
function rememberTrigger(event: MouseEvent) {
  if (!(event.target instanceof Element)) return;
  // A menu option opens the dialog, but the menu's summary is its visible trigger.
  // Capture it before the click handler closes the details menu.
  const menuTrigger = event.target.closest('details')?.querySelector(':scope > summary');
  const target = menuTrigger ?? event.target.closest('button, a, summary, [role="button"], input, select, [tabindex]') ?? event.target;
  lastTrigger = { rect: target.getBoundingClientRect(), time: Date.now() };
}

/** Shared popup policy, including keyboard-triggered clicks and nested dialogs. */
export function usePopupPosition<T extends HTMLElement = HTMLDivElement>(open: boolean, fullScreen = false, offsetX = 0) {
  const panelRef = useRef<T>(null);
  const [style, setStyle] = useState<CSSProperties | undefined>();
  useLayoutEffect(() => {
    if (listeners++ === 0) document.addEventListener('click', rememberTrigger, true);
    return () => {
      if (--listeners === 0) {
        document.removeEventListener('click', rememberTrigger, true);
        lastTrigger = null;
      }
    };
  }, []);
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!open || fullScreen || !panel) { setStyle(undefined); return; }
    // Freeze the opening trigger so interaction inside the popup cannot move it.
    const active = document.activeElement;
    const anchor = lastTrigger && Date.now() - lastTrigger.time < 2000
      ? lastTrigger.rect
      : active instanceof HTMLElement && active !== document.body && !panel.contains(active)
        ? active.getBoundingClientRect() : null;
    const place = () => {
      const position = popupPosition(anchor, panel.offsetWidth, panel.offsetHeight, window.innerWidth, window.innerHeight, offsetX);
      const next: CSSProperties | undefined = position
        ? { position: 'fixed', ...position, width: `calc(100% - ${window.innerWidth >= 640 ? 48 : 32}px)` }
        : undefined;
      setStyle(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(panel);
    window.addEventListener('resize', place);
    return () => { observer.disconnect(); window.removeEventListener('resize', place); };
  }, [open, fullScreen, offsetX]);
  return { panelRef, popupStyle: style };
}
