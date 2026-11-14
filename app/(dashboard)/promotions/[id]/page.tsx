"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  CaretDown,
  Check,
  Copy,
  DotsThree,
  Gift,
  Minus,
  PencilSimple,
  Plus,
  Repeat,
  Sparkle,
  Spinner,
  Trash,
  X,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import type { Category, Product, Promotion } from "@/lib/types";
import type { ComboItemRewardType, ComboRewardType } from "@/lib/promotions/combo";
import { CatalogPicker } from "../_components/catalog-picker";
import { PromotionSimulator } from "../_components/simulator";
import { TypeIcon } from "../_components/type-icon";
import {
  type Draft,
  type DraftGroup,
  type PromoType,
  EMPTY_DRAFT,
  TONE,
  TYPE_META,
  WEEKDAYS,
  bodyFromDraft,
  draftFromPromotion,
  emptySelection,
  liveState,
  money,
  newGroup,
  promotionFromDraft,
  scheduleText,
  selectionLabel,
  summarize,
} from "../_components/shared";

const ITEM_REWARDS: { id: ComboItemRewardType; label: string }[] = [
  { id: "none", label: "Se cobra normal" },
  { id: "free", label: "Gratis" },
  { id: "percent", label: "% menos" },
  { id: "amount", label: "$ menos" },
  { id: "price", label: "Precio fijo" },
];

const COMBO_REWARDS: { id: ComboRewardType; label: string; hint: string }[] = [
  { id: "items", label: "Premio en un platillo", hint: "Ej. el refresco gratis o a mitad de precio" },
  { id: "price", label: "Precio especial", hint: "Todo el combo cuesta un precio fijo" },
  { id: "percent", label: "% al combo", hint: "Descuento sobre el total del combo" },
  { id: "amount", label: "$ al combo", hint: "Monto fijo menos al total del combo" },
];

/** Plantillas de combo: arrancan el formulario con la forma correcta. */
const COMBO_TEMPLATES: { label: string; apply: (d: Draft) => Draft }[] = [
  {
    label: "X + Y gratis",
    apply: (d) => ({
      ...d,
      groups: [newGroup({ label: "Platillos", quantity: 2 }), newGroup({ label: "Bebida", reward: { type: "free" } })],
      comboReward: { type: "items", value: 0 },
    }),
  },
  {
    label: "Precio especial",
    apply: (d) => ({
      ...d,
      groups: [newGroup({ label: "Platillo" }), newGroup({ label: "Bebida" })],
      comboReward: { type: "price", value: 150 },
    }),
  },
  {
    label: "Segundo a mitad",
    apply: (d) => ({
      ...d,
      groups: [newGroup({ label: "Primero" }), newGroup({ label: "Segundo", reward: { type: "percent", value: 50 } })],
      comboReward: { type: "items", value: 0 },
    }),
  },
];

function suggestName(d: Draft, products: Product[], categories: Category[]) {
  const what = d.selection ? selectionLabel(d.selection, products, categories, 1) : "todo el menú";
  switch (d.type) {
    case "buy_x_get_y":
      return `${d.buyQuantity}x${d.buyQuantity - d.getQuantity} ${what}`;
    case "percentage_discount":
      return `${d.discountPercentage}% ${what}`;
    case "fixed_discount":
      return `${money(d.discountAmount)} menos ${what}`;
    case "combo":
      return `Combo ${d.groups.map((g) => g.label.trim() || selectionLabel(g.selection, products, categories, 1)).join(" + ")}`;
  }
}

