// @ts-nocheck
"use client";

import { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ModifierStep } from "@/lib/types";

export const StepNode = memo(({ data }: NodeProps<{ step: ModifierStep }>) => {
  const { step } = data;

  const getStepColor = (stepType: string) => {
    const colors: Record<string, string> = {
      frosting: "bg-blue-500",
      topping: "bg-purple-500",
      extra: "bg-green-500",
      custom: "bg-orange-500",
      products: "bg-cyan-500",
      category: "bg-pink-500",
    };
    return colors[stepType] || "bg-gray-500";
  };

  const getStepLabel = (stepType: string) => {
    const labels: Record<string, string> = {
      frosting: "F",
      topping: "T",
      extra: "E",
      custom: "C",
      products: "P",
      category: "K",
    };
    return labels[stepType] || "S";
  };

  return (
    <div className="relative">
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-muted-foreground !w-3 !h-3 !border-2 !border-border"
      />

      <Card className="w-64 bg-card border-border hover:border-muted-foreground transition-all shadow-xl">
        <div className="p-4 space-y-3">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div
              className={`size-10 rounded-lg ${getStepColor(
                step.stepType
              )} flex items-center justify-center text-xl font-bold text-white`}
            >
              {getStepLabel(step.stepType)}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-foreground truncate">
                {step.stepName}
              </h3>
              <p className="text-xs text-muted-foreground capitalize">
                {step.stepType}
              </p>
            </div>
          </div>

          {/* Options Count */}
          {step.options && step.options.length > 0 && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                {step.options.length} {
                  (step.stepType as string) === "products" ? "productos" :
                  (step.stepType as string) === "category" ? "categoría" :
                  "opciones"
                }
              </Badge>
            </div>
          )}

          {/* None Option */}
          {step.includeNoneOption && (
            <div className="flex items-center gap-2">
              <div className="size-2 rounded-full bg-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                Incluye opción "Ninguno"
              </span>
            </div>
          )}
        </div>

        {/* Gradient Border Effect */}
        <div
          className={`absolute inset-0 rounded-lg opacity-0 hover:opacity-100 transition-opacity pointer-events-none`}
          style={{
            background: `linear-gradient(135deg, ${
              step.stepType === "frosting"
                ? "rgba(59, 130, 246, 0.1)"
                : step.stepType === "topping"
                ? "rgba(168, 85, 247, 0.1)"
                : step.stepType === "extra"
                ? "rgba(34, 197, 94, 0.1)"
                : "rgba(249, 115, 22, 0.1)"
            } 0%, transparent 100%)`,
          }}
        />
      </Card>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-muted-foreground !w-3 !h-3 !border-2 !border-border"
      />
    </div>
  );
});

StepNode.displayName = "StepNode";
