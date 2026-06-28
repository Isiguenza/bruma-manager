import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { products, categories } from "@/lib/db/schema";
import { eq, isNull, and } from "drizzle-orm";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(_request: NextRequest) {
  try {
    const cats = await db.query.categories.findMany({
      where: eq(categories.active, true),
      orderBy: (c, { asc }) => [asc(c.sortOrder)],
    });

    const prods = await db.query.products.findMany({
      where: and(
        eq(products.active, true),
        eq(products.menuWebVisible, true),
        isNull(products.deletedAt)
      ),
      columns: {
        id: true,
        name: true,
        description: true,
        price: true,
        categoryId: true,
        menuImages: true,
        menuVideo: true,
        hasVariants: true,
        variants: true,
      },
    });

    // Build sections: one per category that has visible products
    const sections = cats
      .map((cat) => {
        const items = prods
          .filter((p) => p.categoryId === cat.id)
          .map((p) => {
            const images: string[] = p.menuImages ? JSON.parse(p.menuImages) : [];
            const basePrice = p.hasVariants && p.variants
              ? (() => {
                  const vars = JSON.parse(p.variants);
                  return vars.length > 0 ? `$${parseFloat(vars[0].price).toFixed(0)}` : "";
                })()
              : `$${parseFloat(p.price).toFixed(0)}`;

            return {
              name: p.name,
              description: p.description || "",
              price: basePrice,
              images,
              video: p.menuVideo || "",
            };
          });

        return {
          id: cat.id,
          title: cat.name,
          eyebrow: cat.name,
          items,
        };
      })
      .filter((s) => s.items.length > 0);

    return NextResponse.json({ sections }, { headers: CORS });
  } catch (error: any) {
    console.error("Error fetching public menu:", error);
    return NextResponse.json({ error: "Error al obtener menú" }, { status: 500, headers: CORS });
  }
}
