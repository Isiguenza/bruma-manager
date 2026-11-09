"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "@/components/theme-provider";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  GearSix,
  SignOut,
  Sun,
  Moon,
  CaretUpDown,
  CaretRight,
} from "@phosphor-icons/react";
import { BrumaLogo } from "@/components/bruma-logo";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { navSections, isNavActive, type NavItem } from "@/lib/nav";

const noopSubscribe = () => () => {};

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  // Solo en el cliente (el tema real no se conoce en el servidor).
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setUser(data))
      .catch(() => setUser(null));
  }, []);

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      toast.success("Sesión cerrada");
      router.push("/login");
      router.refresh();
    } catch {
      toast.error("Error al cerrar sesión");
    }
  }

  // Solo iniciales: antes se pedía un avatar a un servicio externo con el
  // nombre del usuario en la URL.
  const initials = (user?.name ?? "")
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "·";

  const renderItem = (item: NavItem) => (
    <SidebarMenuItem key={item.url}>
      <SidebarMenuButton asChild isActive={isNavActive(item.url, pathname)} tooltip={item.title}>
        <Link href={item.url}>
          <item.icon weight={isNavActive(item.url, pathname) ? "fill" : "regular"} />
          <span>{item.title}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-3 py-4">
        <Link href="/dashboard" aria-label="Inicio" className="flex h-9 items-center overflow-hidden px-1 text-sidebar-foreground group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          {/* Expandida: logo horizontal. Colapsada a íconos: solo el pez. */}
          <BrumaLogo variant="horizontal" className="h-9 group-data-[collapsible=icon]:hidden" />
          <BrumaLogo variant="isotipo" className="hidden h-6 group-data-[collapsible=icon]:block" />
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {navSections.map((section) => {
          const containsActive = section.items.some((i) => isNavActive(i.url, pathname));

          if (!section.collapsible) {
            return (
              <SidebarGroup key={section.title}>
                <SidebarGroupLabel>{section.title}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>{section.items.map(renderItem)}</SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            );
          }

          return (
            <Collapsible key={section.title} defaultOpen={containsActive} className="group/collapsible">
              <SidebarGroup>
                <SidebarGroupLabel asChild>
                  <CollapsibleTrigger className="w-full cursor-pointer hover:text-sidebar-foreground">
                    {section.title}
                    <CaretRight className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-90" />
                  </CollapsibleTrigger>
                </SidebarGroupLabel>
                <CollapsibleContent>
                  <SidebarGroupContent>
                    <SidebarMenu>{section.items.map(renderItem)}</SidebarMenu>
                  </SidebarGroupContent>
                </CollapsibleContent>
              </SidebarGroup>
            </Collapsible>
          );
        })}
      </SidebarContent>

      <SidebarFooter className="border-t p-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
              <Avatar className="size-8 rounded-lg">
                <AvatarFallback className="rounded-lg bg-primary/10 text-xs font-semibold text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate text-sm font-medium">{user?.name ?? "Mi cuenta"}</span>
                {user?.email && <span className="truncate text-xs text-muted-foreground">{user.email}</span>}
              </div>
              <CaretUpDown className="ml-auto size-4 text-muted-foreground" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="w-56">
            <DropdownMenuLabel>Mi cuenta</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings/profile" className="cursor-pointer">
                <GearSix className="mr-2 size-4" />
                <span>Mi perfil</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Tema</DropdownMenuLabel>
            {mounted && (
              <>
                <DropdownMenuItem onClick={() => setTheme("light")} className="cursor-pointer">
                  <Sun className="mr-2 size-4" />
                  <span>Claro</span>
                  {theme === "light" && <span className="ml-auto text-primary">✓</span>}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme("dark")} className="cursor-pointer">
                  <Moon className="mr-2 size-4" />
                  <span>Oscuro</span>
                  {theme === "dark" && <span className="ml-auto text-primary">✓</span>}
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-destructive focus:text-destructive">
              <SignOut className="mr-2 size-4" />
              <span>Cerrar sesión</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
