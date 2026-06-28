import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { products, categories } from "@/lib/db/schema";
import { eq, desc, isNull, and } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get("active") === "true";

    const includeImages = searchParams.get("images") === "true";

    // Construir condiciones: siempre excluir productos eliminados (deletedAt IS NULL)
    const conditions = [isNull(products.deletedAt)];
    if (activeOnly) {
      conditions.push(eq(products.active, true));
    }

    const result = await db.query.products.findMany({
      where: and(...conditions),
      columns: {
        id: true,
        name: true,
        description: true,
        price: true,
        platformPrice: true,
        categoryId: true,
        groupId: true,
        imageUrl: includeImages,
        hasVariants: true,
        variants: true,
        active: true,
        menuImages: true,
        menuVideo: true,
        menuWebVisible: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true,
      },
      with: { category: true },
      orderBy: [desc(products.createdAt)],
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching products:", error);
    return NextResponse.json(
      { error: "Error fetching products" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, price, platformPrice, categoryId, imageUrl, hasVariants, variants, active } = body;

    if (!name) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }

    // Validar que tenga precio o variantes
    if (!hasVariants && !price) {
      return NextResponse.json(
        { error: "Price is required when product has no variants" },
        { status: 400 }
      );
    }

    const [product] = await db
      .insert(products)
      .values({
        name,
        description: description || null,
        price: price || "0",
        platformPrice: platformPrice || null,
        categoryId: categoryId || null,
        imageUrl: imageUrl || null,
        hasVariants: hasVariants || false,
        variants: variants || null,
        active: active ?? true,
      })
      .returning();

    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    console.error("Error creating product:", error);
    return NextResponse.json(
      { error: "Error creating product" },
      { status: 500 }
    );
  }
}
