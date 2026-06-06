import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { promotions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// GET /api/promotions/[id] - Get a single promotion
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const [promotion] = await db
      .select()
      .from(promotions)
      .where(eq(promotions.id, id));

    if (!promotion) {
      return NextResponse.json(
        { error: "Promoción no encontrada" },
        { status: 404 }
      );
    }

    return NextResponse.json(promotion);
  } catch (error) {
    console.error("Error fetching promotion:", error);
    return NextResponse.json(
      { error: "Error al obtener promoción" },
      { status: 500 }
    );
  }
}

// PATCH /api/promotions/[id] - Update a promotion
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const updateData: any = {
      updatedAt: new Date(),
    };

    // Only update fields that are provided
    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.type !== undefined) updateData.type = body.type;
    if (body.buyQuantity !== undefined) updateData.buyQuantity = body.buyQuantity;
    if (body.getQuantity !== undefined) updateData.getQuantity = body.getQuantity;
    if (body.discountPercentage !== undefined) 
      updateData.discountPercentage = body.discountPercentage ? body.discountPercentage.toString() : null;
    if (body.discountAmount !== undefined) 
      updateData.discountAmount = body.discountAmount ? body.discountAmount.toString() : null;
    if (body.applyTo !== undefined) updateData.applyTo = body.applyTo;
    if (body.productIds !== undefined) {
      // If productIds is already a string, use it directly; otherwise stringify
      if (typeof body.productIds === 'string') {
        updateData.productIds = body.productIds || null;
      } else {
        updateData.productIds = body.productIds ? JSON.stringify(body.productIds) : null;
      }
    }
    if (body.categoryId !== undefined) updateData.categoryId = body.categoryId || null;
    if (body.active !== undefined) updateData.active = body.active;
    if (body.startDate !== undefined) updateData.startDate = body.startDate;
    if (body.endDate !== undefined) updateData.endDate = body.endDate;
    if (body.daysOfWeek !== undefined) {
      // If daysOfWeek is already a string, use it directly; otherwise stringify
      if (typeof body.daysOfWeek === 'string') {
        updateData.daysOfWeek = body.daysOfWeek || null;
      } else {
        updateData.daysOfWeek = body.daysOfWeek ? JSON.stringify(body.daysOfWeek) : null;
      }
    }
    if (body.startTime !== undefined) updateData.startTime = body.startTime || null;
    if (body.endTime !== undefined) updateData.endTime = body.endTime || null;
    if (body.priority !== undefined) updateData.priority = body.priority;
    if (body.comboRules !== undefined) {
      if (typeof body.comboRules === 'string') {
        updateData.comboRules = body.comboRules || null;
      } else {
        updateData.comboRules = body.comboRules ? JSON.stringify(body.comboRules) : null;
      }
    }

    const [updatedPromotion] = await db
      .update(promotions)
      .set(updateData)
      .where(eq(promotions.id, id))
      .returning();

    if (!updatedPromotion) {
      return NextResponse.json(
        { error: "Promoción no encontrada" },
        { status: 404 }
      );
    }

    return NextResponse.json(updatedPromotion);
  } catch (error: any) {
    console.error("Error updating promotion:", error);
    console.error("Error details:", error.message, error.stack);
    return NextResponse.json(
      { error: "Error al actualizar promoción", details: error.message },
      { status: 500 }
    );
  }
}

// DELETE /api/promotions/[id] - Delete a promotion
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const [deletedPromotion] = await db
      .delete(promotions)
      .where(eq(promotions.id, id))
      .returning();

    if (!deletedPromotion) {
      return NextResponse.json(
        { error: "Promoción no encontrada" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting promotion:", error);
    return NextResponse.json(
      { error: "Error al eliminar promoción" },
      { status: 500 }
    );
  }
}
