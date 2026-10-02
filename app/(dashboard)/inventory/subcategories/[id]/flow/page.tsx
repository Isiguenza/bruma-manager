"use client"
import { use } from "react"
import { FlowEntryRedirect } from "@/components/flow-editor/FlowEntryRedirect"
export default function SubcategoryFlowPage({ params }: { params: Promise<{ id: string }> }) { const { id } = use(params); return <FlowEntryRedirect scopeKind="subcategory" targetId={id} targetField="subcategoryId" /> }
