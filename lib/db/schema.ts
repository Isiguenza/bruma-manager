import {
  pgTable,
  uuid,
  text,
  varchar,
  decimal,
  integer,
  boolean,
  timestamp,
  pgEnum,
  date,
  time,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Enums
export const userRoleEnum = pgEnum("user_role", [
  "admin",
  "cashier",
  "bartender",
  "mesero",
  "cajero",
  "ayudante_general",
  "cocinero",
]);
export const orderStatusEnum = pgEnum("order_status", [
  "pending",
  "preparing",
  "ready",
  "delivered",
  "completed",
  "cancelled",
]);
export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "paid",
  "failed",
  "refunded",
]);
export const paymentMethodEnum = pgEnum("payment_method", [
  "cash",
  "terminal_mercadopago",
  "card",
  "transfer",
  "split",
  "platform_delivery",
]);
export const cashRegisterStatusEnum = pgEnum("cash_register_status", [
  "open",
  "closed",
]);
export const transactionTypeEnum = pgEnum("transaction_type", [
  "sale",
  "refund",
  "adjustment",
  "cash_in",
  "cash_out",
  "withdrawal",
  "deposit",
]);
export const paymentStatusEnumForPayments = pgEnum("payment_status_payments", [
  "pending",
  "completed",
  "failed",
]);
export const tableStatusEnum = pgEnum("table_status", [
  "available",
  "occupied",
  "reserved",
]);
export const reservationStatusEnum = pgEnum("reservation_status", [
  "pending",
  "confirmed",
  "arrived",
  "cancelled",
  "no_show",
]);
export const deliveryPlatformEnum = pgEnum("delivery_platform", [
  "uber_eats",
  "rappi",
  "didi_food",
]);
export const deliveryOrderStatusEnum = pgEnum("delivery_order_status", [
  "pending",
  "accepted",
  "preparing",
  "ready",
  "completed",
  "cancelled",
]);
export const tableShapeEnum = pgEnum("table_shape", ["square", "round"]);
export const promotionTypeEnum = pgEnum("promotion_type", [
  "buy_x_get_y",
  "percentage_discount",
  "fixed_discount",
  "combo",
]);
export const promotionApplyToEnum = pgEnum("promotion_apply_to", [
  "all_products",
  "specific_products",
  "category",
]);
export const discountTypeEnum = pgEnum("discount_type", [
  "percentage",
  "fixed_amount",
  "flexible",
]);

