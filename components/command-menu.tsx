"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ClipboardText, ForkKnife, Moon, SignOut, Sun } from "@phosphor-icons/react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { Command } from "@/components/ui/command";
import { useTheme } from "@/components/theme-provider";
import { navSections } from "@/lib/nav";
import { seedSearch } from "@/lib/use-search-seed";
import { toast } from "sonner";

type ProductHit = {
  id: string;
  name: string;
  price: string;
  active?: boolean;
  category?: { name: string } | null;
};

/**
 * Búsqueda global (⌘K / Ctrl+K): páginas, platillos y órdenes por número.
 * Elegir un platillo u orden lleva a su página con el buscador ya lleno.
 */
export function CommandMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const { setTheme } = useTheme();
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<ProductHit[] | null>(null);

  // Al cerrar se limpia la búsqueda (en el handler, no en un efecto).
  function setOpen(next: boolean) {
    if (!next) setQuery("");
    onOpenChange(next);
  }

  // ⌘K / Ctrl+K desde cualquier página.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Platillos: se cargan la primera vez que se abre, no en cada página.
  useEffect(() => {
    if (!open || products) return;
    fetch("/api/products")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: ProductHit[]) => setProducts(Array.isArray(data) ? data : []))
      .catch(() => setProducts([]));
  }, [open, products]);

  function go(url: string, search?: string) {
    setOpen(false);
    if (search === undefined) {
      router.push(url);
    } else if (pathname === url) {
      seedSearch(search);
    } else {
      router.push(`${url}?search=${encodeURIComponent(search)}`);
    }
  }

  async function logout() {
    setOpen(false);
    await fetch("/api/auth/logout", { method: "POST" });
    toast.success("Sesión cerrada");
    router.push("/login");
    router.refresh();
  }

  const orderNumber = query.trim().replace(/^#/, "");
  const isOrderNumber = /^\d{1,6}$/.test(orderNumber);
  const formatPrice = (price: string) =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(price) || 0);

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Buscar" description="Busca páginas, platillos u órdenes">
      <Command>
        <CommandInput placeholder="Buscar páginas, platillos o # de orden…" value={query} onValueChange={setQuery} />
        <CommandList className="max-h-[420px]">
          <CommandEmpty>Sin resultados para “{query}”.</CommandEmpty>

          {isOrderNumber && (
            <CommandGroup heading="Órdenes">
              <CommandItem value={`orden ${orderNumber}`} onSelect={() => go("/orders/history", orderNumber)}>
                <ClipboardText />
                <span>Ver orden #{orderNumber}</span>
              </CommandItem>
            </CommandGroup>
          )}

          {navSections.map((section) => (
            <CommandGroup key={section.title} heading={section.title}>
              {section.items.map((item) => (
                <CommandItem
                  key={item.url}
                  value={`${item.title} ${section.title}`}
                  keywords={item.keywords}
                  onSelect={() => go(item.url)}
                >
                  <item.icon />
                  <span>{item.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}

          {query.trim().length >= 2 && products && products.length > 0 && (
            <CommandGroup heading="Platillos">
              {products.slice(0, 400).map((p) => (
                <CommandItem
                  key={p.id}
                  value={`platillo ${p.name} ${p.category?.name ?? ""} ${p.id}`}
                  onSelect={() => go("/inventory/products", p.name)}
                >
                  <ForkKnife />
                  <span className="truncate">{p.name}</span>
                  {p.active === false && <span className="text-xs text-muted-foreground">inactivo</span>}
                  <CommandShortcut className="tracking-normal">
                    {p.category?.name ? `${p.category.name} · ` : ""}
                    {formatPrice(p.price)}
                  </CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          <CommandSeparator />
          <CommandGroup heading="Acciones">
            <CommandItem value="tema claro" onSelect={() => { setTheme("light"); setOpen(false); }}>
              <Sun />
              <span>Tema claro</span>
            </CommandItem>
            <CommandItem value="tema oscuro" onSelect={() => { setTheme("dark"); setOpen(false); }}>
              <Moon />
              <span>Tema oscuro</span>
            </CommandItem>
            <CommandItem value="cerrar sesión salir" onSelect={logout}>
              <SignOut />
              <span>Cerrar sesión</span>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
