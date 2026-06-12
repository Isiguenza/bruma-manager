import { Router } from "express";
import { db, schema } from "../db";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";

const router = Router();

// GET /api/employees/debug - Temporary debug endpoint
router.get("/employees/debug", async (req, res) => {
  try {
    const allEmployees = await db.query.userProfiles.findMany();
    console.log("👥 [debug] Total employees:", allEmployees.length);
    for (const emp of allEmployees) {
      console.log(`  - ${emp.name}: pinHash=${emp.pinHash}, active=${emp.active}, id=${emp.id}`);
    }
    res.json(allEmployees.map(e => ({ id: e.id, name: e.name, pinHash: e.pinHash, active: e.active })));
  } catch (error) {
    console.error("💥 [debug] Error:", error);
    res.status(500).json({ error: "Error" });
  }
});

// POST /api/employees/verify-pin
router.post("/employees/verify-pin", async (req, res) => {
  try {
    const { pin } = req.body;
    console.log("🔐 [verify-pin] Received PIN:", pin, "| Length:", pin?.length);

    if (!pin || pin.length !== 4) {
      console.log("❌ [verify-pin] Invalid PIN length:", pin?.length);
      return res.status(400).json({ error: "PIN debe tener 4 dígitos" });
    }

    // Get all active employees
    const allEmployees = await db.query.userProfiles.findMany({
      where: eq(schema.userProfiles.active, true),
    });

    console.log("🔍 [verify-pin] Checking PIN against", allEmployees.length, "active employees");

    // Check PIN against each employee's hashed PIN
    let matchedEmployee = null;
    for (const emp of allEmployees) {
      if (emp.pinHash) {
        const isMatch = await bcrypt.compare(pin, emp.pinHash);
        if (isMatch) {
          matchedEmployee = emp;
          console.log("✅ [verify-pin] PIN matched:", emp.name);
          break;
        }
      }
    }

    if (!matchedEmployee) {
      console.log("❌ [verify-pin] No employee found with matching PIN");
      return res.status(401).json({ error: "PIN inválido o empleado inactivo" });
    }

    console.log("✅ [verify-pin] Success:", matchedEmployee.name);
    res.json({ employee: matchedEmployee });
  } catch (error) {
    console.error("💥 [verify-pin] Error:", error);
    res.status(500).json({ error: "Error al verificar PIN" });
  }
});

export default router;
