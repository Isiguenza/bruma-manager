// @ts-nocheck
"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { X } from "@phosphor-icons/react";

interface AddStepPanelProps {
  onAdd: (stepType: string) => void;
  onClose: () => void;
}

export function AddStepPanel({ onAdd, onClose }: AddStepPanelProps) {
  const stepTypes = [
    {
      type: "frosting",
      name: "Paso Tipo F",
      description: "Selección única de opciones",
      label: "F",
      color: "bg-blue-500",
    },
    {
      type: "topping",
      name: "Paso Tipo T",
      description: "Selección única de opciones",
      label: "T",
      color: "bg-purple-500",
    },
    {
      type: "extra",
      name: "Paso Tipo E",
      description: "Selección múltiple de opciones",
      label: "E",
      color: "bg-green-500",
    },
    {
      type: "custom",
      name: "Paso Personalizado",
      description: "Paso con opciones personalizadas",
      label: "C",
      color: "bg-orange-500",
    },
    {
      type: "products",
      name: "Productos Existentes",
      description: "Selecciona productos del inventario",
      label: "P",
      color: "bg-cyan-500",
    },
    {
      type: "category",
      name: "Productos por Categoría",
      description: "Selecciona todos los productos de una categoría",
      label: "K",
      color: "bg-pink-500",
    },
  ];

  return (
    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <Card className="w-full max-w-2xl bg-card border-border p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold">Agregar Paso</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Selecciona el tipo de paso que deseas agregar al flujo
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="size-5" />
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {stepTypes.map((stepType) => (
            <button
              key={stepType.type}
              onClick={() => onAdd(stepType.type)}
              className="group relative p-6 rounded-lg border-2 border-border hover:border-muted-foreground bg-muted/50 hover:bg-muted transition-all text-left"
            >
              {/* Label */}
              <div
                className={`size-14 rounded-xl ${stepType.color} flex items-center justify-center text-2xl font-bold text-white mb-4 group-hover:scale-110 transition-transform`}
              >
                {stepType.label}
              </div>

              {/* Content */}
              <h3 className="text-lg font-semibold mb-2">
                {stepType.name}
              </h3>
              <p className="text-sm text-muted-foreground">{stepType.description}</p>

              {/* Hover Effect */}
              <div
                className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                style={{
                  background: `linear-gradient(135deg, ${
                    stepType.type === "frosting"
                      ? "rgba(59, 130, 246, 0.1)"
                      : stepType.type === "topping"
                      ? "rgba(168, 85, 247, 0.1)"
                      : stepType.type === "extra"
                      ? "rgba(34, 197, 94, 0.1)"
                      : "rgba(249, 115, 22, 0.1)"
                  } 0%, transparent 100%)`,
                }}
              />
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}