export default function PromotionEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const isNew = id === "new";

  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [initial, setInitial] = useState<Draft>(EMPTY_DRAFT);
  const [promotion, setPromotion] = useState<Promotion | null>(null);
  const [allPromotions, setAllPromotions] = useState<Promotion[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [openPicker, setOpenPicker] = useState<string | null>(null);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(initial), [draft, initial]);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((prev) => ({ ...prev, [key]: value }));
  const setGroup = (key: string, patch: Partial<DraftGroup>) =>
    setDraft((prev) => ({ ...prev, groups: prev.groups.map((g) => (g.key === key ? { ...g, ...patch } : g)) }));

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetch("/api/promotions"), fetch("/api/products?active=true"), fetch("/api/categories")])
      .then(async ([p, pr, c]) => {
        if (cancelled) return;
        const promos: Promotion[] = p.ok ? await p.json() : [];
        const prods: Product[] = pr.ok ? await pr.json() : [];
        setAllPromotions(promos);
        setProducts(prods);
        if (c.ok) setCategories(await c.json());
        if (!isNew) {
          const found = promos.find((x) => x.id === id);
          if (!found) return setNotFound(true);
          const d = draftFromPromotion(found, prods);
          setPromotion(found);
          setDraft(d);
          setInitial(d);
        } else {
          // Un combo nuevo abre el selector del primer grupo de una vez.
          setOpenPicker(EMPTY_DRAFT.groups[0].key);
        }
      })
      .catch(() => !cancelled && toast.error("Error cargando la promoción"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const save = useCallback(async () => {
    const toSave = draft.name.trim() ? draft : { ...draft, name: suggestName(draft, products, categories) };
    setSaving(true);
    try {
      const res = await fetch(isNew ? "/api/promotions" : `/api/promotions/${id}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyFromDraft(toSave, products)),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo guardar");
      setDraft(toSave);
      setInitial(toSave);
      setPromotion(data);
      toast.success(isNew ? "Promoción creada · ya aplica en el POS" : "Cambios guardados · el POS se actualizó");
      if (isNew) router.replace(`/promotions/${data.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }, [draft, id, isNew, products, categories, router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if ((dirty || isNew) && !saving) save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dirty, isNew, saving, save]);

  async function duplicate() {
    const res = await fetch("/api/promotions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...bodyFromDraft(draft, products), name: `${draft.name} (copia)`, active: false }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(data.error || "No se pudo duplicar");
    toast.success("Copia creada en pausa");
    router.push(`/promotions/${data.id}`);
  }

  async function remove() {
    const res = await fetch(`/api/promotions/${id}`, { method: "DELETE" });
    if (!res.ok) return toast.error("No se pudo eliminar");
    setInitial(draft);
    toast.success("Promoción eliminada");
    router.push("/promotions");
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (notFound) {
    return (
      <div className="space-y-4">
        <BackLink />
        <p className="py-16 text-center text-sm text-muted-foreground">Esa promoción no existe o fue eliminada.</p>
      </div>
    );
  }

  const meta = TYPE_META[draft.type];
  const tone = TONE[meta.tone];
  const summary = summarize(draft, products, categories);
  const suggestion = suggestName(draft, products, categories);
  const enginePromo = promotionFromDraft(draft, products, promotion?.id ?? "draft");
  const others = allPromotions.filter((p) => p.id !== promotion?.id && liveState(p).state === "live");
  const live = promotion
    ? liveState({
        ...promotion,
        active: draft.active,
        startDate: draft.startDate || null,
        endDate: draft.endDate || null,
        daysOfWeek: draft.daysOfWeek.length ? JSON.stringify(draft.daysOfWeek) : null,
        startTime: draft.startTime || null,
        endTime: draft.endTime || null,
      })
    : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-28">
      {/* Encabezado */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <BackLink />
          <h1 className="mt-1 truncate text-3xl font-semibold tracking-tight">{draft.name || (isNew ? "Nueva promoción" : "Sin nombre")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{meta.label}</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm">
            <Switch checked={draft.active} onCheckedChange={(v) => set("active", v)} />
            {draft.active ? "Activa" : "En pausa"}
          </label>
          {!isNew && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Más opciones">
                  <DotsThree className="size-5" weight="bold" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={duplicate}>
                  <Copy className="mr-2 size-4" /> Duplicar
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setConfirmDelete(true)} className="text-destructive focus:text-destructive">
                  <Trash className="mr-2 size-4" /> Eliminar promoción
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* ───── Izquierda: configuración ───── */}
        <div className="space-y-6">
          <Section step={1} title="¿Qué tipo de promoción?">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {(Object.keys(TYPE_META) as PromoType[]).map((t) => {
                const m = TYPE_META[t];
                const selected = draft.type === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => set("type", t)}
                    className={cn(
                      "relative flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-all",
                      selected ? cn("border-transparent ring-2", TONE[m.tone].ring, TONE[m.tone].soft) : "hover:bg-muted/50",
                    )}
                  >
                    <TypeIcon type={t} className="size-9" />
                    <div>
                      <p className="text-sm font-semibold">{m.label}</p>
                      <p className="text-xs text-muted-foreground">{m.example}</p>
                    </div>
                    {selected && (
                      <span className={cn("absolute top-2.5 right-2.5 flex size-5 items-center justify-center rounded-full text-white", TONE[m.tone].bg)}>
                        <Check className="size-3" weight="bold" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </Section>

          {draft.type === "buy_x_get_y" && (
            <Section step={2} title="¿Cuánto se lleva?" hint="Lo gratis siempre es lo más barato de lo que califica.">
              <div className="flex flex-wrap gap-2">
                {[
                  [2, 1],
                  [3, 1],
                  [4, 1],
                  [3, 2],
                ].map(([buy, get]) => (
                  <Chip key={`${buy}-${get}`} active={draft.buyQuantity === buy && draft.getQuantity === get} onClick={() => setDraft((d) => ({ ...d, buyQuantity: buy, getQuantity: get }))}>
                    {buy}x{buy - get}
                  </Chip>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                <Stepper label="Se llevan" value={draft.buyQuantity} min={2} max={10} onChange={(v) => setDraft((d) => ({ ...d, buyQuantity: v, getQuantity: Math.min(d.getQuantity, v - 1) }))} />
                <Stepper label="Pagan" value={draft.buyQuantity - draft.getQuantity} min={1} max={draft.buyQuantity - 1} onChange={(v) => set("getQuantity", draft.buyQuantity - v)} />
                <p className="text-sm text-muted-foreground">
                  = <span className="font-semibold text-foreground">{draft.getQuantity} gratis</span> por cada {draft.buyQuantity}
                </p>
              </div>
            </Section>
          )}

          {draft.type === "percentage_discount" && (
            <Section step={2} title="¿Cuánto descuento?">
              <div className="flex flex-wrap items-center gap-2">
                {[10, 15, 20, 25, 50].map((v) => (
                  <Chip key={v} active={draft.discountPercentage === v} onClick={() => set("discountPercentage", v)}>
                    {v}%
                  </Chip>
                ))}
                <NumberField value={draft.discountPercentage} onChange={(v) => set("discountPercentage", v)} suffix="%" max={100} />
              </div>
            </Section>
          )}

          {draft.type === "fixed_discount" && (
            <Section step={2} title="¿Cuánto menos por pieza?" hint="Nunca baja de $0: un platillo más barato que el descuento sale gratis.">
              <NumberField value={draft.discountAmount} onChange={(v) => set("discountAmount", v)} prefix="$" />
            </Section>
          )}

          {draft.type !== "combo" && (
            <Section step={3} title="¿En qué platillos?">
              <Segmented
                value={draft.selection ? "some" : "all"}
                options={[
                  { id: "all", label: "Todo el menú" },
                  { id: "some", label: "Elegir platillos o categorías" },
                ]}
                onChange={(v) => set("selection", v === "all" ? null : draft.selection ?? emptySelection())}
              />
              {draft.selection && (
                <>
                  <CatalogPicker products={products} categories={categories} value={draft.selection} onChange={(sel) => set("selection", sel)} />
                  {draft.selection.categoryIds.length > 1 && (
                    <p className="text-xs text-muted-foreground">
                      Con varias categorías se guardan los platillos que tienen hoy; uno nuevo hay que agregarlo después. Una sola categoría sí incluye los futuros.
                    </p>
                  )}
                </>
              )}
            </Section>
          )}

          {draft.type === "combo" && (
            <>
              <Section
                step={2}
                title="¿Qué lleva el combo?"
                hint="Cada grupo es “cuántas piezas de qué”. El combo aplica cuando el carrito tiene todos los grupos."
                action={
                  <div className="hidden items-center gap-1 sm:flex">
                    <Sparkle className="size-3.5 text-muted-foreground" />
                    {COMBO_TEMPLATES.map((t) => (
                      <button
                        key={t.label}
                        type="button"
                        onClick={() => {
                          const next = t.apply(draft);
                          setDraft(next);
                          setOpenPicker(next.groups[0].key);
                        }}
                        className="rounded-full px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                }
              >
                <div className="space-y-3">
                  {draft.groups.map((g, i) => (
                    <div key={g.key}>
                      {i > 0 && (
                        <div className="flex justify-center py-1">
                          <span className="flex size-6 items-center justify-center rounded-full bg-muted text-muted-foreground">
                            <Plus className="size-3.5" weight="bold" />
                          </span>
                        </div>
                      )}
                      <GroupCard
                        group={g}
                        index={i}
                        perItem={draft.comboReward.type === "items"}
                        products={products}
                        categories={categories}
                        pickerOpen={openPicker === g.key}
                        onTogglePicker={() => setOpenPicker((k) => (k === g.key ? null : g.key))}
                        onChange={(patch) => setGroup(g.key, patch)}
                        onRemove={draft.groups.length > 1 ? () => set("groups", draft.groups.filter((x) => x.key !== g.key)) : undefined}
                      />
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      const g = newGroup({ label: "" });
                      set("groups", [...draft.groups, g]);
                      setOpenPicker(g.key);
                    }}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed py-3 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                  >
                    <Plus className="size-4" weight="bold" />
                    Agregar otro grupo
                  </button>
                </div>
              </Section>

              <Section step={3} title="¿Cuál es el premio?">
                <div className="grid gap-2 sm:grid-cols-2">
                  {COMBO_REWARDS.map((r) => {
                    const selected = draft.comboReward.type === r.id;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() =>
                          set("comboReward", {
                            type: r.id,
                            value: r.id === draft.comboReward.type ? draft.comboReward.value : r.id === "percent" ? 15 : r.id === "amount" ? 30 : r.id === "price" ? 150 : 0,
                          })
                        }
                        className={cn(
                          "flex items-start gap-3 rounded-xl border p-3 text-left transition-all",
                          selected ? "border-transparent bg-violet-500/10 ring-2 ring-violet-500/40" : "hover:bg-muted/50",
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border",
                            selected ? "border-violet-500 bg-violet-500" : "border-muted-foreground/40",
                          )}
                        >
                          {selected && <span className="size-1.5 rounded-full bg-white" />}
                        </span>
                        <span>
                          <span className="block text-sm font-semibold">{r.label}</span>
                          <span className="block text-xs text-muted-foreground">{r.hint}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                {draft.comboReward.type === "items" ? (
                  <p className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                    <Gift className="size-4 shrink-0" weight="duotone" />
                    Marca en cada grupo si va gratis, con descuento o se cobra normal.
                  </p>
                ) : (
                  <div className="flex items-center gap-3">
                    <Label className="text-sm text-muted-foreground">
                      {draft.comboReward.type === "price" ? "El combo cuesta" : draft.comboReward.type === "percent" ? "Descuento" : "Se descuentan"}
                    </Label>
                    <NumberField
                      value={draft.comboReward.value}
                      onChange={(v) => set("comboReward", { ...draft.comboReward, value: v })}
                      prefix={draft.comboReward.type === "percent" ? undefined : "$"}
                      suffix={draft.comboReward.type === "percent" ? "%" : undefined}
                      max={draft.comboReward.type === "percent" ? 100 : undefined}
                    />
                  </div>
                )}
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-3">
                  <Switch checked={draft.comboRepeat} onCheckedChange={(v) => set("comboRepeat", v)} className="mt-0.5" />
                  <span>
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      <Repeat className="size-4" /> Se repite en la misma orden
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {draft.comboRepeat ? "Si piden el doble, se aplica dos veces." : "Solo una vez por orden, aunque pidan de más."}
                    </span>
                  </span>
                </label>
              </Section>
            </>
          )}

          <Section step={4} title="¿Cuándo aplica?" hint={scheduleText(draft)}>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                {WEEKDAYS.map((w) => {
                  const on = draft.daysOfWeek.length === 0 || draft.daysOfWeek.includes(w.value);
                  return (
                    <button
                      key={w.value}
                      type="button"
                      onClick={() => {
                        const current = draft.daysOfWeek.length === 0 ? WEEKDAYS.map((x) => x.value) : draft.daysOfWeek;
                        const next = current.includes(w.value) ? current.filter((d) => d !== w.value) : [...current, w.value];
                        set("daysOfWeek", next.length === 7 ? [] : next);
                      }}
                      className={cn(
                        "flex size-10 items-center justify-center rounded-full text-sm font-semibold transition-colors",
                        on ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:bg-muted/70",
                      )}
                      title={w.label}
                    >
                      {w.label.slice(0, 2)}
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-1">
                {[
                  { label: "Todos", days: [] },
                  { label: "Lunes a viernes", days: [1, 2, 3, 4, 5] },
                  { label: "Fin de semana", days: [6, 0] },
                ].map((p) => (
                  <Chip key={p.label} small active={draft.daysOfWeek.slice().sort().join() === p.days.slice().sort().join()} onClick={() => set("daysOfWeek", p.days)}>
                    {p.label}
                  </Chip>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Horario</Label>
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                    Todo el día
                    <Switch
                      size="sm"
                      checked={!draft.startTime && !draft.endTime}
                      onCheckedChange={(v) => setDraft((d) => (v ? { ...d, startTime: "", endTime: "" } : { ...d, startTime: "13:00", endTime: "17:00" }))}
                    />
                  </label>
                </div>
                {(draft.startTime || draft.endTime) && (
                  <div className="flex items-center gap-2">
                    <Input type="time" value={draft.startTime} onChange={(e) => set("startTime", e.target.value)} />
                    <span className="text-muted-foreground">a</span>
                    <Input type="time" value={draft.endTime} onChange={(e) => set("endTime", e.target.value)} />
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label>Vigencia</Label>
                <div className="flex items-center gap-2">
                  <DateField value={draft.startDate} onChange={(v) => set("startDate", v)} placeholder="Desde hoy" />
                  <span className="text-muted-foreground">a</span>
                  <DateField value={draft.endDate} onChange={(v) => set("endDate", v)} placeholder="Sin fin" />
                </div>
              </div>
            </div>
          </Section>

          <Section step={5} title="Nombre y detalles">
            <div className="space-y-1.5">
              <Label htmlFor="promo-name">Nombre (así sale en el ticket)</Label>
              <Input
                id="promo-name"
                value={draft.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder={suggestion}
                className="h-11 text-base"
              />
              {!draft.name.trim() && (
                <button type="button" onClick={() => set("name", suggestion)} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  <PencilSimple className="size-3" /> Usar “{suggestion}”
                </button>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="promo-desc">Nota interna (opcional)</Label>
              <Input id="promo-desc" value={draft.description} onChange={(e) => set("description", e.target.value)} placeholder="Ej. promo de temporada de lluvias" />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/40 p-3">
              <div>
                <p className="text-sm font-medium">Prioridad</p>
                <p className="text-xs text-muted-foreground">Si dos promos aplican al mismo platillo, gana la de número más alto. Los combos siempre van primero.</p>
              </div>
              <Stepper value={draft.priority} min={0} max={99} onChange={(v) => set("priority", v)} />
            </div>
          </Section>
        </div>

        {/* ───── Derecha: resumen y simulador ───── */}
        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <section className={cn("overflow-hidden rounded-2xl border p-5", tone.soft)}>
            <div className="flex items-center gap-3">
              <TypeIcon type={draft.type} className="bg-background/70" />
              <div className="min-w-0">
                <p className={cn("text-xs font-semibold tracking-wide uppercase", tone.text)}>{meta.short}</p>
                <p className="truncate font-semibold">{draft.name || suggestion}</p>
              </div>
            </div>
            <p className="mt-3 text-[15px] leading-snug font-medium">{summary}</p>
            <p className="mt-2 text-xs text-muted-foreground">{scheduleText(draft)}</p>
            {live && (
              <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-background/70 px-2.5 py-1 text-xs font-medium">
                <span className={cn("size-1.5 rounded-full", live.state === "live" ? "bg-emerald-500" : "bg-muted-foreground")} />
                {live.reason}
                {dirty && " · al guardar"}
              </p>
            )}
          </section>
          <PromotionSimulator products={products} promotion={enginePromo} otherPromotions={others} />
        </div>
      </div>

      {/* Barra de guardado */}
      <div
        className={cn(
          "pointer-events-none fixed inset-x-0 bottom-6 z-30 flex justify-center px-4 transition-all duration-200",
          dirty || isNew ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
        )}
      >
        <div className="pointer-events-auto flex items-center gap-3 rounded-full border bg-background/95 py-2 pr-2 pl-5 shadow-lg backdrop-blur">
          <span className="text-sm text-muted-foreground">{isNew ? "Promoción nueva" : "Tienes cambios sin guardar"}</span>
          {!isNew && (
            <Button variant="ghost" size="sm" className="rounded-full" onClick={() => setDraft(initial)} disabled={saving}>
              Descartar
            </Button>
          )}
          <Button size="sm" className="gap-2 rounded-full px-4" onClick={save} disabled={saving}>
            {saving ? "Guardando…" : isNew ? "Crear promoción" : "Guardar"}
            <kbd className="hidden rounded bg-primary-foreground/20 px-1 font-mono text-[10px] sm:inline">⌘S</kbd>
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar {draft.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Deja de aplicarse en el POS. Las órdenes que ya la usaron conservan su descuento. Si solo quieres quitarla un tiempo, mejor ponla en pausa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={remove} className="bg-destructive text-white hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ───── Piezas ─────

function GroupCard({
  group,
  index,
  perItem,
  products,
  categories,
  pickerOpen,
  onTogglePicker,
  onChange,
  onRemove,
}: {
  group: DraftGroup;
  index: number;
  perItem: boolean;
  products: Product[];
  categories: Category[];
  pickerOpen: boolean;
  onTogglePicker: () => void;
  onChange: (patch: Partial<DraftGroup>) => void;
  onRemove?: () => void;
}) {
  const empty = group.selection.categoryIds.length === 0 && group.selection.refs.length === 0;
  const reward = group.reward;
  const rewarded = perItem && reward.type !== "none";
  return (
    <div className={cn("rounded-xl border bg-background transition-shadow", rewarded && "border-emerald-500/40 shadow-[0_0_0_3px] shadow-emerald-500/10")}>
      <div className="flex flex-wrap items-center gap-3 p-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-sm font-bold text-violet-600 dark:text-violet-400">
          {index + 1}
        </span>
        <input
          value={group.label}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder={empty ? "Nombre del grupo (ej. Empanadas)" : selectionLabel(group.selection, products, categories, 1)}
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:font-normal placeholder:text-muted-foreground"
        />
        <Stepper value={group.quantity} min={1} max={20} onChange={(v) => onChange({ quantity: v, reward: reward.quantity && reward.quantity > v ? { ...reward, quantity: v } : reward })} compact />
        {rewarded && (
          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
            {reward.type === "free" ? "Gratis" : "Con descuento"}
          </span>
        )}
        {onRemove && (
          <button type="button" onClick={onRemove} className="text-muted-foreground hover:text-destructive" aria-label="Quitar grupo">
            <X className="size-4" />
          </button>
        )}
      </div>

      <div className="space-y-3 border-t px-3 pt-3 pb-3">
        <button
          type="button"
          onClick={onTogglePicker}
          className={cn(
            "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
            empty ? "bg-amber-500/10 text-amber-800 dark:text-amber-200" : "bg-muted/50 hover:bg-muted",
          )}
        >
          <span className="min-w-0 truncate">
            {empty ? "Elige qué platillos cuentan para este grupo" : <>Cualquiera de: <span className="font-medium">{selectionLabel(group.selection, products, categories, 4)}</span></>}
          </span>
          <CaretDown className={cn("size-4 shrink-0 transition-transform", pickerOpen && "rotate-180")} />
        </button>
        {pickerOpen && (
          <CatalogPicker products={products} categories={categories} value={group.selection} onChange={(selection) => onChange({ selection })} maxHeight={320} />
        )}

        {perItem && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1">
              {ITEM_REWARDS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() =>
                    onChange({
                      reward: {
                        type: r.id,
                        value: r.id === reward.type ? reward.value : r.id === "percent" ? 50 : r.id === "amount" ? 10 : r.id === "price" ? 20 : null,
                        quantity: reward.quantity ?? null,
                      },
                    })
                  }
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    reward.type === r.id
                      ? r.id === "none"
                        ? "border-foreground/20 bg-foreground/5"
                        : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {r.id === "free" && <Gift className="mr-1 inline size-3.5" weight="fill" />}
                  {r.label}
                </button>
              ))}
            </div>
            {reward.type !== "none" && (
              <div className="flex flex-wrap items-center gap-3 text-sm">
                {reward.type !== "free" && (
                  <NumberField
                    value={Number(reward.value) || 0}
                    onChange={(v) => onChange({ reward: { ...reward, value: v } })}
                    prefix={reward.type === "percent" ? undefined : "$"}
                    suffix={reward.type === "percent" ? "%" : reward.type === "price" ? "c/u" : "menos"}
                    max={reward.type === "percent" ? 100 : undefined}
                  />
                )}
                {group.quantity > 1 && (
                  <span className="flex items-center gap-2 text-muted-foreground">
                    aplica a
                    <select
                      value={reward.quantity ?? group.quantity}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        onChange({ reward: { ...reward, quantity: n >= group.quantity ? null : n } });
                      }}
                      className="h-8 rounded-md border bg-background px-2 text-sm text-foreground"
                    >
                      {Array.from({ length: group.quantity }, (_, i) => i + 1).map((n) => (
                        <option key={n} value={n}>
                          {n === group.quantity ? `las ${n}` : `${n} de ${group.quantity}`}
                        </option>
                      ))}
                    </select>
                    {reward.quantity && reward.quantity < group.quantity ? "(las más baratas)" : ""}
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/promotions" className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-3.5" />
      Promociones
    </Link>
  );
}

function Section({
  step,
  title,
  hint,
  action,
  children,
}: {
  step: number;
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-2xl border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-3">
          <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background">{step}</span>
          <div>
            <h2 className="font-semibold">{title}</h2>
            {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Chip({ active, small, onClick, children }: { active: boolean; small?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border font-semibold transition-colors",
        small ? "px-2.5 py-0.5 text-xs" : "px-4 py-1.5 text-sm",
        active ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Segmented({ value, options, onChange }: { value: string; options: { id: string; label: string }[]; onChange: (id: string) => void }) {
  return (
    <div className="inline-flex rounded-lg bg-muted p-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-all",
            value === o.id ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
  compact,
}: {
  label?: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  compact?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      {label && <span className="text-sm text-muted-foreground">{label}</span>}
      <div className="flex items-center rounded-lg border bg-background">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className={cn("flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30", compact ? "size-7" : "size-9")}
          aria-label="Menos"
        >
          <Minus className="size-3.5" weight="bold" />
        </button>
        <span className={cn("text-center font-semibold tabular-nums", compact ? "w-6 text-sm" : "w-8")}>{value}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className={cn("flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30", compact ? "size-7" : "size-9")}
          aria-label="Más"
        >
          <Plus className="size-3.5" weight="bold" />
        </button>
      </div>
    </div>
  );
}

function NumberField({
  value,
  onChange,
  prefix,
  suffix,
  max,
}: {
  value: number;
  onChange: (v: number) => void;
  prefix?: string;
  suffix?: string;
  max?: number;
}) {
  return (
    <div className="flex h-9 items-center rounded-lg border bg-background px-3 focus-within:ring-2 focus-within:ring-ring/30">
      {prefix && <span className="mr-1 text-muted-foreground">{prefix}</span>}
      <input
        type="number"
        inputMode="decimal"
        min={0}
        max={max}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => {
          const n = parseFloat(e.target.value);
          onChange(Number.isFinite(n) ? (max !== undefined ? Math.min(max, n) : n) : 0);
        }}
        className="w-16 bg-transparent text-sm font-semibold tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
      />
      {suffix && <span className="ml-1 text-sm text-muted-foreground">{suffix}</span>}
    </div>
  );
}

function DateField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative flex-1">
      <Input type="date" value={value} onChange={(e) => onChange(e.target.value)} className={cn(!value && "text-muted-foreground")} aria-label={placeholder} />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute top-1/2 right-8 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label="Quitar fecha"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
