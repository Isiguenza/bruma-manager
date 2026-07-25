export interface Group {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  active: boolean;
  createdAt: Date;
}

export interface Table {
  id: string;
  number: string;
  name: string | null;
  capacity: number;
  status: "available" | "occupied" | "reserved";
  positionX?: number | null;
  positionY?: number | null;
  shape?: "square" | "round" | null;
  rotation?: number | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  activeOrder?: Order | null;
  reservations?: Reservation[];
}

export interface ProductVariant {
  name: string;
  price: string;
  platformPrice?: string; // Precio para plataformas de delivery (Uber/Rappi)
}

export interface Product {
  id: string;
  name: string;
  description: string | null;
  price: string;
  platformPrice?: string | null; // Precio para plataformas de delivery (Uber/Rappi)
  categoryId: string | null;
  groupId: string | null;
  imageUrl: string | null;
  hasVariants: boolean;
  variants: string | null; // JSON string de ProductVariant[]
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  category?: Category | null;
  group?: Group | null;
  ingredients?: ProductIngredient[];
}

export interface Category {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  sortOrder: number;
  active: boolean;
  isBeverage?: boolean;
}

export interface QuickNote {
  id: string;
  label: string;
  productIds: string | null; // JSON string de string[]; null/vacío = aplica a todos los productos
  sortOrder: number;
  active: boolean;
  createdAt: Date;
}

export interface Ingredient {
  id: string;
  name: string;
  unit: string;
  currentStock: string;
  minStock: string;
  costPerUnit: string;
  active: boolean;
}

export interface ProductIngredient {
  id: string;
  productId: string;
  ingredientId: string;
  quantityNeeded: string;
  ingredient?: Ingredient;
}

