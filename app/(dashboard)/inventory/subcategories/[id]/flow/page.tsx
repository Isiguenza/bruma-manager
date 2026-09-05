"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FlowEditor } from "@/components/flow-editor/FlowEditor";
import { toast } from "sonner";
import type { ModifierStep } from "@/lib/types";

// Flujo de subcategoría: mismo editor que categoría/producto. Tiene precedencia
// sobre el flujo de la categoría padre; si se deja vacío, el producto hereda el
// flujo de la categoría. La resolución vive en /api/products/[id]/flow.
export default function SubcategoryFlowPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const { id } = use(params);
  const [loading, setLoading] = useState(true);
  const [flow, setFlow] = useState<any>(null);

  useEffect(() => {
    fetchFlow();
  }, [id]);

  async function fetchFlow() {
    try {
      const res = await fetch(`/api/subcategories/${id}/flow`);
      if (res.ok) {
        setFlow(await res.json());
      }
    } catch (error) {
      console.error("Error fetching flow:", error);
      toast.error("Error al cargar el flujo");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(steps: ModifierStep[], nodes: any) {
    try {
      const res = await fetch(`/api/subcategories/${id}/flow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          useDefaultFlow: steps.length === 0,
          steps,
          nodes,
        }),
      });

      if (res.ok) {
        toast.success("Flujo guardado exitosamente");
      } else {
        toast.error("Error al guardar el flujo");
      }
    } catch (error) {
      console.error("Error saving flow:", error);
      toast.error("Error al guardar el flujo");
    }
  }

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-neutral-950">
        <div className="text-center">
          <div className="size-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-neutral-400">Cargando editor...</p>
        </div>
      </div>
    );
  }

  const initialSteps = flow?.useDefaultFlow ? [] : flow?.steps || [];

  return (
    <FlowEditor
      subcategoryId={id}
      initialSteps={initialSteps}
      initialNodes={flow?.useDefaultFlow ? undefined : flow?.nodes}
      onSave={handleSave}
      onBack={() => router.push("/inventory/categories")}
      allowedStepTypes={["frosting", "topping", "extra", "custom"]}
    />
  );
}
