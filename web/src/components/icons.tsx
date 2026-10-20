import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;
const base = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", viewBox: "0 0 24 24" } as const;

export const LeafIcon = (p: P) => (
  <svg viewBox="0 0 32 32" fill="currentColor" {...p}>
    <path d="M27 4C14 4 5 10 5 20c0 2.2.6 4.2 1.6 5.9C9 18 14 13 21 10c-6 4-10.5 9.4-12.6 17 1.8 1 3.8 1.5 6 1.5C24 28.5 28 18 27 4z" />
  </svg>
);
export const PinIcon = (p: P) => (
  <svg {...base} {...p}><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
);
export const BuildingIcon = (p: P) => (
  <svg {...base} {...p}><path d="M3 21h18M5 21V8l7-4 7 4v13M9 21v-6h6v6M9 10h.01M15 10h.01" /></svg>
);
export const CheckIcon = (p: P) => (
  <svg {...base} {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
);
export const ClockIcon = (p: P) => (
  <svg {...base} {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
);
export const FlameIcon = (p: P) => (
  <svg {...base} {...p}><path d="M12 3c1 4 5 5.5 5 10.5a5 5 0 0 1-10 0c0-2.5 1.5-4 2.5-5 .3 1.6 1 2.5 2 3 0-3-.5-5.5.5-8.5z" /></svg>
);
export const SearchIcon = (p: P) => (
  <svg {...base} {...p}><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4-4" /></svg>
);
export const CloseIcon = (p: P) => (
  <svg {...base} {...p}><path d="M6 6l12 12M18 6L6 18" /></svg>
);
export const DocIcon = (p: P) => (
  <svg {...base} {...p}><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5M10 13h6M10 17h6" /></svg>
);
export const AlertIcon = (p: P) => (
  <svg {...base} {...p}><path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17h.01" /></svg>
);
export const ShieldIcon = (p: P) => (
  <svg {...base} {...p}><path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z" /><path d="M8.5 12l2.5 2.5 4.5-5" /></svg>
);
