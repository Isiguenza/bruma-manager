import { Router } from "express";
import { db, schema } from "../db";
import { eq } from "drizzle-orm";

const router = Router();

// POST /api/employees/verify-pin
router.post("/employees/verify-pin", async (req, res) => {
  try {
    const { pin } = req.body;

    if (!pin || pin.length !== 4) {
      return res.status(400).json({ error: "PIN debe tener 4 dígitos" });
    }

    const employee = await db.query.userProfiles.findFirst({
      where: eq(schema.userProfiles.pinHash, pin),
    });

    if (!employee || !employee.active) {
      return res.status(401).json({ error: "PIN inválido o empleado inactivo" });
    }

    res.json({ employee });
  } catch (error) {
    console.error("Error verifying PIN:", error);
    res.status(500).json({ error: "Error al verificar PIN" });
  }
});

export default router;
