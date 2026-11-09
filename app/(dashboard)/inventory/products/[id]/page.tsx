"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  CaretDown,
  CloudArrowUp,
  DotsThree,
  FlowArrow,
  ImageSquare,
  PencilSimple,
  Plus,
  Spinner,
  Star,
  Trash,
  VideoCamera,
  X,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import type { Category, Product } from "@/lib/types";
import { ImageCropper } from "../_components/image-cropper";
import { type Variant, money, parseMenuImages, parseVariants, uploadToCdn } from "../_components/shared";

type Form = {
  name: string;
  description: string;
  price: string;
  platformPrice: string;
  categoryId: string;
  subcategoryId: string;
  imageUrl: string;
  hasVariants: boolean;
  variants: Variant[];
  active: boolean;
  menuImages: string[];
  menuVideo: string;
  menuWebVisible: boolean;
  flowTags: string[];
  loyaltyEligible: boolean;
};

const EMPTY: Form = {
  name: "",
  description: "",
  price: "",
  platformPrice: "",
  categoryId: "",
  subcategoryId: "",
  imageUrl: "",
  hasVariants: false,
  variants: [],
  active: true,
  menuImages: [],
  menuVideo: "",
  menuWebVisible: true,
  flowTags: [],
  loyaltyEligible: false,
};

const MAX_PHOTOS = 4;

function formFrom(p: Product): Form {
  const raw = p as Product & { menuImages?: unknown; menuVideo?: string | null; menuWebVisible?: boolean; flowTags?: unknown; loyaltyEligible?: boolean };
  return {
    name: p.name,
    description: p.description || "",
    price: p.price ?? "",
    platformPrice: p.platformPrice || "",
    categoryId: p.categoryId || "",
    subcategoryId: p.subcategoryId || "",
    imageUrl: p.imageUrl || "",
    hasVariants: !!p.hasVariants,
    variants: parseVariants(p.variants),
    active: p.active,
    menuImages: parseMenuImages(raw.menuImages),
    menuVideo: raw.menuVideo || "",
    menuWebVisible: raw.menuWebVisible !== false,
    flowTags: Array.isArray(raw.flowTags) ? (raw.flowTags as string[]) : [],
    loyaltyEligible: raw.loyaltyEligible === true,
  };
}

/** Body que espera la API (mismo formato que mandaba el modal anterior). */
function toBody(f: Form) {
  return {
    ...f,
    categoryId: f.categoryId || null,
    subcategoryId: f.subcategoryId || null,
    imageUrl: f.imageUrl || null,
    variants: f.hasVariants ? JSON.stringify(f.variants) : null,
    menuImages: f.menuImages.length > 0 ? JSON.stringify(f.menuImages) : null,
    menuVideo: f.menuVideo || null,
  };
}

/**
 * Detalle de platillo en su propia pantalla (antes era un modal): fotos e
 * información a la izquierda; vista previa, disponibilidad y categoría a la
 * derecha. Guarda con la barra inferior o ⌘S; avisa si sales sin guardar.
 */
