"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  PencilSimple,
  Trash,
  MagnifyingGlass,
  X,
  Package,
  CheckCircle,
  XCircle,
  Star,
  CurrencyDollar,
  Globe,
  VideoCamera,
  CaretDown,
  Tag,
  Image as ImageIcon,
  FlowArrow,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import type { Product, Category, Group } from "@/lib/types";

interface Extra {
  id: string;
  name: string;
  description: string | null;
  price: string;
  sortOrder: number;
  active: boolean;
  createdAt: string;
}

interface ProductVariant {
  name: string;
  price: string;
  platformPrice?: string;
}

interface ProductForm {
  name: string;
  description: string;
  price: string;
  platformPrice?: string;
  categoryId: string;
  subcategoryId: string;
  groupId: string;
  imageUrl: string;
  hasVariants: boolean;
  variants: ProductVariant[];
  active: boolean;
  menuImages: string[];
  menuVideo: string;
  menuWebVisible: boolean;
}

interface CropModalState {
  blobUrl: string;
  zoom: number;
  offsetX: number;
  offsetY: number;
  editingIndex: number | null;
}

const emptyForm: ProductForm = {
  name: "",
  description: "",
  price: "",
  platformPrice: "",
  categoryId: "",
  subcategoryId: "",
  groupId: "",
  imageUrl: "",
  hasVariants: false,
  variants: [],
  active: true,
  menuImages: [],
  menuVideo: "",
  menuWebVisible: true,
};

