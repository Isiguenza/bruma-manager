import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { flowDefinitions } from "@/lib/db/schema"
import { getTargets, replaceTargets, targetRows, validateTargets } from "../../_shared"

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = (await params).id
    const flow = await db.query.flowDefinitions.findFirst({ where: eq(flowDefinitions.id, id), columns: { id: true } })
    if (!flow) return NextResponse.json({ error: "Flow not found" }, { status: 404 })
    return NextResponse.json(await getTargets(id))
  } catch (error) {
    console.error("Error fetching flow targets:", error)
    return NextResponse.json({ error: "Error fetching flow targets" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = (await params).id
    const flow = await db.query.flowDefinitions.findFirst({ where: eq(flowDefinitions.id, id), columns: { id: true } })
    if (!flow) return NextResponse.json({ error: "Flow not found" }, { status: 404 })
    const targets = targetRows(await request.json())
    const problems = validateTargets(targets)
    if (problems.length > 0) return NextResponse.json({ error: "Targets inválidos", problems }, { status: 400 })
    return NextResponse.json(await replaceTargets(id, targets))
  } catch (error) {
    console.error("Error replacing flow targets:", error)
    return NextResponse.json({ error: "Error replacing flow targets" }, { status: 500 })
  }
}
