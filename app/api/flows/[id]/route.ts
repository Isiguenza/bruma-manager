import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { flowDefinitions } from "@/lib/db/schema"
import { notifyFlowsUpdated } from "@/lib/notify-flows-updated"
import { getFlow, scopeKinds } from "../_shared"

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const flow = await getFlow((await params).id)
    return flow ? NextResponse.json(flow) : NextResponse.json({ error: "Flow not found" }, { status: 404 })
  } catch (error) {
    console.error("Error fetching flow:", error)
    return NextResponse.json({ error: "Error fetching flow" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = (await params).id
    const body = await request.json()
    const update: Partial<typeof flowDefinitions.$inferInsert> = { updatedAt: new Date() }
    if (body.name !== undefined) {
      if (typeof body.name !== "string" || body.name.trim() === "") return NextResponse.json({ error: "name no puede estar vacío" }, { status: 400 })
      update.name = body.name.trim()
    }
    if (body.description !== undefined) {
      if (body.description !== null && typeof body.description !== "string") return NextResponse.json({ error: "description inválida" }, { status: 400 })
      update.description = body.description
    }
    if (body.scopeKind !== undefined) {
      if (!scopeKinds.includes(body.scopeKind)) return NextResponse.json({ error: "scopeKind inválido" }, { status: 400 })
      update.scopeKind = body.scopeKind
    }
    if (body.priority !== undefined) {
      if (typeof body.priority !== "number") return NextResponse.json({ error: "priority inválido" }, { status: 400 })
      update.priority = body.priority
    }
    if (body.active !== undefined) {
      if (typeof body.active !== "boolean") return NextResponse.json({ error: "active inválido" }, { status: 400 })
      update.active = body.active
    }
    const [updated] = await db.update(flowDefinitions).set(update).where(eq(flowDefinitions.id, id)).returning({ id: flowDefinitions.id })
    if (!updated) return NextResponse.json({ error: "Flow not found" }, { status: 404 })
    await notifyFlowsUpdated()
    return NextResponse.json(await getFlow(id))
  } catch (error) {
    console.error("Error updating flow:", error)
    return NextResponse.json({ error: "Error updating flow" }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = (await params).id
    const [deleted] = await db.delete(flowDefinitions).where(eq(flowDefinitions.id, id)).returning({ id: flowDefinitions.id })
    if (!deleted) return NextResponse.json({ error: "Flow not found" }, { status: 404 })
    await notifyFlowsUpdated()
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting flow:", error)
    return NextResponse.json({ error: "Error deleting flow" }, { status: 500 })
  }
}