export default function ProductsPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [extras, setExtras] = useState<Extra[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCategoryFilters, setSelectedCategoryFilters] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [extraDialogOpen, setExtraDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingExtra, setEditingExtra] = useState<Extra | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingMenuMedia, setUploadingMenuMedia] = useState(false);
  const [cropModal, setCropModal] = useState<CropModalState | null>(null);
  const cropImgRef = useRef<HTMLImageElement | null>(null);
  const cropContainerRef = useRef<HTMLDivElement | null>(null);
  const cropDragRef = useRef<{ startX: number; startY: number; startOffX: number; startOffY: number } | null>(null);

  // Bulk actions
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [bulkActionInProgress, setBulkActionInProgress] = useState(false);

  // Category dialog
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [catName, setCatName] = useState("");

  // Extra form states
  const [extraName, setExtraName] = useState("");
  const [extraDescription, setExtraDescription] = useState("");
  const [extraPrice, setExtraPrice] = useState("");
  const [extraSortOrder, setExtraSortOrder] = useState(0);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const [productsRes, categoriesRes, groupsRes, extrasRes] = await Promise.all([
        fetch("/api/products"),
        fetch("/api/categories"),
        fetch("/api/groups"),
        fetch("/api/extras"),
      ]);
      if (productsRes.ok) setProducts(await productsRes.json());
      if (categoriesRes.ok) setCategories(await categoriesRes.json());
      if (groupsRes.ok) setGroups(await groupsRes.json());
      if (extrasRes.ok) setExtras(await extrasRes.json());
    } catch {
      toast.error("Error cargando datos");
    } finally {
      setLoading(false);
    }
  }

  function openCreateDialog() {
    setForm(emptyForm);
    setEditingId(null);
    setDialogOpen(true);
  }

  function openEditDialog(product: Product) {
    const variants = product.variants ? JSON.parse(product.variants) : [];
    const menuImages = (product as any).menuImages ? JSON.parse((product as any).menuImages) : [];
    setForm({
      name: product.name,
      description: product.description || "",
      price: product.price,
      platformPrice: product.platformPrice || "",
      categoryId: product.categoryId || "",
      subcategoryId: product.subcategoryId || "",
      groupId: product.groupId || "",
      imageUrl: product.imageUrl || "",
      hasVariants: product.hasVariants || false,
      variants: variants.length > 0 ? variants : [],
      active: product.active,
      menuImages,
      menuVideo: (product as any).menuVideo || "",
      menuWebVisible: (product as any).menuWebVisible !== false,
    });
    setEditingId(product.id);
    setDialogOpen(true);
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error();

      const { imageUrl } = await res.json();
      setForm({ ...form, imageUrl });
      toast.success("Imagen subida");
    } catch {
      toast.error("Error subiendo imagen");
    } finally {
      setUploading(false);
    }
  }

  async function handleMenuMediaUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    e.target.value = "";

    for (const file of files) {
      if (file.type.startsWith("video/")) {
        if (form.menuVideo) { toast.error("Solo se permite 1 video por platillo"); return; }
        setUploadingMenuMedia(true);
        try {
          const fd = new FormData();
          fd.append("file", file);
          const res = await fetch("/api/menu/upload", { method: "POST", body: fd });
          if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Error"); }
          const { url } = await res.json();
          setForm((prev) => ({ ...prev, menuVideo: url }));
          toast.success("Video subido");
        } catch (err: any) {
          toast.error(err.message || "Error subiendo video");
        } finally {
          setUploadingMenuMedia(false);
        }
      } else {
        if (form.menuImages.length >= 4) { toast.error("Máximo 4 imágenes por platillo"); return; }
        const blobUrl = URL.createObjectURL(file);
        setCropModal({ blobUrl, zoom: 1, offsetX: 0, offsetY: 0, editingIndex: null });
        break;
      }
    }
  }

  async function handleVideoReplace(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploadingMenuMedia(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/menu/upload", { method: "POST", body: fd });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Error"); }
      const { url } = await res.json();
      setForm((prev) => ({ ...prev, menuVideo: url }));
      toast.success("Video actualizado");
    } catch (err: any) {
      toast.error(err.message || "Error subiendo video");
    } finally {
      setUploadingMenuMedia(false);
    }
  }

  async function openImageEditor(url: string, index: number) {
    try {
      const res = await fetch(`/api/proxy-image?url=${encodeURIComponent(url)}`);
      if (!res.ok) throw new Error("No se pudo cargar");
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      setCropModal({ blobUrl, zoom: 1, offsetX: 0, offsetY: 0, editingIndex: index });
    } catch {
      toast.error("No se pudo cargar la imagen para editar");
    }
  }

  function closeCropper() {
    if (cropModal) URL.revokeObjectURL(cropModal.blobUrl);
    setCropModal(null);
  }

  function clampCropOffset(
    ox: number, oy: number, zoom: number,
    img: HTMLImageElement, container: HTMLDivElement
  ): [number, number] {
    if (!img.naturalWidth) return [ox, oy];
    const C = container.getBoundingClientRect().width;
    const base = Math.max(C / img.naturalWidth, C / img.naturalHeight);
    const total = base * zoom;
    const mx = Math.max(0, (img.naturalWidth * total - C) / 2);
    const my = Math.max(0, (img.naturalHeight * total - C) / 2);
    return [Math.max(-mx, Math.min(mx, ox)), Math.max(-my, Math.min(my, oy))];
  }

  function onCropMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    cropDragRef.current = {
      startX: e.clientX, startY: e.clientY,
      startOffX: cropModal?.offsetX ?? 0,
      startOffY: cropModal?.offsetY ?? 0,
    };
  }

  function onCropMouseMove(e: React.MouseEvent) {
    if (!cropDragRef.current || !cropModal || !cropImgRef.current || !cropContainerRef.current) return;
    const dx = e.clientX - cropDragRef.current.startX;
    const dy = e.clientY - cropDragRef.current.startY;
    const [cx, cy] = clampCropOffset(
      cropDragRef.current.startOffX + dx,
      cropDragRef.current.startOffY + dy,
      cropModal.zoom, cropImgRef.current, cropContainerRef.current
    );
    setCropModal((prev) => prev ? { ...prev, offsetX: cx, offsetY: cy } : null);
  }

  function onCropMouseUp() { cropDragRef.current = null; }

  function updateCropZoom(zoom: number) {
    if (!cropModal || !cropImgRef.current || !cropContainerRef.current) return;
    const [cx, cy] = clampCropOffset(cropModal.offsetX, cropModal.offsetY, zoom, cropImgRef.current, cropContainerRef.current);
    setCropModal((prev) => prev ? { ...prev, zoom, offsetX: cx, offsetY: cy } : null);
  }

  async function handleCropConfirm() {
    if (!cropModal || !cropImgRef.current || !cropContainerRef.current) return;
    const img = cropImgRef.current;
    const container = cropContainerRef.current;
    if (!img.complete || img.naturalWidth === 0) {
      await new Promise<void>((r) => { img.onload = () => r(); });
    }
    const C = container.getBoundingClientRect().width;
    const base = Math.max(C / img.naturalWidth, C / img.naturalHeight);
    const total = base * cropModal.zoom;
    const srcX = img.naturalWidth / 2 - (C / 2 + cropModal.offsetX) / total;
    const srcY = img.naturalHeight / 2 - (C / 2 + cropModal.offsetY) / total;
    const srcSize = C / total;
    const sx = Math.max(0, Math.min(srcX, img.naturalWidth - srcSize));
    const sy = Math.max(0, Math.min(srcY, img.naturalHeight - srcSize));
    const ss = Math.min(srcSize, img.naturalWidth - sx, img.naturalHeight - sy);
    const canvas = document.createElement("canvas");
    canvas.width = 900; canvas.height = 900;
    canvas.getContext("2d")!.drawImage(img, sx, sy, ss, ss, 0, 0, 900, 900);
    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b!), "image/webp", 0.9)
    );
    setUploadingMenuMedia(true);
    try {
      const fd = new FormData();
      fd.append("file", blob, "crop.webp");
      const res = await fetch("/api/menu/upload", { method: "POST", body: fd });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Error"); }
      const { url } = await res.json();
      if (cropModal.editingIndex !== null) {
        setForm((prev) => ({
          ...prev,
          menuImages: prev.menuImages.map((u, i) => i === cropModal.editingIndex ? url : u),
        }));
      } else {
        setForm((prev) => ({ ...prev, menuImages: [...prev.menuImages, url].slice(0, 4) }));
      }
      toast.success("Imagen guardada");
      closeCropper();
    } catch (err: any) {
      toast.error(err.message || "Error subiendo imagen");
    } finally {
      setUploadingMenuMedia(false);
    }
  }

  async function handleSubmit() {
    if (!form.name) {
      toast.error("El nombre es requerido");
      return;
    }

    // Validar precio o variantes
    if (!form.hasVariants && !form.price) {
      toast.error("El precio es requerido");
      return;
    }

    if (form.hasVariants) {
      // Validar que todas las variantes tengan nombre y precio
      const invalidVariant = form.variants.find(v => !v.name.trim() || !v.price);
      if (invalidVariant || form.variants.length === 0) {
        toast.error("Todas las variantes deben tener nombre y precio");
        return;
      }
    }

    setSubmitting(true);
    try {
      const url = editingId ? `/api/products/${editingId}` : "/api/products";
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          categoryId: form.categoryId || null,
          subcategoryId: form.subcategoryId || null,
          groupId: form.groupId || null,
          variants: form.hasVariants ? JSON.stringify(form.variants) : null,
          menuImages: form.menuImages.length > 0 ? JSON.stringify(form.menuImages) : null,
          menuVideo: form.menuVideo || null,
          menuWebVisible: form.menuWebVisible,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success(editingId ? "Producto actualizado" : "Producto creado");
      setDialogOpen(false);
      fetchData();
    } catch {
      toast.error("Error guardando producto");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    try {
      const res = await fetch(`/api/products/${deleteId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error");
      }
      toast.success("Producto eliminado (se mantiene en órdenes históricas)");
      fetchData();
    } catch (error: any) {
      toast.error(error.message || "Error eliminando producto");
    } finally {
      setDeleteId(null);
    }
  }

  // Bulk action functions
  function toggleProductSelection(productId: string) {
    const newSelected = new Set(selectedProducts);
    if (newSelected.has(productId)) {
      newSelected.delete(productId);
    } else {
      newSelected.add(productId);
    }
    setSelectedProducts(newSelected);
  }

  function toggleAllProducts() {
    if (selectedProducts.size === filtered.length) {
      setSelectedProducts(new Set());
    } else {
      setSelectedProducts(new Set(filtered.map(p => p.id)));
    }
  }

  async function handleBulkDeactivate() {
    if (selectedProducts.size === 0) return;
    
    setBulkActionInProgress(true);
    try {
      const promises = Array.from(selectedProducts).map(id => {
        const product = products.find(p => p.id === id);
        if (!product) return Promise.resolve();
        
        return fetch(`/api/products/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...product, active: false }),
        });
      });
      
      await Promise.all(promises);
      toast.success(`${selectedProducts.size} productos desactivados`);
      setSelectedProducts(new Set());
      fetchData();
    } catch {
      toast.error("Error desactivando productos");
    } finally {
      setBulkActionInProgress(false);
    }
  }

  async function handleBulkDelete() {
    if (selectedProducts.size === 0) return;
    
    setBulkActionInProgress(true);
    let deleted = 0;
    let failed = 0;
    
    try {
      for (const id of Array.from(selectedProducts)) {
        try {
          const res = await fetch(`/api/products/${id}`, { method: "DELETE" });
          if (res.ok) {
            deleted++;
          } else {
            failed++;
          }
        } catch {
          failed++;
        }
      }
      
      if (deleted > 0) {
        toast.success(`${deleted} productos eliminados (se mantienen en órdenes históricas)`);
      }
      if (failed > 0) {
        toast.error(`${failed} productos no pudieron eliminarse`);
      }
      
      setSelectedProducts(new Set());
      fetchData();
    } finally {
      setBulkActionInProgress(false);
    }
  }

  async function handleCreateCategory() {
    if (!catName.trim()) return;
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: catName }),
      });
      if (!res.ok) throw new Error();
      toast.success("Categoría creada");
      setCatDialogOpen(false);
      setCatName("");
      fetchData();
    } catch {
      toast.error("Error creando categoría");
    }
  }

  // Extra functions
  function openCreateExtraDialog() {
    setEditingExtra(null);
    setExtraName("");
    setExtraDescription("");
    setExtraPrice("");
    setExtraSortOrder(extras.length);
    setExtraDialogOpen(true);
  }

  function openEditExtraDialog(extra: Extra) {
    setEditingExtra(extra);
    setExtraName(extra.name);
    setExtraDescription(extra.description || "");
    setExtraPrice(extra.price);
    setExtraSortOrder(extra.sortOrder);
    setExtraDialogOpen(true);
  }

  async function handleExtraSubmit() {
    if (!extraName || !extraPrice) {
      toast.error("Nombre y precio son requeridos");
      return;
    }

    setSubmitting(true);

    try {
      const url = editingExtra
        ? `/api/extras/${editingExtra.id}`
        : "/api/extras";
      
      const method = editingExtra ? "PATCH" : "POST";

      const body = {
        name: extraName,
        description: extraDescription || null,
        price: extraPrice,
        sortOrder: extraSortOrder,
      };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Error");
      }

      toast.success(
        editingExtra ? "Extra actualizado" : "Extra creado"
      );
      setExtraDialogOpen(false);
      fetchData();
    } catch (error: any) {
      toast.error(error.message || "Error al guardar extra");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteExtra(id: string) {
    if (!confirm("¿Estás seguro de desactivar este extra?")) return;

    try {
      const res = await fetch(`/api/extras/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Extra desactivado");
      fetchData();
    } catch (error) {
      toast.error("Error al desactivar extra");
    }
  }

  const formatCurrency = (amount: string) =>
    new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
    }).format(parseFloat(amount));

  const filtered = products.filter((p) => {
    // Filtro de búsqueda
    const matchesSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
    
    // Filtro de categorías (si hay categorías seleccionadas, solo mostrar esas)
    const matchesCategory = selectedCategoryFilters.size === 0 || 
      (p.categoryId && selectedCategoryFilters.has(p.categoryId)) ||
      (!p.categoryId && selectedCategoryFilters.has('no-category'));
    
    return matchesSearch && matchesCategory;
  });

  const activeProducts = products.filter(p => p.active).length;
  const inactiveProducts = products.filter(p => !p.active).length;
  const totalExtras = extras.length;

  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Productos y Extras</h1>
            <p className="text-muted-foreground mt-1">
              Gestiona tu menú y complementos
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setCatDialogOpen(true)} className="gap-2">
              <Plus className="size-4" /> Categoría
            </Button>
            <Button onClick={openCreateDialog} className="gap-2">
              <Plus className="size-4" /> Producto
            </Button>
            <Button onClick={openCreateExtraDialog} variant="outline" className="gap-2">
              <Plus className="size-4" /> Extra
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-blue-500/10 p-3">
                <Package className="size-5 text-blue-600" weight="duotone" />
              </div>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Productos
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{products.length}</div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-green-500/10 p-3">
                <CheckCircle className="size-5 text-green-600" weight="duotone" />
              </div>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Activos
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeProducts}</div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-orange-500/10 p-3">
                <XCircle className="size-5 text-orange-600" weight="duotone" />
              </div>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Inactivos
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{inactiveProducts}</div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-purple-500/10 p-3">
                <Star className="size-5 text-purple-600" weight="duotone" />
              </div>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Extras
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalExtras}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filtro de categorías */}
      <Card>
        <CardContent className="p-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Filtrar por categorías</Label>
            <div className="flex flex-wrap gap-2">
              {categories.map((category) => {
                const isSelected = selectedCategoryFilters.has(category.id);
                return (
                  <Badge
                    key={category.id}
                    variant={isSelected ? "default" : "outline"}
                    className="cursor-pointer hover:bg-primary/80"
                    onClick={() => {
                      const newFilters = new Set(selectedCategoryFilters);
                      if (isSelected) {
                        newFilters.delete(category.id);
                      } else {
                        newFilters.add(category.id);
                      }
                      setSelectedCategoryFilters(newFilters);
                    }}
                  >
                    {category.name}
                  </Badge>
                );
              })}
              {/* Opción para productos sin categoría */}
              <Badge
                variant={selectedCategoryFilters.has('no-category') ? "default" : "outline"}
                className="cursor-pointer hover:bg-primary/80"
                onClick={() => {
                  const newFilters = new Set(selectedCategoryFilters);
                  if (selectedCategoryFilters.has('no-category')) {
                    newFilters.delete('no-category');
                  } else {
                    newFilters.add('no-category');
                  }
                  setSelectedCategoryFilters(newFilters);
                }}
              >
                Sin categoría
              </Badge>
              {/* Botón para limpiar filtros */}
              {selectedCategoryFilters.size > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedCategoryFilters(new Set())}
                  className="h-6 px-2 text-xs"
                >
                  <X className="size-3 mr-1" />
                  Limpiar
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="relative">
        <MagnifyingGlass className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar producto..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Barra de acciones en masa */}
      {selectedProducts.size > 0 && (
        <Card className="mb-4">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium">
                  {selectedProducts.size} producto{selectedProducts.size !== 1 ? "s" : ""} seleccionado{selectedProducts.size !== 1 ? "s" : ""}
                </span>
                <Button variant="ghost" size="sm" onClick={() => setSelectedProducts(new Set())}>
                  <X className="size-4 mr-2" />
                  Cancelar
                </Button>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" disabled={bulkActionInProgress}>
                    Acciones
                    <CaretDown className="size-4 ml-2" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Acciones en masa</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleBulkDeactivate}>
                    <XCircle className="size-4 mr-2 text-orange-500" />
                    Marcar como inactivo
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={handleBulkDelete}
                  >
                    <Trash className="size-4 mr-2" />
                    Eliminar seleccionados
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={filtered.length > 0 && selectedProducts.size === filtered.length}
                    onCheckedChange={() => toggleAllProducts()}
                  />
                </TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center">
                    Cargando...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    No hay productos
                  </TableCell>
                </TableRow>
              ) : (
                (() => {
                  // Agrupar productos por categoría
                  const productsByCategory = filtered.reduce((acc, product) => {
                    const categoryName = product.category?.name || 'Sin categoría';
                    if (!acc[categoryName]) {
                      acc[categoryName] = [];
                    }
                    acc[categoryName].push(product);
                    return acc;
                  }, {} as Record<string, typeof filtered>);

                  // Ordenar categorías alfabéticamente, "Sin categoría" al final
                  const sortedCategories = Object.keys(productsByCategory).sort((a, b) => {
                    if (a === 'Sin categoría') return 1;
                    if (b === 'Sin categoría') return -1;
                    return a.localeCompare(b);
                  });

                  return sortedCategories.map((categoryName) => [
                    // Fila de encabezado de categoría
                    <TableRow key={`category-${categoryName}`} className="bg-muted/40 hover:bg-muted/40 border-b-0">
                      <TableCell colSpan={6} className="py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold tracking-tight uppercase text-muted-foreground">
                            {categoryName}
                          </span>
                          <Badge variant="secondary" className="rounded-full px-2 py-0 text-xs font-normal">
                            {productsByCategory[categoryName].length}
                          </Badge>
                        </div>
                      </TableCell>
                    </TableRow>,
                    // Productos de esta categoría
                    ...productsByCategory[categoryName].map((product) => (
                      <TableRow key={product.id} className="hover:bg-muted/30">
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedProducts.has(product.id)}
                            onCheckedChange={() => toggleProductSelection(product.id)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            {/* Miniatura */}
                            {(product as any).menuImages?.[0] ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={(product as any).menuImages[0]}
                                alt={product.name}
                                className="size-10 rounded-md object-cover border shrink-0"
                              />
                            ) : (
                              <div className="size-10 rounded-md bg-muted border flex items-center justify-center text-sm font-semibold text-muted-foreground shrink-0">
                                {product.name.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="font-medium truncate">{product.name}</p>
                                {(product as any).hasCustomFlow ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 text-blue-600 px-2 py-0.5 text-[11px] font-medium shrink-0">
                                    <FlowArrow className="size-3" /> Flujo propio
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-[11px] shrink-0">
                                    Default
                                  </span>
                                )}
                              </div>
                              {product.description && (
                                <p className="text-xs text-muted-foreground truncate max-w-[240px]">
                                  {product.description}
                                </p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {product.category ? (
                            <Badge variant="secondary">{product.category.name}</Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(product.price)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={product.active ? "default" : "secondary"}>
                            {product.active ? "Activo" : "Inactivo"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => router.push(`/inventory/products/${product.id}/flow`)}
                              title="Configurar flujo"
                            >
                              <FlowArrow className="size-4 text-blue-500" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditDialog(product)}
                            >
                              <PencilSimple className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleteId(product.id)}
                            >
                              <Trash className="size-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ]);
                })()
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Tabla de Extras */}
      <Card>
        <CardHeader>
          <CardTitle>Lista de Extras</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead>Orden</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {extras.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    No hay extras registrados
                  </TableCell>
                </TableRow>
              ) : (
                extras.map((extra) => (
                  <TableRow key={extra.id}>
                    <TableCell className="font-medium">{extra.name}</TableCell>
                    <TableCell className="max-w-md">
                      {extra.description || (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(extra.price)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{extra.sortOrder}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={extra.active ? "default" : "secondary"}>
                        {extra.active ? "Activo" : "Inactivo"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditExtraDialog(extra)}
                        >
                          <PencilSimple className="size-4" />
                        </Button>
                        {extra.active && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteExtra(extra.id)}
                          >
                            <Trash className="size-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Product Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="!w-[80vw] sm:!max-w-[900px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl">
              {editingId ? "Editar Producto" : "Nuevo Producto"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Información Básica */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b">
                <div className="rounded-lg bg-primary/10 p-2">
                  <Package className="size-4 text-primary" weight="duotone" />
                </div>
                <h3 className="font-semibold">Información Básica</h3>
              </div>

              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-sm font-medium">
                    Nombre del Producto *
                  </Label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Ej: Mojito Clásico"
                    className="text-base"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description" className="text-sm font-medium">
                    Descripción
                  </Label>
                  <Textarea
                    id="description"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Describe el producto, ingredientes principales, etc."
                    rows={3}
                    className="resize-none"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="category" className="text-sm font-medium">
                    Categoría
                  </Label>
                  <Select
                    value={form.categoryId}
                    onValueChange={(v) =>
                      setForm({ ...form, categoryId: v, subcategoryId: "" })
                    }
                  >
                    <SelectTrigger id="category">
                      <SelectValue placeholder="Selecciona una categoría" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          <div className="flex items-center gap-2">
                            <div
                              className="size-3 rounded-full"
                              style={{ backgroundColor: cat.color || "#6B7280" }}
                            />
                            {cat.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {(() => {
                  const selectedCategory = categories.find((c) => c.id === form.categoryId);
                  const subcats = selectedCategory?.subcategories || [];
                  if (subcats.length === 0) return null;
                  return (
                    <div className="space-y-2">
                      <Label htmlFor="subcategory" className="text-sm font-medium">
                        Subcategoría
                      </Label>
                      <Select
                        value={form.subcategoryId}
                        onValueChange={(v) => setForm({ ...form, subcategoryId: v })}
                      >
                        <SelectTrigger id="subcategory">
                          <SelectValue placeholder="Selecciona una subcategoría" />
                        </SelectTrigger>
                        <SelectContent>
                          {subcats.map((sub) => (
                            <SelectItem key={sub.id} value={sub.id}>
                              {sub.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Precios */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b">
                <div className="rounded-lg bg-green-500/10 p-2">
                  <CurrencyDollar className="size-4 text-green-600" weight="duotone" />
                </div>
                <h3 className="font-semibold">Precios</h3>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="price" className="text-sm font-medium">
                    Precio Base *
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      $
                    </span>
                    <Input
                      id="price"
                      type="number"
                      step="0.01"
                      value={form.price}
                      onChange={(e) => setForm({ ...form, price: e.target.value })}
                      placeholder="0.00"
                      disabled={form.hasVariants}
                      className="pl-7"
                    />
                  </div>
                  {form.hasVariants && (
                    <p className="text-xs text-muted-foreground">
                      El precio se define en las variantes
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="platformPrice" className="text-sm font-medium flex items-center gap-1">
                    Precio Plataforma
                    <span className="text-xs">🏍️</span>
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      $
                    </span>
                    <Input
                      id="platformPrice"
                      type="number"
                      step="0.01"
                      value={form.platformPrice || ""}
                      onChange={(e) => setForm({ ...form, platformPrice: e.target.value })}
                      placeholder="Opcional"
                      disabled={form.hasVariants}
                      className="pl-7"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Para Uber Eats, Rappi, Didi Food
                  </p>
                </div>
              </div>
            </div>

            {/* Variantes */}
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b">
                <div className="flex items-center gap-2">
                  <div className="rounded-lg bg-blue-500/10 p-2">
                    <Tag className="size-4 text-blue-600" weight="duotone" />
                  </div>
                  <h3 className="font-semibold">Variantes de Precio</h3>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={form.hasVariants}
                    onCheckedChange={(v) => {
                      setForm({ ...form, hasVariants: v, variants: v ? [{ name: "", price: "" }] : [] });
                    }}
                  />
                  <Label className="text-sm cursor-pointer">Activar</Label>
                </div>
              </div>

              {!form.hasVariants && (
                <p className="text-sm text-muted-foreground">
                  Activa las variantes si tu producto tiene diferentes tamaños o presentaciones con precios distintos.
                  <br />
                  <span className="text-xs">Ej: Pieza/Orden, Mediano/Grande, Individual/Familiar</span>
                </p>
              )}

              {form.hasVariants && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    {form.variants.map((variant, index) => (
                      <div key={index} className="p-3 border rounded-lg bg-muted/30 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-muted-foreground">
                            Variante {index + 1}
                          </span>
                          {form.variants.length > 1 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const newVariants = form.variants.filter((_, i) => i !== index);
                                setForm({ ...form, variants: newVariants });
                              }}
                              className="ml-auto h-6 px-2 text-destructive hover:text-destructive"
                            >
                              <Trash className="size-3 mr-1" />
                              Eliminar
                            </Button>
                          )}
                        </div>
                        <div className="grid md:grid-cols-3 gap-2">
                          <Input
                            placeholder="Nombre (ej: Pieza)"
                            value={variant.name}
                            onChange={(e) => {
                              const newVariants = [...form.variants];
                              newVariants[index].name = e.target.value;
                              setForm({ ...form, variants: newVariants });
                            }}
                          />
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                              $
                            </span>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="Precio"
                              value={variant.price}
                              onChange={(e) => {
                                const newVariants = [...form.variants];
                                newVariants[index].price = e.target.value;
                                setForm({ ...form, variants: newVariants });
                              }}
                              className="pl-7"
                            />
                          </div>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                              $
                            </span>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="Precio Plataforma"
                              value={variant.platformPrice || ""}
                              onChange={(e) => {
                                const newVariants = [...form.variants];
                                newVariants[index].platformPrice = e.target.value;
                                setForm({ ...form, variants: newVariants });
                              }}
                              className="pl-7"
                              title="Precio para Uber/Rappi/Didi"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setForm({ ...form, variants: [...form.variants, { name: "", price: "" }] });
                    }}
                    className="w-full"
                  >
                    <Plus className="mr-2 size-4" />
                    Agregar Variante
                  </Button>
                </div>
              )}
            </div>

            {/* Imagen del POS (thumbnail interno) */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b">
                <div className="rounded-lg bg-purple-500/10 p-2">
                  <ImageIcon className="size-4 text-purple-600" weight="duotone" />
                </div>
                <h3 className="font-semibold">Imagen del Producto (POS)</h3>
              </div>
              <div className="space-y-3">
                {form.imageUrl ? (
                  <div className="relative w-full h-40 border-2 border-dashed rounded-lg overflow-hidden group">
                    <img src={form.imageUrl} alt="Preview" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Button variant="destructive" size="sm" onClick={() => setForm({ ...form, imageUrl: "" })}>
                        <Trash className="size-4 mr-2" />Eliminar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="border-2 border-dashed rounded-lg p-4 text-center">
                    <Input type="file" accept="image/*" onChange={handleImageUpload} disabled={uploading} className="max-w-xs mx-auto" />
                    {uploading && <p className="text-sm text-muted-foreground mt-2">Subiendo...</p>}
                  </div>
                )}
              </div>
            </div>

            {/* Menú Web */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b">
                <div className="rounded-lg bg-teal-500/10 p-2">
                  <Globe className="size-4 text-teal-600" weight="duotone" />
                </div>
                <h3 className="font-semibold">Menú Web</h3>
              </div>

              {/* Visible en web toggle */}
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                <div>
                  <Label className="text-sm font-medium">Visible en menú web</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Mostrar este platillo en la página pública del menú
                  </p>
                </div>
                <Switch
                  checked={form.menuWebVisible}
                  onCheckedChange={(v) => setForm((prev) => ({ ...prev, menuWebVisible: v }))}
                />
              </div>

              {/* Video */}
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <VideoCamera className="size-4 text-muted-foreground" />
                  Video (1 máx)
                </Label>
                {form.menuVideo ? (
                  <div className="relative rounded-lg overflow-hidden border bg-muted/20 group w-[200px]">
                    <video
                      src={form.menuVideo}
                      className="w-full aspect-square object-cover"
                      muted playsInline autoPlay loop
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                      <label className="cursor-pointer bg-white/20 backdrop-blur-sm rounded-full w-8 h-8 flex items-center justify-center hover:bg-white/30 transition-colors">
                        <PencilSimple className="size-3.5 text-white" />
                        <input
                          type="file"
                          accept="video/mp4,video/quicktime,video/webm"
                          className="sr-only"
                          onChange={handleVideoReplace}
                          disabled={uploadingMenuMedia}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => setForm((prev) => ({ ...prev, menuVideo: "" }))}
                        className="bg-white/20 backdrop-blur-sm rounded-full w-8 h-8 flex items-center justify-center hover:bg-red-500/70 transition-colors"
                      >
                        <X className="size-3.5 text-white" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="border-2 border-dashed rounded-lg p-3 text-center">
                    <Input
                      type="file"
                      accept="video/mp4,video/quicktime,video/webm"
                      onChange={handleMenuMediaUpload}
                      disabled={uploadingMenuMedia}
                      className="max-w-xs mx-auto text-sm"
                    />
                  </div>
                )}
              </div>

              {/* Images */}
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <ImageIcon className="size-4 text-muted-foreground" />
                  Fotos ({form.menuImages.length}/4)
                </Label>
                <div className="grid grid-cols-4 gap-2">
                  {form.menuImages.map((url, i) => (
                    <div key={i} className="relative aspect-square rounded-lg overflow-hidden border group">
                      <img src={url} alt="" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => openImageEditor(url, i)}
                          className="bg-white/20 backdrop-blur-sm rounded-full w-7 h-7 flex items-center justify-center hover:bg-white/30 transition-colors"
                        >
                          <PencilSimple className="size-3.5 text-white" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setForm((prev) => ({ ...prev, menuImages: prev.menuImages.filter((_, j) => j !== i) }))}
                          className="bg-white/20 backdrop-blur-sm rounded-full w-7 h-7 flex items-center justify-center hover:bg-red-500/70 transition-colors"
                        >
                          <X className="size-3.5 text-white" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {form.menuImages.length < 4 && (
                    <label className="aspect-square rounded-lg border-2 border-dashed flex flex-col items-center justify-center cursor-pointer hover:bg-muted/30 transition-colors">
                      <Plus className="size-5 text-muted-foreground mb-1" />
                      <span className="text-xs text-muted-foreground">Agregar</span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="sr-only"
                        onChange={handleMenuMediaUpload}
                        disabled={uploadingMenuMedia}
                      />
                    </label>
                  )}
                </div>
                {uploadingMenuMedia && (
                  <p className="text-xs text-muted-foreground">Subiendo y comprimiendo...</p>
                )}
              </div>
            </div>

            {/* Estado */}
            <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
              <div>
                <Label className="text-sm font-medium">Estado del Producto</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  {form.active ? "Activo en el POS" : "Inactivo en el POS"}
                </p>
              </div>
              <Switch
                checked={form.active}
                onCheckedChange={(v) => setForm({ ...form, active: v })}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={submitting} className="min-w-24">
              {submitting ? "Guardando..." : editingId ? "Actualizar" : "Crear Producto"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Category Dialog */}
      <Dialog open={catDialogOpen} onOpenChange={setCatDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva Categoría</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Nombre</Label>
            <Input
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
              placeholder="Ej: Mojitos"
              onKeyDown={(e) => e.key === "Enter" && handleCreateCategory()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCatDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateCategory}>Crear</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Extra Dialog */}
      <Dialog open={extraDialogOpen} onOpenChange={setExtraDialogOpen}>
        <DialogContent className="!w-[70vw] sm:!max-w-[750px]">
          <DialogHeader>
            <DialogTitle className="text-2xl">
              {editingExtra ? "Editar Extra" : "Nuevo Extra"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Información Básica */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b">
                <div className="rounded-lg bg-primary/10 p-2">
                  <Star className="size-4 text-primary" weight="duotone" />
                </div>
                <h3 className="font-semibold">Información del Extra</h3>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="extra-name" className="text-sm font-medium">
                    Nombre del Extra *
                  </Label>
                  <Input
                    id="extra-name"
                    value={extraName}
                    onChange={(e) => setExtraName(e.target.value)}
                    placeholder="Ej: Crema batida, Caramelo, Shot extra"
                    className="text-base"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="extra-description" className="text-sm font-medium">
                    Descripción
                  </Label>
                  <Textarea
                    id="extra-description"
                    value={extraDescription}
                    onChange={(e) => setExtraDescription(e.target.value)}
                    placeholder="Describe el extra (opcional)"
                    rows={3}
                    className="resize-none"
                  />
                </div>
              </div>
            </div>

            {/* Precio y Orden */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b">
                <div className="rounded-lg bg-green-500/10 p-2">
                  <CurrencyDollar className="size-4 text-green-600" weight="duotone" />
                </div>
                <h3 className="font-semibold">Precio y Configuración</h3>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="extra-price" className="text-sm font-medium">
                    Precio *
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      $
                    </span>
                    <Input
                      id="extra-price"
                      type="number"
                      step="0.01"
                      value={extraPrice}
                      onChange={(e) => setExtraPrice(e.target.value)}
                      placeholder="0.00"
                      className="pl-7"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Costo adicional del extra
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="extra-sortOrder" className="text-sm font-medium">
                    Orden de Visualización
                  </Label>
                  <Input
                    id="extra-sortOrder"
                    type="number"
                    value={extraSortOrder}
                    onChange={(e) => setExtraSortOrder(parseInt(e.target.value) || 0)}
                    min={0}
                    placeholder="0"
                  />
                  <p className="text-xs text-muted-foreground">
                    Menor número aparece primero
                  </p>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setExtraDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleExtraSubmit} disabled={submitting} className="min-w-24">
              {submitting ? "Guardando..." : editingExtra ? "Actualizar" : "Crear Extra"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar producto?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Image Cropper Modal */}
      {cropModal && (
        <Dialog open onOpenChange={closeCropper}>
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle>Ajustar imagen</DialogTitle>
            </DialogHeader>

            {/* Cropper canvas */}
            <div
              ref={cropContainerRef}
              className="relative overflow-hidden rounded-lg bg-muted select-none touch-none"
              style={{ width: "100%", aspectRatio: "1", cursor: "grab" }}
              onMouseDown={onCropMouseDown}
              onMouseMove={onCropMouseMove}
              onMouseUp={onCropMouseUp}
              onMouseLeave={onCropMouseUp}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={cropImgRef}
                src={cropModal.blobUrl}
                alt="Crop preview"
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  transformOrigin: "center center",
                  transform: `translate(${cropModal.offsetX}px, ${cropModal.offsetY}px) scale(${cropModal.zoom})`,
                  userSelect: "none",
                  pointerEvents: "none",
                  draggable: false,
                } as React.CSSProperties}
              />
              {/* Rule-of-thirds overlay */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  backgroundImage:
                    "linear-gradient(rgba(255,255,255,.12) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.12) 1px, transparent 1px)",
                  backgroundSize: "33.33% 33.33%",
                }}
              />
            </div>

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Zoom — arrastra para centrar</p>
              <input
                type="range"
                min={1}
                max={4}
                step={0.01}
                value={cropModal.zoom}
                onChange={(e) => updateCropZoom(parseFloat(e.target.value))}
                className="w-full accent-primary"
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={closeCropper}>
                Cancelar
              </Button>
              <Button onClick={handleCropConfirm} disabled={uploadingMenuMedia}>
                {uploadingMenuMedia ? "Subiendo..." : "Confirmar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
