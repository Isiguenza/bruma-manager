"use client";

import { useEffect } from "react";

const EVENT = "bruma:search-seed";

/**
 * Deja que la búsqueda ⌘K precargue el buscador de una página: lee `?search=`
 * al montar y escucha el evento cuando ya estás en esa misma página (navegar a
 * la misma ruta no remonta el componente). Se usa `window` y no
 * `useSearchParams` a propósito: este último exige un `<Suspense>` en páginas
 * cliente y rompe el build si falta.
 */
export function useSearchSeed(setSearch: (value: string) => void) {
  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get("search");
    if (initial) setSearch(initial);

    const onSeed = (e: Event) => setSearch((e as CustomEvent<string>).detail ?? "");
    window.addEventListener(EVENT, onSeed);
    return () => window.removeEventListener(EVENT, onSeed);
  }, [setSearch]);
}

export function seedSearch(value: string) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: value }));
}
