"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarBlank,
  Copy,
  DotsThree,
  MagnifyingGlass,
  Plus,
  Spinner,
  Trash,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/page-header";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useSearchSeed } from "@/lib/use-search-seed";
import type { Category, Product, Promotion } from "@/lib/types";
import {
  type LiveState,
  TYPE_META,
  bodyFromDraft,
  draftFromPromotion,
  liveState,
  scheduleText,
  summarize,
} from "./_components/shared";
import { TypeIcon } from "./_components/type-icon";

type Filter = "all" | LiveState;

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "live", label: "En vivo" },
  { id: "scheduled", label: "Programadas" },
  { id: "paused", label: "Pausadas" },
  { id: "expired", label: "Vencidas" },
];

const STATE_STYLE: Record<LiveState, string> = {
  live: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  scheduled: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  paused: "bg-muted text-muted-foreground",
  expired: "bg-muted text-muted-foreground",
};

export default function PromotionsPage() {
  const router = useRouter();
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<Promotion | null>(null);
  useSearchSeed(setSearch);

  useEffect(() => {
    Promise.all([fetch("/api/promotions"), fetch("/api/products?active=true"), fetch("/api/categories")])
      .then(async ([p, pr, c]) => {
        if (p.ok) setPromotions(await p.json());
        if (pr.ok) setProducts(await pr.json());
        if (c.ok) setCategories(await c.json());
      })
      .catch(() => toast.error("Error al cargar promociones"))
      .finally(() => setLoading(false));
  }, []);

  const enriched = useMemo(
    () =>
      promotions.map((p) => {
        const draft = draftFromPromotion(p, products);
        return { promo: p, live: liveState(p), summary: summarize(draft, products, categories), schedule: scheduleText(draft) };
      }),
    [promotions, products, categories],
  );

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: enriched.length, live: 0, scheduled: 0, paused: 0, expired: 0 };
    for (const e of enriched) c[e.live.state]++;
    return c;
  }, [enriched]);

  const q = search.trim().toLowerCase();
  const visible = enriched
    .filter((e) => filter === "all" || e.live.state === filter)
    .filter((e) => !q || e.promo.name.toLowerCase().includes(q) || e.summary.toLowerCase().includes(q))
    .sort((a, b) => {
      const order: LiveState[] = ["live", "scheduled", "paused", "expired"];
      const d = order.indexOf(a.live.state) - order.indexOf(b.live.state);
      return d !== 0 ? d : a.promo.name.localeCompare(b.promo.name, "es");
    });

  async function toggle(p: Promotion) {
    setPromotions((prev) => prev.map((x) => (x.id === p.id ? { ...x, active: !p.active } : x)));
    const res = await fetch(`/api/promotions/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !p.active }),
    });
    if (res.ok) toast.success(p.active ? `${p.name} en pausa` : `${p.name} activada`);
    else {
      setPromotions((prev) => prev.map((x) => (x.id === p.id ? p : x)));
      toast.error("No se pudo cambiar el estado");
    }
  }

  async function duplicate(p: Promotion) {
    const body = { ...bodyFromDraft(draftFromPromotion(p, products), products), name: `${p.name} (copia)`, active: false };
    const res = await fetch("/api/promotions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) return toast.error((await res.json().catch(() => ({}))).error || "No se pudo duplicar");
    const created: Promotion = await res.json();
    toast.success("Copia creada en pausa");
    router.push(`/promotions/${created.id}`);
  }

  async function remove(p: Promotion) {
    const res = await fetch(`/api/promotions/${p.id}`, { method: "DELETE" });
    if (!res.ok) return toast.error("No se pudo eliminar");
    setPromotions((prev) => prev.filter((x) => x.id !== p.id));
    toast.success("Promoción eliminada");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Promociones"
        description="2x1, descuentos y combos que el POS aplica solo al comandar."
        actions={
          <Button asChild className="gap-2">
            <Link href="/promotions/new">
              <Plus className="size-4" weight="bold" />
              Nueva promoción
            </Link>
          </Button>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                filter === f.id ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {f.id === "live" && <span className="size-1.5 rounded-full bg-emerald-500" />}
              {f.label}
              <span className={cn("tabular-nums", filter === f.id ? "opacity-70" : "opacity-60")}>{counts[f.id]}</span>
            </button>
          ))}
        </div>
        <div className="relative sm:w-64">
          <MagnifyingGlass className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar promoción…"
            className="h-9 w-full rounded-full border bg-background pr-3 pl-9 text-sm outline-none focus:ring-2 focus:ring-ring/30"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Spinner className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : promotions.length === 0 ? (
        <EmptyState />
      ) : visible.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">Ninguna promoción en esta vista.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visible.map(({ promo, live, summary, schedule }) => (
            <div
              key={promo.id}
              role="link"
              tabIndex={0}
              onClick={() => router.push(`/promotions/${promo.id}`)}
              onKeyDown={(e) => e.key === "Enter" && router.push(`/promotions/${promo.id}`)}
              className={cn(
                "group flex cursor-pointer flex-col gap-3 rounded-2xl border bg-card p-4 transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none",
                (live.state === "paused" || live.state === "expired") && "opacity-70 hover:opacity-100",
              )}
            >
              <div className="flex items-start gap-3">
                <TypeIcon type={promo.type} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{promo.name}</p>
                  <p className="text-xs text-muted-foreground">{TYPE_META[promo.type].label}</p>
                </div>
                <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-1">
                  <Switch checked={promo.active} onCheckedChange={() => toggle(promo)} aria-label={promo.active ? "Pausar" : "Activar"} />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-8" aria-label="Más opciones">
                        <DotsThree className="size-5" weight="bold" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => duplicate(promo)}>
                        <Copy className="mr-2 size-4" /> Duplicar
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setConfirmDelete(promo)} className="text-destructive focus:text-destructive">
                        <Trash className="mr-2 size-4" /> Eliminar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              <p className="line-clamp-2 text-sm leading-snug">{summary}</p>

              <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
                <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                  <CalendarBlank className="size-3.5 shrink-0" />
                  <span className="truncate">{schedule}</span>
                </span>
                <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold", STATE_STYLE[live.state])}>
                  {live.state === "live" && (
                    <span className="relative flex size-1.5">
                      <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                      <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
                    </span>
                  )}
                  {live.reason}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar {confirmDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Deja de aplicarse en el POS. Las órdenes que ya la usaron conservan su descuento. Si solo quieres quitarla un tiempo, mejor pausarla.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDelete && remove(confirmDelete)}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed px-6 py-14 text-center">
      <div className="mx-auto flex w-fit gap-2">
        {(["buy_x_get_y", "percentage_discount", "combo"] as const).map((t) => (
          <TypeIcon key={t} type={t} />
        ))}
      </div>
      <h2 className="mt-4 text-lg font-semibold">Todavía no hay promociones</h2>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
        Crea un 2x1, un descuento o un combo. El POS lo aplica solo cuando el carrito califica.
      </p>
      <Button asChild className="mt-5 gap-2">
        <Link href="/promotions/new">
          <Plus className="size-4" weight="bold" />
          Nueva promoción
        </Link>
      </Button>
    </div>
  );
}