// User profiles (extends Neon Auth users)
export const userProfiles = pgTable("user_profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  authUserId: text("auth_user_id").notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  role: userRoleEnum("role").notNull().default("cashier"),
  pinHash: varchar("pin_hash", { length: 255 }),
  passwordHash: varchar("password_hash", { length: 255 }), // For dashboard login
  employeeCode: varchar("employee_code", { length: 20 }),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Product groups (for organizing products in bar view)
export const groups = pgTable("groups", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  color: varchar("color", { length: 50 }).notNull().default("#6B7280"),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Product categories
export const categories = pgTable("categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  color: varchar("color", { length: 50 }),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  isBeverage: boolean("is_beverage").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Products
export const products = pgTable("products", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  platformPrice: decimal("platform_price", { precision: 10, scale: 2 }), // Precio para plataformas de delivery (Uber/Rappi)
  categoryId: uuid("category_id").references(() => categories.id),
  groupId: uuid("group_id").references(() => groups.id),
  imageUrl: text("image_url"),
  hasVariants: boolean("has_variants").notNull().default(false),
  variants: text("variants"), // JSON: [{ name: "Pieza", price: "50.00" }, { name: "Orden", price: "150.00" }]
  active: boolean("active").notNull().default(true),
  deletedAt: timestamp("deleted_at"), // Soft delete - mantiene el producto en órdenes históricas
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Ingredients
export const ingredients = pgTable("ingredients", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  unit: varchar("unit", { length: 50 }).notNull(),
  currentStock: decimal("current_stock", { precision: 10, scale: 2 }).notNull().default("0"),
  minStock: decimal("min_stock", { precision: 10, scale: 2 }).notNull().default("0"),
  costPerUnit: decimal("cost_per_unit", { precision: 10, scale: 2 }).notNull().default("0"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Product ingredients (recipes)
export const productIngredients = pgTable("product_ingredients", {
  id: uuid("id").defaultRandom().primaryKey(),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  ingredientId: uuid("ingredient_id")
    .notNull()
    .references(() => ingredients.id, { onDelete: "cascade" }),
  quantityNeeded: decimal("quantity_needed", { precision: 10, scale: 3 }).notNull(),
});

// Frostings (escarchados)
export const frostings = pgTable("frostings", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Dry Toppings (escarchados secos - Miguelito, Tajín, etc.)
export const dryToppings = pgTable("dry_toppings", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Extras (shot, azúcar, etc.)
export const extras = pgTable("extras", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull().default("0"),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Modifier flow steps for categories
export const modifierStepTypeEnum = pgEnum("modifier_step_type", [
  "frosting",
  "topping",
  "extra",
  "custom",
]);

export const modifierSteps = pgTable("modifier_steps", {
  id: uuid("id").defaultRandom().primaryKey(),
  categoryId: uuid("category_id")
    .notNull()
    .references(() => categories.id, { onDelete: "cascade" }),
  stepType: modifierStepTypeEnum("step_type").notNull(),
  stepName: varchar("step_name", { length: 255 }).notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isRequired: boolean("is_required").notNull().default(false),
  allowMultiple: boolean("allow_multiple").notNull().default(false),
  includeNoneOption: boolean("include_none_option").notNull().default(true),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Options for custom modifier steps
export const modifierOptions = pgTable("modifier_options", {
  id: uuid("id").defaultRandom().primaryKey(),
  stepId: uuid("step_id")
    .notNull()
    .references(() => modifierSteps.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull().default("0"),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Orders
export const orders = pgTable("orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderNumber: integer("order_number").notNull(),
  status: orderStatusEnum("status").notNull().default("pending"),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull().default("0"),
  tip: decimal("tip", { precision: 10, scale: 2 }).notNull().default("0"),
  total: decimal("total", { precision: 10, scale: 2 }).notNull().default("0"),
  paymentStatus: paymentStatusEnum("payment_status").notNull().default("pending"),
  paymentMethod: paymentMethodEnum("payment_method"),
  mercadopagoPaymentId: text("mercadopago_payment_id"),
  mercadopagoPaymentIntentId: text("mercadopago_payment_intent_id"),
  userId: uuid("user_id").references(() => userProfiles.id),
  tableId: uuid("table_id").references(() => tables.id),
  customerName: varchar("customer_name", { length: 255 }),
  guestCount: integer("guest_count").default(1),
  notes: text("notes"),
  loyaltyCardId: uuid("loyalty_card_id").references(() => loyaltyCards.id),
  cashRegisterId: uuid("cash_register_id").references(() => cashRegisters.id),
  splitBillData: text("split_bill_data"), // JSON: { itemAssignments, individualPayments, individualTips, guestCount }
  // Discount fields
  discountId: uuid("discount_id").references(() => discounts.id),
  discountName: varchar("discount_name", { length: 255 }),
  discountAmount: decimal("discount_amount", { precision: 10, scale: 2 }),
  source: varchar("source", { length: 50 }).default("pos"), // "pos", "uber_eats", "rappi", etc.
  deliveryOrderId: uuid("delivery_order_id"),
  tipPaymentMethod: paymentMethodEnum("tip_payment_method"),
  priority: integer("priority").default(0), // 0=normal, 1=rush
  onHold: boolean("on_hold").default(false),
  holdStartedAt: timestamp("hold_started_at"),
  holdAccumulatedSeconds: integer("hold_accumulated_seconds").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Order items
export const orderItems = pgTable("order_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id),
  productName: varchar("product_name", { length: 255 }).notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  notes: text("notes"),
  frostingId: uuid("frosting_id").references(() => frostings.id),
  frostingName: varchar("frosting_name", { length: 255 }),
  dryToppingId: uuid("dry_topping_id").references(() => dryToppings.id),
  dryToppingName: varchar("dry_topping_name", { length: 255 }),
  extraId: uuid("extra_id").references(() => extras.id),
  extraName: varchar("extra_name", { length: 255 }),
  customModifiers: text("custom_modifiers"), // JSON string with custom modifier selections
  seat: varchar("seat", { length: 10 }), // Seat assignment: "A1", "A2", ... or "C" for shared/center
  course: integer("course").notNull().default(1), // Tiempo/curso: 1, 2, 3...
  deliveredToTable: boolean("delivered_to_table").notNull().default(false), // Track if item was delivered to table
  voided: boolean("voided").notNull().default(false),
  voidReason: text("void_reason"),
  voidedBy: uuid("voided_by").references(() => userProfiles.id),
  // Promotion fields
  promotionId: uuid("promotion_id").references(() => promotions.id),
  promotionName: varchar("promotion_name", { length: 255 }),
  originalPrice: decimal("original_price", { precision: 10, scale: 2 }),
  promotionDiscount: decimal("promotion_discount", { precision: 10, scale: 2 }),
  // Guest/invited item
  isGuest: boolean("is_guest").notNull().default(false), // Item invitado (no se cobra)
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Order payments (for split payments)
export const orderPayments = pgTable("order_payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  paymentMethod: paymentMethodEnum("payment_method").notNull(),
  status: paymentStatusEnumForPayments("status").notNull().default("pending"),
  userId: uuid("user_id").references(() => userProfiles.id),
  reference: varchar("reference", { length: 255 }),
  mercadopagoPaymentIntentId: text("mercadopago_payment_intent_id"),
  mercadopagoPaymentId: text("mercadopago_payment_id"),
  tip: decimal("tip", { precision: 10, scale: 2 }).default("0"),
  tipPaymentMethod: paymentMethodEnum("tip_payment_method"),
  sequenceNumber: integer("sequence_number").default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

// Tables (mesas del restaurante)
export const tables = pgTable("tables", {
  id: uuid("id").defaultRandom().primaryKey(),
  number: varchar("number", { length: 50 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  capacity: integer("capacity").notNull().default(4),
  guestCount: integer("guest_count").notNull().default(1),
  status: tableStatusEnum("status").notNull().default("available"),
  positionX: integer("position_x"),
  positionY: integer("position_y"),
  shape: tableShapeEnum("shape").default("square"),
  rotation: integer("rotation").default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Cash registers
export const cashRegisters = pgTable("cash_registers", {
  id: uuid("id").defaultRandom().primaryKey(),
  openedBy: uuid("opened_by")
    .notNull()
    .references(() => userProfiles.id),
  openedAt: timestamp("opened_at").defaultNow().notNull(),
  closedAt: timestamp("closed_at"),
  closedBy: uuid("closed_by").references(() => userProfiles.id),
  initialCash: decimal("initial_cash", { precision: 10, scale: 2 }).notNull(),
  finalCash: decimal("final_cash", { precision: 10, scale: 2 }),
  expectedCash: decimal("expected_cash", { precision: 10, scale: 2 }),
  vouchersTotal: decimal("vouchers_total", { precision: 10, scale: 2 }),
  receiptsTotal: decimal("receipts_total", { precision: 10, scale: 2 }),
  totalSales: decimal("total_sales", { precision: 10, scale: 2 }).default("0"),
  cashSales: decimal("cash_sales", { precision: 10, scale: 2 }).default("0"),
  terminalSales: decimal("terminal_sales", { precision: 10, scale: 2 }).default("0"),
  transferSales: decimal("transfer_sales", { precision: 10, scale: 2 }).default("0"),
  withdrawals: decimal("withdrawals", { precision: 10, scale: 2 }).default("0"),
  deposits: decimal("deposits", { precision: 10, scale: 2 }).default("0"),
  totalTips: decimal("total_tips", { precision: 10, scale: 2 }).default("0"),
  cashTips: decimal("cash_tips", { precision: 10, scale: 2 }).default("0"),
  cardTips: decimal("card_tips", { precision: 10, scale: 2 }).default("0"),
  transferTips: decimal("transfer_tips", { precision: 10, scale: 2 }).default("0"),
  cardCommission: decimal("card_commission", { precision: 10, scale: 2 }).default("0"),
  netCardSales: decimal("net_card_sales", { precision: 10, scale: 2 }).default("0"),
  netCardTips: decimal("net_card_tips", { precision: 10, scale: 2 }).default("0"),
  totalOrders: integer("total_orders").default(0),
  difference: decimal("difference", { precision: 10, scale: 2 }),
  tolerance: decimal("tolerance", { precision: 10, scale: 2 }).default("10"),
  notes: text("notes"),
  closureNotes: text("closure_notes"),
  status: cashRegisterStatusEnum("status").notNull().default("open"),
  voided: boolean("voided").notNull().default(false),
  voidedBy: uuid("voided_by").references(() => userProfiles.id),
  voidedReason: text("voided_reason"),
});

// Cash register transactions
export const cashRegisterTransactions = pgTable("cash_register_transactions", {
  id: uuid("id").defaultRandom().primaryKey(),
  registerId: uuid("register_id")
    .notNull()
    .references(() => cashRegisters.id, { onDelete: "cascade" }),
  type: transactionTypeEnum("type").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  paymentMethod: paymentMethodEnum("payment_method"),
  orderId: uuid("order_id").references(() => orders.id),
  userId: uuid("user_id").references(() => userProfiles.id),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Audit log
export const auditLog = pgTable("audit_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => userProfiles.id),
  action: varchar("action", { length: 255 }).notNull(),
  entityType: varchar("entity_type", { length: 100 }),
  entityId: uuid("entity_id"),
  details: text("details"),
  ipAddress: varchar("ip_address", { length: 45 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Loyalty cards
export const loyaltyCards = pgTable("loyalty_cards", {
  id: uuid("id").defaultRandom().primaryKey(),
  customerName: varchar("customer_name", { length: 255 }).notNull(),
  customerPhone: varchar("customer_phone", { length: 20 }),
  customerEmail: varchar("customer_email", { length: 255 }),
  barcodeValue: varchar("barcode_value", { length: 100 }).notNull().unique(),
  pinHash: varchar("pin_hash", { length: 255 }),
  stamps: integer("stamps").notNull().default(0),
  totalStamps: integer("total_stamps").notNull().default(0),
  rewardsAvailable: integer("rewards_available").notNull().default(0),
  rewardsRedeemed: integer("rewards_redeemed").notNull().default(0),
  stampsPerReward: integer("stamps_per_reward").notNull().default(8),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Loyalty transactions
export const loyaltyTransactions = pgTable("loyalty_transactions", {
  id: uuid("id").defaultRandom().primaryKey(),
  cardId: uuid("card_id")
    .notNull()
    .references(() => loyaltyCards.id, { onDelete: "cascade" }),
  orderId: uuid("order_id").references(() => orders.id),
  stampsAdded: integer("stamps_added").notNull().default(0),
  rewardRedeemed: boolean("reward_redeemed").notNull().default(false),
  createdBy: uuid("created_by").references(() => userProfiles.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Wallet device registrations (for Apple Wallet pass updates)
export const walletDeviceRegistrations = pgTable("wallet_device_registrations", {
  id: uuid("id").defaultRandom().primaryKey(),
  deviceLibraryId: varchar("device_library_id", { length: 255 }).notNull(),
  passTypeId: varchar("pass_type_id", { length: 255 }).notNull(),
  serialNumber: uuid("serial_number")
    .notNull()
    .references(() => loyaltyCards.id, { onDelete: "cascade" }),
  pushToken: text("push_token"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Mercado Pago devices
export const mercadopagoDevices = pgTable("mercadopago_devices", {
  id: uuid("id").defaultRandom().primaryKey(),
  deviceId: text("device_id").notNull().unique(),
  deviceName: varchar("device_name", { length: 255 }).notNull(),
  posId: text("pos_id"),
  storeId: text("store_id"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Relations
export const categoriesRelations = relations(categories, ({ many }) => ({
  products: many(products),
  modifierSteps: many(modifierSteps),
}));

export const modifierStepsRelations = relations(modifierSteps, ({ one, many }) => ({
  category: one(categories, {
    fields: [modifierSteps.categoryId],
    references: [categories.id],
  }),
  options: many(modifierOptions),
}));

export const modifierOptionsRelations = relations(modifierOptions, ({ one }) => ({
  step: one(modifierSteps, {
    fields: [modifierOptions.stepId],
    references: [modifierSteps.id],
  }),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
  ingredients: many(productIngredients),
  orderItems: many(orderItems),
}));

export const ingredientsRelations = relations(ingredients, ({ many }) => ({
  products: many(productIngredients),
}));

export const productIngredientsRelations = relations(productIngredients, ({ one }) => ({
  product: one(products, {
    fields: [productIngredients.productId],
    references: [products.id],
  }),
  ingredient: one(ingredients, {
    fields: [productIngredients.ingredientId],
    references: [ingredients.id],
  }),
}));

export const frostingsRelations = relations(frostings, ({ many }) => ({
  orderItems: many(orderItems),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  items: many(orderItems),
  payments: many(orderPayments),
  user: one(userProfiles, {
    fields: [orders.userId],
    references: [userProfiles.id],
  }),
  loyaltyCard: one(loyaltyCards, {
    fields: [orders.loyaltyCardId],
    references: [loyaltyCards.id],
  }),
  cashRegister: one(cashRegisters, {
    fields: [orders.cashRegisterId],
    references: [cashRegisters.id],
  }),
  table: one(tables, {
    fields: [orders.tableId],
    references: [tables.id],
  }),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  product: one(products, {
    fields: [orderItems.productId],
    references: [products.id],
  }),
  frosting: one(frostings, {
    fields: [orderItems.frostingId],
    references: [frostings.id],
  }),
}));

export const orderPaymentsRelations = relations(orderPayments, ({ one }) => ({
  order: one(orders, {
    fields: [orderPayments.orderId],
    references: [orders.id],
  }),
}));

export const cashRegistersRelations = relations(cashRegisters, ({ one, many }) => ({
  openedByUser: one(userProfiles, {
    fields: [cashRegisters.openedBy],
    references: [userProfiles.id],
  }),
  transactions: many(cashRegisterTransactions),
  orders: many(orders),
}));

export const cashRegisterTransactionsRelations = relations(
  cashRegisterTransactions,
  ({ one }) => ({
    register: one(cashRegisters, {
      fields: [cashRegisterTransactions.registerId],
      references: [cashRegisters.id],
    }),
    order: one(orders, {
      fields: [cashRegisterTransactions.orderId],
      references: [orders.id],
    }),
  })
);

export const loyaltyCardsRelations = relations(loyaltyCards, ({ many }) => ({
  transactions: many(loyaltyTransactions),
  orders: many(orders),
}));

// Reservations
export const reservations = pgTable("reservations", {
  id: uuid("id").defaultRandom().primaryKey(),
  tableId: uuid("table_id")
    .notNull()
    .references(() => tables.id, { onDelete: "cascade" }),
  customerName: varchar("customer_name", { length: 255 }).notNull(),
  customerPhone: varchar("customer_phone", { length: 50 }),
  guestCount: integer("guest_count").notNull().default(1),
  reservationDate: date("reservation_date").notNull(),
  reservationTime: time("reservation_time").notNull(),
  duration: integer("duration").notNull().default(120), // Duration in minutes
  status: reservationStatusEnum("status").notNull().default("pending"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const reservationsRelations = relations(reservations, ({ one }) => ({
  table: one(tables, {
    fields: [reservations.tableId],
    references: [tables.id],
  }),
}));

export const tablesRelationsWithReservations = relations(tables, ({ many }) => ({
  reservations: many(reservations),
}));

export const loyaltyTransactionsRelations = relations(loyaltyTransactions, ({ one }) => ({
  card: one(loyaltyCards, {
    fields: [loyaltyTransactions.cardId],
    references: [loyaltyCards.id],
  }),
  order: one(orders, {
    fields: [loyaltyTransactions.orderId],
    references: [orders.id],
  }),
  createdByUser: one(userProfiles, {
    fields: [loyaltyTransactions.createdBy],
    references: [userProfiles.id],
  }),
}));

// Promotions table
export const promotions = pgTable("promotions", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  type: promotionTypeEnum("type").notNull(),
  buyQuantity: integer("buy_quantity"),
  getQuantity: integer("get_quantity"),
  discountPercentage: decimal("discount_percentage", { precision: 5, scale: 2 }),
  discountAmount: decimal("discount_amount", { precision: 10, scale: 2 }),
  applyTo: promotionApplyToEnum("apply_to").notNull(),
  productIds: text("product_ids"), // JSON array
  categoryId: uuid("category_id").references(() => categories.id),
  active: boolean("active").default(true),
  startDate: date("start_date"),
  endDate: date("end_date"),
  daysOfWeek: text("days_of_week"), // JSON array
  startTime: time("start_time"),
  endTime: time("end_time"),
  priority: integer("priority").default(0),
  comboRules: text("combo_rules"), // JSON array: [{productId?, categoryId?, quantity}]
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Discounts table
export const discounts = pgTable("discounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  type: discountTypeEnum("type").notNull(),
  value: decimal("value", { precision: 10, scale: 2 }).notNull(),
  requiresAuthorization: boolean("requires_authorization").default(false),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Promotions relations
export const promotionsRelations = relations(promotions, ({ one }) => ({
  category: one(categories, {
    fields: [promotions.categoryId],
    references: [categories.id],
  }),
}));

// Categories relations with promotions
export const categoriesRelationsWithPromotions = relations(categories, ({ many }) => ({
  promotions: many(promotions),
}));

// SALES HISTORY - Tabla de auditoría INMUTABLE para todas las ventas
// Esta tabla NUNCA se modifica ni se borra - registro permanente
export const salesHistory = pgTable("sales_history", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id").notNull(), // Referencia a la orden original
  orderNumber: integer("order_number").notNull(),
  cashRegisterId: uuid("cash_register_id").notNull().references(() => cashRegisters.id),
  tableId: uuid("table_id").references(() => tables.id),
  tableNumber: integer("table_number"), // Guardamos el número por si se borra la mesa
  customerName: varchar("customer_name", { length: 255 }),
  paymentMethod: paymentMethodEnum("payment_method").notNull(),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  tip: decimal("tip", { precision: 10, scale: 2 }).notNull().default("0"),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  discount: decimal("discount", { precision: 10, scale: 2 }).default("0"),
  discountName: varchar("discount_name", { length: 255 }),
  itemsJson: text("items_json").notNull(), // JSON de todos los items
  userId: uuid("user_id").references(() => userProfiles.id),
  loyaltyCardId: uuid("loyalty_card_id").references(() => loyaltyCards.id),
  splitBillData: text("split_bill_data"),
  createdAt: timestamp("created_at").notNull(), // Fecha original de la orden
  paidAt: timestamp("paid_at").defaultNow().notNull(), // Fecha en que se pagó
});

// Delivery Orders
export const deliveryOrders = pgTable("delivery_orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  platform: deliveryPlatformEnum("platform").notNull(),
  externalId: varchar("external_id", { length: 255 }).notNull().unique(),
  status: deliveryOrderStatusEnum("status").notNull().default("pending"),
  
  // Customer info
  customerName: varchar("customer_name", { length: 255 }).notNull(),
  customerPhone: varchar("customer_phone", { length: 50 }),
  deliveryAddress: text("delivery_address"),
  deliveryInstructions: text("delivery_instructions"),
  
  // Order details
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  deliveryFee: decimal("delivery_fee", { precision: 10, scale: 2 }).default("0"),
  platformFee: decimal("platform_fee", { precision: 10, scale: 2 }).default("0"),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  
  // Timing
  estimatedPickupTime: timestamp("estimated_pickup_time"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  acceptedAt: timestamp("accepted_at"),
  readyAt: timestamp("ready_at"),
  completedAt: timestamp("completed_at"),
  cancelledAt: timestamp("cancelled_at"),
  
  // Related order
  orderId: uuid("order_id").references(() => orders.id),
  
  // Raw data
  rawData: text("raw_data"), // JSON string
  
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Inventory Stock Products (productos contables como refrescos, empanadas crudas, etc.)
export const inventoryProducts = pgTable("inventory_products", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  unit: varchar("unit", { length: 50 }).notNull().default("unidad"), // unidad, caja, paquete, etc.
  currentStock: decimal("current_stock", { precision: 10, scale: 2 }).notNull().default("0"),
  minStock: decimal("min_stock", { precision: 10, scale: 2 }).notNull().default("0"),
  cost: decimal("cost", { precision: 10, scale: 2 }).notNull().default("0"), // costo unitario
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Recipes (recetas hechas de ingredientes, ej: Caldo de camarón)
export const recipes = pgTable("recipes", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  unit: varchar("unit", { length: 50 }).notNull().default("porción"), // porción, litro, etc.
  currentStock: decimal("current_stock", { precision: 10, scale: 2 }).notNull().default("0"),
  minStock: decimal("min_stock", { precision: 10, scale: 2 }).notNull().default("0"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Recipe Ingredients (ingredientes que componen una receta)
export const recipeIngredients = pgTable("recipe_ingredients", {
  id: uuid("id").defaultRandom().primaryKey(),
  recipeId: uuid("recipe_id")
    .notNull()
    .references(() => recipes.id, { onDelete: "cascade" }),
  ingredientId: uuid("ingredient_id")
    .notNull()
    .references(() => ingredients.id, { onDelete: "cascade" }),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Product Inventory Link (vincula productos del menú con inventario o recetas)
export const productInventoryLinks = pgTable("product_inventory_links", {
  id: uuid("id").defaultRandom().primaryKey(),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  // Puede ser inventario O receta (uno de los dos)
  inventoryProductId: uuid("inventory_product_id")
    .references(() => inventoryProducts.id, { onDelete: "cascade" }),
  recipeId: uuid("recipe_id")
    .references(() => recipes.id, { onDelete: "cascade" }),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull().default("1"), // cantidad que se descuenta por venta
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Product Flows (flujos de modificadores por producto - override de category flow)
export const productFlows = pgTable("product_flows", {
  id: uuid("id").defaultRandom().primaryKey(),
  productId: uuid("product_id")
    .notNull()
    .unique()
    .references(() => products.id, { onDelete: "cascade" }),
  useDefaultFlow: boolean("use_default_flow").notNull().default(true), // si true, usa el flujo de la categoría
  steps: text("steps").notNull().default("[]"), // JSON array de ModifierStep
  nodes: text("nodes"), // JSON para el editor visual (posiciones, conexiones)
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// User profiles relations
export const userProfilesRelations = relations(userProfiles, ({ many }) => ({
  orders: many(orders),
  cashRegisters: many(cashRegisters),
}));
