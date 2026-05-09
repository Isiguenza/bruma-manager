// @ts-nocheck - Type compatibility issues with React Flow generics
"use client";

import { useCallback, useState, useEffect } from "react";
import { useTheme } from "next-themes";
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  BackgroundVariant,
  Panel,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus, FloppyDisk, ArrowLeft } from "@phosphor-icons/react";
import { StepNode } from "./StepNode";
import { AddStepPanel } from "./AddStepPanel";
import { StepEditPanel } from "./StepEditPanel";
import type { ModifierStep } from "@/lib/types";

const nodeTypes = {
  step: StepNode,
};

interface FlowEditorProps {
  productId?: string;
  categoryId?: string;
  initialSteps?: ModifierStep[];
  initialNodes?: any;
  onSave?: (steps: ModifierStep[], nodes: any) => void;
  onBack?: () => void;
}

export function FlowEditor({
  productId,
  categoryId,
  initialSteps = [],
  initialNodes,
  onSave,
  onBack,
}: FlowEditorProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [steps, setSteps] = useState<ModifierStep[]>(initialSteps);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const { theme } = useTheme();
  const isDark = theme === "dark";

  // Initialize nodes from steps
  useEffect(() => {
    if (initialNodes) {
      setNodes(initialNodes.nodes || []);
      setEdges(initialNodes.edges || []);
    } else if (initialSteps.length > 0) {
      // Auto-layout steps vertically
      const newNodes = initialSteps.map((step, index) => ({
        id: step.id,
        type: "step",
        position: { x: 250, y: index * 150 + 50 },
        data: { step },
      }));

      const newEdges = initialSteps.slice(0, -1).map((step, index) => ({
        id: `e${step.id}-${initialSteps[index + 1].id}`,
        source: step.id,
        target: initialSteps[index + 1].id,
        animated: true,
      }));

      setNodes(newNodes);
      setEdges(newEdges);
    }
  }, []);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const addStep = (stepType: string) => {
    const newStep: ModifierStep = {
      id: `step-${Date.now()}`,
      stepName: getStepName(stepType),
      stepType,
      includeNoneOption: true,
      options: stepType === "custom" ? [] : null,
    };

    const newNode: Node = {
      id: newStep.id,
      type: "step",
      position: { x: 250, y: nodes.length * 150 + 50 },
      data: { step: newStep },
    };

    setSteps([...steps, newStep]);
    setNodes([...nodes, newNode]);
    setShowAddPanel(false);
  };

  const updateStep = (stepId: string, updates: Partial<ModifierStep>) => {
    // Update steps array
    const updatedSteps = steps.map((s) => 
      s.id === stepId ? { ...s, ...updates } : s
    );
    setSteps(updatedSteps);
    
    // Update nodes with the new step data
    setNodes(
      nodes.map((n) => {
        if (n.id === stepId) {
          const currentStep = n.data?.step || {};
          return {
            ...n,
            data: {
              ...n.data,
              step: { ...currentStep, ...updates }
            }
          };
        }
        return n;
      })
    );
  };

  const deleteStep = (stepId: string) => {
    setSteps(steps.filter((s) => s.id !== stepId));
    setNodes(nodes.filter((n) => n.id !== stepId));
    setEdges(edges.filter((e) => e.source !== stepId && e.target !== stepId));
  };

  const handleSave = () => {
    if (onSave) {
      onSave(steps, { nodes, edges });
    }
  };

  const getStepName = (stepType: string) => {
    const names: Record<string, string> = {
      frosting: "Betún",
      topping: "Topping",
      extra: "Extras",
      custom: "Paso Personalizado",
    };
    return names[stepType] || "Nuevo Paso";
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="h-16 border-b border-border flex items-center justify-between px-6 bg-card">
        <div className="flex items-center gap-4">
          {onBack && (
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft className="size-4" />
            </Button>
          )}
          <div>
            <h1 className="text-xl font-bold">Editor de Flujo</h1>
            <p className="text-sm text-muted-foreground">
              {productId ? "Flujo de Producto" : "Flujo de Categoría"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setShowAddPanel(true)}
            className="gap-2"
          >
            <Plus className="size-4" />
            Agregar Paso
          </Button>
          <Button onClick={handleSave} className="gap-2">
            <FloppyDisk className="size-4" />
            Guardar Flujo
          </Button>
        </div>
      </div>

      {/* Flow Canvas */}
      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
          className="bg-background"
          onNodeClick={(_, node) => setSelectedNode(node)}
        >
          <Background 
            variant={BackgroundVariant.Dots} 
            gap={20} 
            size={1} 
            color={isDark ? "#333" : "#ddd"} 
          />
          <Controls className="bg-card border-border" />
          <MiniMap
            className="bg-card border-border"
            nodeColor="#6366f1"
            maskColor={isDark ? "rgba(0, 0, 0, 0.6)" : "rgba(255, 255, 255, 0.6)"}
          />

          {/* Info Panel */}
          <Panel position="top-left" className="bg-card border border-border rounded-lg p-4 m-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="size-3 rounded-full bg-blue-500" />
                <span className="text-xs text-muted-foreground">Tipo F</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="size-3 rounded-full bg-purple-500" />
                <span className="text-xs text-muted-foreground">Tipo T</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="size-3 rounded-full bg-green-500" />
                <span className="text-xs text-muted-foreground">Tipo E</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="size-3 rounded-full bg-orange-500" />
                <span className="text-xs text-muted-foreground">Personalizado</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="size-3 rounded-full bg-cyan-500" />
                <span className="text-xs text-muted-foreground">Productos</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="size-3 rounded-full bg-pink-500" />
                <span className="text-xs text-muted-foreground">Categoría</span>
              </div>
            </div>
          </Panel>
        </ReactFlow>

        {/* Add Step Panel */}
        {showAddPanel && (
          <AddStepPanel
            onAdd={addStep}
            onClose={() => setShowAddPanel(false)}
          />
        )}

        {/* Step Edit Panel */}
        {selectedNode && selectedNode.data?.step && (
          <StepEditPanel
            step={selectedNode.data.step as ModifierStep}
            onUpdate={(updates) => updateStep(selectedNode.id, updates)}
            onDelete={() => {
              deleteStep(selectedNode.id);
              setSelectedNode(null);
            }}
            onClose={() => setSelectedNode(null)}
          />
        )}
      </div>
    </div>
  );
}
