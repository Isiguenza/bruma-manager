import { NextRequest, NextResponse } from "next/server"

import { replaceGraph } from "../../_shared"

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const result = await replaceGraph((await params).id, await request.json())
    if ("problems" in result) return NextResponse.json({ problems: result.problems }, { status: 400 })
    return NextResponse.json(result.flow)
  } catch (error) {
    if (error instanceof Error && error.message === "FLOW_NOT_FOUND") {
      return NextResponse.json({ error: "Flow not found" }, { status: 404 })
    }
    console.error("Error replacing flow graph:", error)
    return NextResponse.json({ error: "Error replacing flow graph" }, { status: 500 })
  }
}
