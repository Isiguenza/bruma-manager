import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { productFlows, products, modifierSteps, modifierOptions } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";

// GET /api/products/[id]/flow - Get product flow (or inherit from category)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    console.log("🔍 GET /api/products/[id]/flow - Product ID:", id);

    // Get product to know its category
    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.id, id))
      .limit(1);

    if (!product) {
      console.log("❌ Product not found with ID:", id);
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    
    console.log("✅ Product found:", product.name, "Category:", product.categoryId);

    // Check if product has a custom flow
    const [productFlow] = await db
      .select()
      .from(productFlows)
      .where(eq(productFlows.productId, id))
      .limit(1);

    console.log("🔍 Product flow lookup:", {
      productId: id,
      found: !!productFlow,
      useDefaultFlow: productFlow?.useDefaultFlow,
    });

    // If product has custom flow and not using default, return it
    if (productFlow && !productFlow.useDefaultFlow) {
      const rawSteps = JSON.parse(productFlow.steps || "[]");
      console.log(`📋 Raw steps from DB:`, JSON.stringify(rawSteps, null, 2));
      
      // Normalize steps to include all required fields for Swift
      const steps = await Promise.all(rawSteps.map(async (step: any, index: number) => {
        let options = step.options || [];
        
        console.log(`🔍 Processing step ${index}:`, {
          stepName: step.stepName,
          stepType: step.stepType,
          stepCategoryId: step.categoryId,
          optionsCount: options.length,
          firstOption: options[0],
        });
        
        // Store the selected category ID for category-type steps
        let stepCategoryId = product.categoryId || null;
        
        // If step type is "category", fetch products from that category
        if (step.stepType === "category") {
          // Try to get categoryId from options first, then fallback to step.categoryId
          const categoryId = (options.length > 0 ? options[0].id : step.categoryId) || null;
          
          if (categoryId) {
            stepCategoryId = categoryId; // Use the selected category ID for this step
            
            const categoryName = options.length > 0 ? options[0].name : step.stepName;
            console.log(`📂 Fetching products for category: ${categoryId} (${categoryName})`);
            
            const categoryProducts = await db.query.products.findMany({
              where: eq(products.categoryId, categoryId),
              orderBy: [asc(products.name)],
            });
            
            // Filter only active products
            const activeProducts = categoryProducts.filter(p => p.active);
            
            console.log(`✅ Found ${categoryProducts.length} products (${activeProducts.length} active) in category ${categoryName}:`, 
              activeProducts.map(p => p.name).join(", "));
            
            // Convert products to options format
            options = activeProducts.map((prod, idx) => ({
              id: prod.id,
              stepId: step.id,
              name: prod.name,
              description: null,
              price: "0", // Don't add extra price for category products
              sortOrder: idx,
              active: true,
            }));
          } else {
            console.warn(`⚠️ Category step "${step.stepName}" has no categoryId - cannot expand products`);
          }
        } else {
          // For other types, just clean up the options
          options = options.map((opt: any) => ({
            id: opt.id,
            stepId: opt.stepId,
            name: opt.name,
            description: opt.description,
            price: opt.price,
            sortOrder: opt.sortOrder,
            active: opt.active,
          }));
        }
        
        return {
          id: step.id,
          categoryId: stepCategoryId,
          stepType: step.stepType,
          stepName: step.stepName,
          sortOrder: step.sortOrder ?? index,
          isRequired: step.isRequired ?? true,
          allowMultiple: step.allowMultiple ?? (step.stepType === "extra"),
          includeNoneOption: step.includeNoneOption ?? true,
          active: step.active ?? true,
          options,
        };
      }));
      
      console.log("✅ Returning product-specific flow:", {
        productId: id,
        stepsCount: steps.length,
        steps: steps.map(s => ({
          name: s.stepName,
          type: s.stepType,
          optionsCount: s.options.length,
          firstOptions: s.options.slice(0, 3).map((o: any) => o.name),
        })),
      });
      const response = {
        productId: id,
        useDefaultFlow: false,
        steps,
        nodes: productFlow.nodes ? JSON.parse(productFlow.nodes) : null,
        source: "product",
      };
      console.log("📤 Full response:", JSON.stringify(response, null, 2));
      return NextResponse.json(response);
    }

    // Otherwise, inherit from category flow
    if (product.categoryId) {
      const steps = await db.query.modifierSteps.findMany({
        where: eq(modifierSteps.categoryId, product.categoryId),
        orderBy: [asc(modifierSteps.sortOrder)],
        with: {
          options: {
            orderBy: [asc(modifierOptions.sortOrder)],
          },
        },
      });

      if (steps.length > 0) {
        return NextResponse.json({
          productId: id,
          useDefaultFlow: false,
          steps: steps.map((s, index) => ({
            id: s.id,
            categoryId: product.categoryId,
            stepName: s.stepName,
            stepType: s.stepType,
            sortOrder: s.sortOrder ?? index + 1,
            isRequired: s.isRequired ?? false,
            allowMultiple: s.allowMultiple ?? (s.stepType === "extra"),
            includeNoneOption: s.includeNoneOption ?? true,
            active: s.active ?? true,
            options: (s.options || []).map((o: any) => ({
              id: o.id,
              stepId: o.stepId ?? s.id,
              name: o.name,
              description: o.description ?? null,
              price: o.price ?? "0",
              sortOrder: o.sortOrder ?? 0,
              active: o.active ?? true,
            })),
          })),
          source: "category",
        });
      }
    }

    // No flow found, return default empty flow
    return NextResponse.json({
      productId: id,
      useDefaultFlow: true,
      steps: [],
      source: "default",
    });
  } catch (error) {
    console.error("Error fetching product flow:", error);
    return NextResponse.json(
      { error: "Error fetching product flow" },
      { status: 500 }
    );
  }
}

// POST /api/products/[id]/flow - Save product flow
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { useDefaultFlow, steps, nodes } = body;
    
    console.log("💾 Saving product flow:", {
      productId: id,
      useDefaultFlow,
      stepsCount: steps?.length || 0,
      hasNodes: !!nodes,
    });

    // Check if product flow exists
    const [existing] = await db
      .select()
      .from(productFlows)
      .where(eq(productFlows.productId, id))
      .limit(1);

    const flowData = {
      productId: id,
      useDefaultFlow: useDefaultFlow ?? true,
      steps: JSON.stringify(steps || []),
      nodes: nodes ? JSON.stringify(nodes) : null,
      updatedAt: new Date(),
    };

    if (existing) {
      // Update existing
      await db
        .update(productFlows)
        .set(flowData)
        .where(eq(productFlows.id, existing.id));
    } else {
      // Create new
      await db.insert(productFlows).values(flowData);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error saving product flow:", error);
    return NextResponse.json(
      { error: "Error saving product flow" },
      { status: 500 }
    );
  }
}
