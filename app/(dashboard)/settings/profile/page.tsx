"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  User, 
  Envelope, 
  ShieldCheck, 
  Key,
  Camera,
  CheckCircle,
} from "@phosphor-icons/react";
import { toast } from "sonner";

interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: "admin" | "cashier" | "bartender";
  employeeCode: string | null;
  active: boolean;
  createdAt: string;
}

export default function ProfilePage() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, []);

  async function fetchProfile() {
    try {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const data = await res.json();
        setUser(data);
        setName(data.name);
        setEmail(data.email);
      }
    } catch (error) {
      toast.error("Error cargando perfil");
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdateProfile() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email }),
      });
      
      if (res.ok) {
        toast.success("Perfil actualizado");
        setEditing(false);
        fetchProfile();
      } else {
        toast.error("Error al actualizar perfil");
      }
    } catch (error) {
      toast.error("Error al actualizar perfil");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleChangePassword() {
    if (newPassword !== confirmPassword) {
      toast.error("Las contraseñas no coinciden");
      return;
    }

    if (newPassword.length < 6) {
      toast.error("La contraseña debe tener al menos 6 caracteres");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      
      if (res.ok) {
        toast.success("Contraseña actualizada");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        const data = await res.json();
        toast.error(data.error || "Error al cambiar contraseña");
      }
    } catch (error) {
      toast.error("Error al cambiar contraseña");
    } finally {
      setSubmitting(false);
    }
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const roleLabels = {
    admin: "Administrador",
    cashier: "Cajero",
    bartender: "Bartender",
  };

  const roleColors = {
    admin: "bg-purple-500/10 text-purple-600 border-purple-500/20",
    cashier: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    bartender: "bg-green-500/10 text-green-600 border-green-500/20",
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-2">
          <div className="size-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground">Cargando perfil...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">No se pudo cargar el perfil</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Mi Perfil</h1>
        <p className="text-muted-foreground mt-1">
          Gestiona tu información personal y seguridad
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Profile Card */}
        <Card className="border-none shadow-sm lg:col-span-1">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center space-y-4">
              {/* Avatar */}
              <div className="relative">
                <Avatar className="size-32">
                  <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${user.name}`} />
                  <AvatarFallback className="bg-primary/10 text-primary font-bold text-3xl">
                    {getInitials(user.name)}
                  </AvatarFallback>
                </Avatar>
                <Button
                  size="sm"
                  variant="secondary"
                  className="absolute bottom-0 right-0 rounded-full size-10 p-0 shadow-md"
                  disabled
                >
                  <Camera className="size-4" />
                </Button>
              </div>

              {/* Name and Role */}
              <div className="space-y-2">
                <h2 className="text-2xl font-bold">{user.name}</h2>
                <Badge variant="outline" className={roleColors[user.role]}>
                  {roleLabels[user.role]}
                </Badge>
              </div>

              {/* Info */}
              <div className="w-full space-y-3 pt-4 border-t">
                <div className="flex items-center gap-3 text-sm">
                  <Envelope className="size-4 text-muted-foreground" />
                  <span className="text-muted-foreground truncate">{user.email}</span>
                </div>
                {user.employeeCode && (
                  <div className="flex items-center gap-3 text-sm">
                    <ShieldCheck className="size-4 text-muted-foreground" />
                    <code className="text-xs bg-muted px-2 py-1 rounded">
                      {user.employeeCode}
                    </code>
                  </div>
                )}
                <div className="flex items-center gap-3 text-sm">
                  <CheckCircle className="size-4 text-green-600" weight="fill" />
                  <span className="text-sm font-medium text-green-600">Cuenta Activa</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Right Column */}
        <div className="space-y-6 lg:col-span-2">
          {/* Personal Info Card */}
          <Card className="border-none shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <User className="size-5" weight="duotone" />
                    Información Personal
                  </CardTitle>
                  <CardDescription>
                    Actualiza tu nombre y correo electrónico
                  </CardDescription>
                </div>
                {!editing && (
                  <Button variant="outline" onClick={() => setEditing(true)}>
                    Editar
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nombre completo</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={!editing}
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Correo electrónico</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={!editing}
                  className="h-11"
                />
              </div>
              {editing && (
                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={handleUpdateProfile}
                    disabled={submitting}
                    className="gap-2"
                  >
                    <CheckCircle className="size-4" />
                    Guardar Cambios
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditing(false);
                      setName(user.name);
                      setEmail(user.email);
                    }}
                    disabled={submitting}
                  >
                    Cancelar
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Security Card */}
          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="size-5" weight="duotone" />
                Seguridad
              </CardTitle>
              <CardDescription>
                Cambia tu contraseña para mantener tu cuenta segura
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="current-password">Contraseña actual</Label>
                <Input
                  id="current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="h-11"
                />
              </div>
              <Separator />
              <div className="space-y-2">
                <Label htmlFor="new-password">Nueva contraseña</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirmar nueva contraseña</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="h-11"
                />
              </div>
              <Button
                onClick={handleChangePassword}
                disabled={submitting || !currentPassword || !newPassword || !confirmPassword}
                className="gap-2"
              >
                <Key className="size-4" />
                Cambiar Contraseña
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
