"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function AddStepPanel({ onAdd, onClose }: { onAdd: (title: string, stepNode: boolean) => void; onClose: () => void }) {
  return <div className="absolute inset-0 z-50 grid place-items-center bg-black/40 p-4"><div className="w-full max-w-md rounded-xl border bg-card p-5 shadow-xl"><h2 className="text-lg font-semibold">Agregar nodo</h2><p className="mt-1 text-sm text-muted-foreground">Un nodo de paso no tiene opciones y permite ramificar antes de preguntar algo.</p><form className="mt-5 space-y-3" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); onAdd(String(form.get("title") || "Nuevo nodo"), form.get("kind") === "step") }}><Input name="title" autoFocus defaultValue="Nuevo nodo" /><label className="flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm"><input name="kind" type="radio" value="choice" defaultChecked /> Nodo de selección</label><label className="flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm"><input name="kind" type="radio" value="step" /> Nodo de paso / router</label><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancelar</Button><Button>Agregar</Button></div></form></div></div>
}
