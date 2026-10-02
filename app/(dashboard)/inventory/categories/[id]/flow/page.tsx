"use client"
import { use } from "react"
import { FlowEntryRedirect } from "@/components/flow-editor/FlowEntryRedirect"
export default function CategoryFlowPage({ params }: { params: Promise<{ id: string }> }) { const { id } = use(params); return <FlowEntryRedirect scopeKind="category" targetId={id} targetField="categoryId" /> }