export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const isNew = id === "new";

  const [form, setForm] = useState<Form>(EMPTY);
  const [initial, setInitial] = useState<Form>(EMPTY);
  const [loading, setLoading] = useState(!isNew);
  const [notFound, setNotFound] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [knownTags, setKnownTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [cropping, setCropping] = useState<{ blobUrl: string; index: number | null } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tagDraft, setTagDraft] = useState("");

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(initial), [form, initial]);
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((prev) => ({ ...prev, [key]: value }));

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetch("/api/categories"), fetch("/api/products"), isNew ? null : fetch(`/api/products/${id}`)])
      .then(async ([c, all, one]) => {
        if (cancelled) return;
        if (c.ok) setCategories(await c.json());
        if (all.ok) {
          const list: Product[] = await all.json();
          setKnownTags([...new Set(list.flatMap((p) => ((p as { flowTags?: string[] }).flowTags ?? [])))].sort());
        }
        if (one) {
          if (!one.ok) {
            setNotFound(true);
          } else {
            const f = formFrom(await one.json());
            setForm(f);
            setInitial(f);
          }
        }
      })
      .catch(() => !cancelled && toast.error("Error cargando el platillo"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  // Aviso al cerrar la pestaña con cambios sin guardar.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const save = useCallback(async () => {
    if (!form.name.trim()) return toast.error("Escribe el nombre del platillo");
    if (!form.hasVariants && !form.price) return toast.error("Escribe el precio");
    if (form.hasVariants && (form.variants.length === 0 || form.variants.some((v) => !v.name.trim() || !v.price)))
      return toast.error("Cada variante necesita nombre y precio");

    setSaving(true);
    try {
      const body = toBody(form);
      let productId = id;
      if (isNew) {
        const res = await fetch("/api/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (!res.ok) throw new Error();
        productId = (await res.json()).id;
      }
      // La API de alta no recibe fotos/video/visible-en-web: siempre se guarda
      // el platillo completo con PUT (si no, al crear se perdían las fotos).
      const res = await fetch(`/api/products/${productId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error();
      setInitial(form);
      toast.success(isNew ? "Platillo creado" : "Cambios guardados");
      if (isNew) router.replace(`/inventory/products/${productId}`);
    } catch {
      toast.error("No se pudo guardar el platillo");
    } finally {
      setSaving(false);
    }
  }, [form, id, isNew, router]);

  // ⌘S / Ctrl+S guarda.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (dirty && !saving) save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dirty, saving, save]);

  async function remove() {
    try {
      const res = await fetch(`/api/products/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Error");
      }
      toast.success("Platillo eliminado (se mantiene en órdenes históricas)");
      setInitial(form);
      router.push("/inventory/products");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error eliminando el platillo");
    }
  }

  // ───── Fotos y video ─────
  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files);
    const video = list.find((f) => f.type.startsWith("video/"));
    const image = list.find((f) => f.type.startsWith("image/"));
    if (video) {
      if (form.menuVideo) toast.message("Se reemplazará el video actual");
      setUploading(true);
      try {
        const url = await uploadToCdn(video, video.name);
        set("menuVideo", url);
        toast.success("Video subido");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error subiendo video");
      } finally {
        setUploading(false);
      }
    }
    if (image) {
      if (form.menuImages.length >= MAX_PHOTOS) return toast.error(`Máximo ${MAX_PHOTOS} fotos por platillo`);
      setCropping({ blobUrl: URL.createObjectURL(image), index: null });
    }
  }

  async function editPhoto(url: string, index: number) {
    try {
      const res = await fetch(`/api/proxy-image?url=${encodeURIComponent(url)}`);
      if (!res.ok) throw new Error();
      setCropping({ blobUrl: URL.createObjectURL(await res.blob()), index });
    } catch {
      toast.error("No se pudo abrir la foto para editar");
    }
  }

  function closeCropper() {
    if (cropping) URL.revokeObjectURL(cropping.blobUrl);
    setCropping(null);
  }

  function makeCover(index: number) {
    setForm((prev) => {
      const next = [...prev.menuImages];
      const [photo] = next.splice(index, 1);
      return { ...prev, menuImages: [photo, ...next] };
    });
  }

  // ───── Render ─────
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
        <p className="py-16 text-center text-sm text-muted-foreground">Ese platillo no existe o fue eliminado.</p>
      </div>
    );
  }

  const category = categories.find((c) => c.id === form.categoryId);
  const subcategories = category?.subcategories ?? [];
  const isCoffee = category?.name === "Café";
  const cover = form.menuImages[0];
  const prices = form.hasVariants ? form.variants.map((v) => Number(v.price)).filter((n) => n > 0) : [Number(form.price) || 0];
  const previewPrice =
    prices.length === 0 ? money(0) : Math.min(...prices) === Math.max(...prices) ? money(prices[0]) : `Desde ${money(Math.min(...prices))}`;

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-24">
      {/* Encabezado */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <BackLink />
          <h1 className="mt-1 truncate text-3xl font-semibold tracking-tight">{form.name || (isNew ? "Nuevo platillo" : "Sin nombre")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {[category?.name, subcategories.find((s) => s.id === form.subcategoryId)?.name].filter(Boolean).join(" · ") || "Sin categoría"}
            {!form.active && " · Inactivo en el POS"}
          </p>
        </div>
        {!isNew && (
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild className="gap-2">
              <Link href={`/inventory/products/${id}/flow`}>
                <FlowArrow className="size-4" />
                Flujo del platillo
              </Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Más opciones">
                  <DotsThree className="size-5" weight="bold" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => router.push("/inventory/products/new")}>
                  <Plus className="mr-2 size-4" /> Nuevo platillo
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setConfirmDelete(true)} className="text-destructive focus:text-destructive">
                  <Trash className="mr-2 size-4" /> Eliminar platillo
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* ───── Izquierda ───── */}
        <div className="space-y-6">
          {/* Fotos */}
          <Section title="Fotos" hint={`${form.menuImages.length}/${MAX_PHOTOS} · la primera es la portada del menú web y la miniatura`}>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                handleFiles(e.dataTransfer.files);
              }}
              className={cn("grid gap-3 rounded-xl transition-colors sm:grid-cols-[1.4fr_1fr]", dragOver && "bg-primary/5 ring-2 ring-primary/40")}
            >
              {/* Portada */}
              {cover ? (
                <Photo url={cover} cover onEdit={() => editPhoto(cover, 0)} onRemove={() => set("menuImages", form.menuImages.slice(1))} />
              ) : (
                <UploadTile big uploading={uploading} onFiles={handleFiles} />
              )}

              <div className="grid grid-cols-2 gap-3">
                {form.menuImages.slice(1).map((url, i) => (
                  <Photo
                    key={url}
                    url={url}
                    onEdit={() => editPhoto(url, i + 1)}
                    onRemove={() => set("menuImages", form.menuImages.filter((_, j) => j !== i + 1))}
                    onMakeCover={() => makeCover(i + 1)}
                  />
                ))}
                {cover && form.menuImages.length < MAX_PHOTOS && <UploadTile uploading={uploading} onFiles={handleFiles} />}
                {/* Video */}
                {form.menuVideo ? (
                  <div className="group relative aspect-square overflow-hidden rounded-xl border bg-muted">
                    <video src={form.menuVideo} className="size-full object-cover" muted playsInline autoPlay loop />
                    <span className="absolute top-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white">Video</span>
                    <button
                      type="button"
                      onClick={() => set("menuVideo", "")}
                      className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
                      aria-label="Quitar video"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ) : (
                  <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed text-muted-foreground transition-colors hover:bg-muted/40">
                    <VideoCamera className="size-5" />
                    <span className="text-xs">Video</span>
                    <input type="file" accept="video/mp4,video/quicktime,video/webm" className="sr-only" onChange={(e) => e.target.files && handleFiles(e.target.files)} disabled={uploading} />
                  </label>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Arrastra fotos o un video aquí. Las fotos se recortan cuadradas y se suben comprimidas al CDN.</p>
          </Section>

          {/* Información */}
          <Section title="Información">
            <div className="space-y-1.5">
              <Label htmlFor="p-name">Nombre</Label>
              <Input id="p-name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Ej: Coctel de camarón" className="h-11 text-base" autoFocus={isNew} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-desc">Descripción</Label>
              <Textarea
                id="p-desc"
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                rows={3}
                placeholder="Ingredientes o cómo se sirve. Sale en el menú en línea."
                className="resize-none"
              />
            </div>
          </Section>

          {/* Precio */}
          <Section
            title="Precio"
            action={
              <div className="inline-flex rounded-lg border bg-muted/40 p-0.5 text-sm">
                {([false, true] as const).map((v) => (
                  <button
                    key={String(v)}
                    type="button"
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        hasVariants: v,
                        variants: v && prev.variants.length === 0 ? [{ name: "", price: prev.price, platformPrice: prev.platformPrice }] : prev.variants,
                      }))
                    }
                    className={cn("rounded-md px-3 py-1 font-medium transition-colors", form.hasVariants === v ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}
                  >
                    {v ? "Por variantes" : "Precio único"}
                  </button>
                ))}
              </div>
            }
          >
            {!form.hasVariants ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <MoneyInput id="p-price" label="Precio" value={form.price} onChange={(v) => set("price", v)} />
                <MoneyInput id="p-platform" label="Precio en plataformas" hint="Uber Eats, Rappi, DiDi · opcional" value={form.platformPrice} onChange={(v) => set("platformPrice", v)} placeholder="Igual al precio" />
              </div>
            ) : (
              <div className="space-y-2">
                {isCoffee && (
                  <p className="rounded-lg bg-blue-500/5 p-3 text-xs text-muted-foreground">
                    Para las temperaturas de este café agrega solo las variantes <strong>Frío</strong> y/o <strong>Caliente</strong> que apliquen; el POS mostrará solo esas.
                  </p>
                )}
                <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_2rem] gap-2 px-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  <span>Variante</span>
                  <span>Precio</span>
                  <span>Plataformas</span>
                  <span />
                </div>
                {form.variants.map((v, i) => (
                  <div key={i} className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_2rem] items-center gap-2">
                    <Input
                      value={v.name}
                      placeholder="Ej: Grande"
                      onChange={(e) => set("variants", form.variants.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                    />
                    <MoneyInput value={v.price} onChange={(val) => set("variants", form.variants.map((x, j) => (j === i ? { ...x, price: val } : x)))} />
                    <MoneyInput
                      value={v.platformPrice ?? ""}
                      placeholder="Igual"
                      onChange={(val) => set("variants", form.variants.map((x, j) => (j === i ? { ...x, platformPrice: val } : x)))}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-destructive"
                      onClick={() => set("variants", form.variants.filter((_, j) => j !== i))}
                      disabled={form.variants.length === 1}
                      aria-label="Quitar variante"
                    >
                      <Trash className="size-4" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" className="w-full gap-2" onClick={() => set("variants", [...form.variants, { name: "", price: "" }])}>
                  <Plus className="size-4" /> Agregar variante
                </Button>
              </div>
            )}
          </Section>

          {/* Tags de flujo */}
          <Section title="Tags de flujo" hint="Los flujos pueden preguntar según un tag; p. ej. con-leche para cafés que llevan leche.">
            {isCoffee && (
              <div className="flex items-center justify-between rounded-lg border bg-amber-500/5 px-3 py-2.5 text-sm">
                <div>
                  <p className="font-medium">Este café permite elegir leche</p>
                  <p className="text-xs text-muted-foreground">Se pregunta en Frío y en Caliente.</p>
                </div>
                <Switch
                  checked={form.flowTags.includes("con-leche")}
                  onCheckedChange={(checked) =>
                    set("flowTags", checked ? [...new Set([...form.flowTags, "con-leche"])] : form.flowTags.filter((t) => t !== "con-leche"))
                  }
                />
              </div>
            )}
            <div className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-muted/20 p-2">
              {form.flowTags.map((tag) => (
                <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                  {tag}
                  <button type="button" aria-label={`Quitar ${tag}`} onClick={() => set("flowTags", form.flowTags.filter((t) => t !== tag))}>
                    <X className="size-3" />
                  </button>
                </span>
              ))}
              <input
                list="known-flow-tags"
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  const tag = tagDraft.trim().toLowerCase();
                  if (tag) set("flowTags", [...new Set([...form.flowTags, tag])]);
                  setTagDraft("");
                }}
                placeholder="Escribe y Enter"
                className="h-7 min-w-32 flex-1 bg-transparent px-1 text-sm outline-none"
              />
              <datalist id="known-flow-tags">
                {knownTags.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
          </Section>
        </div>

        {/* ───── Derecha ───── */}
        <div className="space-y-6 lg:sticky lg:top-20 lg:self-start">
          {/* Vista previa */}
          <div className="overflow-hidden rounded-2xl border bg-card">
            <div className="relative aspect-[4/3] bg-muted">
              {cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cover} alt="" className="size-full object-cover" />
              ) : (
                <div className="flex size-full items-center justify-center text-muted-foreground">
                  <ImageSquare className="size-10 opacity-40" />
                </div>
              )}
              {!form.menuWebVisible && (
                <span className="absolute top-3 left-3 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-semibold text-white">Oculto en el menú web</span>
              )}
            </div>
            <div className="space-y-1 p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Así se ve en el menú</p>
              <p className="font-semibold leading-tight">{form.name || "Nombre del platillo"}</p>
              {form.description && <p className="line-clamp-2 text-sm text-muted-foreground">{form.description}</p>}
              <p className="pt-1 font-semibold tabular-nums">{previewPrice}</p>
            </div>
          </div>

          {/* Disponibilidad */}
          <Section title="Disponibilidad">
            <ToggleRow label="Activo en el POS" hint={form.active ? "Se puede comandar" : "No aparece en los iPads"} checked={form.active} onChange={(v) => set("active", v)} />
            <ToggleRow
              label="Visible en el menú web"
              hint={form.menuWebVisible ? "Sale en cocinabruma.com.mx" : "Oculto en la página pública"}
              checked={form.menuWebVisible}
              onChange={(v) => set("menuWebVisible", v)}
            />
            <ToggleRow
              label="Premio de lealtad"
              hint={form.loyaltyEligible ? "Se puede canjear gratis con el pase" : "No se puede canjear como premio"}
              checked={form.loyaltyEligible}
              onChange={(v) => set("loyaltyEligible", v)}
            />
          </Section>

          {/* Categoría */}
          <Section title="Categoría">
            <Select value={form.categoryId} onValueChange={(v) => setForm((prev) => ({ ...prev, categoryId: v, subcategoryId: "" }))}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Elige una categoría" />
              </SelectTrigger>
              <SelectContent>
                {[...categories]
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="flex items-center gap-2">
                        <span className="size-2.5 rounded-full" style={{ backgroundColor: c.color || "#6B7280" }} />
                        {c.name}
                      </span>
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {subcategories.length > 0 && (
              <Select value={form.subcategoryId} onValueChange={(v) => set("subcategoryId", v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Subcategoría (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  {subcategories.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Section>

          {/* Imagen del POS */}
          <PosImage
            value={form.imageUrl}
            cover={cover}
            onChange={(v) => set("imageUrl", v)}
          />
        </div>
      </div>

      {/* Barra de guardado */}
      <div
        className={cn(
          "pointer-events-none fixed inset-x-0 bottom-6 z-30 flex justify-center px-4 transition-all duration-200",
          dirty || isNew ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
        )}
      >
        <div className="pointer-events-auto flex items-center gap-3 rounded-full border bg-background/95 py-2 pr-2 pl-5 shadow-lg backdrop-blur">
          <span className="text-sm text-muted-foreground">{isNew ? "Platillo nuevo" : "Tienes cambios sin guardar"}</span>
          {!isNew && (
            <Button variant="ghost" size="sm" className="rounded-full" onClick={() => setForm(initial)} disabled={saving}>
              Descartar
            </Button>
          )}
          <Button size="sm" className="gap-2 rounded-full px-4" onClick={save} disabled={saving}>
            {saving ? "Guardando…" : isNew ? "Crear platillo" : "Guardar"}
            <kbd className="hidden rounded bg-primary-foreground/20 px-1 font-mono text-[10px] sm:inline">⌘S</kbd>
          </Button>
        </div>
      </div>

      {cropping && (
        <ImageCropper
          blobUrl={cropping.blobUrl}
          onCancel={closeCropper}
          onUploaded={(url) => {
            setForm((prev) => ({
              ...prev,
              menuImages:
                cropping.index !== null ? prev.menuImages.map((u, i) => (i === cropping.index ? url : u)) : [...prev.menuImages, url].slice(0, MAX_PHOTOS),
            }));
            toast.success("Foto lista · recuerda guardar");
            closeCropper();
          }}
        />
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar {form.name}?</AlertDialogTitle>
            <AlertDialogDescription>Deja de salir en el POS y en el menú. Se conserva en las órdenes históricas.</AlertDialogDescription>
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

function BackLink() {
  return (
    <Link href="/inventory/products" className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-3.5" />
      Platillos
    </Link>
  );
}

function Section({ title, hint, action, children }: { title: string; hint?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{title}</h2>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function MoneyInput({
  id,
  label,
  hint,
  value,
  onChange,
  placeholder = "0.00",
}: {
  id?: string;
  label?: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const input = (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">$</span>
      <Input id={id} inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))} placeholder={placeholder} className="pl-7 tabular-nums" />
    </div>
  );
  if (!label) return input;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {input}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ToggleRow({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function Photo({
  url,
  cover,
  onEdit,
  onRemove,
  onMakeCover,
}: {
  url: string;
  cover?: boolean;
  onEdit: () => void;
  onRemove: () => void;
  onMakeCover?: () => void;
}) {
  const [broken, setBroken] = useState(false);
  return (
    <div className={cn("group relative overflow-hidden rounded-xl border bg-muted", cover ? "aspect-square sm:aspect-auto sm:h-full" : "aspect-square")}>
      {broken ? (
        <div className="flex size-full flex-col items-center justify-center gap-1 p-2 text-center text-xs text-muted-foreground">
          <ImageSquare className="size-6 opacity-50" />
          No se pudo cargar
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" onError={() => setBroken(true)} className="size-full object-cover" />
      )}
      {cover && <span className="absolute top-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white">Portada</span>}
      <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1.5 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
        {onMakeCover && (
          <IconButton label="Hacer portada" onClick={onMakeCover}>
            <Star className="size-3.5" />
          </IconButton>
        )}
        <IconButton label="Recortar" onClick={onEdit}>
          <PencilSimple className="size-3.5" />
        </IconButton>
        <IconButton label="Quitar" onClick={onRemove} danger>
          <X className="size-3.5" />
        </IconButton>
      </div>
    </div>
  );
}

function IconButton({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn("flex size-7 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm transition-colors", danger ? "hover:bg-red-500/80" : "hover:bg-white/35")}
    >
      {children}
    </button>
  );
}

function UploadTile({ big, uploading, onFiles }: { big?: boolean; uploading: boolean; onFiles: (files: FileList) => void }) {
  return (
    <label
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed text-muted-foreground transition-colors hover:bg-muted/40",
        big ? "aspect-square sm:aspect-auto sm:min-h-64" : "aspect-square"
      )}
    >
      {uploading ? <Spinner className="size-5 animate-spin" /> : big ? <CloudArrowUp className="size-8" /> : <Plus className="size-5" />}
      <span className={cn("text-center", big ? "text-sm" : "text-xs")}>{uploading ? "Subiendo…" : big ? "Sube o arrastra la portada" : "Agregar foto"}</span>
      <input type="file" accept="image/*,video/mp4,video/quicktime,video/webm" className="sr-only" onChange={(e) => e.target.files && onFiles(e.target.files)} disabled={uploading} />
    </label>
  );
}

/**
 * Imagen que usa el POS del iPad (`products.image_url`). Antes se guardaba como
 * base64 dentro de la DB (`/api/upload`); ahora se sube al CDN como las fotos
 * del menú, y se puede reusar la portada con un clic.
 */
function PosImage({ value, cover, onChange }: { value: string; cover?: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(!!value);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setUploading(true);
    try {
      onChange(await uploadToCdn(file, file.name));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error subiendo imagen");
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-5">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between text-left">
        <span>
          <span className="block font-semibold">Imagen en el POS</span>
          <span className="block text-xs text-muted-foreground">{value ? "Personalizada" : "Opcional · el iPad usa esta imagen"}</span>
        </span>
        <CaretDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="mt-4 space-y-3">
          {value ? (
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={value} alt="" className="size-16 rounded-lg border object-cover" />
              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => onChange("")}>
                Quitar
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Sin imagen propia.</p>
          )}
          <div className="flex flex-wrap gap-2">
            {cover && cover !== value && (
              <Button variant="outline" size="sm" onClick={() => onChange(cover)}>
                Usar la portada
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? "Subiendo…" : "Subir imagen"}
            </Button>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </div>
        </div>
      )}
    </section>
  );
}