export interface Frosting {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DryTopping {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Extra {
  id: string;
  name: string;
  description: string | null;
  price: string;
  sortOrder: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ModifierStep {
  id: string;
  categoryId?: string; // Optional for product flows
  stepType: "frosting" | "topping" | "extra" | "custom" | "products" | "category";
  stepName: string;
  sortOrder: number;
  isRequired: boolean;
  allowMultiple: boolean;
  includeNoneOption: boolean;
  active: boolean;
  createdAt: Date;
  options?: ModifierOption[];
}

export interface ModifierOption {
  id: string;
  stepId: string;
  name: string;
  description: string | null;
  price: string;
  sortOrder: number;
  active: boolean;
  createdAt: Date;
}

export interface CategoryFlow {
  categoryId: string;
  useDefaultFlow: boolean;
  steps: ModifierStep[];
}

export interface Order {
  id: string;
  orderNumber: number;
  status: "pending" | "preparing" | "ready" | "delivered" | "cancelled";
  total: string;
  paymentStatus: "pending" | "paid" | "failed" | "refunded";
  paymentMethod: "cash" | "terminal_mercadopago" | "card" | "transfer" | "platform_delivery" | null;
  mercadopagoPaymentId: string | null;
  mercadopagoPaymentIntentId: string | null;
  userId: string | null;
  customerName: string | null;
  notes: string | null;
  loyaltyCardId: string | null;
  cashRegisterId: string | null;
  tableId: string | null;
  createdAt: Date;
  updatedAt: Date;
  items?: OrderItem[];
  payments?: OrderPayment[];
  user?: UserProfile | null;
  table?: Table | null;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: string;
  subtotal: string;
  notes: string | null;
  frostingId: string | null;
  frostingName: string | null;
  dryToppingId: string | null;
  dryToppingName: string | null;
  extraId: string | null;
  extraName: string | null;
  customModifiers: string | null;
  seat?: string | null;
  course?: number;
  frosting?: Frosting | null;
  dryTopping?: DryTopping | null;
  extra?: Extra | null;
  product?: {
    id: string;
    categoryId: string | null;
    category?: { id: string; name: string; isBeverage: boolean } | null;
  } | null;
}

export interface OrderPayment {
  id: string;
  orderId: string;
  amount: string;
  paymentMethod: "cash" | "terminal_mercadopago" | "card" | "transfer";
  status: "pending" | "completed" | "failed";
  mercadopagoPaymentIntentId: string | null;
  mercadopagoPaymentId: string | null;
  createdAt: Date;
  completedAt: Date | null;
}

export interface CartItem {
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  notes: string;
  frostingId?: string | null | undefined;
  frostingName?: string | null | undefined;
  dryToppingId?: string | null | undefined;
  dryToppingName?: string | null | undefined;
  extraId?: string | null | undefined;
  extraName?: string | null | undefined;
  customModifiers?: string | null;
  sentToKitchen?: boolean; // Items enviados a cocina no se pueden editar
  orderStatus?: "pending" | "preparing" | "ready" | "delivered" | "cancelled"; // Status de la orden para mostrar badge correcto
  orderId?: string; // ID de la orden a la que pertenece este item
  itemId?: string; // ID del order_item en BD
  deliveredToTable?: boolean; // Si ya fue entregado a la mesa
  seat?: string | null; // Asiento: "A1", "A2", ... o "C" (centro/compartido)
  course?: number; // Tiempo/curso: 1, 2, 3...
  isBeverage?: boolean; // Si el item es bebida (del frontend)
  // Promotion fields
  promotionId?: string | null;
  promotionName?: string | null;
  originalPrice?: number | null; // Precio antes de la promoción
  promotionDiscount?: number | null; // Descuento aplicado por la promoción
  // Guest fields
  isGuest?: boolean; // Si el item es invitado (precio = 0)
}

export interface CashRegister {
  id: string;
  openedBy: string;
  openedAt: Date;
  closedAt: Date | null;
  closedBy: string | null;
  initialCash: string;
  finalCash: string | null;
  expectedCash: string | null;
  vouchersTotal: string | null;
  receiptsTotal: string | null;
  totalSales: string | null;
  cashSales: string | null;
  terminalSales: string | null;
  transferSales: string | null;
  withdrawals: string | null;
  deposits: string | null;
  totalOrders: number | null;
  difference: string | null;
  tolerance: string;
  notes: string | null;
  closureNotes: string | null;
  status: "open" | "closed";
  voided: boolean;
  voidedBy: string | null;
  voidedReason: string | null;
  openedByUser?: UserProfile;
  closedByUser?: UserProfile | null;
}

export interface LoyaltyCard {
  id: string;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  barcodeValue: string;
  stamps: number;
  totalStamps: number;
  rewardsAvailable: number;
  rewardsRedeemed: number;
  stampsPerReward: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserProfile {
  id: string;
  authUserId: string;
  name: string;
  email: string;
  role: "admin" | "cashier" | "bartender";
  employeeCode: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface MercadoPagoDevice {
  id: string;
  deviceId: string;
  deviceName: string;
  posId: string | null;
  storeId: string | null;
  active: boolean;
}

export interface Reservation {
  id: string;
  tableId: string;
  customerName: string;
  customerPhone: string | null;
  guestCount: number;
  reservationDate: string; // ISO date string
  reservationTime: string; // HH:mm format
  duration: number; // Duration in minutes
  status: "pending" | "confirmed" | "arrived" | "cancelled" | "no_show";
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  table?: Table;
}

export interface Promotion {
  id: string;
  name: string;
  description: string | null;
  type: "buy_x_get_y" | "percentage_discount" | "fixed_discount" | "combo";
  buyQuantity: number | null;
  getQuantity: number | null;
  discountPercentage: number | null;
  discountAmount: number | null;
  applyTo: "all_products" | "specific_products" | "category";
  productIds: string | null; // JSON array
  categoryId: string | null;
  active: boolean;
  startDate: string | null;
  endDate: string | null;
  daysOfWeek: string | null; // JSON array
  startTime: string | null;
  endTime: string | null;
  priority: number;
  comboRules: string | null; // JSON array: [{productId?, categoryId?, quantity}]
  createdAt: Date;
  updatedAt: Date;
}

export interface Discount {
  id: string;
  name: string;
  description: string | null;
  type: "percentage" | "fixed_amount" | "flexible";
  value: number;
  requiresAuthorization: boolean;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}
