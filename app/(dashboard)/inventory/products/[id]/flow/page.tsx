"use client"
import { use } from "react"
import { FlowEntryRedirect } from "@/components/flow-editor/FlowEntryRedirect"
export default function ProductFlowPage({ params }: { params: Promise<{ id: string }> }) { const { id } = use(params); return <FlowEntryRedirect scopeKind="product" targetId={id} targetField="productId" /> }
