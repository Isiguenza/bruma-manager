import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { userProfiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, email, role, pin, password, employeeCode, active } = body;

    const updateData: any = {};

    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (role !== undefined) updateData.role = role;
    if (employeeCode !== undefined) updateData.employeeCode = employeeCode;
    if (active !== undefined) updateData.active = active;

    // Handle PIN update
    if (pin) {
      if (pin.length !== 4) {
        return NextResponse.json(
          { error: "PIN must be 4 digits" },
          { status: 400 }
        );
      }
      updateData.pinHash = await bcrypt.hash(pin, 10);
    }

    // Handle password update
    if (password) {
      updateData.passwordHash = await bcrypt.hash(password, 10);
    }

    updateData.updatedAt = new Date();

    const [updated] = await db
      .update(userProfiles)
      .set(updateData)
      .where(eq(userProfiles.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    // Don't return sensitive data
    const { pinHash: _, passwordHash: __, ...sanitized } = updated;

    return NextResponse.json(sanitized);
  } catch (error) {
    console.error("Error updating employee:", error);
    return NextResponse.json({ error: "Error updating employee" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Hard delete - permanently remove employee
    await db
      .delete(userProfiles)
      .where(eq(userProfiles.id, id));

    return NextResponse.json({ message: "Employee deleted permanently" });
  } catch (error) {
    console.error("Error deleting employee:", error);
    return NextResponse.json({ error: "Error deleting employee" }, { status: 500 });
  }
}
