import { useEffect, useState } from 'react';

/** Hash routing — works on GitHub Pages and any static host with no server rewrites. */
export type Route = { path: string; query: URLSearchParams };

function parse(): Route {
  const raw = window.location.hash.replace(/^#/, '') || '/pipeline';
  const [path, qs = ''] = raw.split('?');
  return { path: path || '/pipeline', query: new URLSearchParams(qs) };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const on = () => setRoute(parse());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function navigate(to: string) {
  window.location.hash = to.startsWith('#') ? to : `#${to}`;
}
