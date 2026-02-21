let _prefersReducedMotion: boolean | null = null;

export function prefersReducedMotion(): boolean {
  if (_prefersReducedMotion === null) {
    _prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  return _prefersReducedMotion;
}

export function motionClass(baseClass: string, motion: string): string {
  if (prefersReducedMotion()) return baseClass;
  return `${baseClass} ${motion}`;
}

export const Motion = {
  panelEnter: "animate-motion-slide-down",
  fadeIn: "animate-motion-fade-in",
  slideUp: "animate-motion-slide-up",
  popIn: "animate-motion-pop-in",
  hoverLift:
    "transition-safe duration-motion-fast ease-out-premium hover:-translate-y-0.5",
  press: "active:scale-[0.98] transition-safe duration-motion-fast ease-out-premium",
  cardHover:
    "transition-safe duration-motion-base ease-out-premium hover:-translate-y-0.5 hover:shadow-soft",
  bellBounce: "animate-bell-bounce",
  badgePop: "animate-badge-pop",
  notifPanel: "notif-panel-motion origin-top-right",
  notifItemEnter: "animate-notif-item-enter",
  notifRowHover: "notif-row-hover",
} as const;
