"use client";

import { usePathname } from "next/navigation";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AppHeader } from "@/components/app-header";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // Los editores de flujos usan todo el ancho; el resto del dashboard se
  // centra con un ancho máximo para no estirarse en pantallas grandes.
  const fullWidth = pathname.startsWith("/flows") || pathname.endsWith("/flow");

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <AppHeader />
        <main className="flex-1 overflow-auto p-4 lg:p-6">
          <div className={cn("mx-auto w-full", !fullWidth && "max-w-7xl")}>{children}</div>
        </main>
      </SidebarInset>
      <Toaster richColors position="top-right" />
    </SidebarProvider>
  );
}
