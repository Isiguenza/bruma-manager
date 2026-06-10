import { Router } from "express";
import { db, schema } from "../db";
import { eq } from "drizzle-orm";

const router = Router();

// POST /api/employees/verify-pin
router.post("/employees/verify-pin", async (req, res) => {
  try {
    const { pin } = req.body;
    console.log("🔐 [verify-pin] Received PIN:", pin, "| Length:", pin?.length);

    if (!pin || pin.length !== 4) {
      console.log("❌ [verify-pin] Invalid PIN length:", pin?.length);
      return res.status(400).json({ error: "PIN debe tener 4 dígitos" });
    }

    console.log("🔍 [verify-pin] Searching userProfiles for pinHash:", pin);
    const employee = await db.query.userProfiles.findFirst({
      where: eq(schema.userProfiles.pinHash, pin),
    });

    console.log("🔍 [verify-pin] Result:", employee ? `Found: ${employee.name} (active=${employee.active})` : "Not found");

    if (!employee || !employee.active) {
      console.log("❌ [verify-pin] Employee not found or inactive");
      return res.status(401).json({ error: "PIN inválido o empleado inactivo" });
    }

    console.log("✅ [verify-pin] Success:", employee.name);
    res.json({ employee });
  } catch (error) {
    console.error("💥 [verify-pin] Error:", error);
    res.status(500).json({ error: "Error al verificar PIN" });
  }
});

export default router;
