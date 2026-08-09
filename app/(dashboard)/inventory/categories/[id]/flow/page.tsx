"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FlowEditor } from "@/components/flow-editor/FlowEditor";
import { toast } from "sonner";
import type { ModifierStep } from "@/lib/types";

// Flujos de categoría: mismo editor visual que los de producto, pero limitado a
// los 4 tipos que soporta el almacenamiento normalizado (modifierSteps), que es
// lo que POS y waitress ya consumen. Sin migración ni cambios en el POS.
export default function CategoryFlowPage({
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
      const res = await fetch(`/api/categories/${id}/flow`);
      if (res.ok) {
        const data = await res.json();
        setFlow(data);
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
      const res = await fetch(`/api/categories/${id}/flow`, {
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

  // Si la categoría usa el flujo default, arranca vacío para no convertirla en
  // personalizada por accidente al guardar.
  const initialSteps = flow?.useDefaultFlow ? [] : flow?.steps || [];

  return (
    <FlowEditor
      categoryId={id}
      initialSteps={initialSteps}
      initialNodes={flow?.useDefaultFlow ? undefined : flow?.nodes}
      onSave={handleSave}
      onBack={() => router.push("/inventory/categories")}
      allowedStepTypes={["frosting", "topping", "extra", "custom"]}
    />
  );
}
