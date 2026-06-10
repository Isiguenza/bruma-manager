import { Router } from "express";
import { db, schema } from "../db";
import { eq } from "drizzle-orm";

const router = Router();

// GET /api/employees
router.get("/employees", async (req, res) => {
  try {
    const { active } = req.query;

    let whereConditions: any[] = [];

    if (active === "true") {
      whereConditions.push(eq(schema.employees.active, true));
    }

    const employeesList = await db.query.userProfiles.findMany({
      where: whereConditions.length > 0 ? whereConditions[0] : undefined,
    });

    res.json(employeesList);
  } catch (error) {
    console.error("Error fetching employees:", error);
    res.status(500).json({ error: "Error al obtener empleados" });
  }
});

// GET /api/employees/:id
router.get("/employees/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const employee = await db.query.userProfiles.findFirst({
      where: eq(schema.userProfiles.id, id),
    });

    if (!employee) {
      return res.status(404).json({ error: "Empleado no encontrado" });
    }

    res.json(employee);
  } catch (error) {
    console.error("Error fetching employee:", error);
    res.status(500).json({ error: "Error al obtener empleado" });
  }
});

// POST /api/employees
router.post("/employees", async (req, res) => {
  try {
    const { name, pin, role, active } = req.body;

    if (!name || !pin || !role) {
      return res.status(400).json({ error: "name, pin y role son requeridos" });
    }

    const [newEmployee] = await db
      .insert(schema.userProfiles)
      .values({
        name,
        pinHash: pin,
        role,
        active: active !== undefined ? active : true,
        authUserId: `employee_${Date.now()}`,
        email: `employee_${Date.now()}@bruma.local`,
      })
      .returning();

    res.json(newEmployee);
  } catch (error) {
    console.error("Error creating employee:", error);
    res.status(500).json({ error: "Error al crear empleado" });
  }
});

// PATCH /api/employees/:id
router.patch("/employees/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const { pin, ...otherUpdates } = updates;
    const updateData: any = { ...otherUpdates };
    if (pin !== undefined) updateData.pinHash = pin;

    const [updatedEmployee] = await db
      .update(schema.userProfiles)
      .set(updateData)
      .where(eq(schema.userProfiles.id, id))
      .returning();

    if (!updatedEmployee) {
      return res.status(404).json({ error: "Empleado no encontrado" });
    }

    res.json(updatedEmployee);
  } catch (error) {
    console.error("Error updating employee:", error);
    res.status(500).json({ error: "Error al actualizar empleado" });
  }
});

// DELETE /api/employees/:id
router.delete("/employees/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const [deletedEmployee] = await db
      .delete(schema.userProfiles)
      .where(eq(schema.userProfiles.id, id))
      .returning();

    if (!deletedEmployee) {
      return res.status(404).json({ error: "Empleado no encontrado" });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting employee:", error);
    res.status(500).json({ error: "Error al eliminar empleado" });
  }
});

export default router;
