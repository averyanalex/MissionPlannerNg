import { useSyncExternalStore, useMemo } from "react";

type Breakpoints = {
  sm: boolean;
  md: boolean;
  lg: boolean;
  xl: boolean;
  isMobile: boolean;
};

function subscribe(cb: () => void) {
  const queries = [
    window.matchMedia("(min-width: 640px)"),
    window.matchMedia("(min-width: 768px)"),
    window.matchMedia("(min-width: 1024px)"),
    window.matchMedia("(min-width: 1280px)"),
  ];
  for (const q of queries) q.addEventListener("change", cb);
  return () => { for (const q of queries) q.removeEventListener("change", cb); };
}

function getSnapshot(): string {
  const sm = window.matchMedia("(min-width: 640px)").matches;
  const md = window.matchMedia("(min-width: 768px)").matches;
  const lg = window.matchMedia("(min-width: 1024px)").matches;
  const xl = window.matchMedia("(min-width: 1280px)").matches;
  return `${+sm}${+md}${+lg}${+xl}`;
}

function getServerSnapshot(): string {
  return "1111"; // assume desktop for SSR
}

export function useBreakpoint(): Breakpoints {
  const key = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return useMemo<Breakpoints>(() => {
    const sm = key[0] === "1";
    const md = key[1] === "1";
    const lg = key[2] === "1";
    const xl = key[3] === "1";
    return { sm, md, lg, xl, isMobile: !lg };
  }, [key]);
}
