"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { jsPDF } from "jspdf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Minus, Trash, MagnifyingGlass, DotsThree, QrCode, Stamp, Camera, X, Money, CreditCard, Check, Spinner, Bank, House, Coffee, ShoppingBag, Users, Printer, User, ForkKnife, GearSix, CookingPot, Gift, Percent } from "@phosphor-icons/react";
import { SlideToConfirm } from "@/components/ui/slide-to-confirm";
import { toast } from "sonner";
import type { Product, Category, CartItem, Frosting, DryTopping, Extra, LoyaltyCard, CategoryFlow, ModifierStep, ModifierOption, Table, Order, Promotion, Discount } from "@/lib/types";
import { applyPromotions, calculateDiscount } from "@/lib/utils/promotions";
import { getApiUrl } from "@/lib/utils";
import { Sidebar } from "./components/Sidebar";
import { ReservationsView } from "./components/ReservationsView";

export default function BarPage() {
  const router = useRouter();
  
  // Estado de vista activa (POS o Reservas)
  const [activeView, setActiveView] = useState<"pos" | "reservations">("pos");
  
  // Estados del sistema de mesas
  const [tables, setTables] = useState<Table[]>([]);
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [showTableSelection, setShowTableSelection] = useState(true);
  const [deliveryOrders, setDeliveryOrders] = useState<Order[]>([]);
  const [platformDeliveryOrders, setPlatformDeliveryOrders] = useState<Order[]>([]); // Uber/Rappi
  const [showCustomerNameDialog, setShowCustomerNameDialog] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [isPlatformDelivery, setIsPlatformDelivery] = useState(false); // Flag para saber si es delivery de plataforma
  const [deliveryPlatform, setDeliveryPlatform] = useState<"Uber" | "Rappi" | "Didi" | "">(""); // Plataforma seleccionada
  const [platformOrderDigits, setPlatformOrderDigits] = useState(""); // Últimos 4 dígitos de la orden
  const [tablesWithReadyItems, setTablesWithReadyItems] = useState<Set<string>>(new Set());
  
  // Estados de promociones y descuentos
  const [activePromotions, setActivePromotions] = useState<Promotion[]>([]);
  const [availableDiscounts, setAvailableDiscounts] = useState<Discount[]>([]);
  const [selectedDiscount, setSelectedDiscount] = useState<Discount | null>(null);
  const [showFlexibleDiscountDialog, setShowFlexibleDiscountDialog] = useState(false);
  const [flexibleDiscountType, setFlexibleDiscountType] = useState<"percentage" | "fixed">("percentage");
  const [flexibleDiscountValue, setFlexibleDiscountValue] = useState<number>(10);
  const [customFlexibleAmount, setCustomFlexibleAmount] = useState<string>("");
  
  // Estados para menú admin e invitados
  const [showAdminMenu, setShowAdminMenu] = useState(false);
  const [showGuestItemsDialog, setShowGuestItemsDialog] = useState(false);
  const [guestItemsSelection, setGuestItemsSelection] = useState<number[]>([]);
  const [showGuestProductDialog, setShowGuestProductDialog] = useState(false); // Dialog para agregar productos invitados (cortesía dueños)
  const [guestProductCart, setGuestProductCart] = useState<Array<{ productId: string; name: string; price: number; qty: number }>>([]); // Carrito temporal para cortesías
  
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [frostings, setFrostings] = useState<Frosting[]>([]);
  const [toppings, setToppings] = useState<DryTopping[]>([]);
  const [extras, setExtras] = useState<Extra[]>([]);
  
  // Estados para variantes de productos
  const [showVariantDialog, setShowVariantDialog] = useState(false);
  const [selectedProductForVariant, setSelectedProductForVariant] = useState<Product | null>(null);
  
  // Estados para diálogo de comentarios
  const [showNotesDialog, setShowNotesDialog] = useState(false);
  const [pendingCartItem, setPendingCartItem] = useState<CartItem | null>(null);
  const [tempNotes, setTempNotes] = useState("");
  
  // Estados para número de personas
  const [guestCount, setGuestCount] = useState(2);
  const [showGuestCountDialog, setShowGuestCountDialog] = useState(false);
  const [tempGuestCount, setTempGuestCount] = useState(2);
  const [activeSeat, setActiveSeat] = useState<string>("C"); // "A1","A2",... o "C" (centro)
  const [showInitialGuestDialog, setShowInitialGuestDialog] = useState(false); // Modal al abrir mesa libre
  const [activeCourse, setActiveCourse] = useState(1); // Tiempo/curso activo: 1, 2, 3...
  
  // Estados para eliminar items de cocina con razón
  const [showVoidDialog, setShowVoidDialog] = useState(false);
  const [voidItemIndex, setVoidItemIndex] = useState<number | null>(null);
  const [voidReason, setVoidReason] = useState("");
  
  // Flujo de modificadores dinámico
  const [categoryFlow, setCategoryFlow] = useState<CategoryFlow | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(-1); // -1 = productos
  const [stepSelections, setStepSelections] = useState<Record<string, any>>({});
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  
  // Estados legacy para compatibilidad (se usarán según el tipo de paso)
  const [selectedFrosting, setSelectedFrosting] = useState<Frosting | null>(null);
  const [selectedTopping, setSelectedTopping] = useState<DryTopping | null>(null);
  const [selectedExtras, setSelectedExtras] = useState<Extra[]>([]);
  const [productNotes, setProductNotes] = useState<string>("");
  
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
  // Estados de pago inline
  const [showingPayment, setShowingPayment] = useState(false);
  const [showingLoyaltyStep, setShowingLoyaltyStep] = useState(false); // COMENTADO PARA FUTURO
  const [paymentStep, setPaymentStep] = useState<"summary" | "payment" | "confirmation" | "split-assign" | "split-overview" | "split-pay-person" | "done">("summary");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "terminal_mercadopago" | "transfer" | null>(null);
  const [cashReceived, setCashReceived] = useState("");
  
  // Estados de propina
  const [tipPercentage, setTipPercentage] = useState<number>(0);
  const [customTip, setCustomTip] = useState<string>("");
  const [showCustomTip, setShowCustomTip] = useState(false);
  
  // Estados de división de cuenta
  const [splitBillMode, setSplitBillMode] = useState(false);
  const [currentPersonIndex, setCurrentPersonIndex] = useState(0);
  const [selectedSplitPersonIndex, setSelectedSplitPersonIndex] = useState<number>(0); // persona seleccionada para pagar
  const [itemAssignments, setItemAssignments] = useState<Record<number, number[]>>({}); // personIndex -> [cartItemIndexes]
  const [individualPayments, setIndividualPayments] = useState<Record<number, { paid: boolean, method: string | null, amount: number }>>({}); // personIndex -> payment info
  const [individualTips, setIndividualTips] = useState<Record<number, { percentage: number, custom: string, showCustom: boolean }>>({}); // propina por persona
  const [showIndividualDetails, setShowIndividualDetails] = useState(true);
  const [waitingForTerminal, setWaitingForTerminal] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [currentOrderId, setCurrentOrderId] = useState<string | null>(null);
  const [paymentCompleted, setPaymentCompleted] = useState(false);
  const [confirmingOrder, setConfirmingOrder] = useState(false);
  const [splitPaymentMethod, setSplitPaymentMethod] = useState<"cash" | "terminal_mercadopago" | "transfer" | null>(null);
  const [splitCashReceived, setSplitCashReceived] = useState("");
  
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [employeeName, setEmployeeName] = useState<string>('');
  const [showDashboard, setShowDashboard] = useState(true);
  const [authStep, setAuthStep] = useState<'idle' | 'pin'>('idle');
  const [employeeCode, setEmployeeCode] = useState('');
  const [pin, setPin] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [cashRegisterOpen, setCashRegisterOpen] = useState(false);
  const [checkingRegister, setCheckingRegister] = useState(true);
  const [authenticating, setAuthenticating] = useState(false);
  const [lastActivity, setLastActivity] = useState<number>(Date.now());
  
  // Loyalty card states
  const [loyaltyCard, setLoyaltyCard] = useState<LoyaltyCard | null>(null);
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [manualStampDialogOpen, setManualStampDialogOpen] = useState(false);
  const [qrCode, setQrCode] = useState("");
  const [manualBarcodeInput, setManualBarcodeInput] = useState("");
  const [loadingCard, setLoadingCard] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scanningRef = useRef<boolean>(false);

  // Persistir estado de división de cuenta en BD
  const saveSplitBillData = useCallback(async (
    orderId: string | null,
    assignments: Record<number, number[]>,
    payments: Record<number, { paid: boolean, method: string | null, amount: number }>,
    tips: Record<number, { percentage: number, custom: string, showCustom: boolean }>,
    guests: number,
    step: string
  ) => {
    if (!orderId) return;
    try {
      await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          splitBillData: {
            itemAssignments: assignments,
            individualPayments: payments,
            individualTips: tips,
            guestCount: guests,
            paymentStep: step,
          },
        }),
      });
    } catch (e) {
      console.error("Error saving split bill data:", e);
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    checkCashRegister();
    restoreSession();
    fetchActivePromotions();
    fetchAvailableDiscounts();
    // No cargar mesas ni delivery orders hasta que se muestre la pantalla de selección
    // Esto acelera la carga inicial
    
    // Restaurar estado del carrito desde localStorage al cargar la página
    try {
      const savedCart = localStorage.getItem('barCart');
      const savedTable = localStorage.getItem('barSelectedTable');
      const savedCustomerName = localStorage.getItem('barCustomerName');
      const savedOrderId = localStorage.getItem('barCurrentOrderId');
      const savedGuestCount = localStorage.getItem('barGuestCount');
      const savedActiveCourse = localStorage.getItem('barActiveCourse');
      const savedActiveSeat = localStorage.getItem('barActiveSeat');
      
      let hasActiveOrder = false;
      
      if (savedCart) {
        const parsedCart = JSON.parse(savedCart);
        if (parsedCart.length > 0) {
          setCart(parsedCart);
          hasActiveOrder = true;
          console.log('🔄 Carrito restaurado desde localStorage:', parsedCart.length, 'items');
        }
      }
      
      if (savedTable) {
        const parsedTable = JSON.parse(savedTable);
        setSelectedTable(parsedTable);
        hasActiveOrder = true;
        console.log('🔄 Mesa restaurada:', parsedTable.number);
      }
      
      if (savedCustomerName) {
        setCustomerName(savedCustomerName);
        hasActiveOrder = true;
        console.log('🔄 Cliente restaurado:', savedCustomerName);
        
        // Si es delivery, cargar las órdenes de delivery para tener los datos completos
        fetchDeliveryOrders();
      }
      
      // Si hay orden activa (carrito, mesa o cliente), ocultar selección de mesas
      if (hasActiveOrder) {
        setShowTableSelection(false);
        console.log('✅ Orden activa restaurada - ocultando selección de mesas');
        console.log('📊 Estado restaurado:', {
          cartItems: savedCart ? JSON.parse(savedCart).length : 0,
          hasTable: !!savedTable,
          hasCustomer: !!savedCustomerName,
          orderId: savedOrderId,
        });
      }
      
      if (savedOrderId) {
        setCurrentOrderId(savedOrderId);
        console.log('🔄 OrderId restaurado:', savedOrderId);
        
        // Cargar la orden desde la API para restaurar el carrito
        fetch(`/api/orders/${savedOrderId}`)
          .then(res => res.json())
          .then(order => {
            if (order && order.items) {
              const apiCartItems: CartItem[] = order.items
                .filter((item: any) => !item.voided)
                .map((item: any) => ({
                  productId: item.productId,
                  productName: item.productName,
                  unitPrice: parseFloat(item.unitPrice),
                  quantity: item.quantity,
                  notes: item.notes || "",
                  frostingId: item.frostingId,
                  frostingName: item.frostingName,
                  dryToppingId: item.dryToppingId,
                  dryToppingName: item.dryToppingName,
                  extraId: item.extraId,
                  extraName: item.extraName,
                  customModifiers: item.customModifiers,
                  sentToKitchen: order.status === "preparing" || order.status === "ready" || order.status === "delivered",
                  orderStatus: order.status,
                  orderId: order.id,
                  itemId: item.id,
                  deliveredToTable: item.deliveredToTable || false,
                  seat: item.seat || "C",
                  course: item.course || 1,
                  isBeverage: item.product?.category?.isBeverage || false,
                  isGuest: item.isGuest || false,
                }));
              
              // Merge con items no enviados de localStorage (para preservar items invitados pendientes)
              const localUnsentItems = savedCart ? JSON.parse(savedCart).filter((item: CartItem) => !item.sentToKitchen) : [];
              const mergedCart = [...apiCartItems, ...localUnsentItems];
              
              setCart(mergedCart);
              const maxCourse = Math.max(...mergedCart.map(i => i.course || 1), 1);
              setActiveCourse(maxCourse);
              console.log('✅ Carrito restaurado desde API:', apiCartItems.length, 'items + ', localUnsentItems.length, 'items locales no enviados');
            }
          })
          .catch(error => {
            console.error('Error cargando orden desde API:', error);
          });
      }
      
      if (savedGuestCount) {
        const count = parseInt(savedGuestCount);
        setGuestCount(count);
        setTempGuestCount(count);
      }
      
      if (savedActiveCourse) {
        setActiveCourse(parseInt(savedActiveCourse));
      }
      
      if (savedActiveSeat) {
        setActiveSeat(savedActiveSeat);
      }
    } catch (error) {
      console.error('Error restaurando estado desde localStorage:', error);
    }
  }, []);

  useEffect(() => {
    const checkInactivity = setInterval(() => {
      if (employeeId) {
        const now = Date.now();
        const inactiveTime = now - lastActivity;
        const TEN_MINUTES = 10 * 60 * 1000;
        
        if (inactiveTime > TEN_MINUTES) {
          handleSessionExpired();
        }
      }
    }, 60000);

    return () => clearInterval(checkInactivity);
  }, [employeeId, lastActivity]);

  useEffect(() => {
    if (selectedCategory) {
      loadCategoryFlow(selectedCategory);
    }
  }, [selectedCategory]);

  // Recargar mesas y delivery orders cuando se muestra la pantalla de selección
  useEffect(() => {
    if (showTableSelection) {
      console.log("🔄 Recargando mesas y delivery orders...");
      fetchTables();
      fetchDeliveryOrders();
    }
  }, [showTableSelection]);

  // Mostrar modal de nombre de cliente automáticamente para Para Llevar y Delivery
  useEffect(() => {
    // Si no estamos en selección de mesas, no hay mesa seleccionada, y no hay nombre de cliente
    // entonces mostrar el modal automáticamente
    if (!showTableSelection && !selectedTable && !customerName.trim()) {
      setShowCustomerNameDialog(true);
    }
  }, [showTableSelection, selectedTable, customerName]);

  // Este useEffect estaba duplicado - eliminado

  useEffect(() => {
    const updateActivity = () => setLastActivity(Date.now());
    
    window.addEventListener('click', updateActivity);
    window.addEventListener('keydown', updateActivity);
    window.addEventListener('touchstart', updateActivity);
    
    return () => {
      window.removeEventListener('click', updateActivity);
      window.removeEventListener('keydown', updateActivity);
      window.removeEventListener('touchstart', updateActivity);
    };
  }, []);

  useEffect(() => {
    let wasHidden = false;
    
    const handleVisibilityChange = () => {
      if (document.hidden) {
        wasHidden = true;
      } else if (wasHidden) {
        // La app volvió a estar visible después de estar oculta
        wasHidden = false;
        
        // Si hay una mesa/orden activa, sugerir recargar
        if (selectedTable || customerName) {
          toast.info("Si la app no responde, recarga la página", {
            duration: 5000,
            action: {
              label: "Recargar",
              onClick: () => window.location.reload(),
            },
          });
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [selectedTable, customerName]);

  // Guardar estado en localStorage cuando cambie
  useEffect(() => {
    if (cart.length > 0) {
      localStorage.setItem('barCart', JSON.stringify(cart));
    } else {
      localStorage.removeItem('barCart');
    }
  }, [cart]);

  useEffect(() => {
    if (selectedTable) {
      localStorage.setItem('barSelectedTable', JSON.stringify(selectedTable));
    } else {
      localStorage.removeItem('barSelectedTable');
    }
  }, [selectedTable]);

  useEffect(() => {
    if (customerName) {
      localStorage.setItem('barCustomerName', customerName);
    } else {
      localStorage.removeItem('barCustomerName');
    }
  }, [customerName]);

  useEffect(() => {
    if (currentOrderId) {
      localStorage.setItem('barCurrentOrderId', currentOrderId);
    } else {
      localStorage.removeItem('barCurrentOrderId');
    }
  }, [currentOrderId]);

  useEffect(() => {
    localStorage.setItem('barGuestCount', guestCount.toString());
  }, [guestCount]);

  useEffect(() => {
    localStorage.setItem('barActiveCourse', activeCourse.toString());
  }, [activeCourse]);

  useEffect(() => {
    localStorage.setItem('barActiveSeat', activeSeat);
  }, [activeSeat]);

  // Aplicar promociones automáticamente cuando cambia el carrito
  useEffect(() => {
    console.log('🔄 useEffect promociones ejecutado:', { 
      cartLength: cart.length, 
      activePromotionsLength: activePromotions.length,
      activePromotions: activePromotions.map(p => ({ id: p.id, name: p.name, type: p.type, applyTo: p.applyTo }))
    });
    
    if (cart.length === 0 || activePromotions.length === 0) {
      console.log('⚠️ No se aplican promociones: cart.length =', cart.length, 'activePromotions.length =', activePromotions.length);
      return;
    }
    
    const cartWithPromotions = applyPromotions(cart, activePromotions);
    
    // Comparar si realmente hay cambios en las promociones
    const hasPromotionChanges = cartWithPromotions.some((item, index) => {
      const original = cart[index];
      if (!original) return false;
      return item.promotionId !== original.promotionId ||
             item.promotionDiscount !== original.promotionDiscount ||
             item.promotionName !== original.promotionName;
    });
    
    console.log('🔍 hasPromotionChanges:', hasPromotionChanges);
    console.log('📋 Items con promoción en cartWithPromotions:', cartWithPromotions.filter(i => i.promotionId).map(i => ({
      name: i.productName,
      qty: i.quantity,
      promotionId: i.promotionId,
      promotionName: i.promotionName,
      promotionDiscount: i.promotionDiscount
    })));
    
    if (hasPromotionChanges) {
      console.log('✅ Promociones aplicadas al carrito - actualizando state');
      setCart(cartWithPromotions);
    } else {
      console.log('⚠️ No hay cambios en promociones, no se actualiza el state');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    // Crear una clave que cambie cuando cambian cantidades o productos
    cart.map(item => `${item.productId}-${item.quantity}-${item.unitPrice}`).join(','),
    activePromotions.length
  ])

  // Polling para actualizar estado de items del carrito automáticamente
  useEffect(() => {
    if (!selectedTable && !customerName) return; // No hay mesa/orden activa
    if (cart.length === 0) return; // No hay items
    
    const interval = setInterval(async () => {
      try {
        // Obtener IDs únicos de órdenes en el carrito
        const orderIds = [...new Set(cart.filter(item => item.orderId).map(item => item.orderId))];
        
        if (orderIds.length === 0) return;
        
        // Consultar estado de cada orden
        for (const orderId of orderIds) {
          const res = await fetch(`/api/orders/${orderId}`);
          if (res.ok) {
            const order = await res.json();
            
            // Actualizar estado de items en el carrito
            setCart(prevCart => {
              return prevCart.map(item => {
                if (item.orderId === orderId) {
                  // Buscar el item correspondiente en la orden
                  const orderItem = order.items?.find((oi: any) => oi.id === item.itemId);
                  if (orderItem) {
                    return {
                      ...item,
                      orderStatus: order.status,
                      deliveredToTable: orderItem.deliveredToTable || false,
                    };
                  }
                }
                return item;
              });
            });
          }
        }
      } catch (error) {
        console.error('Error polling order status:', error);
      }
    }, 3000); // Cada 3 segundos
    
    return () => clearInterval(interval);
  }, [cart.length, selectedTable, customerName]);

  useEffect(() => {
    const updateActivity = () => setLastActivity(Date.now());
    
    window.addEventListener('click', updateActivity);
    window.addEventListener('keydown', updateActivity);
    window.addEventListener('touchstart', updateActivity);
    
    return () => {
      window.removeEventListener('click', updateActivity);
      window.removeEventListener('keydown', updateActivity);
      window.removeEventListener('touchstart', updateActivity);
    };
  }, []);

  function restoreSession() {
    const savedSession = localStorage.getItem('barSession');
    if (savedSession) {
      try {
        const session = JSON.parse(savedSession);
        const now = Date.now();
        const sessionAge = now - session.timestamp;
        const TEN_MINUTES = 10 * 60 * 1000;
        
        if (sessionAge < TEN_MINUTES) {
          setEmployeeId(session.employeeId);
          setEmployeeName(session.employeeName);
          setShowDashboard(false);
          setLastActivity(session.timestamp);
          fetchData();
        } else {
          localStorage.removeItem('barSession');
        }
      } catch (error) {
        console.error('Error restoring session:', error);
        localStorage.removeItem('barSession');
      }
    }
  }

  function saveSession(empId: string, empName: string) {
    const session = {
      employeeId: empId,
      employeeName: empName,
      timestamp: Date.now()
    };
    localStorage.setItem('barSession', JSON.stringify(session));
  }

  function handleSessionExpired() {
    localStorage.removeItem('barSession');
    setEmployeeId(null);
    setEmployeeName('');
    setShowDashboard(true);
    setCart([]);
    setActiveCourse(1);
    toast.error('Sesión expirada por inactividad');
  }

  async function checkCashRegister() {
    try {
      const res = await fetch('/api/cash-register/current');
      if (res.ok) {
        const data = await res.json();
        const isOpen = !!data;
        setCashRegisterOpen(isOpen);
      } else {
        setCashRegisterOpen(false);
      }
    } catch (error) {
      console.error('Error checking cash register:', error);
      setCashRegisterOpen(false);
    } finally {
      setCheckingRegister(false);
    }
  }

  function handleOpenComanda() {
    if (!cashRegisterOpen) {
      toast.error('La caja está cerrada. Abre la caja registradora primero.');
      return;
    }
    setAuthStep('pin');
  }

  function handleNumberClick(num: string) {
    if (authStep === 'pin') {
      if (pin.length < 4) {
        setPin(prev => prev + num);
      }
    }
  }

  function handleBackspace() {
    if (authStep === 'pin') {
      setPin(prev => prev.slice(0, -1));
    }
  }

  function handleClear() {
    if (authStep === 'pin') {
      setPin('');
    }
  }

  async function handlePinSubmit() {
    if (pin.length !== 4) {
      toast.error('Ingresa un PIN válido (4 dígitos)');
      return;
    }

    setAuthenticating(true);
    try {
      const res = await fetch('/api/employees/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'PIN inválido');
      }

      const data = await res.json();
      handlePinSuccess(data.employee.id, data.employee.name);
    } catch (error: any) {
      toast.error(error.message || 'Error al autenticar');
      setPin('');
    } finally {
      setAuthenticating(false);
    }
  }

  function handleCancel() {
    setAuthStep('idle');
    setPin('');
  }

  async function fetchTables() {
    try {
      const res = await fetch("/api/tables");
      if (res.ok) {
        const data = await res.json();
        setTables(data);
        // Verificar qué mesas tienen items ready
        await checkTablesWithReadyItems(data);
      }
    } catch (error) {
      console.error('Error fetching tables:', error);
      toast.error("Error cargando mesas");
    }
  }

  async function checkTablesWithReadyItems(tablesToCheck: Table[]) {
    try {
      const tablesWithReady = new Set<string>();
      
      // Verificar cada mesa ocupada
      for (const table of tablesToCheck) {
        if (table.status === "occupied") {
          const ordersRes = await fetch(`/api/orders?tableId=${table.id}&status=ready`);
          if (ordersRes.ok) {
            const orders = await ordersRes.json();
            if (orders.length > 0) {
              tablesWithReady.add(table.id);
            }
          }
        }
      }
      
      setTablesWithReadyItems(tablesWithReady);
    } catch (error) {
      console.error('Error checking tables with ready items:', error);
    }
  }

  async function fetchDeliveryOrders() {
    try {
      // Cargar órdenes Para Llevar activas (sin mesa, status preparing, ready o pending, NO pagadas)
      const res = await fetch("/api/orders?status=preparing,ready,pending&noTable=true");
      if (res.ok) {
        const deliveryOnly = await res.json();
        // Filtrar solo las que NO están pagadas ni entregadas
        const activeOnly = deliveryOnly.filter((order: any) => 
          order.paymentStatus !== 'paid' && order.status !== 'delivered'
        );
        
        // Separar entre Para Llevar y Delivery de plataforma
        const regularTakeout = activeOnly.filter((order: any) => 
          !order.customerName?.startsWith('Uber') && !order.customerName?.startsWith('Rappi') && !order.customerName?.startsWith('Didi')
        );
        const platformDelivery = activeOnly.filter((order: any) => 
          order.customerName?.startsWith('Uber') || order.customerName?.startsWith('Rappi') || order.customerName?.startsWith('Didi')
        );
        
        // Agrupar órdenes por customerName para no mostrar duplicados en el panel
        // Cuando hay múltiples envíos a cocina, se crean varias órdenes con el mismo nombre
        // En el panel solo mostramos UNA entrada por cliente (la primera orden como representante)
        const groupByName = (orders: any[]) => {
          const grouped = new Map<string, any>();
          for (const order of orders) {
            const key = order.customerName || order.id;
            if (!grouped.has(key)) {
              // Guardar la primera orden como representante, con referencia a todas las hermanas
              grouped.set(key, { ...order, _siblingOrderIds: [order.id] });
            } else {
              // Agregar el ID de esta orden a las hermanas
              grouped.get(key)._siblingOrderIds.push(order.id);
            }
          }
          return Array.from(grouped.values());
        };
        
        setDeliveryOrders(groupByName(regularTakeout));
        setPlatformDeliveryOrders(groupByName(platformDelivery));
      }
    } catch (error) {
      console.error('Error fetching delivery orders:', error);
    }
  }

  async function fetchActivePromotions() {
    try {
      const res = await fetch("/api/promotions/active");
      if (res.ok) {
        const data = await res.json();
        setActivePromotions(data);
        console.log('✅ Promociones activas cargadas:', data.length);
      }
    } catch (error) {
      console.error('Error fetching active promotions:', error);
    }
  }

  async function fetchAvailableDiscounts() {
    try {
      const res = await fetch("/api/discounts?active=true");
      if (res.ok) {
        const data = await res.json();
        setAvailableDiscounts(data);
        console.log('✅ Descuentos disponibles:', data.length);
      }
    } catch (error) {
      console.error('Error fetching available discounts:', error);
    }
  }

  async function handleSelectTable(table: Table) {
    setSelectedTable(table);
    setShowTableSelection(false);
    setCustomerName("");
    // Cargar guestCount persistido de la mesa
    setGuestCount((table as any).guestCount || 1);
    setTempGuestCount((table as any).guestCount || 1);
    
    // Cargar todas las órdenes de la mesa (preparing, ready, pending)
    try {
      console.log("📋 Cargando órdenes de mesa:", table.id);
      
      // Buscar órdenes de esta mesa con status preparing, ready o pending
      const ordersRes = await fetch(`/api/orders?tableId=${table.id}&status=preparing,ready,pending`);
      
      if (ordersRes.ok) {
        const orders = await ordersRes.json();
        console.log("📦 Órdenes encontradas:", orders);
        console.log("📊 Cantidad de órdenes:", orders.length);
        orders.forEach((order: any) => {
          console.log(`  - Orden ${order.id}: status=${order.status}, items=${order.items?.length || 0}, paymentStatus=${order.paymentStatus}`);
        });
        
        // Verificar si hay órdenes con status delivered (no deberían aparecer)
        const deliveredOrders = orders.filter((o: any) => o.status === 'delivered');
        if (deliveredOrders.length > 0) {
          console.error("⚠️ ERROR: Se encontraron órdenes con status 'delivered' que no deberían estar aquí:", deliveredOrders);
        }
        
        if (orders.length > 0) {
          // Combinar todos los items de todas las órdenes
          const allCartItems: CartItem[] = [];
          
          for (const order of orders) {
            console.log(`🔄 Procesando orden ${order.id} con status ${order.status}`);
            const items = order.items
              .filter((item: any) => !item.voided) // Excluir items eliminados
              .map((item: any) => ({
                productId: item.productId,
                productName: item.productName,
                unitPrice: parseFloat(item.unitPrice),
                quantity: item.quantity,
                notes: item.notes || "",
                frostingId: item.frostingId,
                frostingName: item.frostingName,
                dryToppingId: item.dryToppingId,
                dryToppingName: item.dryToppingName,
                extraId: item.extraId,
                extraName: item.extraName,
                customModifiers: item.customModifiers,
                sentToKitchen: order.status === "preparing" || order.status === "ready" || order.status === "delivered", // Marcar como enviados
                orderStatus: order.status, // Guardar status para mostrar badge correcto
                orderId: order.id, // Guardar ID de la orden
                itemId: item.id, // Guardar ID del item en BD
                deliveredToTable: item.deliveredToTable || false, // Estado de entrega física
                seat: item.seat || "C", // Asiento del item
                course: item.course || 1,
                isBeverage: item.product?.category?.isBeverage || false,
              }));
            allCartItems.push(...items);
          }
          
          // Restaurar activeCourse al máximo curso existente
          const maxCourse = Math.max(...allCartItems.map(i => i.course || 1), 1);
          setActiveCourse(maxCourse);
          
          console.log("🛒 Items cargados al carrito:", allCartItems);
          setCart(allCartItems);
          setCurrentOrderId(orders[0].id); // Usar el ID de la primera orden
          
          // Restaurar estado de división de cuenta si existe
          const splitData = orders[0].splitBillData;
          if (splitData) {
            try {
              const parsed = typeof splitData === "string" ? JSON.parse(splitData) : splitData;
              if (parsed && parsed.itemAssignments) {
                setItemAssignments(parsed.itemAssignments);
                setIndividualPayments(parsed.individualPayments || {});
                setIndividualTips(parsed.individualTips || {});
                setGuestCount(parsed.guestCount || (table as any).guestCount || 1);
                setTempGuestCount(parsed.guestCount || (table as any).guestCount || 1);
                // Restaurar la vista de pago en el paso guardado
                setShowingPayment(true);
                setPaymentStep(parsed.paymentStep || "split-overview");
                toast.success(`División de cuenta restaurada para Mesa ${table.number}`);
              }
            } catch (e) {
              console.error("Error parsing splitBillData:", e);
            }
          } else {
            toast.success(`Cuenta de Mesa ${table.number} cargada (${allCartItems.length} items)`);
          }
        } else {
          // Mesa libre sin órdenes — pedir número de personas
          setActiveSeat("C");
          setShowInitialGuestDialog(true);
        }
      }
    } catch (error) {
      console.error('Error loading table orders:', error);
      toast.error("Error cargando cuenta de la mesa");
    }
  }

  function handleChangeTable() {
    setShowTableSelection(true);
    setSelectedTable(null);
    setCart([]);
    setActiveCourse(1);
    setActiveSeat("C");
    setCustomerName("");
    setCurrentOrderId(null);
    
    // Limpiar localStorage
    localStorage.removeItem('barCart');
    localStorage.removeItem('barSelectedTable');
    localStorage.removeItem('barCustomerName');
    localStorage.removeItem('barCurrentOrderId');
  }

  function handleNewDeliveryOrder() {
    setSelectedTable(null);
    setIsPlatformDelivery(false); // Para llevar normal, NO es plataforma
    setCustomerName("");
    setCart([]);
    setCurrentOrderId(null);
    setActiveCourse(1);
    setGuestCount(1);
    setShowTableSelection(false);
    // El modal se mostrará automáticamente en el useEffect
  }

  function handleNewPlatformDeliveryOrder() {
    setSelectedTable(null);
    setIsPlatformDelivery(true);
    setCustomerName("");
    setCart([]);
    setCurrentOrderId(null);
    setActiveCourse(1);
    setGuestCount(1);
    setShowTableSelection(false);
    // El modal se mostrará automáticamente en el useEffect
  }

  function handleConfirmCustomerName() {
    // Validar campos requeridos para delivery de plataforma
    if (isPlatformDelivery) {
      if (!deliveryPlatform) {
        toast.error("Por favor selecciona la plataforma");
        return;
      }
      if (platformOrderDigits.length !== 4) {
        toast.error("Por favor ingresa los 4 dígitos de la orden");
        return;
      }
      if (!customerName.trim()) {
        toast.error("Por favor ingresa el nombre del cliente");
        return;
      }
      
      // Formatear nombre con plataforma y dígitos: "Uber #1234 - Juan Pérez"
      const formattedName = `${deliveryPlatform} #${platformOrderDigits} - ${customerName.trim()}`;
      setCustomerName(formattedName);
    } else {
      // Para llevar normal
      if (!customerName.trim()) {
        toast.error("Por favor ingresa el nombre del cliente");
        return;
      }
    }
    
    setShowCustomerNameDialog(false);
    setCart([]);
    setCurrentOrderId(null);
    setActiveCourse(1);
    setGuestCount(1);
    setShowTableSelection(false);
    
    const orderType = isPlatformDelivery ? "Delivery" : "Para Llevar";
    const displayName = isPlatformDelivery ? `${deliveryPlatform} #${platformOrderDigits}` : customerName;
    toast.success(`Orden ${orderType} - ${displayName}`);
  }

  async function handleSelectDeliveryOrder(order: Order) {
    setSelectedTable(null);
    setShowTableSelection(false);
    setCustomerName(order.customerName || "");
    setCurrentOrderId(order.id);
    
    // Cargar TODAS las órdenes hermanas (múltiples envíos a cocina = múltiples órdenes)
    const siblingIds: string[] = (order as any)._siblingOrderIds || [order.id];
    
    try {
      // Fetch todas las órdenes hermanas en paralelo
      const responses = await Promise.all(
        siblingIds.map((id: string) => fetch(`/api/orders/${id}`).then(r => r.json()))
      );
      
      // Combinar items de todas las órdenes en un solo carrito
      const allCartItems: CartItem[] = [];
      for (const fullOrder of responses) {
        if (fullOrder && fullOrder.items) {
          const items: CartItem[] = fullOrder.items
            .filter((item: any) => !item.voided)
            .map((item: any) => ({
              productId: item.productId,
              productName: item.productName,
              unitPrice: parseFloat(item.unitPrice),
              quantity: item.quantity,
              notes: item.notes || "",
              frostingId: item.frostingId,
              frostingName: item.frostingName,
              dryToppingId: item.dryToppingId,
              dryToppingName: item.dryToppingName,
              extraId: item.extraId,
              extraName: item.extraName,
              customModifiers: item.customModifiers,
              sentToKitchen: fullOrder.status === "preparing" || fullOrder.status === "ready" || fullOrder.status === "delivered",
              orderStatus: fullOrder.status,
              orderId: fullOrder.id,
              itemId: item.id,
              deliveredToTable: item.deliveredToTable || false,
              seat: item.seat || "C",
              course: item.course || 1,
              isBeverage: item.product?.category?.isBeverage || false,
              isGuest: item.isGuest || false,
            }));
          allCartItems.push(...items);
        }
      }
      
      if (allCartItems.length > 0) {
        const maxCourse = Math.max(...allCartItems.map(i => i.course || 1), 1);
        setActiveCourse(maxCourse);
        setCart(allCartItems);
        
        // Restaurar estado de división de cuenta si existe (del primer orden)
        const splitData = responses[0]?.splitBillData;
        if (splitData) {
          try {
            const parsed = typeof splitData === "string" ? JSON.parse(splitData) : splitData;
            if (parsed && parsed.itemAssignments) {
              setItemAssignments(parsed.itemAssignments);
              setIndividualPayments(parsed.individualPayments || {});
              setIndividualTips(parsed.individualTips || {});
              setGuestCount(parsed.guestCount || 1);
              setTempGuestCount(parsed.guestCount || 1);
              setShowingPayment(true);
              setPaymentStep(parsed.paymentStep || "split-overview");
              toast.success(`División de cuenta restaurada`);
              return;
            }
          } catch (e) {
            console.error("Error parsing splitBillData:", e);
          }
        }
        
        toast.success(`Orden Para Llevar - ${order.customerName || `#${order.orderNumber}`} cargada (${allCartItems.length} items)`);
      }
    } catch (error) {
      console.error('Error loading delivery order:', error);
      toast.error("Error cargando orden");
    }
  }

  async function handleMarkAsDelivered(index: number) {
    const item = cart[index];
    if (!item.itemId) {
      toast.error("No se puede marcar este item");
      return;
    }
    
    try {
      // Actualizar deliveredToTable en BD
      const res = await fetch(`/api/order-items/${item.itemId}/delivered`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deliveredToTable: true }),
      });
      
      if (!res.ok) throw new Error();
      
      // Actualizar en estado local
      const updatedCart = [...cart];
      updatedCart[index] = {
        ...updatedCart[index],
        deliveredToTable: true,
      };
      
      setCart(updatedCart);
      toast.success("Platillo marcado como entregado");
    } catch (error) {
      console.error('Error marking as delivered:', error);
      toast.error("Error al marcar como entregado");
    }
  }

  async function handleReleaseTable() {
    const orderType = selectedTable ? `Mesa ${selectedTable.number}` : `Orden Para Llevar - ${customerName}`;
    
    // Confirmar si hay items en el carrito
    if (cart.length > 0) {
      const confirmed = window.confirm(
        `¿Liberar ${orderType}?\n\nHay ${cart.length} items en el carrito que se perderán.`
      );
      if (!confirmed) return;
    }

    try {
      // Solo eliminar la orden ACTUAL de esta sesión (currentOrderId)
      // NO tocar órdenes anteriores de la mesa
      if (currentOrderId) {
        console.log(`🗑️ Liberando sesión actual - Eliminando orden: ${currentOrderId}`);
        await fetch(`/api/orders/${currentOrderId}`, { method: "DELETE" });
      }
      
      // Si hay mesa, actualizar estado a "available" y resetear guestCount
      if (selectedTable) {
        await fetch(`/api/tables/${selectedTable.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...selectedTable,
            status: "available",
            guestCount: 1,
          }),
        });
      }

      toast.success(`${orderType} liberada`);
      
      // Volver a selección de mesas
      setShowTableSelection(true);
      setSelectedTable(null);
      setCart([]);
      setActiveCourse(1);
      setActiveSeat("C");
      setCustomerName("");
      setCurrentOrderId(null);
      
      // Limpiar localStorage
      localStorage.removeItem('barCart');
      localStorage.removeItem('barSelectedTable');
      localStorage.removeItem('barCustomerName');
      localStorage.removeItem('barCurrentOrderId');
      
      // Recargar mesas y delivery orders
      fetchTables();
      fetchDeliveryOrders();
    } catch (error) {
      toast.error("Error liberando orden");
    }
  }

  async function handleSendToKitchen() {
    console.log("🍳 handleSendToKitchen called");
    
    // Verificar que hay items pendientes de enviar
    const pendingItems = cart.filter(item => !item.sentToKitchen);
    
    if (pendingItems.length === 0) {
      toast.error("No hay items pendientes para enviar a cocina");
      return;
    }

    const itemsData = pendingItems.map(item => ({
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      notes: item.notes || "",
      frostingId: item.frostingId || null,
      frostingName: item.frostingName || null,
      dryToppingId: item.dryToppingId || null,
      dryToppingName: item.dryToppingName || null,
      extraId: item.extraId || null,
      extraName: item.extraName || null,
      customModifiers: item.customModifiers || null,
      seat: item.seat || "C",
      course: item.course || 1,
      isGuest: item.isGuest || false,
    }));

    try {
      let orderId: string;
      
      if (currentOrderId) {
        // Ya hay orden → añadir items a la misma
        console.log("📦 Añadiendo items a orden existente:", currentOrderId);
        const res = await fetch(`/api/orders/${currentOrderId}/items`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: itemsData }),
        });
        if (!res.ok) throw new Error("Error adding items");
        orderId = currentOrderId;
      } else {
        // Primera vez → crear orden
        console.log("🆕 Creando orden con", pendingItems.length, "items");
        const res = await fetch("/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tableId: selectedTable?.id || null,
            items: itemsData,
            status: "preparing",
            paymentMethod: null,
            loyaltyCardId: null,
            customerName: customerName || null,
          }),
        });
        if (!res.ok) throw new Error("Error creating order");
        const createdOrder = await res.json();
        orderId = createdOrder.id;
        setCurrentOrderId(orderId);
      }
      
      // Actualizar estado de la mesa a "occupied" solo si hay mesa seleccionada
      if (selectedTable) {
        await fetch(`/api/tables/${selectedTable.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...selectedTable,
            status: "occupied",
          }),
        });
      }

      // Marcar items como enviados a cocina en el carrito local
      const updatedCart: CartItem[] = cart.map(item => 
        item.sentToKitchen ? item : { ...item, sentToKitchen: true, orderId: orderId, orderStatus: "preparing" as const } as CartItem
      );
      setCart(updatedCart);
      
      const orderType = selectedTable ? `Mesa ${selectedTable.number}` : "Para Llevar";
      toast.success(`${pendingItems.length} items enviados a cocina (${orderType})`);
      
      // Imprimir comanda en cocina (fire-and-forget)
      try {
        const printServerUrl = process.env.NEXT_PUBLIC_PRINT_SERVER_URL || "http://192.168.0.152:3001";
        fetch(`${printServerUrl}/print-comanda`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tableNumber: selectedTable?.number || null,
            orderNumber: orderId?.slice(0, 8) || "",
            customerName: !selectedTable ? (customerName || null) : null,
            items: pendingItems.map(item => ({
              name: item.productName,
              qty: item.quantity,
              notes: item.notes || null,
            })),
          }),
        }).catch(err => console.warn("⚠️ Error imprimiendo comanda:", err));
      } catch (printErr) {
        console.warn("⚠️ Error imprimiendo comanda:", printErr);
      }

      // Recargar órdenes delivery si es Para Llevar
      if (!selectedTable) {
        fetchDeliveryOrders();
      }
    } catch (error) {
      toast.error("Error enviando a cocina");
      console.error("Error:", error);
    }
  }

  async function fetchData() {
    try {
      // Cargar categorías y datos esenciales al inicio
      const [categoriesRes, frostingsRes, toppingsRes, extrasRes] = await Promise.all([
        fetch("/api/categories"),
        fetch("/api/frostings"),
        fetch("/api/dry-toppings"),
        fetch("/api/extras"),
      ]);
      
      if (categoriesRes.ok) setCategories(await categoriesRes.json());
      if (frostingsRes.ok) setFrostings(await frostingsRes.json());
      if (toppingsRes.ok) setToppings(await toppingsRes.json());
      if (extrasRes.ok) setExtras(await extrasRes.json());
      
      // Cargar productos en segundo plano (sin caché por quota issues)
      fetchAndCacheProducts();
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error("Error cargando datos");
    } finally {
      setLoading(false);
    }
  }
  
  async function fetchAndCacheProducts() {
    try {
      const productsRes = await fetch("/api/products?active=true");
      if (productsRes.ok) {
        const productsData = await productsRes.json();
        setProducts(productsData);
        // No guardar en localStorage - causa quota exceeded error
      }
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  }

  // Cargar flujo de categoría y productos si no están cargados
  async function loadCategoryFlow(categoryId: string) {
    try {
      // Si no hay productos cargados aún, cargarlos ahora
      if (products.length === 0) {
        fetchAndCacheProducts();
      }
      
      const res = await fetch(`/api/categories/${categoryId}/flow`);
      if (res.ok) {
        const flow = await res.json();
        setCategoryFlow(flow);
      }
    } catch (error) {
      console.error("Error loading category flow:", error);
      // Usar flujo predeterminado en caso de error
      setCategoryFlow({
        categoryId,
        useDefaultFlow: true,
        steps: [],
      });
    }
  }

  // Agregar producto directamente al carrito (flujo simplificado)
  function handleProductClick(product: Product) {
    // Si el producto tiene variantes, mostrar dialog de selección
    if (product.hasVariants && product.variants) {
      setSelectedProductForVariant(product);
      setShowVariantDialog(true);
      return;
    }

    // Si la categoría tiene un flujo personalizado con pasos, iniciar el flujo
    if (categoryFlow && !categoryFlow.useDefaultFlow && categoryFlow.steps.length > 0) {
      setSelectedProduct(product);
      setStepSelections({});
      setSelectedFrosting(null);
      setSelectedTopping(null);
      setSelectedExtras([]);
      setProductNotes("");
      setCurrentStepIndex(0);
      return;
    }

    // Sin flujo personalizado: crear item y mostrar diálogo de comentarios
    // Usar precio de plataforma si es delivery de plataforma (Uber/Rappi/Didi)
    const isPlatform = customerName && (customerName.startsWith('Uber') || customerName.startsWith('Rappi') || customerName.startsWith('Didi'));
    const priceToUse = isPlatform && product.platformPrice ? parseFloat(product.platformPrice) : parseFloat(product.price);
    
    if (isPlatform) {
      console.log(`🚨 Producto ${product.name}:`, {
        isPlatform,
        hasPlatformPrice: !!product.platformPrice,
        platformPrice: product.platformPrice,
        normalPrice: product.price,
        priceUsed: priceToUse,
      });
    }
    
    const newItem: CartItem = {
      productId: product.id,
      productName: product.name,
      unitPrice: priceToUse,
      quantity: 1,
      notes: "",
      frostingId: undefined,
      frostingName: undefined,
      dryToppingId: undefined,
      dryToppingName: undefined,
      extraId: undefined,
      extraName: undefined,
      customModifiers: null,
    };
    setPendingCartItem(newItem);
    setTempNotes("");
    setShowNotesDialog(true);
  }

  // Agregar producto con variante seleccionada
  function handleAddVariant(variantName: string, variantPrice: string, variantPlatformPrice?: string) {
    if (!selectedProductForVariant) return;

    // Usar precio de plataforma si es delivery de plataforma (Uber/Rappi/Didi)
    const isPlatform = customerName && (customerName.startsWith('Uber') || customerName.startsWith('Rappi') || customerName.startsWith('Didi'));
    const priceToUse = isPlatform && variantPlatformPrice ? parseFloat(variantPlatformPrice) : parseFloat(variantPrice);

    const newItem: CartItem = {
      productId: selectedProductForVariant.id,
      productName: `${selectedProductForVariant.name} - ${variantName}`,
      unitPrice: priceToUse,
      quantity: 1,
      notes: "",
      frostingId: undefined,
      frostingName: undefined,
      dryToppingId: undefined,
      dryToppingName: undefined,
      extraId: undefined,
      extraName: undefined,
      customModifiers: null,
    };
    
    // Cerrar diálogo de variantes y abrir diálogo de comentarios
    setShowVariantDialog(false);
    setPendingCartItem(newItem);
    setTempNotes("");
    setShowNotesDialog(true);
  }
  
  // Confirmar y agregar item con comentarios al carrito
  function handleConfirmNotes() {
    if (!pendingCartItem) return;
    
    const isBev = pendingCartItem.productId 
      ? categories.find(c => c.id === products.find(p => p.id === pendingCartItem.productId)?.categoryId)?.isBeverage || false
      : false;
    const itemWithNotes = {
      ...pendingCartItem,
      notes: tempNotes.trim(),
      seat: selectedTable ? activeSeat : "C",
      course: activeCourse,
      isBeverage: isBev,
    };
    
    setCart([...cart, itemWithNotes]);
    toast.success(`${pendingCartItem.productName} agregado`);
    
    // Limpiar estados
    setShowNotesDialog(false);
    setPendingCartItem(null);
    setTempNotes("");
    setSelectedProductForVariant(null);
  }
  
  // Cancelar diálogo de comentarios
  function handleCancelNotes() {
    setShowNotesDialog(false);
    setPendingCartItem(null);
    setTempNotes("");
    setSelectedProductForVariant(null);
  }

  // Abrir dialog de personalización para un item del carrito
  function handleCustomizeItem(index: number) {
    const item = cart[index];
    setSelectedProduct(products.find(p => p.id === item.productId) || null);
    setProductNotes(item.notes || "");
    // Aquí podrías abrir un dialog de personalización si lo necesitas
  }

  function handleStepSelection(selection: any) {
    if (!categoryFlow || currentStepIndex < 0) return;
    
    const currentStep = categoryFlow.steps[currentStepIndex];
    
    // Support multi-select for custom steps
    if (currentStep.stepType === "custom" && currentStep.allowMultiple) {
      const current = (stepSelections[currentStep.id] as ModifierOption[]) || [];
      let next: ModifierOption[];
      if (selection === null) {
        next = [];
      } else {
        const exists = current.find((o: any) => o.id === selection.id);
        if (exists) {
          next = current.filter((o: any) => o.id !== selection.id);
        } else {
          next = [...current, selection];
        }
      }
      setStepSelections({
        ...stepSelections,
        [currentStep.id]: next,
      });
      return; // Don't auto-advance for multi-select
    }
    
    // Guardar selección del paso actual
    setStepSelections({
      ...stepSelections,
      [currentStep.id]: selection,
    });
    
    // Avanzar al siguiente paso o mostrar pantalla de notas
    if (currentStepIndex < categoryFlow.steps.length - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
    } else {
      // Último paso completado, mostrar pantalla de notas
      setCurrentStepIndex(categoryFlow.steps.length); // Índice especial para notas
    }
  }

  function advanceToNextStep() {
    if (!categoryFlow || currentStepIndex < 0) return;
    if (currentStepIndex < categoryFlow.steps.length - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
    } else {
      setCurrentStepIndex(categoryFlow.steps.length);
    }
  }

  function finishFlowAndAddToCart() {
    if (!selectedProduct || !categoryFlow) return;

    // Usar precio de plataforma si es delivery de plataforma (Uber/Rappi/Didi)
    const isPlatform = customerName && (customerName.startsWith('Uber') || customerName.startsWith('Rappi') || customerName.startsWith('Didi'));
    const basePrice = isPlatform && selectedProduct.platformPrice ? parseFloat(selectedProduct.platformPrice) : parseFloat(selectedProduct.price);
    
    // Calcular precio total con modificadores custom
    let totalPrice = basePrice;
    const customModifiersData: Record<string, any> = {};

    categoryFlow.steps.forEach((step) => {
      const selection = stepSelections[step.id];
      if (!selection) return;

      if (step.stepType === "custom" && step.options) {
        // Para pasos custom, guardar en customModifiers y sumar precio
        const selectedOptions = Array.isArray(selection) ? selection : [selection];
        if (selectedOptions.length > 0) {
          customModifiersData[step.id] = {
            stepName: step.stepName,
            options: selectedOptions.map((opt: ModifierOption) => {
              totalPrice += parseFloat(opt.price);
              return {
                id: opt.id,
                name: opt.name,
                price: opt.price,
              };
            }),
          };
        }
      } else if (step.stepType === "extra") {
        // Para extras, sumar precio
        const selectedExtras = Array.isArray(selection) ? selection : [selection];
        selectedExtras.forEach((extra: Extra) => {
          totalPrice += parseFloat(extra.price);
        });
      }
    });

    const isBev = categories.find(c => c.id === selectedProduct.categoryId)?.isBeverage || false;
    const newItem: CartItem = {
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      unitPrice: totalPrice,
      quantity: 1,
      notes: productNotes,
      frostingId: selectedFrosting?.id,
      frostingName: selectedFrosting?.name,
      dryToppingId: selectedTopping?.id,
      dryToppingName: selectedTopping?.name,
      extraId: selectedExtras.length > 0 ? selectedExtras[0].id : undefined,
      extraName: selectedExtras.length > 0 ? selectedExtras[0].name : undefined,
      customModifiers: Object.keys(customModifiersData).length > 0 ? JSON.stringify(customModifiersData) : null,
      seat: selectedTable ? activeSeat : "C",
      course: activeCourse,
      isBeverage: isBev,
    };

    // Buscar si ya existe un item idéntico en el carrito (mismo producto, mismos mods, mismo asiento)
    const existingItemIndex = cart.findIndex((item) => 
      item.productId === newItem.productId &&
      item.frostingId === newItem.frostingId &&
      item.dryToppingId === newItem.dryToppingId &&
      item.extraId === newItem.extraId &&
      item.customModifiers === newItem.customModifiers &&
      item.seat === newItem.seat
    );

    if (existingItemIndex >= 0) {
      // Si existe, incrementar cantidad
      const updatedCart = [...cart];
      updatedCart[existingItemIndex].quantity += 1;
      setCart(updatedCart);
      toast.success(`${selectedProduct.name} agregado (${updatedCart[existingItemIndex].quantity})`);
    } else {
      // Si no existe, agregar nuevo item
      setCart([...cart, newItem]);
      toast.success(`${selectedProduct.name} agregado`);
    }
    
    resetFlow();
  }

  function resetFlow() {
    setCurrentStepIndex(-1);
    setSelectedProduct(null);
    setStepSelections({});
    setSelectedFrosting(null);
    setSelectedTopping(null);
    setSelectedExtras([]);
    setProductNotes("");
  }

  function handleBackInFlow() {
    if (currentStepIndex === 0) {
      resetFlow();
    } else if (currentStepIndex > 0) {
      setCurrentStepIndex(currentStepIndex - 1);
    }
  }

  function toggleExtra(extra: Extra) {
    if (selectedExtras.find(e => e.id === extra.id)) {
      setSelectedExtras(selectedExtras.filter(e => e.id !== extra.id));
    } else {
      setSelectedExtras([...selectedExtras, extra]);
    }
  }

  function updateQuantity(index: number, delta: number) {
    const item = cart[index];
    if (!item) return;

    // No permitir editar items enviados a cocina
    if (item.sentToKitchen) {
      toast.error("No se puede modificar un item ya enviado a cocina");
      return;
    }

    const newQty = item.quantity + delta;
    if (newQty <= 0) {
      removeFromCart(index);
    } else {
      const updatedCart = [...cart];
      updatedCart[index] = { ...updatedCart[index], quantity: newQty };
      setCart(updatedCart);
    }
  }

  function removeFromCart(index: number) {
    const item = cart[index];
    
    // Si el item fue enviado a cocina, pedir razón antes de eliminar
    if (item && item.sentToKitchen) {
      setVoidItemIndex(index);
      setVoidReason("");
      setShowVoidDialog(true);
      return;
    }
    
    setCart(cart.filter((_, i) => i !== index));
  }

  async function handleVoidItem() {
    if (voidItemIndex === null) return;
    const item = cart[voidItemIndex];
    if (!item) return;

    try {
      // Si el item tiene itemId en BD, marcarlo como voided
      if (item.itemId) {
        await fetch(`/api/orders/${item.orderId}/items/${item.itemId}/void`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            voidReason: voidReason || "Sin razón especificada",
            voidedBy: employeeId,
          }),
        });
      }

      // Remover del carrito local
      setCart(cart.filter((_, i) => i !== voidItemIndex));
      toast.success(`Item eliminado: ${item.productName} — ${voidReason || "Sin razón"}`);
    } catch (error) {
      console.error("Error voiding item:", error);
      toast.error("Error al eliminar item");
    } finally {
      setShowVoidDialog(false);
      setVoidItemIndex(null);
      setVoidReason("");
    }
  }

  // Camera functions
  async function startCamera() {
    try {
      // Verificar contexto seguro (HTTPS)
      if (typeof window !== 'undefined' && !window.isSecureContext) {
        toast.error("La cámara requiere HTTPS. Usa el input manual.");
        return;
      }

      // Check if getUserMedia is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        toast.error("Tu navegador no soporta acceso a la cámara. Usa el input manual.");
        return;
      }

      console.log("📷 Solicitando acceso a cámara...");

      // Constraints más flexibles para iPad
      const constraints = {
        video: {
          facingMode: { ideal: "environment" }, // ideal en lugar de exact
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log("✅ Stream obtenido:", stream.getVideoTracks());
      
      // Guardar stream inmediatamente
      streamRef.current = stream;
      
      // Activar cámara PRIMERO para que el video se monte en el DOM
      setCameraActive(true);
      
      console.log("🔍 Verificando videoRef.current:", videoRef.current);
      
      // Esperar un pequeño delay para que el video se monte en el DOM
      await new Promise(resolve => setTimeout(resolve, 100));
      
      console.log("🔍 Verificando videoRef.current después del delay:", videoRef.current);
      
      if (videoRef.current) {
        console.log("✅ videoRef.current existe, asignando stream...");
        videoRef.current.srcObject = stream;
        
        console.log("📹 Stream asignado al video. Dimensiones del track:", 
          stream.getVideoTracks()[0].getSettings());
        
        // Protección contra cierre automático en iPad
        const videoTrack = stream.getVideoTracks()[0];
        videoTrack.addEventListener('ended', () => {
          console.warn("⚠️ Video track terminado inesperadamente - posible cierre automático de iPad");
          toast.error("La cámara se detuvo. Por favor, abre la cámara de nuevo.");
          setCameraActive(false);
        });
        
        // Prevenir pause automático en iPad
        const handlePause = (e: Event) => {
          console.warn("⚠️ Video pausado - reintentando reproducir...");
          if (videoRef.current && cameraActive) {
            videoRef.current.play().catch(err => {
              console.error("❌ No se pudo reanudar video:", err);
            });
          }
        };
        
        videoRef.current.addEventListener('pause', handlePause);
        
        // Esperar a que el video cargue metadata
        const handleLoadedMetadata = () => {
          console.log("✅ Video metadata cargada. VideoWidth:", 
            videoRef.current?.videoWidth, 
            "VideoHeight:", 
            videoRef.current?.videoHeight);
        };
        
        videoRef.current.addEventListener('loadedmetadata', handleLoadedMetadata, { once: true });
        
        // Esperar a que el video esté listo y reproducirlo explícitamente
        try {
          await videoRef.current.play();
          console.log("✅ Video reproduciendo");
          
          // Start scanning después de un pequeño delay para asegurar que el video esté listo
          setTimeout(() => scanQRCode(), 100);
        } catch (playError) {
          console.error("❌ Error al reproducir video:", playError);
          toast.error("Error al iniciar video. Intenta de nuevo.");
          // Limpiar stream si falla el play
          stream.getTracks().forEach(track => track.stop());
          streamRef.current = null;
          setCameraActive(false);
        }
      } else {
        console.error("❌ videoRef.current es NULL después del delay!");
        toast.error("Error: elemento de video no disponible");
        stream.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        setCameraActive(false);
      }
    } catch (error: any) {
      console.error("❌ Error accessing camera:", error);
      
      // Manejo específico de errores para iPad
      if (error.name === 'NotAllowedError') {
        toast.error("Permiso de cámara denegado. Por favor permite el acceso en Configuración.");
      } else if (error.name === 'NotFoundError') {
        toast.error("No se encontró cámara. Verifica que tu dispositivo tenga cámara.");
      } else if (error.name === 'NotReadableError') {
        toast.error("La cámara está en uso por otra aplicación. Ciérrala e intenta de nuevo.");
      } else if (error.name === 'OverconstrainedError') {
        toast.error("Configuración de cámara no soportada. Usando input manual.");
      } else {
        toast.error(`Error de cámara: ${error.message || 'Desconocido'}. Usa el input manual.`);
      }
    }
  }

  function stopCamera() {
    scanningRef.current = false;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }

  async function scanQRCode() {
    if (!videoRef.current || !canvasRef.current) return;
    
    scanningRef.current = true;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    
    if (!context) return;

    // Load jsQR dynamically
    if (!(window as any).jsQR) {
      try {
        await loadJsQR();
      } catch (error) {
        console.error("Error loading jsQR:", error);
        toast.error("Error cargando detector de QR");
        return;
      }
    }

    const scan = () => {
      if (!scanningRef.current || video.readyState !== video.HAVE_ENOUGH_DATA) {
        if (scanningRef.current) {
          requestAnimationFrame(scan);
        }
        return;
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      
      const code = (window as any).jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "dontInvert",
      });

      if (code) {
        console.log("✅ QR detectado:", code.data);
        scanningRef.current = false;
        stopCamera();
        
        // Buscar cliente automáticamente
        handleQRCodeDetected(code.data);
        return;
      }

      if (scanningRef.current) {
        requestAnimationFrame(scan);
      }
    };

    requestAnimationFrame(scan);
  }

  async function loadJsQR() {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  // Clean up camera on unmount or dialog close
  useEffect(() => {
    if (!qrDialogOpen && cameraActive) {
      stopCamera();
    }
  }, [qrDialogOpen]);

  // Loyalty card functions
  async function handleQRCodeDetected(code: string) {
    if (!code.trim()) {
      toast.error("Código QR inválido");
      return;
    }

    setLoadingCard(true);
    try {
      console.log("🔍 Buscando cliente con código:", code);
      const res = await fetch(`/api/loyalty/search?barcode=${encodeURIComponent(code)}`);
      
      if (!res.ok) {
        toast.error("Tarjeta no encontrada");
        setQrCode("");
        return;
      }
      
      const card = await res.json();
      console.log("✅ Cliente encontrado:", card);
      setLoyaltyCard(card);
      setQrDialogOpen(false);
      setQrCode("");
      toast.success(`Cliente: ${card.customerName}`);
      
      // Si estamos en el paso de loyalty, avanzar automáticamente a pago
      if (showingLoyaltyStep) {
        skipLoyaltyAndProceedToPayment();
      }
    } catch (error) {
      console.error("❌ Error buscando tarjeta:", error);
      toast.error("Error al buscar tarjeta");
      setQrCode("");
    } finally {
      setLoadingCard(false);
    }
  }

  async function handleQRSubmit() {
    if (!qrCode.trim()) {
      toast.error("Ingresa el código QR");
      return;
    }

    await handleQRCodeDetected(qrCode);
  }

  async function handleManualStampSubmit() {
    if (!manualBarcodeInput.trim()) {
      toast.error("Ingresa el código de barras");
      return;
    }

    setLoadingCard(true);
    try {
      const res = await fetch(`/api/loyalty-cards/barcode/${manualBarcodeInput}`);
      if (!res.ok) {
        toast.error("Tarjeta no encontrada");
        return;
      }
      
      const card = await res.json();
      
      // Agregar sello
      const stampRes = await fetch(`/api/loyalty-cards/${card.id}/stamp`, {
        method: "POST",
      });

      if (!stampRes.ok) {
        toast.error("Error al agregar sello");
        return;
      }

      const updated = await stampRes.json();
      toast.success(`Sello agregado a ${card.customerName}`);
      setManualStampDialogOpen(false);
      setManualBarcodeInput("");
    } catch (error) {
      toast.error("Error al procesar sello");
    } finally {
      setLoadingCard(false);
    }
  }

  async function handleCheckout() {
    if (cart.length === 0) {
      toast.error("El carrito está vacío");
      return;
    }
    if (!employeeId) {
      toast.error("No hay empleado autenticado");
      return;
    }
    // Validar que haya mesa O nombre de cliente (Para Llevar)
    if (!selectedTable && !customerName) {
      toast.error("No hay mesa ni cliente seleccionado");
      return;
    }

    // Si ya existe una orden (items fueron enviados a cocina), usar esa orden para cobrar
    if (currentOrderId) {
      console.log("💰 Usando orden existente para cobrar:", currentOrderId);
      
      // Si hay items no enviados a cocina, agregarlos a la orden principal en BD
      const unsentItems = cart.filter(item => !item.sentToKitchen && !item.itemId);
      if (unsentItems.length > 0) {
        try {
          const res = await fetch(`/api/orders/${currentOrderId}/items`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              items: unsentItems.map(item => ({
                productId: item.productId,
                productName: item.productName,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                notes: item.notes || null,
                frostingId: item.frostingId || null,
                frostingName: item.frostingName || null,
                dryToppingId: item.dryToppingId || null,
                dryToppingName: item.dryToppingName || null,
                extraId: item.extraId || null,
                extraName: item.extraName || null,
                customModifiers: item.customModifiers || null,
              })),
            }),
          });
          if (res.ok) {
            const updatedOrder = await res.json();
            // Actualizar cart items con sus IDs de BD
            const newDbItems = updatedOrder.items || [];
            const updatedCart = cart.map(item => {
              if (!item.sentToKitchen && !item.itemId) {
                // Buscar el item correspondiente en la respuesta
                const match = newDbItems.find((dbItem: any) => 
                  dbItem.productId === item.productId && 
                  !cart.some(ci => ci.itemId === dbItem.id)
                );
                if (match) {
                  return { ...item, itemId: match.id, orderId: currentOrderId, sentToKitchen: true };
                }
              }
              return item;
            });
            setCart(updatedCart);
            console.log(`✅ ${unsentItems.length} items añadidos a orden ${currentOrderId}`);
          }
        } catch (e) {
          console.error("Error adding unsent items to order:", e);
        }
      }
      
      // Si hay split bill activo, ir directo a split-assign para asignar nuevos items
      if (Object.keys(itemAssignments).length > 0) {
        setPaymentStep("split-assign");
        setShowingPayment(true);
        toast.info("Asigna los nuevos productos a una persona");
        return;
      }
      
      // Ir directo a pago sin crear nueva orden
      setPaymentStep("summary");
      setShowingPayment(true);
      return;
    }

    // Verificar si algún item ya tiene orderId (fue enviado a cocina previamente)
    const existingOrderId = cart.find(item => item.orderId)?.orderId;
    if (existingOrderId) {
      console.log("💰 Encontrada orden existente en carrito:", existingOrderId);
      setCurrentOrderId(existingOrderId);
      
      // Agregar items no enviados a la orden existente
      const unsentItems = cart.filter(item => !item.sentToKitchen && !item.itemId);
      if (unsentItems.length > 0) {
        try {
          const res = await fetch(`/api/orders/${existingOrderId}/items`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              items: unsentItems.map(item => ({
                productId: item.productId,
                productName: item.productName,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                notes: item.notes || null,
                frostingId: item.frostingId || null,
                frostingName: item.frostingName || null,
                dryToppingId: item.dryToppingId || null,
                dryToppingName: item.dryToppingName || null,
                extraId: item.extraId || null,
                extraName: item.extraName || null,
                customModifiers: item.customModifiers || null,
                isGuest: item.isGuest || false, // IMPORTANTE: Persistir items invitados
              })),
            }),
          });
          if (res.ok) {
            const updatedCart = cart.map(item => 
              !item.sentToKitchen && !item.itemId 
                ? { ...item, orderId: existingOrderId, sentToKitchen: true } 
                : item
            );
            setCart(updatedCart);
          }
        } catch (e) {
          console.error("Error adding items:", e);
        }
      }
      
      setPaymentStep("summary");
      setShowingPayment(true);
      return;
    }
    
    // Solo crear nueva orden si no hay ninguna existente
    setSubmitting(true);
    try {
      const orderData = {
        items: cart.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          notes: item.notes,
          frostingId: item.frostingId,
          frostingName: item.frostingName,
          dryToppingId: item.dryToppingId,
          dryToppingName: item.dryToppingName,
          extraId: item.extraId,
          extraName: item.extraName,
          customModifiers: item.customModifiers,
          isGuest: item.isGuest || false, // IMPORTANTE: Persistir items invitados
        })),
        employeeId,
        tableId: selectedTable?.id || null,
        paymentStatus: "pending",
        loyaltyCardId: loyaltyCard?.id || null,
        customerName: customerName || loyaltyCard?.customerName || null,
      };

      const orderType = selectedTable ? `Mesa ${selectedTable.number}` : `Para Llevar - ${customerName}`;
      console.log("📦 Creando orden para", orderType);
      
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderData),
      });

      if (!res.ok) throw new Error();
      const order = await res.json();
      
      if (selectedTable) {
        await fetch(`/api/tables/${selectedTable.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "occupied" }),
        });
      }
      
      setCurrentOrderId(order.id);
      // Marcar todos los items del carrito con el orderId para evitar duplicados
      setCart(cart.map(item => ({ ...item, orderId: order.id, sentToKitchen: true, itemId: item.itemId || undefined })));
      
      setPaymentStep("summary");
      setShowingPayment(true);
      toast.success(`Orden creada para ${orderType}`);
    } catch (error) {
      toast.error("Error creando orden");
    } finally {
      setSubmitting(false);
    }
  }

  function skipLoyaltyAndProceedToPayment() {
    setShowingLoyaltyStep(false);
    setPaymentStep("summary");
    setShowingPayment(true);
  }

  async function handlePayCash() {
    if (!currentOrderId) return;
    setProcessing(true);
    try {
      // CONSOLIDACIÓN DESHABILITADA - Mantener todas las órdenes separadas
      // const siblingOrderIds = [...new Set(cart.map(item => item.orderId).filter(id => id && id !== currentOrderId))];
      // if (siblingOrderIds.length > 0) {
      //   await fetch(`/api/orders/${currentOrderId}/consolidate`, {
      //     method: "POST",
      //     headers: { "Content-Type": "application/json" },
      //     body: JSON.stringify({ siblingOrderIds }),
      //   });
      // }
      
      // Calcular propina
      const tipAmount = showCustomTip 
        ? parseFloat(customTip) || 0 
        : (cartTotalWithDiscount * tipPercentage / 100);
      
      const res = await fetch(`${getApiUrl()}/api/orders/${currentOrderId}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentMethod: "cash",
          loyaltyCardId: loyaltyCard?.id || null,
          loyaltyStamps: 1,
          userId: employeeId,
          tip: tipAmount,
          subtotal: cartTotalWithDiscount,
          discount: totalDiscount,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        console.error("❌ Error en pago:", errData);
        throw new Error(errData.error || "Error en pago");
      }
      
      toast.success("Pago en efectivo registrado");
      setPaymentCompleted(true);
      handlePrint("cash");
    } catch (err: any) {
      toast.error(err?.message || "Error procesando pago");
    } finally {
      setProcessing(false);
    }
  }

  async function handlePayTransfer() {
    if (!currentOrderId) return;
    setProcessing(true);
    try {
      // CONSOLIDACIÓN DESHABILITADA - Mantener todas las órdenes separadas
      // const siblingOrderIds = [...new Set(cart.map(item => item.orderId).filter(id => id && id !== currentOrderId))];
      // if (siblingOrderIds.length > 0) {
      //   await fetch(`/api/orders/${currentOrderId}/consolidate`, {
      //     method: "POST",
      //     headers: { "Content-Type": "application/json" },
      //     body: JSON.stringify({ siblingOrderIds }),
      //   });
      // }
      
      // Calcular propina
      const tipAmount = showCustomTip 
        ? parseFloat(customTip) || 0 
        : (cartTotalWithDiscount * tipPercentage / 100);
      
      const res = await fetch(`${getApiUrl()}/api/orders/${currentOrderId}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentMethod: "transfer",
          loyaltyCardId: loyaltyCard?.id || null,
          loyaltyStamps: 1,
          userId: employeeId,
          tip: tipAmount,
          subtotal: cartTotalWithDiscount,
          discount: totalDiscount,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        console.error("❌ Error en pago:", errData);
        throw new Error(errData.error || "Error en pago");
      }
      
      toast.success("Pago por transferencia registrado");
      setPaymentCompleted(true);
      handlePrint("transfer");
    } catch (err: any) {
      toast.error(err?.message || "Error procesando pago");
    } finally {
      setProcessing(false);
    }
  }

  function shortenName(name: string, max = 22): string {
    let s = name
      .replace(/Camarones/gi, "Cam.")
      .replace(/Orden de (\d+)/gi, "Ord.$1")
      .replace(/Grande/gi, "Gde")
      .replace(/Mediano/gi, "Med")
      .replace(/Chico/gi, "Chc")
      .replace(/Empanada/gi, "Emp.")
      .replace(/Quesadilla/gi, "Qsda.")
      .replace(/Ensenada/gi, "Ens.")
      .replace(/Tamarindo/gi, "Tam.")
      .replace(/Asiaticos/gi, "Asia.")
      .replace(/Pescaditos/gi, "Pesc.")
      .replace(/Mineral/gi, "Min.")
      .replace(/preparada/gi, "prep.")
      .replace(/camarón/gi, "cam.")
      .replace(/camaron/gi, "cam.")
      .replace(/Paquete/gi, "Paq.")
      .replace(/Pieza/gi, "Pza")
      .replace(/ - /g, "-");
    if (s.length > max) s = s.slice(0, max - 1) + ".";
    return s;
  }

  async function handlePrint(paidWithMethod?: string) {
    try {
      const sentItems = cart.filter(item => item.sentToKitchen);
      if (sentItems.length === 0) return;

      // Agrupar items solo por asiento, luego por producto
      type TicketItem = { 
        name: string; 
        qty: number; 
        price: number; 
        total: number;
        promotionName?: string;
        promotionDiscount?: number;
        isGuest?: boolean;
      };
      const seatGroups = new Map<string, Map<string, TicketItem>>();
      for (const item of sentItems) {
        const seat = item.seat || "C";
        if (!seatGroups.has(seat)) seatGroups.set(seat, new Map());
        const group = seatGroups.get(seat)!;
        const key = `${item.productId}-${item.unitPrice}-${item.promotionId || 'none'}`;
        const existing = group.get(key);
        if (existing) {
          existing.qty += item.quantity;
          existing.total = existing.qty * existing.price;
          if (item.promotionDiscount) {
            existing.promotionDiscount = (existing.promotionDiscount || 0) + item.promotionDiscount;
          }
        } else {
          const lineTotal = item.quantity * item.unitPrice;
          group.set(key, { 
            name: item.productName, 
            qty: item.quantity, 
            price: item.unitPrice,
            total: lineTotal,
            promotionName: item.promotionName || undefined,
            promotionDiscount: item.promotionDiscount || undefined,
            isGuest: item.isGuest || undefined
          });
        }
      }

      // Calcular subtotal excluyendo items invitados
      const subtotal = Array.from(seatGroups.values())
        .flatMap(g => Array.from(g.values()))
        .filter(i => !i.isGuest) // Excluir items invitados del total
        .reduce((sum, i) => sum + i.total, 0);
      
      // Calcular descuento si hay
      const discountData = selectedDiscount ? {
        name: selectedDiscount.name,
        amount: Math.round(calculateDiscount(
          subtotal,
          selectedDiscount.type,
          parseFloat(selectedDiscount.value.toString())
        ))
      } : undefined;
      
      const discountAmount = discountData?.amount || 0;
      const subtotalWithDiscount = subtotal - discountAmount;
      
      const tipAmount = showCustomTip 
        ? parseFloat(customTip) || 0 
        : (subtotalWithDiscount * tipPercentage / 100);
      const total = subtotalWithDiscount + tipAmount;

      // Preparar datos para la impresora
      const seatKeys = Array.from(seatGroups.keys()).sort((a, b) => {
        if (a === "C") return 1;
        if (b === "C") return -1;
        return a.localeCompare(b, undefined, { numeric: true });
      });

      const itemsBySeat: Record<string, Array<{ 
        name: string; 
        qty: number; 
        total: number;
        promotionName?: string;
        promotionDiscount?: number;
        isGuest?: boolean;
      }>> = {};
      for (const seatKey of seatKeys) {
        itemsBySeat[seatKey] = Array.from(seatGroups.get(seatKey)!.values()).map(item => ({
          name: item.name,
          qty: item.qty,
          total: Math.round(item.total),
          promotionName: item.promotionName,
          promotionDiscount: item.promotionDiscount ? Math.round(item.promotionDiscount) : undefined,
          isGuest: item.isGuest
        }));
      }

      // Enviar a impresora ESC/POS
      const printData: any = {
        customerName: customerName || "",
        orderNumber: sentItems[0]?.orderId?.slice(0, 8) || "N/A",
        items: itemsBySeat,
        subtotal: Math.round(subtotal),
        tip: Math.round(tipAmount),
        total: Math.round(total),
        tableNumber: selectedTable?.number || "",
        isDelivery: !selectedTable,
        discount: discountData
      };
      
      // Solo agregar paymentMethod si se pasó (desde pago completado)
      if (paidWithMethod) {
        printData.paymentMethod = paidWithMethod;
      }

      // Enviar al servidor local de impresión (iMac - IP reservada: 192.168.0.160)
      const printServerUrl = process.env.NEXT_PUBLIC_PRINT_SERVER_URL || "http://192.168.0.152:3001";
      const response = await fetch(`${printServerUrl}/print`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(printData)
      });

      if (!response.ok) {
        throw new Error("Error al imprimir");
      }

      toast.success("Ticket enviado a impresora");
    } catch (err) {
      console.error("Error generando ticket:", err);
      toast.error("Error generando ticket");
    }
  }

  function handleConfirmOrder() {
    // El pago ya marcó la orden como delivered y liberó la mesa automáticamente
    // Solo necesitamos limpiar la UI y volver a selección de mesas
    
    const orderType = selectedTable ? "Mesa liberada" : "Orden Para Llevar completada";
    toast.success(`Orden completada - ${orderType}`);
    
    // Limpiar todo y volver a selección de mesas
    setCart([]);
    setActiveCourse(1);
    setLoyaltyCard(null);
    setShowingPayment(false);
    setShowingLoyaltyStep(false);
    setPaymentStep("summary");
    setPaymentMethod(null);
    setCashReceived("");
    setCurrentOrderId(null);
    setPaymentCompleted(false);
    setSelectedTable(null);
    setCustomerName("");
    setTipPercentage(0);
    setCustomTip("");
    setShowCustomTip(false);
    setSplitBillMode(false);
    setItemAssignments({});
    setIndividualPayments({});
    setIndividualTips({});
    setSplitPaymentMethod(null);
    setSplitCashReceived("");
    setShowTableSelection(true);
    
    // Limpiar localStorage
    localStorage.removeItem('barCart');
    localStorage.removeItem('barSelectedTable');
    localStorage.removeItem('barCustomerName');
    localStorage.removeItem('barCurrentOrderId');
    
    // Recargar delivery orders para quitar la orden completada
    fetchDeliveryOrders();
    
    // Recargar mesas para actualizar estados
    fetchTables();
  }

  // CÓDIGO ORIGINAL CON INTEGRACIÓN A TERMINAL MERCADOPAGO - COMENTADO PARA USO FUTURO
  // async function handlePayTerminal() {
  //   if (!currentOrderId) return;
  //   setProcessing(true);
  //   setWaitingForTerminal(true);
  //   try {
  //     const res = await fetch(`${getApiUrl()}/api/orders/${currentOrderId}/pay`, {
  //       method: "POST",
  //       headers: { "Content-Type": "application/json" },
  //       body: JSON.stringify({
  //         paymentMethod: "terminal_mercadopago",
  //         loyaltyCardId: loyaltyCard?.id || null,
  //         loyaltyStamps: 1,
  //         userId: employeeId,
  //       }),
  //     });
  //     
  //     if (!res.ok) {
  //       const errorData = await res.json();
  //       toast.error(errorData.error || "Error enviando pago a terminal");
  //       if (errorData.hint) {
  //         toast.error(errorData.hint, { duration: 5000 });
  //       }
  //       setProcessing(false);
  //       setWaitingForTerminal(false);
  //       return;
  //     }
  //
  //     // Poll order status - webhook updates paymentStatus to "paid"
  //     const pollInterval = setInterval(async () => {
  //       try {
  //         const statusRes = await fetch(`/api/orders/${currentOrderId}`);
  //         if (statusRes.ok) {
  //           const updatedOrder = await statusRes.json();
  //           
  //           if (updatedOrder.paymentStatus === "paid") {
  //             clearInterval(pollInterval);
  //             
  //             // Webhook puede poner status incorrecto - asegurar que sea "delivered"
  //             if (updatedOrder.status !== "delivered") {
  //               console.log("🔧 Corrigiendo status a delivered después de pago terminal");
  //               await fetch(`/api/orders/${currentOrderId}/status`, {
  //                 method: "PATCH",
  //                 headers: { "Content-Type": "application/json" },
  //                 body: JSON.stringify({ status: "delivered" }),
  //               });
  //             }
  //             
  //             // Liberar mesa si es necesario
  //             if (selectedTable) {
  //               await fetch(`/api/tables/${selectedTable.id}`, {
  //                 method: "PUT",
  //                 headers: { "Content-Type": "application/json" },
  //                 body: JSON.stringify({ ...selectedTable, status: "available" }),
  //               });
  //             }
  //             
  //             setWaitingForTerminal(false);
  //             toast.success("Pago confirmado por terminal");
  //             setPaymentCompleted(true);
  //             setProcessing(false);
  //           } else if (updatedOrder.paymentStatus === "failed") {
  //             clearInterval(pollInterval);
  //             setWaitingForTerminal(false);
  //             setProcessing(false);
  //             toast.error("Pago rechazado en terminal");
  //           }
  //         }
  //       } catch (err) {
  //         console.error("Error polling order:", err);
  //       }
  //     }, 2000);
  //
  //     // Timeout after 2 minutes
  //     setTimeout(() => {
  //       clearInterval(pollInterval);
  //       if (waitingForTerminal) {
  //         setWaitingForTerminal(false);
  //         setProcessing(false);
  //         toast.error("Tiempo de espera agotado");
  //       }
  //     }, 120000);
  //   } catch (error) {
  //     toast.error("Error enviando pago a terminal");
  //     setProcessing(false);
  //     setWaitingForTerminal(false);
  //   }
  // }

  // VERSIÓN SIMPLIFICADA - Terminal funciona igual que efectivo (confirmación directa)
  async function handlePayTerminal() {
    if (!currentOrderId) return;
    setProcessing(true);
    try {
      // CONSOLIDACIÓN DESHABILITADA - Mantener todas las órdenes separadas
      // const siblingOrderIds = [...new Set(cart.map(item => item.orderId).filter(id => id && id !== currentOrderId))];
      // if (siblingOrderIds.length > 0) {
      //   await fetch(`/api/orders/${currentOrderId}/consolidate`, {
      //     method: "POST",
      //     headers: { "Content-Type": "application/json" },
      //     body: JSON.stringify({ siblingOrderIds }),
      //   });
      // }
      
      // Calcular propina
      const tipAmount = showCustomTip 
        ? parseFloat(customTip) || 0 
        : (cartTotalWithDiscount * tipPercentage / 100);
      
      const res = await fetch(`${getApiUrl()}/api/orders/${currentOrderId}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentMethod: "terminal_mercadopago",
          loyaltyCardId: loyaltyCard?.id || null,
          loyaltyStamps: 1,
          userId: employeeId,
          tip: tipAmount,
          subtotal: cartTotalWithDiscount,
          discount: totalDiscount,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "Error desconocido" }));
        console.error("Error en pago con terminal:", errData);
        throw new Error(errData.error || "Error procesando pago con terminal");
      }
      
      toast.success("Pago con tarjeta registrado");
      setPaymentCompleted(true);
      handlePrint("card");
    } catch (err: any) {
      toast.error(err?.message || "Error procesando pago");
    } finally {
      setProcessing(false);
    }
  }

  // Marcar orden de delivery de plataforma como entregada a repartidor (sin cobrar)
  async function handleDeliverToDriver() {
    if (!currentOrderId) return;
    setProcessing(true);
    try {
      // CONSOLIDACIÓN DESHABILITADA - Mantener todas las órdenes separadas
      // const siblingOrderIds = [...new Set(cart.map(item => item.orderId).filter(id => id && id !== currentOrderId))];
      // if (siblingOrderIds.length > 0) {
      //   await fetch(`/api/orders/${currentOrderId}/consolidate`, {
      //     method: "POST",
      //     headers: { "Content-Type": "application/json" },
      //     body: JSON.stringify({ siblingOrderIds }),
      //   });
      // }
      
      // Calcular subtotal y total
      const subtotal = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
      const tipAmount = 0; // Sin propina en delivery de plataforma
      
      // Usar el endpoint /pay para registrar correctamente en caja e inventario
      const res = await fetch(`${getApiUrl()}/api/orders/${currentOrderId}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentMethod: "platform_delivery", // Método especial para delivery de plataforma
          subtotal: subtotal,
          tip: tipAmount,
          userId: employeeId || null,
        }),
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Error marcando como entregado");
      }
      
      toast.success("Orden entregada a repartidor");
      
      // Imprimir ticket
      handlePrint();
      
      // Recargar lista de órdenes de delivery para quitar la orden completada
      await fetchDeliveryOrders();
      
      // Limpiar y volver a selección
      setPaymentCompleted(true);
      handleConfirmOrder();
    } catch (err: any) {
      toast.error(err?.message || "Error entregando orden");
    } finally {
      setProcessing(false);
    }
  }

  function handlePinSuccess(empId: string, empName: string) {
    setEmployeeId(empId);
    setEmployeeName(empName);
    setShowDashboard(false);
    setAuthStep('idle');
    setEmployeeCode('');
    setPin('');
    setLastActivity(Date.now());
    saveSession(empId, empName);
    toast.success(`Bienvenido, ${empName}`);
    fetchData();
  }

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(amount);

  // Calcular subtotal sin descuentos
  const cartSubtotalBeforeDiscounts = cart.reduce((sum, item) => {
    if (item.isGuest) return sum;
    return sum + (item.unitPrice * item.quantity);
  }, 0);
  
  // Calcular descuento total de promociones
  const totalPromotionDiscount = cart.reduce((sum, item) => {
    if (item.isGuest) return sum;
    return sum + (item.promotionDiscount || 0);
  }, 0);
  
  // Subtotal después de promociones
  const cartTotal = cartSubtotalBeforeDiscounts - totalPromotionDiscount;
  
  // Aplicar descuento flexible si existe
  const cartSubtotal = cartTotal;
  const flexibleDiscountAmount = selectedDiscount 
    ? calculateDiscount(cartSubtotal, selectedDiscount.type, parseFloat(selectedDiscount.value.toString()))
    : 0;
  const cartTotalWithDiscount = cartSubtotal - flexibleDiscountAmount;
  
  // Descuento total (promociones + flexible)
  const totalDiscount = totalPromotionDiscount + flexibleDiscountAmount;
  
  // Debug logs
  if (totalDiscount > 0) {
    console.log('💰 Descuentos:', {
      promociones: totalPromotionDiscount,
      flexible: flexibleDiscountAmount,
      total: totalDiscount,
      subtotalOriginal: cartSubtotalBeforeDiscounts,
      subtotalConDescuento: cartTotalWithDiscount
    });
  }

  // Dashboard de bienvenida
  if (showDashboard) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-950">
        <div className="w-full max-w-md p-8 bg-neutral-900 rounded-lg shadow-2xl border border-neutral-800 flex flex-col items-center gap-6">
          {/* Header con logo/titulo */}
          <div className="text-center mb-4">
            <img 
              src="/logos/LogoBruma.png" 
              alt="BRUMA Marisquería" 
              className="h-16 mx-auto mb-4"
              onError={(e) => {
                console.error('Error cargando LogoBruma.png');
                console.log('Intentando cargar desde:', e.currentTarget.src);
              }}
              onLoad={() => console.log('LogoBruma.png cargado exitosamente')}
            />
            <div className="w-16 h-1 bg-blue-600 mx-auto rounded-full"></div>
          </div>

          {authStep === 'idle' && (
            <>
              <div className="text-center mb-6">
                <h2 className="text-xl font-semibold text-white mb-2">Comandera</h2>
                <p className="text-neutral-400 text-sm">Sistema POS</p>
                {!cashRegisterOpen && !checkingRegister && (
                  <div className="mt-4 p-3 bg-red-950/50 border border-red-800/50 rounded-lg">
                    <p className="text-red-400 text-sm font-medium">⚠️ Caja cerrada</p>
                  </div>
                )}
              </div>
              <Button
                onClick={handleOpenComanda}
                disabled={checkingRegister}
                size="lg"
                className="px-12 py-6 text-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold"
              >
                Iniciar Sesión
              </Button>
            </>
          )}

          {authStep === 'pin' && (
            <div className="w-full">
              <div className="text-center mb-6">
                <h2 className="text-xl font-semibold text-white mb-2">PIN de Seguridad</h2>
                <p className="text-neutral-400 text-sm">4 dígitos</p>
              </div>
              
              <div className="mb-6 text-center">
                <div className="text-4xl font-mono tracking-widest h-16 flex items-center justify-center bg-neutral-950 rounded-lg border border-neutral-800 text-white">
                  {pin.split('').map((_, i) => '●').join(' ').padEnd(7, '·')}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-6">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '←'].map((key) => (
                  <Button
                    key={key}
                    variant="outline"
                    size="lg"
                    onClick={() => {
                      if (key === 'C') handleClear();
                      else if (key === '←') handleBackspace();
                      else handleNumberClick(key);
                    }}
                    className="h-16 text-xl font-semibold bg-neutral-800 border-neutral-700 text-white hover:bg-neutral-700 hover:border-blue-600"
                  >
                    {key}
                  </Button>
                ))}
              </div>

              <div className="space-y-3">
                <Button
                  onClick={handlePinSubmit}
                  disabled={pin.length !== 4 || authenticating}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                  size="lg"
                >
                  {authenticating ? 'Verificando...' : 'Ingresar'}
                </Button>
                <Button
                  onClick={handleCancel}
                  variant="outline"
                  className="w-full bg-neutral-800 border-neutral-700 text-white hover:bg-neutral-700"
                >
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        Cargando...
      </div>
    );
  }

  // Vista de selección de mesas
  if (showTableSelection) {
    return (
      <div className="flex h-screen bg-neutral-950">
        {/* Sidebar de navegación */}
        <Sidebar activeView={activeView} onViewChange={setActiveView} />
        
        {/* Contenido principal */}
        {activeView === "reservations" ? (
          <div className="flex-1">
            <ReservationsView />
          </div>
        ) : (
          <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="p-6 border-b border-neutral-800 bg-neutral-950">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-4xl font-bold mb-2 text-white">BRUMA Marisquería</h1>
                <p className="text-neutral-400">Selecciona una mesa para comenzar</p>
              </div>
              <div className="flex items-center gap-2">
                {/* Botón para invitar productos (cortesía dueños) */}
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setShowGuestProductDialog(true)}
                  className="bg-purple-900/20 border-purple-700 text-purple-400 hover:bg-purple-800/30 hover:text-purple-300"
                  title="Invitar Producto (Cortesía)"
                >
                  <Gift className="size-5" />
                </Button>
                
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="bg-neutral-900 border-neutral-800 text-white hover:bg-neutral-800"
                    >
                      <GearSix className="size-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                    <DropdownMenuItem onClick={() => router.push("/orders/dispatch")}>
                      <CookingPot className="size-4 mr-2" />
                      Buscar Órdenes
                    </DropdownMenuItem>
                    {/* DISABLED: Este botón borra órdenes de forma agresiva y causó pérdida de datos
                    <DropdownMenuItem
                      onClick={async () => {
                        if (!confirm("¿Consolidar órdenes duplicadas? Esto juntará todas las órdenes activas del mismo cliente/mesa en una sola orden.")) {
                          return;
                        }
                        try {
                          const res = await fetch("/api/orders/consolidate-duplicates", {
                            method: "POST",
                          });
                          if (res.ok) {
                            const data = await res.json();
                            toast.success(
                              `Órdenes consolidadas: ${data.stats.groupsConsolidated} grupos, ${data.stats.itemsMoved} items movidos`
                            );
                          } else {
                            toast.error("Error al consolidar órdenes");
                          }
                        } catch (error) {
                          toast.error("Error al consolidar órdenes duplicadas");
                        }
                      }}
                    >
                      <span className="mr-2">🔗</span>
                      Consolidar Duplicados
                    </DropdownMenuItem>
                    */}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button 
                  variant="outline" 
                  onClick={() => router.push("/dashboard")}
                  className="bg-neutral-900 border-neutral-800 text-white hover:bg-neutral-800"
                >
                  Volver al Dashboard
                </Button>
              </div>
            </div>
          </div>

          {/* Grid de mesas */}
          <div className="flex-1 overflow-auto p-6">
            <div className="grid grid-cols-6 gap-4 max-w-screen-2xl">
              {/* Opción Nueva Orden Para Llevar */}
              <button
                className="rounded-lg overflow-hidden relative hover:scale-[1.02] transition-all bg-gradient-to-br from-blue-900/80 to-blue-950 border border-blue-800/50 shadow-md hover:border-blue-700/70 min-h-[160px]"
                onClick={(e) => {
                  e.stopPropagation();
                  handleNewDeliveryOrder();
                }}
              >
                <div className="relative z-10 p-6 flex flex-col items-center justify-center h-full">
                  <div className="text-5xl mb-3">
                    🛍️
                  </div>
                  <div className="text-lg font-bold text-white mb-1">
                    Para Llevar
                  </div>
                  <div className="text-xs text-blue-200/70 mb-3">
                    Nueva Orden
                  </div>
                  <Badge className="bg-blue-950/50 text-blue-200 border-blue-700/50">
                    + Nuevo
                  </Badge>
                </div>
              </button>

              {/* Órdenes Para Llevar Activas */}
              {deliveryOrders.map((order, index) => (
                <button
                  key={order.id}
                  className="rounded-lg overflow-hidden relative hover:scale-[1.02] transition-all bg-gradient-to-br from-green-900/80 to-green-950 border border-green-800/50 shadow-md hover:border-green-700/70 min-h-[160px]"
                  onClick={() => handleSelectDeliveryOrder(order)}
                >
                  <div className="relative z-10 p-6 flex flex-col items-center justify-center h-full">
                    <div className="text-5xl mb-3">
                      📦
                    </div>
                    <div className="text-lg font-bold text-white mb-1">
                      {order.customerName || `Delivery ${index + 1}`}
                    </div>
                    <div className="text-xs text-green-200/70 mb-3">
                      Orden #{order.orderNumber}
                    </div>
                    <Badge className="bg-green-950/50 text-green-200 border-green-700/50">
                      {order.items?.length || 0} items
                    </Badge>
                  </div>
                </button>
              ))}

              {/* Opción Nueva Orden Delivery (Uber/Rappi) */}
              <button
                className="rounded-lg overflow-hidden relative hover:scale-[1.02] transition-all bg-gradient-to-br from-purple-900/80 to-purple-950 border border-purple-800/50 shadow-md hover:border-purple-700/70 min-h-[160px]"
                onClick={(e) => {
                  e.stopPropagation();
                  handleNewPlatformDeliveryOrder();
                }}
              >
                <div className="relative z-10 p-6 flex flex-col items-center justify-center h-full">
                  <div className="text-5xl mb-3">
                    📦
                  </div>
                  <div className="text-lg font-bold text-white mb-1">
                    Delivery
                  </div>
                  <div className="text-xs text-purple-200/70 mb-3">
                    Uber/Rappi/Didi
                  </div>
                  <Badge className="bg-purple-950/50 text-purple-200 border-purple-700/50">
                    + Nuevo
                  </Badge>
                </div>
              </button>

              {/* Órdenes Delivery Plataforma Activas */}
              {platformDeliveryOrders.map((order, index) => {
                // Detectar plataforma del customerName
                const platformMatch = order.customerName?.match(/^(Uber|Rappi|Didi)/);
                const platform = platformMatch ? platformMatch[1] : null;
                
                return (
                  <button
                    key={order.id}
                    className="rounded-lg overflow-hidden relative hover:scale-[1.02] transition-all bg-gradient-to-br from-orange-900/80 to-orange-950 border border-orange-800/50 shadow-md hover:border-orange-700/70 min-h-[160px]"
                    onClick={() => handleSelectDeliveryOrder(order)}
                  >
                    <div className="relative z-10 p-6 flex flex-col items-center justify-center h-full">
                      {platform ? (
                        <img 
                          src={`/delivery_logos/${platform.toLowerCase()}.png`}
                          alt={platform}
                          className="w-16 h-16 mb-3 object-contain"
                          onError={(e) => {
                            // Fallback a emoji si la imagen no carga
                            e.currentTarget.style.display = 'none';
                            (e.currentTarget.nextElementSibling as HTMLElement | null)?.style.setProperty('display', 'block');
                          }}
                        />
                      ) : null}
                      <div className="text-5xl mb-3" style={{ display: platform ? 'none' : 'block' }}>
                        🏍️
                      </div>
                      <div className="text-lg font-bold text-white mb-1">
                        {order.customerName || `Delivery ${index + 1}`}
                      </div>
                      <div className="text-xs text-orange-200/70 mb-3">
                        Orden #{order.orderNumber}
                      </div>
                      <Badge className="bg-orange-950/50 text-orange-200 border-orange-700/50">
                        {order.items?.length || 0} items
                      </Badge>
                    </div>
                  </button>
                );
              })}

              {/* Mesas */}
              {tables.map((table) => {
                const statusConfig = {
                  available: {
                    gradient: "from-green-900/80 to-green-950",
                    border: "border-green-800/50",
                    hoverBorder: "hover:border-green-700/70",
                    textColor: "text-green-200/70",
                    badgeBg: "bg-green-950/50",
                    badgeText: "text-green-200",
                    badgeBorder: "border-green-700/50",
                  },
                  occupied: {
                    gradient: "from-red-900/80 to-red-950",
                    border: "border-red-800/50",
                    hoverBorder: "hover:border-red-700/70",
                    textColor: "text-red-200/70",
                    badgeBg: "bg-red-950/50",
                    badgeText: "text-red-200",
                    badgeBorder: "border-red-700/50",
                  },
                  reserved: {
                    gradient: "from-amber-900/80 to-amber-950",
                    border: "border-amber-800/50",
                    hoverBorder: "hover:border-amber-700/70",
                    textColor: "text-amber-200/70",
                    badgeBg: "bg-amber-950/50",
                    badgeText: "text-amber-200",
                    badgeBorder: "border-amber-700/50",
                  },
                };

                const statusLabels = {
                  available: "Disponible",
                  occupied: "Ocupada",
                  reserved: "Reservada",
                };

                const config = statusConfig[table.status];

                return (
                  <button
                    key={table.id}
                    className={`rounded-lg overflow-hidden relative hover:scale-[1.02] transition-all bg-gradient-to-br ${config.gradient} border ${config.border} ${config.hoverBorder} shadow-md min-h-[160px]`}
                    onClick={() => handleSelectTable(table)}
                  >
                    <div className="relative z-10 p-6 flex flex-col items-center justify-center h-full">
                      <div className="text-5xl font-bold text-white mb-3">
                        {table.number}
                      </div>
                      <div className="text-sm font-medium text-white mb-1">
                        {table.name || `Mesa ${table.number}`}
                      </div>
                      <div className={`text-xs ${config.textColor} mb-3 flex items-center gap-1 justify-center`}>
                        <Users className="size-3" weight="fill" />
                        <span>{table.capacity} {table.capacity === 1 ? "persona" : "personas"}</span>
                      </div>
                      <div className="flex flex-col gap-2">
                        <Badge className={`${config.badgeBg} ${config.badgeText} ${config.badgeBorder}`}>
                          {statusLabels[table.status]}
                        </Badge>
                        {tablesWithReadyItems.has(table.id) && (
                          <Badge className="bg-green-700/80 text-green-100 border-green-600/50 animate-pulse">
                            ✓ Platillos listos
                          </Badge>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          </div>
        )}
        
        {/* Diálogo Invitar Producto en vista de mesas */}
        <Dialog open={showGuestProductDialog} onOpenChange={(open) => {
          setShowGuestProductDialog(open);
          if (!open) setGuestProductCart([]);
        }}>
          <DialogContent className="bg-neutral-950 border-neutral-800 text-white max-w-2xl max-h-[80vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="text-white flex items-center gap-2">
                <Gift className="size-5 text-purple-400" />
                Invitar Producto (Cortesía)
              </DialogTitle>
              <p className="text-sm text-neutral-400">
                Selecciona productos para registrar como cortesía. Se imprimirá un ticket.
              </p>
            </DialogHeader>
            
            {/* Productos seleccionados */}
            {guestProductCart.length > 0 && (
              <div className="border border-purple-800 rounded-lg p-3 space-y-2 bg-purple-900/10">
                <p className="text-xs font-semibold text-purple-400 uppercase">Productos a invitar:</p>
                {guestProductCart.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm">
                    <span className="text-white">{item.qty}x {item.name}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setGuestProductCart(prev => prev.filter((_, i) => i !== idx))}
                      className="text-red-400 hover:text-red-300 h-6 w-6 p-0"
                    >
                      <X className="size-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            
            <div className="grid grid-cols-2 gap-3 py-2 overflow-y-auto flex-1">
              {products.filter(p => p.active).map((product) => (
                <Button
                  key={product.id}
                  onClick={() => {
                    setGuestProductCart(prev => {
                      const existing = prev.find(p => p.productId === product.id);
                      if (existing) {
                        return prev.map(p => p.productId === product.id ? { ...p, qty: p.qty + 1 } : p);
                      }
                      return [...prev, {
                        productId: product.id,
                        name: product.name,
                        price: parseFloat(product.price),
                        qty: 1,
                      }];
                    });
                  }}
                  variant="outline"
                  className="h-auto py-4 px-3 flex flex-col items-start gap-1 bg-neutral-900 border-neutral-700 hover:bg-purple-900/20 hover:border-purple-700 text-left"
                >
                  <span className="font-semibold text-white">{product.name}</span>
                  <span className="text-xs text-neutral-400">{formatCurrency(parseFloat(product.price))}</span>
                </Button>
              ))}
            </div>
            <DialogFooter className="flex gap-2">
              <Button variant="outline" onClick={() => {
                setShowGuestProductDialog(false);
                setGuestProductCart([]);
              }}>
                Cancelar
              </Button>
              <Button
                disabled={guestProductCart.length === 0}
                onClick={async () => {
                  try {
                    // Crear orden con todos los items invitados
                    const orderData = {
                      tableId: null,
                      items: guestProductCart.map(item => ({
                        productId: item.productId,
                        productName: item.name,
                        quantity: item.qty,
                        unitPrice: item.price,
                        notes: "Cortesía",
                        isGuest: true,
                        seat: "C",
                        course: 1,
                      })),
                      status: "preparing",
                      paymentMethod: null,
                      loyaltyCardId: null,
                      customerName: "Cortesía Casa",
                    };

                    const res = await fetch("/api/orders", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(orderData),
                    });

                    if (!res.ok) throw new Error("Error creando orden");
                    const createdOrder = await res.json();
                    
                    // Marcar como pagada inmediatamente
                    await fetch(`/api/orders/${createdOrder.id}/pay`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        paymentMethod: "cash",
                        cashReceived: 0,
                        tip: 0,
                        discount: 0,
                      }),
                    });

                    // Imprimir ticket de cortesía con línea de firma
                    const printServerUrl = process.env.NEXT_PUBLIC_PRINT_SERVER_URL || "http://192.168.0.152:3001";
                    await fetch(`${printServerUrl}/print-guest`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        items: guestProductCart.map(item => ({
                          name: item.name,
                          qty: item.qty,
                        })),
                        orderNumber: createdOrder.id?.slice(0, 8) || "N/A",
                      }),
                    });

                    toast.success(`Cortesía registrada (${guestProductCart.length} productos) — Ticket impreso`);
                    setGuestProductCart([]);
                    setShowGuestProductDialog(false);
                  } catch (error) {
                    toast.error("Error registrando cortesía");
                    console.error(error);
                  }
                }}
                className="bg-purple-600 hover:bg-purple-700 text-white"
              >
                <Gift className="size-4 mr-2" />
                Invitar y Registrar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Filtrar productos por categoría o búsqueda
  const filteredProducts = searchQuery
    ? products.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase())) // Buscar en todas las categorías
    : selectedCategory
    ? products.filter(p => p.categoryId === selectedCategory)
    : [];

  return (
    <div className="flex h-screen bg-background overflow-hidden">
          {/* SIDEBAR - CARRITO */}
          <div className="w-80 bg-neutral-950 border-r border-neutral-800 flex flex-col">
        {/* Header del carrito */}
        <div className="p-4 border-b border-neutral-800">
          {/* Row de botones superior */}
          {(selectedTable || customerName) && (
            <div className="mb-3 flex items-center gap-2">
              {/* Botón Home */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleChangeTable}
                className="bg-neutral-900 border-neutral-800 hover:bg-neutral-800 text-white p-3"
              >
                <House className="size-4" weight="fill" />
              </Button>
              
              {/* Botón Mesa con dropdown - flex-1 para ocupar todo el espacio */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 bg-neutral-900 border-neutral-800 hover:bg-neutral-800 text-white flex items-center gap-2 justify-start"
                  >
                    {selectedTable ? (
                      <>
                        <Coffee className="size-4" />
                        <div className="flex flex-col items-start">
                          <span className="font-medium">{selectedTable.name || `Mesa ${selectedTable.number}`}</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <ShoppingBag className="size-4" />
                        <div className="flex flex-col items-start">
                          <span className="font-medium">Para Llevar</span>
                          {customerName && (
                            <span className="text-xs text-neutral-400">{customerName}</span>
                          )}
                        </div>
                      </>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem 
                    onClick={handleReleaseTable}
                    className="text-red-400 focus:text-red-300"
                  >
                    <X className="mr-2 size-4" />
                    Liberar mesa
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              
              {/* Botón Número de Personas */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setTempGuestCount(guestCount);
                  setShowGuestCountDialog(true);
                }}
                className="bg-neutral-900 border-neutral-800 hover:bg-neutral-800 text-white flex items-center gap-2"
              >
                <Users className="size-4" weight="fill" />
                <span>{guestCount}</span>
              </Button>
              
            </div>
          )}
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold text-white">Orden</h2>
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-neutral-400 hover:text-white">
                    <DotsThree className="size-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setQrDialogOpen(true)}>
                    <QrCode className="mr-2 size-4" />
                    Leer QR
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setManualStampDialogOpen(true)}>
                    <Stamp className="mr-2 size-4" />
                    Asignar sellos manual
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <span className="font-bold text-white">{formatCurrency(cartTotal)}</span>
            </div>
          </div>
          {/* Selector de asientos */}
          {selectedTable && guestCount > 0 && (
            <div className="flex gap-1 mb-2 flex-wrap">
              {Array.from({ length: guestCount }).map((_, i) => {
                const seatId = `A${i + 1}`;
                return (
                  <button
                    key={seatId}
                    onClick={() => setActiveSeat(seatId)}
                    className={`px-3 py-1.5 rounded text-xs font-bold transition-colors ${
                      activeSeat === seatId
                        ? "bg-blue-600 text-white"
                        : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"
                    }`}
                  >
                    {seatId}
                  </button>
                );
              })}
              <button
                onClick={() => setActiveSeat("C")}
                className={`px-3 py-1.5 rounded text-xs font-bold transition-colors ${
                  activeSeat === "C"
                    ? "bg-amber-600 text-white"
                    : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"
                }`}
              >
                C
              </button>
            </div>
          )}
          {/* Selector de tiempos/cursos */}
          {cart.length > 0 && (
            <div className="flex items-center gap-2 mb-2">
              <div className="flex gap-1 flex-wrap flex-1">
                {Array.from({ length: activeCourse }, (_, i) => i + 1).map(c => (
                  <button
                    key={c}
                    onClick={() => setActiveCourse(c)}
                    className={`px-2.5 py-1 rounded text-xs font-bold transition-colors ${
                      activeCourse === c
                        ? "bg-emerald-600 text-white"
                        : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"
                    }`}
                  >
                    T{c}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setActiveCourse(prev => prev + 1)}
                className="px-2.5 py-1 rounded text-xs font-bold bg-emerald-900/50 text-emerald-400 hover:bg-emerald-800 hover:text-white transition-colors border border-emerald-700/50"
              >
                + Tiempo
              </button>
            </div>
          )}
          {loyaltyCard && (
            <div className="mb-2 p-2 bg-blue-950/30 rounded text-sm flex items-start justify-between gap-2 border border-blue-900/50">
              <div className="flex-1">
                <div className="font-medium text-white">{loyaltyCard.customerName}</div>
                <div className="text-xs text-neutral-400">
                  {loyaltyCard.stamps} sellos • {loyaltyCard.rewardsAvailable} recompensas
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLoyaltyCard(null)}
                className="h-6 w-6 p-0 text-neutral-400 hover:text-white"
              >
                <X className="size-4" />
              </Button>
            </div>
          )}
          <div className="text-sm text-neutral-500">
            {cart.length} {cart.length === 1 ? 'producto' : 'productos'}
          </div>
        </div>

        {/* Items del carrito */}
        <div className="flex-1 overflow-auto p-4 space-y-2">
          {cart.length === 0 ? (
            <div className="text-neutral-500 text-center py-8 text-sm">
              Carrito vacío
            </div>
          ) : (
            (() => {
              const seatOrder = selectedTable 
                ? [...Array.from({ length: guestCount }, (_, i) => `A${i + 1}`), "C"]
                : ["C"];
              const sortedCart = [...cart].map((item, idx) => ({ item, idx }));
              // Ordenar: primero por curso, luego por asiento
              sortedCart.sort((a, b) => {
                const courseA = a.item.course || 1;
                const courseB = b.item.course || 1;
                if (courseA !== courseB) return courseA - courseB;
                if (selectedTable) {
                  const aIdx = seatOrder.indexOf(a.item.seat || "C");
                  const bIdx = seatOrder.indexOf(b.item.seat || "C");
                  return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
                }
                return 0;
              });
              const maxCourseInCart = Math.max(...cart.map(i => i.course || 1), 1);
              const showCourseHeaders = maxCourseInCart > 1;
              let lastCourse = 0;
              let lastSeat = "";
              let lastPromotionId: string | null = null;
              
              return sortedCart.map(({ item, idx: index }, arrayIndex) => {
                const itemCourse = item.course || 1;
                const showCourseHeader = showCourseHeaders && itemCourse !== lastCourse;
                if (showCourseHeader) {
                  lastCourse = itemCourse;
                  lastSeat = ""; // Reset seat tracking on course change
                }
                const showSeatHeader = selectedTable && (item.seat || "C") !== lastSeat;
                if (showSeatHeader) lastSeat = item.seat || "C";
                
                // Promotion grouping logic
                const currentPromotionId = item.promotionId || null;
                const nextItem = sortedCart[arrayIndex + 1];
                const prevItem = arrayIndex > 0 ? sortedCart[arrayIndex - 1] : null;
                
                const isFirstInPromoGroup = currentPromotionId && (
                  !prevItem || prevItem.item.promotionId !== currentPromotionId
                );
                const isLastInPromoGroup = currentPromotionId && (
                  !nextItem || nextItem.item.promotionId !== currentPromotionId
                );
                const isInPromoGroup = !!currentPromotionId;
                
                // Calculate total discount for this promotion group
                let promoTotalDiscount = 0;
                if (isFirstInPromoGroup && currentPromotionId) {
                  promoTotalDiscount = sortedCart
                    .filter(({ item: i }) => i.promotionId === currentPromotionId)
                    .reduce((sum, { item: i }) => sum + (i.promotionDiscount || 0), 0);
                }
                
                return (
                  <div key={index}>
                    {showCourseHeader && (
                      <div className={`flex items-center gap-1.5 text-xs font-bold px-2 py-1.5 mt-3 mb-1 rounded bg-emerald-950/40 border border-emerald-800/40 text-emerald-400`}>
                        <span className="text-sm">T{itemCourse}</span>
                        <span className="text-emerald-600">•</span>
                        <span>Tiempo {itemCourse}</span>
                      </div>
                    )}
                    {showSeatHeader && (
                      <div className={`flex items-center gap-1.5 text-xs font-bold px-2 py-1 mt-2 ${
                        item.seat === "C" ? "text-amber-400" : "text-blue-400"
                      }`}>
                        {item.seat === "C" 
                          ? <><ForkKnife className="size-3.5" weight="fill" /> Centro (compartido)</>
                          : <><User className="size-3.5" weight="fill" /> Asiento {item.seat}</>
                        }
                      </div>
                    )}
                    
                    {/* Promotion group header */}
                    {isFirstInPromoGroup && (
                      <div className="flex items-center justify-between gap-2 px-3 py-2 mt-2 bg-blue-950/50 border-t-2 border-x-2 border-blue-600 rounded-t-lg">
                        <div className="flex items-center gap-2">
                          <Percent className="size-4 text-blue-400" weight="bold" />
                          <span className="text-sm font-bold text-blue-300">{item.promotionName}</span>
                        </div>
                        <span className="text-sm font-bold text-blue-400">-{formatCurrency(promoTotalDiscount)}</span>
                      </div>
                    )}
                    
                    <div className={`bg-neutral-900 ${
                      isInPromoGroup 
                        ? `border-x-2 border-blue-600 ${
                            isFirstInPromoGroup ? 'rounded-t-none' : '-mt-px'
                          } ${
                            isLastInPromoGroup ? 'border-b-2 rounded-b-lg' : ''
                          } ${
                            !isFirstInPromoGroup && !isLastInPromoGroup ? 'rounded-none' : ''
                          }`
                        : 'border border-neutral-800 rounded-lg overflow-hidden'
                    }`}>
                      <div className={`p-3 ${item.sentToKitchen ? 'opacity-75' : ''}`}>
                        <div className="flex items-start gap-3 mb-2">
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
                            {item.quantity}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <div className="font-medium text-sm text-white">{item.productName}</div>
                                  {item.sentToKitchen && item.orderStatus === "ready" && !item.deliveredToTable && (
                                    <Badge variant="default" className="text-xs bg-green-600">✓ Listo</Badge>
                                  )}
                                  {item.sentToKitchen && item.deliveredToTable && (
                                    <Badge variant="secondary" className="text-xs bg-blue-600">✓ Entregado</Badge>
                                  )}
                                  {item.sentToKitchen && item.orderStatus === "preparing" && (
                                    <Badge variant="destructive" className="text-xs">En cocina</Badge>
                                  )}
                                </div>
                              </div>
                              <div className="flex-shrink-0 flex items-start gap-2">
                                <span className={`font-semibold ${item.isGuest ? 'line-through text-neutral-500' : 'text-white'}`}>
                                  {formatCurrency(item.unitPrice * item.quantity)}
                                </span>
                                <Button variant="ghost" size="sm" onClick={() => removeFromCart(index)} className="h-6 w-6 p-0 text-red-400 hover:text-red-300">
                                  <Trash className="size-3" />
                                </Button>
                              </div>
                            </div>
                            <div className="text-xs text-neutral-500 mt-0.5">
                              {item.isGuest ? (
                                <span className="line-through">{formatCurrency(item.unitPrice)} c/u</span>
                              ) : (
                                <>{formatCurrency(item.unitPrice)} c/u</>
                              )}
                            </div>
                            {(item.frostingName || item.dryToppingName || item.extraName || item.customModifiers || item.notes) && (
                              <div className="mt-1 space-y-0.5">
                                {item.frostingName && (
                                  <div className="text-xs text-muted-foreground flex items-start gap-1">
                                    <span className="opacity-50">↳</span><span>{item.frostingName}</span>
                                  </div>
                                )}
                                {item.dryToppingName && (
                                  <div className="text-xs text-muted-foreground flex items-start gap-1">
                                    <span className="opacity-50">↳</span><span>{item.dryToppingName}</span>
                                  </div>
                                )}
                                {item.extraName && (
                                  <div className="text-xs text-muted-foreground flex items-start gap-1">
                                    <span className="opacity-50">↳</span><span>{item.extraName}</span>
                                  </div>
                                )}
                                {item.customModifiers && (() => {
                                  try {
                                    const modifiers = JSON.parse(item.customModifiers);
                                    return Object.values(modifiers).map((mod: any, idx: number) => (
                                      <div key={idx} className="text-xs text-muted-foreground flex items-start gap-1">
                                        <span className="opacity-50">↳</span>
                                        <span>{mod.stepName}: {mod.options.map((opt: any) => opt.name).join(', ')}</span>
                                      </div>
                                    ));
                                  } catch { return null; }
                                })()}
                                {item.notes && (
                                  <div className="text-xs text-yellow-600 dark:text-yellow-500 flex items-start gap-1 italic">
                                    <span className="opacity-50">↳</span><span>{item.notes}</span>
                                  </div>
                                )}
                                {item.isGuest && (
                                  <div className="text-xs text-yellow-600 dark:text-yellow-500 flex items-start gap-1 italic font-medium">
                                    <span className="opacity-50">↳</span>
                                    <span>Invitado</span>
                                  </div>
                                )}
                              </div>
                            )}
                            {!item.sentToKitchen && (
                              <div className="flex items-center gap-2 mt-2">
                                <Button variant="outline" size="sm" onClick={() => updateQuantity(index, -1)} className="h-7 w-7 p-0 bg-neutral-800 border-neutral-700 hover:bg-neutral-700 text-white">
                                  <Minus className="size-3" />
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => updateQuantity(index, 1)} className="h-7 w-7 p-0 bg-neutral-800 border-neutral-700 hover:bg-neutral-700 text-white">
                                  <Plus className="size-3" />
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      {item.sentToKitchen && item.orderStatus === "ready" && !item.deliveredToTable && (
                        <div className="bg-neutral-800 p-2 opacity-100 border-t border-neutral-700">
                          <Button onClick={() => handleMarkAsDelivered(index)} className="w-full bg-green-600 hover:bg-green-700 text-white border-0 font-semibold shadow-lg" size="sm">
                            <span className="mr-2">✓</span>Marcar como entregado a mesa
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              });
            })()
          )}
        </div>

        {/* Footer - botones de acción */}
        <div className="p-4 border-t border-neutral-800 bg-neutral-950 space-y-3">
          {/* Total */}
          <div className="flex items-center justify-between px-2 py-3 bg-neutral-900 rounded-lg border border-neutral-800">
            <span className="text-neutral-400 text-sm">Total</span>
            <span className="text-white text-2xl font-bold">{formatCurrency(cartTotal)}</span>
          </div>
          {/* Botón Enviar a Cocina */}
          {cart.some(item => !item.sentToKitchen) && (
            <Button
              onClick={handleSendToKitchen}
              disabled={cart.length === 0}
              className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold"
              size="lg"
            >
              Enviar a Cocina ({cart.filter(item => !item.sentToKitchen).length})
            </Button>
          )}
          
          {/* Botones Cobrar e Imprimir */}
          <div className="flex gap-2">
            <Button
              onClick={handleCheckout}
              disabled={cart.length === 0 || submitting}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold"
              size="lg"
            >
              {submitting ? "Procesando..." : "Cobrar"}
            </Button>
            <Button
              onClick={() => handlePrint()}
              disabled={cart.filter(i => i.sentToKitchen).length === 0}
              variant="outline"
              className="bg-neutral-800 border-neutral-700 text-white hover:bg-neutral-700"
              size="lg"
            >
              <Printer className="size-5" />
            </Button>
          </div>
        </div>
      </div>

      {/* VISTA DE PAGO O CATEGORÍAS/PRODUCTOS */}
      {/* LOYALTY STEP COMENTADO PARA FUTURO */}
      {showingPayment && paymentStep === "split-assign" ? (
        // PANTALLA: Asignar productos a personas
        <div className="flex-1 flex items-center justify-center p-4 bg-neutral-950">
          <div className="w-full max-w-5xl space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white">Dividir Cuenta</h2>
              <Button 
                variant="outline" 
                onClick={() => setPaymentStep("summary")}
                className="bg-neutral-900 border-neutral-800 text-white hover:bg-neutral-800"
              >
                ← Regresar
              </Button>
            </div>

            {/* Navegación de personas */}
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                onClick={() => setCurrentPersonIndex(Math.max(0, currentPersonIndex - 1))}
                disabled={currentPersonIndex === 0}
                className="bg-neutral-900 border-neutral-800 text-white hover:bg-neutral-800 disabled:opacity-30"
              >
                ← Anterior
              </Button>
              <div className="text-center">
                <p className="text-white font-semibold">Persona {currentPersonIndex + 1} de {guestCount}</p>
                <div className="flex gap-1 mt-2 justify-center">
                  {Array.from({ length: guestCount }).map((_, idx) => (
                    <div
                      key={idx}
                      className={`h-2 w-2 rounded-full ${
                        idx === currentPersonIndex ? 'bg-blue-600' : 'bg-neutral-700'
                      }`}
                    />
                  ))}
                </div>
              </div>
              <Button
                variant="outline"
                onClick={() => setCurrentPersonIndex(Math.min(guestCount - 1, currentPersonIndex + 1))}
                disabled={currentPersonIndex === guestCount - 1}
                className="bg-neutral-900 border-neutral-800 text-white hover:bg-neutral-800 disabled:opacity-30"
              >
                Siguiente →
              </Button>
            </div>

            {/* Lista de productos con checkboxes para asignar */}
            <Card className="bg-neutral-900 border-neutral-800">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-lg font-bold text-white">Persona {currentPersonIndex + 1}</h4>
                  <span className="text-sm text-neutral-400">
                    {(itemAssignments[currentPersonIndex] || []).length} items asignados
                  </span>
                </div>
                <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                  {cart.map((item, cartIndex) => {
                    const assignedItems = itemAssignments[currentPersonIndex] || [];
                    const isAssigned = assignedItems.includes(cartIndex);
                    const itemsAssignedToOthers = Object.entries(itemAssignments)
                      .filter(([idx]) => parseInt(idx) !== currentPersonIndex)
                      .flatMap(([_, items]) => items);
                    const isAssignedToOther = itemsAssignedToOthers.includes(cartIndex);

                    return (
                      <label
                        key={cartIndex}
                        className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                          isAssignedToOther
                            ? 'opacity-40 cursor-not-allowed bg-neutral-950 border-neutral-800'
                            : isAssigned 
                            ? 'bg-blue-600/20 border-blue-600 cursor-pointer' 
                            : 'bg-neutral-950 border-neutral-800 cursor-pointer hover:bg-neutral-900 hover:border-neutral-700'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isAssigned}
                          disabled={isAssignedToOther}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setItemAssignments(prev => ({
                                ...prev,
                                [currentPersonIndex]: [...(prev[currentPersonIndex] || []), cartIndex]
                              }));
                            } else {
                              setItemAssignments(prev => ({
                                ...prev,
                                [currentPersonIndex]: (prev[currentPersonIndex] || []).filter(i => i !== cartIndex)
                              }));
                            }
                          }}
                          className="size-5 cursor-pointer accent-blue-600"
                        />
                        <div className="flex-1 text-sm">
                          <span className="text-white font-medium">{item.quantity}x {item.productName}</span>
                          {isAssignedToOther && (
                            <span className="text-xs text-neutral-500 ml-2">(asignado a otra persona)</span>
                          )}
                        </div>
                        <span className="text-sm font-semibold text-blue-400">
                          {formatCurrency(item.unitPrice * item.quantity)}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Botón Confirmar División */}
            {(() => {
              const totalAssigned = Object.values(itemAssignments).flat().length;
              const allAssigned = totalAssigned === cart.length;
              return (
                <Button
                  onClick={() => {
                    setPaymentStep("split-overview");
                    saveSplitBillData(currentOrderId, itemAssignments, individualPayments, individualTips, guestCount, "split-overview");
                  }}
                  disabled={!allAssigned}
                  className="w-full h-14 text-base font-semibold bg-green-600 hover:bg-green-700 text-white border-0 disabled:opacity-50"
                >
                  <Check className="mr-2 size-5" weight="bold" />
                  {allAssigned 
                    ? 'Confirmar Division' 
                    : `Faltan ${cart.length - totalAssigned} items por asignar`
                  }
                </Button>
              );
            })()}
          </div>
        </div>
      ) : showingPayment && paymentStep === "split-overview" ? (
        // PANTALLA: Resumen de division — lista de personas con estado
        <div className="flex-1 flex items-center justify-center p-4 bg-neutral-950">
          <div className="w-full max-w-lg space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white">Cobro Dividido</h2>
              <Button 
                variant="outline" 
                onClick={() => setPaymentStep("split-assign")}
                className="bg-neutral-900 border-neutral-800 text-white hover:bg-neutral-800"
              >
                ← Editar Division
              </Button>
            </div>

            {/* Totales arriba */}
            {(() => {
              const totalPaid = Object.values(individualPayments).reduce((sum, p) => p.paid ? sum + p.amount : sum, 0);
              const remaining = cartTotal - totalPaid;
              return (
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-3 text-center">
                    <p className="text-xs text-neutral-400">Total</p>
                    <p className="text-lg font-bold text-white">{formatCurrency(cartTotal)}</p>
                  </div>
                  <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-3 text-center">
                    <p className="text-xs text-neutral-400">Pagado</p>
                    <p className="text-lg font-bold text-green-400">{formatCurrency(totalPaid)}</p>
                  </div>
                  <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-3 text-center">
                    <p className="text-xs text-neutral-400">Restante</p>
                    <p className="text-lg font-bold text-yellow-400">{formatCurrency(Math.max(0, remaining))}</p>
                  </div>
                </div>
              );
            })()}

            {/* Lista de personas */}
            <div className="space-y-2">
              {Array.from({ length: guestCount }).map((_, idx) => {
                const payment = individualPayments[idx];
                const hasPaid = payment?.paid || false;
                const assignedItems = itemAssignments[idx] || [];
                const personTotal = assignedItems.reduce((sum, cartIndex) => {
                  return sum + (cart[cartIndex]?.unitPrice || 0) * (cart[cartIndex]?.quantity || 0);
                }, 0);

                return (
                  <div
                    key={idx}
                    onClick={() => {
                      if (!hasPaid) {
                        setSelectedSplitPersonIndex(idx);
                        setSplitPaymentMethod(null);
                        setSplitCashReceived("");
                        setPaymentStep("split-pay-person");
                      }
                    }}
                    className={`flex items-center gap-3 p-4 rounded-lg border transition-all ${
                      hasPaid 
                        ? 'bg-green-600/10 border-green-600/30' 
                        : 'bg-neutral-900 border-neutral-800 cursor-pointer hover:bg-neutral-800 hover:border-neutral-700'
                    }`}
                  >
                    <div className={`p-2 rounded-full ${hasPaid ? 'bg-green-600' : 'bg-blue-600'}`}>
                      <Users className="size-4 text-white" weight="fill" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-white">Persona {idx + 1}</p>
                      <p className="text-xs text-neutral-400">{assignedItems.length} items</p>
                    </div>
                    <p className={`text-base font-bold ${hasPaid ? 'text-green-400' : 'text-white'}`}>
                      {formatCurrency(hasPaid ? payment.amount : personTotal)}
                    </p>
                    {hasPaid ? (
                      <Badge className="bg-green-600 text-white text-xs border-0">
                        <Check className="size-3 mr-1" weight="bold" /> Pagado
                      </Badge>
                    ) : (
                      <Badge className="bg-yellow-600 text-white text-xs border-0">Pendiente</Badge>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Auto-cierre: si todos pagaron */}
            {Object.keys(individualPayments).length > 0 && Object.values(individualPayments).every(p => p.paid) && (
              <div className="space-y-3">
                <Card className="bg-green-600/10 border-green-600">
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="bg-green-600 p-3 rounded-full">
                      <Check className="size-6 text-white" weight="bold" />
                    </div>
                    <div>
                      <p className="text-lg font-bold text-white">Todos han pagado</p>
                      <p className="text-sm text-neutral-400">Total: {formatCurrency(
                        Object.values(individualPayments).reduce((sum, p) => sum + p.amount, 0)
                      )}</p>
                    </div>
                  </CardContent>
                </Card>
                <SlideToConfirm 
                  onConfirm={async () => {
                    if (!currentOrderId) return;
                    setConfirmingOrder(true);
                    try {
                      // Construir resumen final por persona
                      const splitSummary: { finalized: true, guestCount: number, persons: any[] } = {
                        finalized: true,
                        guestCount,
                        persons: [],
                      };
                      let totalTips = 0;
                      
                      for (let i = 0; i < guestCount; i++) {
                        const assignedItems = itemAssignments[i] || [];
                        const personSubtotal = assignedItems.reduce((s, ci) => s + (cart[ci]?.unitPrice || 0) * (cart[ci]?.quantity || 0), 0);
                        const tipData = individualTips[i] || { percentage: 0, custom: '', showCustom: false };
                        const tipAmt = tipData.showCustom ? parseFloat(tipData.custom) || 0 : personSubtotal * tipData.percentage / 100;
                        totalTips += tipAmt;
                        const payment = individualPayments[i] || { paid: false, method: null, amount: 0 };
                        
                        splitSummary.persons.push({
                          index: i,
                          items: assignedItems.map(ci => ({
                            name: cart[ci]?.productName,
                            qty: cart[ci]?.quantity,
                            price: (cart[ci]?.unitPrice || 0) * (cart[ci]?.quantity || 0),
                          })),
                          subtotal: personSubtotal,
                          tipAmount: tipAmt,
                          tipLabel: tipData.showCustom ? "Otro" : (tipData.percentage > 0 ? `${tipData.percentage}%` : "Sin"),
                          total: personSubtotal + tipAmt,
                          method: payment.method,
                        });
                      }
                      
                      // CONSOLIDACIÓN DESHABILITADA - Mantener todas las órdenes separadas
                      // const siblingOrderIds = [...new Set(cart.map(item => item.orderId).filter(id => id && id !== currentOrderId))];
                      // if (siblingOrderIds.length > 0) {
                      //   console.log("🔀 Consolidando", siblingOrderIds.length, "órdenes hermanas");
                      //   await fetch(`/api/orders/${currentOrderId}/consolidate`, {
                      //     method: "POST",
                      //     headers: { "Content-Type": "application/json" },
                      //     body: JSON.stringify({ siblingOrderIds }),
                      //   });
                      // }
                      
                      const res = await fetch(`${getApiUrl()}/api/orders/${currentOrderId}/pay`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          paymentMethod: "split",
                          loyaltyCardId: loyaltyCard?.id || null,
                          loyaltyStamps: 1,
                          userId: employeeId,
                          tip: totalTips,
                          subtotal: cartTotal,
                        }),
                      });
                      if (!res.ok) throw new Error();
                      // Guardar resumen de split finalizado (no borrar — se usa en historial)
                      await fetch(`/api/orders/${currentOrderId}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ splitBillData: splitSummary }),
                      });
                      toast.success("Pago dividido completado - Mesa liberada");
                      handlePrint();
                      handleConfirmOrder();
                    } catch {
                      toast.error("Error procesando pago dividido");
                    } finally {
                      setConfirmingOrder(false);
                    }
                  }} 
                  disabled={confirmingOrder} 
                />
              </div>
            )}

            {/* Botón continuar orden — salir del cobro para añadir más items */}
            <Button 
              variant="outline" 
              onClick={() => {
                // Guardar estado de split antes de salir
                saveSplitBillData(currentOrderId, itemAssignments, individualPayments, individualTips, guestCount, "split-overview");
                setShowingPayment(false);
                setPaymentStep("summary");
                toast.success("Puedes añadir más productos. Cuando termines, presiona Cobrar para continuar.");
              }}
              className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white border-0 font-semibold"
            >
              + Continuar Orden
            </Button>

            {/* Botón cancelar */}
            <Button 
              variant="outline" 
              onClick={() => {
                setPaymentStep("summary");
              }}
              className="w-full bg-neutral-900 border-neutral-800 text-neutral-400 hover:bg-neutral-800 hover:text-white"
            >
              Cancelar Cobro
            </Button>
          </div>
        </div>
      ) : showingPayment && paymentStep === "split-pay-person" ? (
        // PANTALLA: Pago individual de una persona
        <div className="flex-1 flex items-center justify-center p-4 bg-neutral-950">
          <div className="w-full max-w-lg space-y-3">
            {(() => {
              const pIdx = selectedSplitPersonIndex;
              const assignedItems = itemAssignments[pIdx] || [];
              const personTotal = assignedItems.reduce((sum, ci) => sum + (cart[ci]?.unitPrice || 0) * (cart[ci]?.quantity || 0), 0);
              const tipData = individualTips[pIdx] || { percentage: 0, custom: '', showCustom: false };
              const tipAmt = tipData.showCustom ? parseFloat(tipData.custom) || 0 : personTotal * tipData.percentage / 100;
              const finalTotal = personTotal + tipAmt;

              return (
                <>
                  <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-bold text-white">Persona {pIdx + 1}</h2>
                    <Button 
                      variant="outline" 
                      onClick={() => setPaymentStep("split-overview")}
                      className="bg-neutral-900 border-neutral-800 text-white hover:bg-neutral-800"
                    >
                      ← Regresar
                    </Button>
                  </div>

                  {/* Items asignados */}
                  <Card className="bg-neutral-900 border-neutral-800">
                    <CardContent className="p-4">
                      <h4 className="text-sm font-semibold text-white mb-2">Productos</h4>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {assignedItems.map((ci) => (
                          <div key={ci} className="flex justify-between text-sm py-1">
                            <span className="text-white">{cart[ci]?.quantity}x {cart[ci]?.productName}</span>
                            <span className="text-neutral-400">{formatCurrency((cart[ci]?.unitPrice || 0) * (cart[ci]?.quantity || 0))}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Propina individual */}
                  <Card className="bg-neutral-900 border-neutral-800">
                    <CardContent className="p-4">
                      <h4 className="text-sm font-semibold text-white mb-2">Propina</h4>
                      <div className="grid grid-cols-5 gap-2">
                        {[0, 10, 15, 20].map(pct => (
                          <Button
                            key={pct}
                            variant="outline"
                            size="sm"
                            onClick={() => setIndividualTips(prev => ({ ...prev, [pIdx]: { percentage: pct, custom: '', showCustom: false } }))}
                            className={`h-10 text-sm font-semibold ${
                              tipData.percentage === pct && !tipData.showCustom
                                ? 'bg-blue-600 border-blue-500 text-white hover:bg-blue-700'
                                : 'bg-neutral-800 border-neutral-700 text-white hover:bg-neutral-700'
                            }`}
                          >
                            {pct === 0 ? 'Sin' : `${pct}%`}
                          </Button>
                        ))}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setIndividualTips(prev => ({ ...prev, [pIdx]: { percentage: 0, custom: '', showCustom: true } }))}
                          className={`h-10 text-sm font-semibold ${
                            tipData.showCustom ? 'bg-blue-600 border-blue-500 text-white' : 'bg-neutral-800 border-neutral-700 text-white hover:bg-neutral-700'
                          }`}
                        >
                          Otro
                        </Button>
                      </div>
                      {tipData.showCustom && (
                        <Input
                          type="number"
                          placeholder="0.00"
                          value={tipData.custom}
                          onChange={(e) => setIndividualTips(prev => ({ ...prev, [pIdx]: { ...tipData, custom: e.target.value } }))}
                          className="mt-2 bg-neutral-950 border-neutral-800 text-white h-10"
                        />
                      )}
                    </CardContent>
                  </Card>

                  {/* Totales */}
                  <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 space-y-2">
                    <div className="flex justify-between text-sm text-neutral-400">
                      <span>Subtotal:</span>
                      <span className="font-semibold">{formatCurrency(personTotal)}</span>
                    </div>
                    {tipAmt > 0 && (
                      <div className="flex justify-between text-sm text-blue-400">
                        <span>Propina:</span>
                        <span className="font-semibold">{formatCurrency(tipAmt)}</span>
                      </div>
                    )}
                    <div className="border-t border-neutral-700 pt-2"></div>
                    <div className="flex justify-between text-xl font-bold text-white">
                      <span>Total:</span>
                      <span>{formatCurrency(finalTotal)}</span>
                    </div>
                  </div>

                  {/* Método de pago */}
                  <div className="grid grid-cols-3 gap-3">
                    <Card
                      className={`cursor-pointer transition-all hover:shadow-lg ${splitPaymentMethod === "cash" ? "ring-2 ring-green-500" : "bg-neutral-900 border-neutral-800"}`}
                      onClick={() => setSplitPaymentMethod("cash")}
                    >
                      <CardContent className="flex flex-col items-center justify-center p-4">
                        <Money className="mb-2 size-10 text-green-600" />
                        <p className="text-sm font-semibold text-white">Efectivo</p>
                      </CardContent>
                    </Card>
                    <Card
                      className={`cursor-pointer transition-all hover:shadow-lg ${splitPaymentMethod === "terminal_mercadopago" ? "ring-2 ring-blue-500" : "bg-neutral-900 border-neutral-800"}`}
                      onClick={() => setSplitPaymentMethod("terminal_mercadopago")}
                    >
                      <CardContent className="flex flex-col items-center justify-center p-4">
                        <CreditCard className="mb-2 size-10 text-blue-600" />
                        <p className="text-sm font-semibold text-white">Terminal</p>
                      </CardContent>
                    </Card>
                    <Card
                      className={`cursor-pointer transition-all hover:shadow-lg ${splitPaymentMethod === "transfer" ? "ring-2 ring-purple-500" : "bg-neutral-900 border-neutral-800"}`}
                      onClick={() => setSplitPaymentMethod("transfer")}
                    >
                      <CardContent className="flex flex-col items-center justify-center p-4">
                        <Bank className="mb-2 size-10 text-purple-600" />
                        <p className="text-sm font-semibold text-white">Transferencia</p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Efectivo: input recibido + cambio */}
                  {splitPaymentMethod === "cash" && (
                    <Card className="bg-neutral-900 border-neutral-800">
                      <CardContent className="p-4 space-y-3">
                        <Label className="text-white">Efectivo recibido</Label>
                        <Input
                          type="number"
                          placeholder="0.00"
                          value={splitCashReceived}
                          onChange={(e) => setSplitCashReceived(e.target.value)}
                          className="text-2xl font-bold bg-neutral-950 border-neutral-800 text-white"
                          autoFocus
                        />
                        {parseFloat(splitCashReceived) > 0 && (
                          <div className="flex justify-between rounded-lg bg-neutral-950 p-3">
                            <span className="text-white">Cambio</span>
                            <span className={`text-xl font-bold ${parseFloat(splitCashReceived) >= finalTotal ? 'text-green-400' : 'text-red-400'}`}>
                              {formatCurrency(Math.max(0, parseFloat(splitCashReceived) - finalTotal))}
                            </span>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* Slide to confirm */}
                  {splitPaymentMethod && (splitPaymentMethod !== "cash" || parseFloat(splitCashReceived) >= finalTotal) && (
                    <SlideToConfirm 
                      onConfirm={() => {
                        const updatedPayments = {
                          ...individualPayments,
                          [pIdx]: { paid: true, method: splitPaymentMethod, amount: finalTotal }
                        };
                        setIndividualPayments(updatedPayments);
                        // Persistir en BD
                        saveSplitBillData(
                          currentOrderId,
                          itemAssignments,
                          updatedPayments,
                          individualTips,
                          guestCount,
                          "split-overview"
                        );
                        toast.success(`Persona ${pIdx + 1} - Pago registrado: ${formatCurrency(finalTotal)}`);
                        setPaymentStep("split-overview");
                      }} 
                      disabled={false} 
                    />
                  )}
                </>
              );
            })()}
          </div>
        </div>
      ) : showingPayment && paymentStep === "summary" ? (
        // PANTALLA: Summary — Total, Pagado, Restante, Cobrar Todo / Dividir
        <div className="flex-1 flex items-center justify-center p-4 bg-neutral-950">
          <div className="w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white">Cobrar</h2>
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowingPayment(false);
                  setPaymentMethod(null);
                  setCashReceived("");
                  setTipPercentage(0);
                  setCustomTip("");
                  setShowCustomTip(false);
                }}
                className="bg-neutral-900 border-neutral-800 text-white hover:bg-neutral-800"
              >
                ← Cancelar
              </Button>
            </div>

            {/* Selector de Descuento */}
            {availableDiscounts.length > 0 && (
              <Card className="bg-neutral-900 border-neutral-800">
                <CardContent className="p-4">
                  <Label className="text-white mb-2 block">Descuento (opcional)</Label>
                  <Select
                    value={selectedDiscount?.id || "none"}
                    onValueChange={(value) => {
                      if (value === "none") {
                        setSelectedDiscount(null);
                      } else {
                        const discount = availableDiscounts.find(d => d.id === value);
                        if (discount && discount.type === "flexible") {
                          setSelectedDiscount(discount);
                          setShowFlexibleDiscountDialog(true);
                        } else {
                          setSelectedDiscount(discount || null);
                        }
                      }
                    }}
                  >
                    <SelectTrigger className="bg-neutral-800 border-neutral-700 text-white">
                      <SelectValue placeholder="Sin descuento" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin descuento</SelectItem>
                      {availableDiscounts.map((discount) => (
                        <SelectItem key={discount.id} value={discount.id}>
                          {discount.name} (
                          {discount.type === "percentage" ? `${discount.value}%` : 
                           discount.type === "fixed_amount" ? `$${discount.value}` :
                           "Flexible"})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>
            )}

            {/* Resumen de totales */}
            <Card className="bg-neutral-900 border-neutral-800">
              <CardContent className="p-6 space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-neutral-400">Subtotal</span>
                  <span className="text-2xl font-bold text-white">{formatCurrency(cartSubtotal)}</span>
                </div>
                {selectedDiscount && (() => {
                  let discountValue = parseFloat(selectedDiscount.value.toString());
                  
                  // For flexible discounts, use the selected value
                  if (selectedDiscount.type === "flexible") {
                    if (flexibleDiscountType === "percentage") {
                      discountValue = flexibleDiscountValue;
                    } else {
                      discountValue = parseFloat(customFlexibleAmount) || 0;
                    }
                  }
                  
                  const discountAmount = calculateDiscount(
                    cartTotal,
                    selectedDiscount.type === "flexible" ? 
                      (flexibleDiscountType === "percentage" ? "percentage" : "fixed_amount") :
                      selectedDiscount.type,
                    discountValue
                  );
                  const finalTotal = cartTotal - discountAmount;
                  return (
                    <>
                      <div className="flex justify-between items-center">
                        <span className="text-yellow-400">{selectedDiscount.name}</span>
                        <span className="text-lg font-semibold text-yellow-400">-{formatCurrency(discountAmount)}</span>
                      </div>
                      <div className="border-t border-neutral-700 pt-3 flex justify-between items-center">
                        <span className="text-white font-medium">Total</span>
                        <span className="text-3xl font-bold text-green-400">{formatCurrency(finalTotal)}</span>
                      </div>
                    </>
                  );
                })()}
                {!selectedDiscount && (
                  <div className="border-t border-neutral-700 pt-3 flex justify-between items-center">
                    <span className="text-white font-medium">Total</span>
                    <span className="text-3xl font-bold text-white">{formatCurrency(cartTotal)}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Botones de acción */}
            <Button
              onClick={() => {
                setPaymentStep("payment");
                setPaymentMethod(null);
                setCashReceived("");
              }}
              className="w-full h-16 text-lg font-semibold bg-green-600 hover:bg-green-700 text-white"
            >
              <Money className="mr-3 size-6" />
              Cobrar Todo
            </Button>

            {guestCount > 1 && (
              <Button
                variant="outline"
                onClick={() => {
                  if (Object.keys(itemAssignments).length === 0) {
                    const initialAssignments: Record<number, number[]> = {};
                    const initialPayments: Record<number, { paid: boolean, method: string | null, amount: number }> = {};
                    const initialTips: Record<number, { percentage: number, custom: string, showCustom: boolean }> = {};
                    for (let i = 0; i < guestCount; i++) {
                      initialAssignments[i] = [];
                      initialPayments[i] = { paid: false, method: null, amount: 0 };
                      initialTips[i] = { percentage: 0, custom: '', showCustom: false };
                    }
                    setItemAssignments(initialAssignments);
                    setIndividualPayments(initialPayments);
                    setIndividualTips(initialTips);
                  }
                  setCurrentPersonIndex(0);
                  setPaymentStep("split-assign");
                }}
                className="w-full h-14 text-base font-semibold bg-blue-600 hover:bg-blue-700 text-white border-0"
              >
                <Users className="mr-2 size-5" weight="fill" />
                Dividir Cuenta ({guestCount} personas)
              </Button>
            )}
          </div>
        </div>
      ) : showingPayment && paymentStep === "payment" ? (
        // PANTALLA: Seleccionar método de pago + propina
        <div className="flex-1 flex items-center justify-center p-4 bg-neutral-950">
          <div className="w-full max-w-lg space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white">Pago</h2>
              <Button 
                variant="outline" 
                onClick={() => setPaymentStep("summary")}
                className="bg-neutral-900 border-neutral-800 text-white hover:bg-neutral-800"
              >
                ← Regresar
              </Button>
            </div>

            {/* Propina */}
            <Card className="bg-neutral-900 border-neutral-800">
              <CardContent className="p-4">
                <h4 className="text-sm font-semibold text-white mb-3">Propina (Servicio)</h4>
                <div className="grid grid-cols-5 gap-2">
                  {[0, 10, 15, 20].map(pct => (
                    <Button
                      key={pct}
                      variant="outline"
                      size="sm"
                      onClick={() => { setTipPercentage(pct); setCustomTip(""); setShowCustomTip(false); }}
                      className={`h-10 text-sm font-semibold ${
                        tipPercentage === pct && !showCustomTip
                          ? 'bg-blue-600 border-blue-500 text-white hover:bg-blue-700'
                          : 'bg-neutral-800 border-neutral-700 text-white hover:bg-neutral-700'
                      }`}
                    >
                      {pct === 0 ? 'Sin' : `${pct}%`}
                    </Button>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setShowCustomTip(true); setTipPercentage(0); }}
                    className={`h-10 text-sm font-semibold ${
                      showCustomTip ? 'bg-blue-600 border-blue-500 text-white' : 'bg-neutral-800 border-neutral-700 text-white hover:bg-neutral-700'
                    }`}
                  >
                    Otro
                  </Button>
                </div>
                {showCustomTip && (
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={customTip}
                    onChange={(e) => setCustomTip(e.target.value)}
                    className="mt-2 bg-neutral-950 border-neutral-800 text-white h-10"
                  />
                )}
              </CardContent>
            </Card>

            {/* Total con propina */}
            {(() => {
              const tipAmt = showCustomTip ? parseFloat(customTip) || 0 : cartTotalWithDiscount * tipPercentage / 100;
              const totalWithTip = cartTotalWithDiscount + tipAmt;
              return (
                <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between text-sm text-neutral-400">
                    <span>Subtotal:</span>
                    <span>{formatCurrency(cartTotalWithDiscount)}</span>
                  </div>
                  {tipAmt > 0 && (
                    <div className="flex justify-between text-sm text-blue-400">
                      <span>Propina:</span>
                      <span>{formatCurrency(tipAmt)}</span>
                    </div>
                  )}
                  <div className="border-t border-neutral-700 pt-2"></div>
                  <div className="flex justify-between text-xl font-bold text-white">
                    <span>Total:</span>
                    <span>{formatCurrency(totalWithTip)}</span>
                  </div>
                </div>
              );
            })()}

            {/* Botón especial para Delivery de plataforma (Uber/Rappi) */}
            {customerName && (customerName.startsWith('Uber') || customerName.startsWith('Rappi') || customerName.startsWith('Didi')) ? (
              <div className="space-y-4">
                <div className="bg-orange-900/20 border border-orange-800/50 rounded-lg p-4">
                  <p className="text-sm text-orange-200 mb-2">
                    🏍️ Esta es una orden de delivery de plataforma
                  </p>
                  <p className="text-xs text-orange-300/70">
                    El pago es manejado por {customerName.split(' ')[0]}. Solo marca como entregado al repartidor.
                  </p>
                </div>
                <Button
                  size="lg"
                  className="w-full h-16 text-lg font-semibold bg-orange-600 hover:bg-orange-700"
                  onClick={handleDeliverToDriver}
                  disabled={processing}
                >
                  {processing ? (
                    <>
                      <Spinner className="mr-2 size-5 animate-spin" />
                      Procesando...
                    </>
                  ) : (
                    <>
                      ✅ Entregar a Repartidor
                    </>
                  )}
                </Button>
              </div>
            ) : (
              // Métodos de pago normales
              <>
                <div className="grid grid-cols-3 gap-3">
                  <Card
                    className={`cursor-pointer transition-all hover:shadow-lg ${paymentMethod === "cash" ? "ring-2 ring-green-500" : "bg-neutral-900 border-neutral-800"}`}
                    onClick={() => setPaymentMethod("cash")}
                  >
                    <CardContent className="flex flex-col items-center justify-center p-4">
                      <Money className="mb-2 size-10 text-green-600" />
                      <p className="text-sm font-semibold text-white">Efectivo</p>
                    </CardContent>
                  </Card>
                  <Card
                    className={`cursor-pointer transition-all hover:shadow-lg ${paymentMethod === "terminal_mercadopago" ? "ring-2 ring-blue-500" : "bg-neutral-900 border-neutral-800"}`}
                    onClick={() => setPaymentMethod("terminal_mercadopago")}
                  >
                    <CardContent className="flex flex-col items-center justify-center p-4">
                      <CreditCard className="mb-2 size-10 text-blue-600" />
                      <p className="text-sm font-semibold text-white">Terminal</p>
                    </CardContent>
                  </Card>
                  <Card
                    className={`cursor-pointer transition-all hover:shadow-lg ${paymentMethod === "transfer" ? "ring-2 ring-purple-500" : "bg-neutral-900 border-neutral-800"}`}
                    onClick={() => setPaymentMethod("transfer")}
                  >
                    <CardContent className="flex flex-col items-center justify-center p-4">
                      <Bank className="mb-2 size-10 text-purple-600" />
                      <p className="text-sm font-semibold text-white">Transferencia</p>
                    </CardContent>
                  </Card>
                </div>
              </>
            )}

            {/* Efectivo: recibido + cambio */}
            {paymentMethod === "cash" && (
              <Card className="bg-neutral-900 border-neutral-800">
                <CardContent className="p-4 space-y-3">
                  <Label className="text-white">Efectivo recibido</Label>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={cashReceived}
                    onChange={(e) => setCashReceived(e.target.value)}
                    className="text-2xl font-bold bg-neutral-950 border-neutral-800 text-white"
                    autoFocus
                  />
                  {(() => {
                    const tipAmt = showCustomTip ? parseFloat(customTip) || 0 : cartTotalWithDiscount * tipPercentage / 100;
                    const totalWithTip = cartTotalWithDiscount + tipAmt;
                    return parseFloat(cashReceived) > 0 ? (
                      <div className="flex justify-between rounded-lg bg-neutral-950 p-3">
                        <span className="text-white">Cambio</span>
                        <span className={`text-xl font-bold ${parseFloat(cashReceived) >= totalWithTip ? 'text-green-400' : 'text-red-400'}`}>
                          {formatCurrency(Math.max(0, parseFloat(cashReceived) - totalWithTip))}
                        </span>
                      </div>
                    ) : null;
                  })()}
                </CardContent>
              </Card>
            )}

            {/* Botón continuar a confirmación */}
            {paymentMethod && (
              <Button
                size="lg"
                className="w-full h-14 text-lg font-semibold"
                disabled={paymentMethod === "cash" && (() => {
                  const tipAmt = showCustomTip ? parseFloat(customTip) || 0 : cartTotalWithDiscount * tipPercentage / 100;
                  return parseFloat(cashReceived) < cartTotalWithDiscount + tipAmt;
                })()}
                onClick={() => setPaymentStep("confirmation")}
              >
                Continuar →
              </Button>
            )}
          </div>
        </div>
      ) : showingPayment && paymentStep === "confirmation" ? (
        // PANTALLA: Confirmación final + Slide to confirm
        <div className="flex-1 flex items-center justify-center p-4 bg-neutral-950">
          <div className="w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white">Confirmar Pago</h2>
              <Button 
                variant="outline" 
                onClick={() => setPaymentStep("payment")}
                className="bg-neutral-900 border-neutral-800 text-white hover:bg-neutral-800"
              >
                ← Regresar
              </Button>
            </div>

            {/* Resumen final */}
            {(() => {
              const tipAmt = showCustomTip ? parseFloat(customTip) || 0 : cartTotalWithDiscount * tipPercentage / 100;
              const totalWithTip = cartTotalWithDiscount + tipAmt;
              return (
                <Card className="bg-neutral-900 border-neutral-800">
                  <CardContent className="p-6 space-y-3">
                    <div className="flex justify-between text-sm text-neutral-400">
                      <span>Subtotal:</span>
                      <span>{formatCurrency(cartTotalWithDiscount)}</span>
                    </div>
                    {tipAmt > 0 && (
                      <div className="flex justify-between text-sm text-blue-400">
                        <span>Propina:</span>
                        <span>{formatCurrency(tipAmt)}</span>
                      </div>
                    )}
                    <div className="border-t border-neutral-700 pt-3"></div>
                    <div className="flex justify-between text-2xl font-bold text-white">
                      <span>Total:</span>
                      <span>{formatCurrency(totalWithTip)}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-sm text-neutral-400">Método:</span>
                      <Badge className="bg-neutral-800 text-white border-0">
                        {paymentMethod === "cash" ? "Efectivo" : paymentMethod === "transfer" ? "Transferencia" : "Terminal"}
                      </Badge>
                    </div>
                    {paymentMethod === "cash" && parseFloat(cashReceived) > 0 && (
                      <div className="flex justify-between text-sm text-green-400 mt-1">
                        <span>Cambio:</span>
                        <span className="font-semibold">{formatCurrency(Math.max(0, parseFloat(cashReceived) - totalWithTip))}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })()}

            {/* Slide to confirm */}
            <SlideToConfirm 
              onConfirm={async () => {
                if (paymentMethod === "cash") {
                  await handlePayCash();
                } else if (paymentMethod === "transfer") {
                  await handlePayTransfer();
                } else if (paymentMethod === "terminal_mercadopago") {
                  await handlePayTerminal();
                }
                // handlePayCash/Transfer/Terminal ya llaman setPaymentCompleted(true)
                // y después mostramos la pantalla done
                setPaymentStep("done");
              }} 
              disabled={processing} 
            />
          </div>
        </div>
      ) : showingPayment && paymentStep === "done" ? (
        // PANTALLA: Pago completado
        <div className="flex-1 flex items-center justify-center p-4 bg-neutral-950">
          <div className="w-full max-w-md space-y-4">
            <Card className="border-green-600 bg-green-600/10">
              <CardContent className="flex flex-col items-center justify-center p-8">
                <Check className="mb-4 size-20 text-green-600" weight="bold" />
                <p className="text-2xl font-bold text-white mb-2">Pago Completado</p>
                <p className="text-neutral-400">
                  {paymentMethod === "cash" && "Efectivo recibido"}
                  {paymentMethod === "transfer" && "Transferencia confirmada"}
                  {paymentMethod === "terminal_mercadopago" && "Pago con terminal confirmado"}
                </p>
                <p className="text-3xl font-bold text-white mt-4">{formatCurrency(
                  cartTotalWithDiscount + (showCustomTip ? parseFloat(customTip) || 0 : cartTotalWithDiscount * tipPercentage / 100)
                )}</p>
              </CardContent>
            </Card>

            <Button
              onClick={handleConfirmOrder}
              className="w-full h-14 text-lg font-semibold bg-green-600 hover:bg-green-700 text-white"
            >
              Finalizar
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* COLUMNA DE CATEGORÍAS VERTICAL */}
          <div className="w-64 bg-neutral-950 border-r border-neutral-800 flex flex-col overflow-y-auto">
            {/* Botón Menú Admin */}
            <div className="p-3 border-b border-neutral-800">
              <Button
                onClick={() => setShowAdminMenu(true)}
                variant="outline"
                className="w-full bg-neutral-900 border-neutral-700 text-white hover:bg-neutral-800 hover:text-white"
              >
                <GearSix className="size-4 mr-2" />
                Menú Admin
              </Button>
            </div>
            
            {/* Searchbar */}
            <div className="p-4 border-b border-neutral-800">
              <div className="relative">
                <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-500" />
                <Input
                  placeholder="Buscar productos..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    if (e.target.value) setSelectedCategory(null);
                  }}
                  className="pl-9 bg-neutral-900 border-neutral-800 text-white placeholder:text-neutral-500 focus:border-blue-600"
                />
              </div>
            </div>

            {/* Categorías */}
            <div className="p-3 space-y-2">
              {categories.map((category) => {
                const isSelected = selectedCategory === category.id;
                const categoryColor = category.color || '#6B7280';
                
                return (
                  <button
                    key={category.id}
                    onClick={() => {
                      setSelectedCategory(category.id);
                      setSearchQuery('');
                      resetFlow();
                    }}
                    className={`w-full px-4 py-4 text-left rounded-lg transition-all font-medium relative overflow-hidden ${
                      isSelected 
                        ? 'bg-neutral-900 border-2 shadow-lg' 
                        : 'bg-neutral-900/50 border border-neutral-800 hover:bg-neutral-900 hover:border-neutral-700'
                    }`}
                    style={{
                      borderColor: isSelected ? categoryColor : undefined,
                      color: isSelected ? categoryColor : '#fff',
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span>{category.name}</span>
                      {isSelected && (
                        <div 
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: categoryColor }}
                        />
                      )}
                    </div>
                    {isSelected && (
                      <div 
                        className="absolute left-0 top-0 bottom-0 w-1"
                        style={{ backgroundColor: categoryColor }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* AREA PRINCIPAL - FLUJO DINÁMICO */}
          <div className="flex-1 flex flex-col overflow-hidden bg-neutral-900">
        {/* Header con título y botón back */}
        <div className="p-4 bg-neutral-950 border-b border-neutral-800 flex items-center justify-between">
          <div>
            {currentStepIndex === -1 && <h2 className="text-2xl font-bold text-white">Selecciona un producto</h2>}
            {currentStepIndex >= 0 && categoryFlow && currentStepIndex === categoryFlow.steps.length && (
              <div>
                <h2 className="text-2xl font-bold text-white">Notas (opcional)</h2>
                <p className="text-sm text-neutral-400">{selectedProduct?.name}</p>
              </div>
            )}
            {currentStepIndex >= 0 && categoryFlow && categoryFlow.steps[currentStepIndex] && (
              <div>
                <h2 className="text-2xl font-bold text-white">{categoryFlow.steps[currentStepIndex].stepName}</h2>
                <p className="text-sm text-neutral-400">{selectedProduct?.name}</p>
              </div>
            )}
          </div>
          {currentStepIndex >= 0 && (
            <Button 
              variant="outline" 
              onClick={handleBackInFlow}
              className="bg-neutral-900 border-neutral-800 text-white hover:bg-neutral-800"
            >
              ← Atrás
            </Button>
          )}
        </div>

        {/* VISTA: PRODUCTOS */}
        {currentStepIndex === -1 && (
          <div className="flex-1 overflow-auto p-6">
            {!selectedCategory ? (
              <div className="flex items-center justify-center h-full text-neutral-500">
                Selecciona una categoría para ver productos
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="flex items-center justify-center h-full text-neutral-500">
                No hay productos en esta categoría
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-4">
                {filteredProducts.map((product) => {
                  const category = categories.find(c => c.id === product.categoryId);
                  return (
                    <button
                      key={product.id}
                      onClick={() => handleProductClick(product)}
                      className="rounded-lg overflow-hidden relative hover:scale-[1.02] transition-all bg-neutral-800 border border-neutral-700 hover:border-blue-600 hover:shadow-xl"
                      style={{ minHeight: '180px' }}
                    >
                      {product.imageUrl ? (
                        <div className="absolute inset-0">
                          <img 
                            src={product.imageUrl} 
                            alt={product.name}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
                        </div>
                      ) : (
                        <div className="absolute inset-0 bg-gradient-to-br from-neutral-800 to-neutral-900" />
                      )}
                      <div className="relative z-10 p-4 flex flex-col justify-between h-full min-h-[180px]">
                        <div className="text-left">
                          <div className="font-semibold text-white text-lg mb-2">
                            {product.name}
                          </div>
                        </div>
                          
                        <div className="text-left">
                          <div className="text-2xl font-bold text-white">
                            {formatCurrency(parseFloat(product.price))}
                          </div>
                          {category && (
                            <div 
                              className="inline-block px-2 py-1 rounded text-xs font-medium mt-2"
                              style={{ 
                                backgroundColor: `${category.color || '#6B7280'}20`,
                                color: category.color || '#6B7280',
                                border: `1px solid ${category.color || '#6B7280'}40`
                              }}
                            >
                              {category.name}
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* VISTAS DINÁMICAS DE PASOS */}
        {currentStepIndex >= 0 && categoryFlow && categoryFlow.steps[currentStepIndex] && (() => {
          const currentStep = categoryFlow.steps[currentStepIndex];
          
          // Renderizar según tipo de paso
          if (currentStep.stepType === "frosting") {
            const stepOptions = currentStep.options?.filter((o) => o.active).sort((a, b) => a.sortOrder - b.sortOrder) || [];
            if (stepOptions.length > 0) {
              const selectedOption = stepSelections[currentStep.id] as ModifierOption | undefined;
              return (
                <div className="flex-1 p-8 overflow-auto">
                  <div className="grid grid-cols-4 gap-4 max-w-6xl">
                    {currentStep.includeNoneOption && (
                      <button
                        onClick={() => handleStepSelection(null)}
                        className={`h-32 rounded-lg flex items-center justify-center font-semibold transition-colors border-2 ${!selectedOption ? "bg-primary text-primary-foreground border-primary" : "bg-muted hover:bg-muted/80 border-transparent hover:border-primary"}`}
                      >
                        Sin {currentStep.stepName.toLowerCase()}
                      </button>
                    )}
                    {stepOptions.map((option) => (
                      <button
                        key={option.id}
                        onClick={() => handleStepSelection(option)}
                        className={`h-32 rounded-lg flex flex-col items-center justify-center font-semibold transition-colors border-2 ${selectedOption?.id === option.id ? "bg-primary text-primary-foreground border-primary" : "bg-primary/10 hover:bg-primary/20 border-transparent hover:border-primary"}`}
                      >
                        <div>{option.name}</div>
                        {parseFloat(option.price) > 0 && <div className="text-sm opacity-80 mt-1">+{formatCurrency(parseFloat(option.price))}</div>}
                      </button>
                    ))}
                  </div>
                </div>
              );
            }
            return (
              <div className="flex-1 p-8 overflow-auto">
                <div className="grid grid-cols-4 gap-4 max-w-6xl">
                  {currentStep.includeNoneOption && (
                    <button
                      onClick={() => handleStepSelection(null)}
                      className="h-32 rounded-lg bg-muted hover:bg-muted/80 flex items-center justify-center font-semibold transition-colors border-2 border-transparent hover:border-primary"
                    >
                      Sin {currentStep.stepName.toLowerCase()}
                    </button>
                  )}
                  {frostings.map((frosting) => (
                    <button
                      key={frosting.id}
                      onClick={() => {
                        setSelectedFrosting(frosting);
                        handleStepSelection(frosting);
                      }}
                      className="h-32 rounded-lg bg-primary/10 hover:bg-primary/20 flex items-center justify-center font-semibold transition-colors border-2 border-transparent hover:border-primary"
                    >
                      {frosting.name}
                    </button>
                  ))}
                </div>
              </div>
            );
          } else if (currentStep.stepType === "topping") {
            const stepOptions = currentStep.options?.filter((o) => o.active).sort((a, b) => a.sortOrder - b.sortOrder) || [];
            if (stepOptions.length > 0) {
              const selectedOption = stepSelections[currentStep.id] as ModifierOption | undefined;
              return (
                <div className="flex-1 p-8 overflow-auto">
                  <div className="grid grid-cols-4 gap-4 max-w-6xl">
                    {currentStep.includeNoneOption && (
                      <button
                        onClick={() => handleStepSelection(null)}
                        className={`h-32 rounded-lg flex items-center justify-center font-semibold transition-colors border-2 ${!selectedOption ? "bg-primary text-primary-foreground border-primary" : "bg-muted hover:bg-muted/80 border-transparent hover:border-primary"}`}
                      >
                        Sin {currentStep.stepName.toLowerCase()}
                      </button>
                    )}
                    {stepOptions.map((option) => (
                      <button
                        key={option.id}
                        onClick={() => handleStepSelection(option)}
                        className={`h-32 rounded-lg flex flex-col items-center justify-center font-semibold transition-colors border-2 ${selectedOption?.id === option.id ? "bg-primary text-primary-foreground border-primary" : "bg-primary/10 hover:bg-primary/20 border-transparent hover:border-primary"}`}
                      >
                        <div>{option.name}</div>
                        {parseFloat(option.price) > 0 && <div className="text-sm opacity-80 mt-1">+{formatCurrency(parseFloat(option.price))}</div>}
                      </button>
                    ))}
                  </div>
                </div>
              );
            }
            return (
              <div className="flex-1 p-8 overflow-auto">
                <div className="grid grid-cols-4 gap-4 max-w-6xl">
                  {currentStep.includeNoneOption && (
                    <button
                      onClick={() => handleStepSelection(null)}
                      className="h-32 rounded-lg bg-muted hover:bg-muted/80 flex items-center justify-center font-semibold transition-colors border-2 border-transparent hover:border-primary"
                    >
                      Sin {currentStep.stepName.toLowerCase()}
                    </button>
                  )}
                  {toppings.map((topping) => (
                    <button
                      key={topping.id}
                      onClick={() => {
                        setSelectedTopping(topping);
                        handleStepSelection(topping);
                      }}
                      className="h-32 rounded-lg bg-primary/10 hover:bg-primary/20 flex items-center justify-center font-semibold transition-colors border-2 border-transparent hover:border-primary"
                    >
                      {topping.name}
                    </button>
                  ))}
                </div>
              </div>
            );
          } else if (currentStep.stepType === "extra") {
            const stepOptions = currentStep.options?.filter((o) => o.active).sort((a, b) => a.sortOrder - b.sortOrder) || [];
            if (stepOptions.length > 0) {
              const selectedOptions = (stepSelections[currentStep.id] as ModifierOption[]) || [];
              const isMulti = currentStep.allowMultiple;
              return (
                <div className="flex-1 flex flex-col p-8 overflow-auto">
                  <div className="grid grid-cols-4 gap-4 max-w-6xl mb-6">
                    {currentStep.includeNoneOption && (
                      <button
                        onClick={() => handleStepSelection([])}
                        className={`h-32 rounded-lg flex items-center justify-center font-semibold transition-colors border-2 ${selectedOptions.length === 0 ? "bg-primary text-primary-foreground border-primary" : "bg-muted hover:bg-muted/80 border-transparent hover:border-primary"}`}
                      >
                        Sin {currentStep.stepName.toLowerCase()}
                      </button>
                    )}
                    {stepOptions.map((option) => {
                      const isSelected = selectedOptions.some((o) => o.id === option.id);
                      return (
                        <button
                          key={option.id}
                          onClick={() => handleStepSelection(option)}
                          className={`h-32 rounded-lg flex flex-col items-center justify-center font-semibold transition-colors border-2 ${isSelected ? "bg-primary text-primary-foreground border-primary" : "bg-primary/10 hover:bg-primary/20 border-transparent hover:border-primary"}`}
                        >
                          <div>{option.name}</div>
                          {parseFloat(option.price) > 0 && <div className="text-sm opacity-80 mt-1">+{formatCurrency(parseFloat(option.price))}</div>}
                        </button>
                      );
                    })}
                  </div>
                  {isMulti && (
                    <div className="max-w-6xl">
                      <button
                        onClick={advanceToNextStep}
                        className="w-full h-14 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-colors"
                      >
                        Siguiente
                      </button>
                    </div>
                  )}
                </div>
              );
            }
            return (
              <div className="flex-1 flex flex-col p-8 overflow-auto">
                <div className="grid grid-cols-4 gap-4 max-w-6xl mb-6">
                  {currentStep.includeNoneOption && (
                    <button
                      onClick={() => handleStepSelection([])}
                      className="h-32 rounded-lg bg-muted hover:bg-muted/80 flex items-center justify-center font-semibold transition-colors border-2 border-transparent hover:border-primary"
                    >
                      Sin {currentStep.stepName.toLowerCase()}
                    </button>
                  )}
                  {extras.map((extra) => (
                    <button
                      key={extra.id}
                      onClick={() => {
                        const newExtras = selectedExtras.find(e => e.id === extra.id)
                          ? selectedExtras.filter(e => e.id !== extra.id)
                          : [...selectedExtras, extra];
                        setSelectedExtras(newExtras);
                        setTimeout(() => handleStepSelection(newExtras), 300);
                      }}
                      className={`h-32 rounded-lg flex flex-col items-center justify-center font-semibold transition-colors border-2 ${
                        selectedExtras.find(e => e.id === extra.id)
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-muted hover:bg-muted/80 border-transparent hover:border-primary'
                      }`}
                    >
                      <div>{extra.name}</div>
                      <div className="text-sm opacity-80">{formatCurrency(parseFloat(extra.price))}</div>
                    </button>
                  ))}
                </div>
              </div>
            );
          } else if (currentStep.stepType === "custom" && currentStep.options) {
            // Renderizar opciones personalizadas
            const selectedOptions = (stepSelections[currentStep.id] as ModifierOption[]) || [];
            const isMulti = currentStep.allowMultiple;
            return (
              <div className="flex-1 p-8 overflow-auto">
                <div className="grid grid-cols-4 gap-4 max-w-6xl">
                  {currentStep.includeNoneOption && (
                    <button
                      onClick={() => handleStepSelection(null)}
                      className={`h-32 rounded-lg flex items-center justify-center font-semibold transition-colors border-2 ${
                        selectedOptions.length === 0
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted hover:bg-muted/80 border-transparent hover:border-primary"
                      }`}
                    >
                      Sin {currentStep.stepName.toLowerCase()}
                    </button>
                  )}
                  {currentStep.options.map((option) => {
                    const isSelected = selectedOptions.some((o) => o.id === option.id);
                    return (
                      <button
                        key={option.id}
                        onClick={() => handleStepSelection(option)}
                        className={`h-32 rounded-lg flex flex-col items-center justify-center font-semibold transition-colors border-2 ${
                          isSelected
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-primary/10 hover:bg-primary/20 border-transparent hover:border-primary"
                        }`}
                      >
                        <div>{option.name}</div>
                        {parseFloat(option.price) > 0 && (
                          <div className="text-sm opacity-80 mt-1">
                            +{formatCurrency(parseFloat(option.price))}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
                {isMulti && (
                  <div className="max-w-6xl mt-6">
                    <button
                      onClick={advanceToNextStep}
                      className="w-full h-14 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-colors"
                    >
                      Siguiente
                    </button>
                  </div>
                )}
              </div>
            );
          }
          
          return null;
        })()}

        {/* VISTA: NOTAS (después del último paso) */}
        {currentStepIndex >= 0 && categoryFlow && currentStepIndex === categoryFlow.steps.length && (
          <div className="flex-1 flex flex-col p-8 overflow-auto">
            <div className="max-w-2xl mx-auto w-full space-y-6">
              <div>
                <Label htmlFor="product-notes" className="text-lg">¿Alguna nota especial para este producto?</Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Opcional: indica preferencias, alergias o instrucciones especiales
                </p>
              </div>
              
              <textarea
                id="product-notes"
                value={productNotes}
                onChange={(e) => setProductNotes(e.target.value)}
                placeholder="Ej: Sin azúcar, extra picante, sin cebolla..."
                className="w-full h-32 p-4 rounded-lg border bg-background resize-none"
              />

              <div className="flex gap-4">
                <Button
                  onClick={finishFlowAndAddToCart}
                  size="lg"
                  className="flex-1"
                >
                  Agregar al carrito
                </Button>
              </div>
            </div>
          </div>
        )}
          </div>
        </>
      )}

      {/* Dialog de Selección de Variantes */}
      <Dialog open={showVariantDialog} onOpenChange={setShowVariantDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedProductForVariant?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Selecciona una opción:
            </p>
            {selectedProductForVariant?.variants && JSON.parse(selectedProductForVariant.variants).map((variant: any, index: number) => {
              // Detectar si es delivery de plataforma
              const isPlatform = customerName && (customerName.startsWith('Uber') || customerName.startsWith('Rappi') || customerName.startsWith('Didi'));
              const priceToShow = isPlatform && variant.platformPrice ? parseFloat(variant.platformPrice) : parseFloat(variant.price);
              
              return (
                <Button
                  key={index}
                  variant="outline"
                  className="w-full justify-between h-auto py-4"
                  onClick={() => handleAddVariant(variant.name, variant.price, variant.platformPrice)}
                >
                  <span className="font-semibold">{variant.name}</span>
                  <span className="text-lg">{formatCurrency(priceToShow)}</span>
                </Button>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowVariantDialog(false)}>
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Número de Personas */}
      <Dialog open={showGuestCountDialog} onOpenChange={setShowGuestCountDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Número de Personas</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-4">
              <Button
                variant="outline"
                size="lg"
                onClick={() => setTempGuestCount(Math.max(1, tempGuestCount - 1))}
                className="h-16 w-16 p-0"
              >
                <Minus className="size-6" />
              </Button>
              <div className="text-6xl font-bold w-32 text-center">
                {tempGuestCount}
              </div>
              <Button
                variant="outline"
                size="lg"
                onClick={() => setTempGuestCount(tempGuestCount + 1)}
                className="h-16 w-16 p-0"
              >
                <Plus className="size-6" />
              </Button>
            </div>
            <p className="text-sm text-muted-foreground text-center">
              Ajusta el número de comensales en la mesa
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGuestCountDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={async () => {
              setGuestCount(tempGuestCount);
              setShowGuestCountDialog(false);
              toast.success(`Número de personas actualizado: ${tempGuestCount}`);
              // Persistir en BD si hay mesa seleccionada
              if (selectedTable) {
                try {
                  const res = await fetch(`/api/tables/${selectedTable.id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ guestCount: tempGuestCount }),
                  });
                  if (res.ok) {
                    const updatedTable = await res.json();
                    setSelectedTable(updatedTable);
                  }
                } catch (e) {
                  console.error("Error persisting guestCount:", e);
                }
              }
            }}>
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Inicial de Número de Personas (al abrir mesa libre) */}
      <Dialog open={showInitialGuestDialog} onOpenChange={(open) => {
        if (!open) {
          // Si cierra sin confirmar, usar 1 persona por defecto
          setGuestCount(1);
          setTempGuestCount(1);
          setActiveSeat("C");
          setShowInitialGuestDialog(false);
          if (selectedTable) {
            fetch(`/api/tables/${selectedTable.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ guestCount: 1 }),
            }).catch(() => {});
          }
          toast.success(`Mesa ${selectedTable?.number} seleccionada`);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Cuántas personas?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-4">
              <Button variant="outline" size="lg" onClick={() => setTempGuestCount(Math.max(1, tempGuestCount - 1))} className="h-16 w-16 p-0">
                <Minus className="size-6" />
              </Button>
              <div className="text-6xl font-bold w-32 text-center">{tempGuestCount}</div>
              <Button variant="outline" size="lg" onClick={() => setTempGuestCount(tempGuestCount + 1)} className="h-16 w-16 p-0">
                <Plus className="size-6" />
              </Button>
            </div>
            <p className="text-sm text-muted-foreground text-center">
              Puedes cambiarlo después desde el botón de personas
            </p>
            <div className="grid grid-cols-4 gap-2">
              {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
                <Button
                  key={n}
                  variant={tempGuestCount === n ? "default" : "outline"}
                  onClick={() => setTempGuestCount(n)}
                  className="h-12"
                >
                  {n}
                </Button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button className="w-full" size="lg" onClick={async () => {
              setGuestCount(tempGuestCount);
              setActiveSeat("A1");
              setShowInitialGuestDialog(false);
              toast.success(`Mesa ${selectedTable?.number} — ${tempGuestCount} persona${tempGuestCount > 1 ? 's' : ''}`);
              if (selectedTable) {
                try {
                  const res = await fetch(`/api/tables/${selectedTable.id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ guestCount: tempGuestCount }),
                  });
                  if (res.ok) {
                    const updatedTable = await res.json();
                    setSelectedTable(updatedTable);
                  }
                } catch (e) {
                  console.error("Error persisting guestCount:", e);
                }
              }
            }}>
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Eliminar Item de Cocina con Razón */}
      <Dialog open={showVoidDialog} onOpenChange={setShowVoidDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar Item de Cocina</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {voidItemIndex !== null && cart[voidItemIndex] && (
              <p className="text-sm text-muted-foreground">
                Eliminar: <strong>{cart[voidItemIndex].quantity}x {cart[voidItemIndex].productName}</strong>
              </p>
            )}
            <div>
              <Label className="text-sm font-medium">Razón de eliminación</Label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {["Cliente cambió de opinión", "Error del mesero", "Producto agotado", "Problema de calidad"].map((reason) => (
                  <Button
                    key={reason}
                    variant="outline"
                    size="sm"
                    onClick={() => setVoidReason(reason)}
                    className={`text-xs ${voidReason === reason ? 'bg-blue-600 text-white border-blue-500' : ''}`}
                  >
                    {reason}
                  </Button>
                ))}
              </div>
              <Input
                placeholder="Otra razón..."
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                className="mt-2"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowVoidDialog(false); setVoidItemIndex(null); }}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={!voidReason.trim()}
              onClick={handleVoidItem}
            >
              Eliminar Item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Comentarios para Producto */}
      <Dialog open={showNotesDialog} onOpenChange={setShowNotesDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pendingCartItem?.productName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="item-notes">Comentarios especiales (opcional)</Label>
              <p className="text-xs text-muted-foreground mt-1">
                Instrucciones, preferencias o alergias
              </p>
              <textarea
                id="item-notes"
                value={tempNotes}
                onChange={(e) => setTempNotes(e.target.value)}
                placeholder="Ej: Sin cebolla, extra picante, término medio..."
                className="w-full h-24 p-3 mt-2 rounded-lg border bg-background resize-none"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancelNotes}>
              Cancelar
            </Button>
            <Button onClick={handleConfirmNotes}>
              {tempNotes.trim() ? "Agregar con comentario" : "Agregar sin comentario"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Nombre de Cliente Para Llevar / Delivery */}
      <Dialog open={showCustomerNameDialog} onOpenChange={setShowCustomerNameDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isPlatformDelivery ? "Orden Delivery (Uber/Rappi/Didi)" : "Orden Para Llevar"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {isPlatformDelivery && (
              <>
                <div>
                  <Label>Plataforma *</Label>
                  <select
                    value={deliveryPlatform}
                    onChange={(e) => setDeliveryPlatform(e.target.value as "Uber" | "Rappi" | "Didi" | "")}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                  >
                    <option value="">Selecciona plataforma</option>
                    <option value="Uber">Uber Eats</option>
                    <option value="Rappi">Rappi</option>
                    <option value="Didi">Didi Food</option>
                  </select>
                </div>
                <div>
                  <Label>Últimos 4 dígitos de la orden *</Label>
                  <Input
                    type="text"
                    maxLength={4}
                    value={platformOrderDigits}
                    onChange={(e) => setPlatformOrderDigits(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="1234"
                  />
                </div>
              </>
            )}
            <div>
              <Label>Nombre del Cliente</Label>
              <Input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder={isPlatformDelivery ? "Ej: Juan Pérez" : "Ej: Juan Pérez"}
                autoFocus={!isPlatformDelivery}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleConfirmCustomerName();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCustomerNameDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleConfirmCustomerName}>
              Continuar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Leer QR */}
      <Dialog open={qrDialogOpen} onOpenChange={setQrDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leer QR de Tarjeta de Lealtad</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Camera Toggle Button */}
            <div className="flex justify-center">
              {!cameraActive ? (
                <Button onClick={startCamera} variant="outline" className="w-full">
                  <Camera className="mr-2 size-4" />
                  Abrir Cámara
                </Button>
              ) : (
                <Button onClick={stopCamera} variant="outline" className="w-full">
                  <X className="mr-2 size-4" />
                  Cerrar Cámara
                </Button>
              )}
            </div>

            {/* Video Preview */}
            {cameraActive ? (
              <div className="relative rounded-lg overflow-hidden bg-black" style={{ minHeight: '256px' }}>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-64 object-cover"
                  style={{ minHeight: '256px', display: 'block' }}
                  onLoadedMetadata={() => console.log("🎥 Video onLoadedMetadata disparado")}
                  onPlaying={() => console.log("▶️ Video onPlaying disparado")}
                  onError={(e) => console.error("❌ Video onError:", e)}
                />
                <canvas ref={canvasRef} className="hidden" />
                <div className="absolute inset-0 border-2 border-primary/50 pointer-events-none">
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 border-2 border-primary rounded-lg" />
                </div>
              </div>
            ) : (
              <div className="relative rounded-lg overflow-hidden bg-muted border-2 border-dashed" style={{ minHeight: '256px' }}>
                <div className="flex items-center justify-center h-64 text-muted-foreground">
                  <div className="text-center">
                    <Camera className="mx-auto mb-2 size-12 opacity-50" />
                    <p>Presiona "Abrir Cámara" para escanear</p>
                  </div>
                </div>
              </div>
            )}

            {/* Manual Input */}
            <div>
              <Label htmlFor="qr-code">O ingresa el código manualmente</Label>
              <Input
                id="qr-code"
                value={qrCode}
                onChange={(e) => setQrCode(e.target.value)}
                placeholder="Código de barras"
                onKeyDown={(e) => e.key === "Enter" && handleQRSubmit()}
                disabled={cameraActive}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { stopCamera(); setQrDialogOpen(false); }}>
              Cancelar
            </Button>
            <Button onClick={handleQRSubmit} disabled={loadingCard || !qrCode.trim()}>
              {loadingCard ? "Buscando..." : "Buscar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Asignar Sellos Manual */}
      <Dialog open={manualStampDialogOpen} onOpenChange={setManualStampDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Asignar Sello Manual</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="manual-barcode">Código de Barras</Label>
              <Input
                id="manual-barcode"
                value={manualBarcodeInput}
                onChange={(e) => setManualBarcodeInput(e.target.value)}
                placeholder="Escanea o ingresa el código"
                onKeyDown={(e) => e.key === "Enter" && handleManualStampSubmit()}
                autoFocus
              />
              <p className="text-xs text-muted-foreground mt-1">
                Para clientes que ya pagaron pero olvidaron escanear su tarjeta
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualStampDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleManualStampSubmit} disabled={loadingCard}>
              {loadingCard ? "Procesando..." : "Agregar Sello"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de Descuento Flexible */}
      <Dialog open={showFlexibleDiscountDialog} onOpenChange={setShowFlexibleDiscountDialog}>
        <DialogContent className="bg-neutral-950 border-neutral-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">Seleccionar Descuento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-3">
              <Label className="text-white">Tipo de Descuento</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={flexibleDiscountType === "percentage" ? "default" : "outline"}
                  onClick={() => {
                    setFlexibleDiscountType("percentage");
                    setFlexibleDiscountValue(10);
                  }}
                  className="h-12"
                >
                  Porcentaje
                </Button>
                <Button
                  variant={flexibleDiscountType === "fixed" ? "default" : "outline"}
                  onClick={() => {
                    setFlexibleDiscountType("fixed");
                    setCustomFlexibleAmount("");
                  }}
                  className="h-12"
                >
                  Monto Fijo
                </Button>
              </div>
            </div>

            {flexibleDiscountType === "percentage" && (
              <div className="space-y-2">
                <Label className="text-white">Porcentaje</Label>
                <div className="grid grid-cols-3 gap-2">
                  {[10, 20, 30, 50, 60].map((percent) => (
                    <Button
                      key={percent}
                      variant={flexibleDiscountValue === percent ? "default" : "outline"}
                      onClick={() => setFlexibleDiscountValue(percent)}
                      className="h-12 text-lg font-semibold"
                    >
                      {percent}%
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {flexibleDiscountType === "fixed" && (
              <div className="space-y-2">
                <Label className="text-white">Monto en Pesos</Label>
                <Input
                  type="number"
                  value={customFlexibleAmount}
                  onChange={(e) => setCustomFlexibleAmount(e.target.value)}
                  placeholder="Ingresa el monto"
                  className="bg-neutral-900 border-neutral-700 text-white h-12 text-lg"
                  min="0"
                  step="0.01"
                />
              </div>
            )}

            <div className="p-3 bg-blue-950 border border-blue-800 rounded-lg">
              <p className="text-sm text-blue-200">
                {flexibleDiscountType === "percentage" ? (
                  <>
                    Descuento del <strong>{flexibleDiscountValue}%</strong> sobre el subtotal
                  </>
                ) : (
                  <>
                    Descuento de <strong>${customFlexibleAmount || "0"}</strong> en pesos
                  </>
                )}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowFlexibleDiscountDialog(false);
                setSelectedDiscount(null);
              }}
              className="bg-neutral-900 border-neutral-700 text-white hover:bg-neutral-800"
            >
              Cancelar
            </Button>
            <Button
              onClick={() => {
                setShowFlexibleDiscountDialog(false);
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              Aplicar Descuento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo Menú Admin */}
      <Dialog open={showAdminMenu} onOpenChange={setShowAdminMenu}>
        <DialogContent className="bg-neutral-950 border-neutral-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">Menú Admin</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Button
              onClick={() => {
                setShowAdminMenu(false);
                setShowGuestItemsDialog(true);
              }}
              className="w-full h-14 bg-blue-600 hover:bg-blue-700 text-white text-lg"
            >
              <Gift className="size-5 mr-2" weight="duotone" />
              Invitar Productos / Cuenta Invitado
            </Button>
          
          </div>
        </DialogContent>
      </Dialog>

      {/* Diálogo Invitar Productos */}
      <Dialog open={showGuestItemsDialog} onOpenChange={setShowGuestItemsDialog}>
        <DialogContent className="bg-neutral-950 border-neutral-800 text-white max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white">Invitar Productos</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-neutral-400">
              Selecciona los productos que deseas marcar como invitados. Estos aparecerán en la cuenta con precio $0.
            </p>
            
            {cart.length === 0 ? (
              <div className="text-center py-8 text-neutral-500">
                No hay productos en el carrito
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {cart.map((item, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 p-3 rounded-lg bg-neutral-900 border border-neutral-800"
                  >
                    <input
                      type="checkbox"
                      checked={guestItemsSelection.includes(index)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setGuestItemsSelection([...guestItemsSelection, index]);
                        } else {
                          setGuestItemsSelection(guestItemsSelection.filter(i => i !== index));
                        }
                      }}
                      className="h-5 w-5 rounded border-neutral-600"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{item.quantity}x {item.productName}</span>
                        {item.isGuest && (
                          <Badge className="bg-yellow-500 text-black text-xs">
                            Invitado
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-neutral-400">
                        {item.isGuest ? (
                          <span className="line-through">{formatCurrency(item.unitPrice * item.quantity)}</span>
                        ) : (
                          formatCurrency(item.unitPrice * item.quantity)
                        )}
                      </div>
                    </div>
                    {item.isGuest && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const updatedCart = cart.map((cartItem, idx) => {
                            if (idx === index) {
                              return { ...cartItem, isGuest: false };
                            }
                            return cartItem;
                          });
                          setCart(updatedCart);
                          toast.success("Producto desinvitado");
                        }}
                        className="bg-red-900 border-red-700 text-white hover:bg-red-800"
                      >
                        <X className="size-4 mr-1" />
                        Desinvitar
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowGuestItemsDialog(false);
                setGuestItemsSelection([]);
              }}
              className="bg-neutral-900 border-neutral-700 text-white hover:bg-neutral-800"
            >
              Cancelar
            </Button>
            <Button
              onClick={() => {
                // Marcar items seleccionados como invitados
                const updatedCart = cart.map((item, index) => {
                  if (guestItemsSelection.includes(index)) {
                    return { ...item, isGuest: true };
                  }
                  return item;
                });
                setCart(updatedCart);
                setShowGuestItemsDialog(false);
                setGuestItemsSelection([]);
                toast.success(`${guestItemsSelection.length} producto(s) marcado(s) como invitado`);
              }}
              disabled={guestItemsSelection.length === 0}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Gift className="size-4 mr-2" />
              Marcar como Invitado ({guestItemsSelection.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
