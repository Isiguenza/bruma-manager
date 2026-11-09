"use client";

import { useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { CaretRight, MagnifyingGlass } from "@phosphor-icons/react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { CommandMenu } from "@/components/command-menu";
import { findNav } from "@/lib/nav";

const noopSubscribe = () => () => {};

export function AppHeader() {
  const pathname = usePathname();
  const current = findNav(pathname);
  const [searchOpen, setSearchOpen] = useState(false);
  const isMac = useSyncExternalStore(
    noopSubscribe,
    () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent),
    () => true
  );

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70 lg:px-6">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="h-5" />

      <nav aria-label="Ubicación" className="flex min-w-0 items-center gap-1.5 text-sm">
        {current ? (
          <>
            <span className="hidden text-muted-foreground sm:inline">{current.section.title}</span>
            <CaretRight className="hidden size-3 text-muted-foreground/60 sm:inline" />
            <span className="truncate font-medium">{current.item.title}</span>
          </>
        ) : (
          <span className="font-medium">Bruma</span>
        )}
      </nav>

      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        className="ml-auto flex h-9 w-full max-w-xs items-center gap-2 rounded-lg border bg-muted/40 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <MagnifyingGlass className="size-4" />
        <span className="flex-1 text-left">Buscar…</span>
        <kbd className="hidden rounded border bg-background px-1.5 py-0.5 font-mono text-[11px] sm:inline">
          {isMac ? "⌘" : "Ctrl"} K
        </kbd>
      </button>

      <CommandMenu open={searchOpen} onOpenChange={setSearchOpen} />
    </header>
  );
}
