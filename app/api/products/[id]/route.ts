import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const product = await db.query.products.findFirst({
      where: eq(products.id, id),
      with: { category: true, ingredients: { with: { ingredient: true } } },
    });

    if (!product) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(product);
  } catch (error) {
    console.error("Error fetching product:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, description, price, platformPrice, categoryId, imageUrl, hasVariants, variants, active } = body;

    const [product] = await db
      .update(products)
      .set({
        name,
        description: description || null,
        price: price || "0",
        platformPrice: platformPrice || null,
        categoryId: categoryId || null,
        imageUrl: imageUrl || null,
        hasVariants: hasVariants ?? false,
        variants: variants || null,
        active,
        updatedAt: new Date(),
      })
      .where(eq(products.id, id))
      .returning();

    return NextResponse.json(product);
  } catch (error) {
    console.error("Error updating product:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // Verificar si el producto existe
    const [product] = await db.select().from(products).where(eq(products.id, id));
    
    if (!product) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }
    
    // SOFT DELETE: Marcar como eliminado en lugar de borrar
    // Esto mantiene el producto en las órdenes históricas
    await db
      .update(products)
      .set({
        deletedAt: new Date(),
        active: false, // También lo marcamos como inactivo
        updatedAt: new Date(),
      })
      .where(eq(products.id, id));
    
    return NextResponse.json({ 
      success: true,
      message: "Producto eliminado (soft delete)" 
    });
  } catch (error: any) {
    console.error("Error al eliminar producto:", error);
    return NextResponse.json({ 
      error: error.message || "Error al eliminar producto" 
    }, { status: 500 });
  }
}
