import { NextRequest, NextResponse } from "next/server"

import { db } from "@/lib/db"
import { flowDefinitions, flowNodes } from "@/lib/db/schema"
import { notifyFlowsUpdated } from "@/lib/notify-flows-updated"
import { getFlow, listFlows, scopeKinds } from "./_shared"

export async function GET() {
  try {
    return NextResponse.json(await listFlows())
  } catch (error) {
    console.error("Error listing flows:", error)
    return NextResponse.json({ error: "Error listing flows" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const scopeKind = body.scopeKind ?? "global"
    if (!scopeKinds.includes(scopeKind)) {
      return NextResponse.json({ error: "scopeKind inválido" }, { status: 400 })
    }
    if (body.name !== undefined && (typeof body.name !== "string" || body.name.trim() === "")) {
      return NextResponse.json({ error: "name no puede estar vacío" }, { status: 400 })
    }
    const [definition] = await db.insert(flowDefinitions).values({
      name: body.name?.trim() || "Nuevo flujo",
      description: typeof body.description === "string" ? body.description : null,
      scopeKind,
      priority: typeof body.priority === "number" ? body.priority : 0,
      active: typeof body.active === "boolean" ? body.active : true,
      parentFlowId: typeof body.parentFlowId === "string" ? body.parentFlowId : null,
    }).returning({ id: flowDefinitions.id })
    await db.insert(flowNodes).values({
      flowId: definition.id,
      title: typeof body.firstStepTitle === "string" && body.firstStepTitle.trim() ? body.firstStepTitle.trim() : "Inicio",
      isEntry: true,
      sortOrder: 0,
    })
    await notifyFlowsUpdated()
    return NextResponse.json(await getFlow(definition.id), { status: 201 })
  } catch (error) {
    console.error("Error creating flow:", error)
    return NextResponse.json({ error: "Error creating flow" }, { status: 500 })
  }
}
