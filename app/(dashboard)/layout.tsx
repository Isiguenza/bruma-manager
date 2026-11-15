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
      {/* `min-w-0`: sin él, el inset (hijo flex) crece al ancho de su contenido
          y una tabla ancha empujaba toda la página fuera de la pantalla y,
          al hacer scroll horizontal, se metía debajo de la sidebar fija. Las
          tablas anchas hacen scroll DENTRO de su propia caja (`overflow-x-auto`). */}
      <SidebarInset className="min-w-0">
        <AppHeader />
        <main className="min-w-0 flex-1 overflow-auto p-4 lg:p-6">
          <div className={cn("mx-auto w-full", !fullWidth && "max-w-7xl")}>{children}</div>
        </main>
      </SidebarInset>
      <Toaster richColors position="top-right" />
    </SidebarProvider>
  );
}
