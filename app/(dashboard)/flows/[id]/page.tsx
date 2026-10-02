"use client"
import { use } from "react"
import { useRouter } from "next/navigation"
import { FlowEditor } from "@/components/flow-editor/FlowEditor"
export default function FlowPage({ params }: { params: Promise<{ id: string }> }) { const { id } = use(params); const router = useRouter(); return <FlowEditor flowId={id} onBack={() => router.push("/flows")} /> }
