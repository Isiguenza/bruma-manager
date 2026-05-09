"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { 
  Plus, 
  Pencil, 
  Trash, 
  User,
  Users,
  CheckCircle,
  XCircle,
  ShieldCheck,
  UserCircle,
  DotsThree,
  Power,
} from "@phosphor-icons/react";
import { toast } from "sonner";

interface Employee {
  id: string;
  name: string;
  email: string;
  role: "admin" | "cashier" | "bartender" | "mesero" | "cajero" | "ayudante_general" | "cocinero";
  employeeCode: string | null;
  active: boolean;
  createdAt: string;
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  
  // Form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "cashier" | "bartender" | "mesero" | "cajero" | "ayudante_general" | "cocinero">("cajero");
  const [employeeCode, setEmployeeCode] = useState("");
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchEmployees();
  }, []);

  async function fetchEmployees() {
    try {
      const res = await fetch("/api/employees");
      if (res.ok) {
        setEmployees(await res.json());
      }
    } catch (error) {
      toast.error("Error cargando empleados");
    } finally {
      setLoading(false);
    }
  }

  function openCreateDialog() {
    setEditingEmployee(null);
    setName("");
    setEmail("");
    setRole("cashier");
    setEmployeeCode("");
    setPin("");
    setPinConfirm("");
    setPassword("");
    setPasswordConfirm("");
    setDialogOpen(true);
  }

  function openEditDialog(employee: Employee) {
    setEditingEmployee(employee);
    setName(employee.name);
    setEmail(employee.email);
    setRole(employee.role);
    setEmployeeCode(employee.employeeCode || "");
    setPin("");
    setPinConfirm("");
    setPassword("");
    setPasswordConfirm("");
    setDialogOpen(true);
  }

  async function handleSubmit() {
    if (!name || !email || !role) {
      toast.error("Nombre, email y rol son requeridos");
      return;
    }

    if (pin && pin.length !== 4) {
      toast.error("El PIN debe tener 4 dígitos");
      return;
    }

    if (pin && pin !== pinConfirm) {
      toast.error("Los PINs no coinciden");
      return;
    }

    if (!editingEmployee && !pin) {
      toast.error("El PIN es requerido para nuevos empleados");
      return;
    }

    // Validar contraseña
    if (password && password.length < 6) {
      toast.error("La contraseña debe tener al menos 6 caracteres");
      return;
    }

    if (password && password !== passwordConfirm) {
      toast.error("Las contraseñas no coinciden");
      return;
    }

    setSubmitting(true);

    try {
      const url = editingEmployee
        ? `/api/employees/${editingEmployee.id}`
        : "/api/employees";
      
      const method = editingEmployee ? "PATCH" : "POST";

      const body: any = { name, email, role, employeeCode: employeeCode || null };
      if (pin) body.pin = pin;
      if (password) body.password = password;

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Error");
      }

      toast.success(
        editingEmployee ? "Empleado actualizado" : "Empleado creado"
      );
      setDialogOpen(false);
      fetchEmployees();
    } catch (error: any) {
      toast.error(error.message || "Error al guardar empleado");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(employee: Employee) {
    try {
      const res = await fetch(`/api/employees/${employee.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !employee.active }),
      });
      if (!res.ok) throw new Error();
      toast.success(employee.active ? "Empleado desactivado" : "Empleado activado");
      fetchEmployees();
    } catch (error) {
      toast.error("Error al cambiar estado");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("¿Estás seguro de eliminar permanentemente este empleado?")) return;

    try {
      const res = await fetch(`/api/employees/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Empleado eliminado");
      fetchEmployees();
    } catch (error) {
      toast.error("Error al eliminar empleado");
    }
  }

  const roleColors: Record<string, string> = {
    admin: "bg-purple-500/10 text-purple-600 border-purple-500/20",
    cashier: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    bartender: "bg-green-500/10 text-green-600 border-green-500/20",
    cajero: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    mesero: "bg-orange-500/10 text-orange-600 border-orange-500/20",
    ayudante_general: "bg-gray-500/10 text-gray-600 border-gray-500/20",
    cocinero: "bg-red-500/10 text-red-600 border-red-500/20",
  };

  const roleLabels: Record<string, string> = {
    admin: "Administrador",
    cashier: "Cajero (legacy)",
    bartender: "Bartender",
    cajero: "Cajero",
    mesero: "Mesero",
    ayudante_general: "Ayudante General",
    cocinero: "Cocinero",
  };

  const activeEmployees = employees.filter(e => e.active).length;
  const inactiveEmployees = employees.filter(e => !e.active).length;
  const adminCount = employees.filter(e => e.role === 'admin').length;

  // Función para generar iniciales
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Colores para avatares
  const avatarColors = [
    'bg-blue-500',
    'bg-green-500',
    'bg-purple-500',
    'bg-orange-500',
    'bg-pink-500',
    'bg-cyan-500',
  ];

  const getAvatarColor = (id: string) => {
    const index = id.charCodeAt(0) % avatarColors.length;
    return avatarColors[index];
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-2">
          <div className="size-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground">Cargando empleados...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Empleados</h1>
          <p className="text-muted-foreground mt-1">
            Gestiona tu equipo y sus accesos
          </p>
        </div>
        <Button onClick={openCreateDialog} className="gap-2">
          <Plus className="size-4" />
          Nuevo Empleado
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-blue-500/10 p-3">
                <Users className="size-5 text-blue-600" weight="duotone" />
              </div>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Empleados
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{employees.length}</div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-green-500/10 p-3">
                <CheckCircle className="size-5 text-green-600" weight="duotone" />
              </div>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Activos
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeEmployees}</div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-orange-500/10 p-3">
                <XCircle className="size-5 text-orange-600" weight="duotone" />
              </div>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Inactivos
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{inactiveEmployees}</div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-purple-500/10 p-3">
                <ShieldCheck className="size-5 text-purple-600" weight="duotone" />
              </div>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Administradores
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{adminCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Divider */}
      <div className="border-t" />

      {/* Employees Grid */}
      {employees.length === 0 ? (
        <Card className="border-none shadow-sm">
          <CardContent className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <Users className="size-16 mb-4 opacity-20" weight="duotone" />
            <p className="text-lg font-medium">No hay empleados registrados</p>
            <p className="text-sm">Crea tu primer empleado para comenzar</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {employees.map((employee) => (
            <Card 
              key={employee.id} 
              className="group border-none shadow-sm hover:shadow-md transition-all"
            >
              <CardContent className="p-6">
                <div className="space-y-4">
                  {/* Avatar and Name */}
                  <div className="flex items-start gap-4">
                    <div className={`size-14 rounded-full ${getAvatarColor(employee.id)} flex items-center justify-center text-white font-bold text-lg shadow-md`}>
                      {getInitials(employee.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-lg truncate">{employee.name}</h3>
                      <p className="text-sm text-muted-foreground truncate">{employee.email}</p>
                      {employee.employeeCode && (
                        <code className="text-xs bg-muted px-2 py-0.5 rounded mt-1 inline-block">
                          {employee.employeeCode}
                        </code>
                      )}
                    </div>
                  </div>

                  {/* Role and Status */}
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={roleColors[employee.role]}>
                      {roleLabels[employee.role]}
                    </Badge>
                    <Badge variant={employee.active ? "default" : "secondary"}>
                      {employee.active ? "Activo" : "Inactivo"}
                    </Badge>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-2 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEditDialog(employee)}
                      className="flex-1 gap-2"
                    >
                      <Pencil className="size-4" />
                      Editar
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2"
                        >
                          <DotsThree className="size-5" weight="bold" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => toggleActive(employee)}>
                          <Power className="size-4 mr-2" />
                          {employee.active ? "Desactivar" : "Activar"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          onClick={() => handleDelete(employee.id)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash className="size-4 mr-2" />
                          Eliminar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Keep old table hidden for reference */}
      <Card className="hidden">
        <CardHeader>
          <CardTitle>Lista de Empleados</CardTitle>
          <CardDescription>
            {employees.length} empleado{employees.length !== 1 ? "s" : ""} registrado
            {employees.length !== 1 ? "s" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((employee) => (
                <TableRow key={employee.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <User className="size-4 text-muted-foreground" />
                      {employee.name}
                    </div>
                  </TableCell>
                  <TableCell>{employee.email}</TableCell>
                  <TableCell>
                    {employee.employeeCode ? (
                      <code className="text-xs bg-muted px-2 py-1 rounded">
                        {employee.employeeCode}
                      </code>
                    ) : (
                      <span className="text-muted-foreground text-sm">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={roleColors[employee.role]}>
                      {roleLabels[employee.role]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={employee.active ? "default" : "secondary"}
                    >
                      {employee.active ? "Activo" : "Inactivo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(employee)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      {employee.active && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(employee.id)}
                        >
                          <Trash className="size-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {employees.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No hay empleados registrados
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingEmployee ? "Editar Empleado" : "Nuevo Empleado"}
            </DialogTitle>
            <DialogDescription>
              {editingEmployee
                ? "Actualiza la información del empleado. El PIN solo se actualiza si lo cambias."
                : "Crea un nuevo empleado con su PIN de acceso."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Nombre *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Juan Pérez"
              />
            </div>

            <div>
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="juan@ejemplo.com"
              />
            </div>

            <div>
              <Label htmlFor="employeeCode">Código de Empleado</Label>
              <Input
                id="employeeCode"
                value={employeeCode}
                onChange={(e) => setEmployeeCode(e.target.value)}
                placeholder="EMP001"
              />
            </div>

            <div>
              <Label htmlFor="role">Rol *</Label>
              <Select value={role} onValueChange={(v: any) => setRole(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrador</SelectItem>
                  <SelectItem value="cajero">Cajero</SelectItem>
                  <SelectItem value="mesero">Mesero</SelectItem>
                  <SelectItem value="ayudante_general">Ayudante General</SelectItem>
                  <SelectItem value="cocinero">Cocinero</SelectItem>
                  <SelectItem value="bartender">Bartender</SelectItem>
                  <SelectItem value="cashier">Cashier (legacy)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="border-t pt-4">
              <Label htmlFor="pin">
                PIN (4 dígitos) {editingEmployee ? "" : "*"}
              </Label>
              <Input
                id="pin"
                type="password"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                placeholder="1234"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {editingEmployee
                  ? "Deja en blanco para mantener el PIN actual"
                  : "El empleado usará este PIN para identificarse"}
              </p>
            </div>

            {pin && (
              <div>
                <Label htmlFor="pinConfirm">Confirmar PIN *</Label>
                <Input
                  id="pinConfirm"
                  type="password"
                  maxLength={4}
                  value={pinConfirm}
                  onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, ""))}
                  placeholder="1234"
                />
              </div>
            )}

            <div className="border-t pt-4">
              <Label htmlFor="password">
                Contraseña para Dashboard {editingEmployee ? "(opcional)" : ""}
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {editingEmployee
                  ? "Deja en blanco para mantener la contraseña actual"
                  : "Para acceder al dashboard"}
              </p>
            </div>

            {password && (
              <div>
                <Label htmlFor="passwordConfirm">Confirmar Contraseña *</Label>
                <Input
                  id="passwordConfirm"
                  type="password"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  placeholder="Confirma la contraseña"
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
