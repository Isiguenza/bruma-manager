"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { playNotificationSound } from "@/lib/utils/sound";
import type { Order } from "@/lib/types";
import { SpeakerHigh, GridFour, Check, User, ForkKnife, BeerStein, Timer } from "@phosphor-icons/react";
import { ThemeToggle } from "@/components/theme-toggle";
import { SlideToConfirm } from "@/components/ui/slide-to-confirm";

export default function DispatchMonitorPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [previousOrderIds, setPreviousOrderIds] = useState<Set<string>>(new Set());
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [soundEnabled, setSoundEnabled] = useState(() => {
    // Leer del localStorage al iniciar
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('dispatch_sound_enabled');
      return saved !== 'false'; // Por defecto true
    }
    return true;
  });
  const [audioInitialized, setAudioInitialized] = useState(false);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch("/api/orders?status=preparing");
      if (res.ok) {
        const newOrders = await res.json();
        const newOrderIds = new Set<string>(newOrders.map((o: Order) => o.id));
        const hasNewOrder = newOrders.some((o: Order) => !previousOrderIds.has(o.id));
        
        console.log('📊 Dispatch check:', {
          totalOrders: newOrders.length,
          hasNewOrder,
          previousCount: previousOrderIds.size,
          soundEnabled,
          willPlaySound: hasNewOrder && previousOrderIds.size > 0 && soundEnabled
        });
        
        if (hasNewOrder && previousOrderIds.size > 0 && soundEnabled) {
          console.log('🔔 ¡Nueva orden detectada! - llamando playNotificationSound()');
          playNotificationSound();
        }
        
        setPreviousOrderIds(newOrderIds);
        setOrders(newOrders);
      }
    } catch (error) {
      console.error("Error fetching orders:", error);
    }
  }, [previousOrderIds, soundEnabled]);

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 3000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  // Auto-inicializar audio en primera interacción si el sonido está activado
  useEffect(() => {
    if (soundEnabled && !audioInitialized) {
      const handleFirstInteraction = () => {
        console.log('🎵 Primera interacción detectada - inicializando audio...');
        initializeAudio();
        // Remover listeners después de la primera interacción
        document.removeEventListener('click', handleFirstInteraction);
        document.removeEventListener('keydown', handleFirstInteraction);
        document.removeEventListener('touchstart', handleFirstInteraction);
      };

      // Escuchar cualquier interacción del usuario
      document.addEventListener('click', handleFirstInteraction);
      document.addEventListener('keydown', handleFirstInteraction);
      document.addEventListener('touchstart', handleFirstInteraction);

      return () => {
        document.removeEventListener('click', handleFirstInteraction);
        document.removeEventListener('keydown', handleFirstInteraction);
        document.removeEventListener('touchstart', handleFirstInteraction);
      };
    }
  }, [soundEnabled, audioInitialized]);

  function getOrderUrgency(order: Order) {
    const minutes = Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60000);
    if (minutes > 10) return "urgent"; // Red
    if (minutes > 7) return "warning"; // Orange  
    if (minutes > 4) return "attention"; // Yellow
    return "normal"; // Gray
  }

  function getUrgencyColor(urgency: string) {
    switch (urgency) {
      case "urgent": return "bg-red-600";
      case "warning": return "bg-orange-600";
      case "attention": return "bg-yellow-600";
      default: return "bg-neutral-700";
    }
  }

  function getElapsedTime(createdAt: string) {
    const elapsed = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    return `${minutes}m ${seconds}s`;
  }

  function toggleExpand(orderId: string) {
    setExpandedOrders(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  }

  async function markAsDelivered(orderId: string, orderNumber: number) {
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ready" }), // Cambiar a ready para que aparezca en bar
      });

      if (res.ok) {
        toast.success(`Orden #${orderNumber} marcada como entregada`);
        fetchOrders();
      } else {
        toast.error("Error al marcar orden");
      }
    } catch (error) {
      toast.error("Error al marcar orden");
    }
  }

  function parseCustomModifiers(customModifiers: string | null) {
    if (!customModifiers) return null;
    try {
      return JSON.parse(customModifiers);
    } catch {
      return null;
    }
  }

  function flowOptionLabel(option: { name: string; price?: string | number }) {
    const price = Number(option.price ?? 0);
    return Number.isFinite(price) && price !== 0
      ? `${option.name} +$${Number.isInteger(price) ? price : price.toFixed(2)}`
      : option.name;
  }

  async function initializeAudio() {
    try {
      console.log("🎵 Intentando inicializar audio...");
      
      // Intentar inicializar AudioContext primero
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      await audioContext.resume();
      console.log("✅ AudioContext inicializado");
      
      // Intentar pre-cargar el archivo de audio
      let audioLoaded = false;
      
      // Intentar .mp3 primero
      try {
        const audio = new Audio("/notification.mp3");
        audio.volume = 0.01; // Muy bajo pero no 0
        await audio.play();
        audio.pause();
        console.log("✅ notification.mp3 pre-cargado");
        audioLoaded = true;
      } catch (mp3Error) {
        console.log("⚠️ No se pudo pre-cargar .mp3:", mp3Error);
      }
      
      // Si mp3 falla, intentar .wav
      if (!audioLoaded) {
        try {
          const audio = new Audio("/notification.wav");
          audio.volume = 0.01;
          await audio.play();
          audio.pause();
          console.log("✅ notification.wav pre-cargado");
          audioLoaded = true;
        } catch (wavError) {
          console.log("⚠️ No se pudo pre-cargar .wav:", wavError);
        }
      }
      
      setAudioInitialized(true);
      
      if (audioLoaded) {
        console.log("✅ Audio inicializado completamente");
        toast.success("Sonido activado - archivo de audio cargado");
      } else {
        console.log("✅ Audio inicializado (usando beep como fallback)");
        toast.success("Sonido activado - usando beep");
      }
    } catch (error) {
      console.error("❌ Error inicializando audio:", error);
      toast.error("Error al inicializar audio");
      // Aún así marcamos como inicializado para que al menos intente el beep
      setAudioInitialized(true);
    }
  }

  function toggleSound() {
    const newState = !soundEnabled;
    setSoundEnabled(newState);
    
    // Guardar en localStorage
    localStorage.setItem('dispatch_sound_enabled', String(newState));
    
    if (newState && !audioInitialized) {
      // Si está activando el sonido por primera vez, inicializar audio
      initializeAudio();
    } else if (newState) {
      toast.success("Sonido activado");
    } else {
      toast.info("Sonido desactivado");
    }
  }

  return (
    <div className="h-screen bg-black flex flex-col">
      {/* Header fijo */}
      <div className="bg-neutral-900 border-b border-neutral-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-white text-2xl font-bold">Monitor de Cocina</h1>
            <p className="text-neutral-400 text-sm mt-1">
              {orders.length} {orders.length === 1 ? 'orden' : 'órdenes'} en preparación
            </p>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={toggleSound}
              className={`p-3 rounded-lg transition-colors ${
                soundEnabled 
                  ? 'bg-green-600 hover:bg-green-700' 
                  : 'bg-neutral-700 hover:bg-neutral-600'
              }`}
              title={soundEnabled ? 'Sonido activado' : 'Sonido desactivado'}
            >
              <SpeakerHigh className="size-6 text-white" weight={soundEnabled ? 'fill' : 'regular'} />
            </button>
            <button className="p-3 rounded-lg bg-neutral-700 hover:bg-neutral-600">
              <GridFour className="size-6 text-white" />
            </button>
          </div>
        </div>
      </div>

      {/* Grid de órdenes con scroll */}
      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-4 gap-4 max-w-screen-2xl auto-rows-min">
        {orders.length === 0 ? (
          <div className="col-span-4 flex items-center justify-center h-96 text-neutral-500">
            No hay órdenes pendientes
          </div>
        ) : (
          orders.map((order) => {
            const urgency = getOrderUrgency(order);
            const urgencyColor = getUrgencyColor(urgency);
            const isExpanded = expandedOrders.has(order.id);
            const activeItems = order.items?.filter((item: any) => !item.voided) || [];
            const visibleItems = isExpanded ? activeItems : activeItems.slice(0, 3);
            const hasMoreItems = activeItems.length > 3;

            return (
              <div
                key={order.id}
                className="bg-neutral-900 rounded-lg overflow-hidden border border-neutral-800 hover:border-neutral-700 transition-all h-fit"
              >
                {/* Header con color de urgencia */}
                <div className={`${urgencyColor} px-4 py-2 flex items-center justify-between`}>
                  <div className="text-white font-bold text-lg">#{order.orderNumber}</div>
                  <div className="text-white text-sm">{getElapsedTime(order.createdAt.toString())}</div>
                </div>

                <div className="px-4 py-3">
                  {/* Mesa o Para Llevar */}
                  <div className="text-neutral-400 text-xs mb-3">
                    {order.table ? (
                      <span className="font-semibold text-yellow-400">Mesa {order.table.number}</span>
                    ) : (
                      <span className="font-semibold text-green-400">Para Llevar</span>
                    )}
                    {order.customerName && <span> • {order.customerName}</span>}
                  </div>

                  {/* Items: bebidas arriba, luego por tiempo, luego por asiento */}
                  <div className="space-y-3">
                    {(() => {
                      const items = visibleItems || [];
                      // Separar bebidas y comida
                      const beverages = items.filter((item: any) => item.product?.category?.isBeverage);
                      const food = items.filter((item: any) => !item.product?.category?.isBeverage);
                      
                      // Agrupar comida por curso
                      const courseMap = new Map<number, typeof food>();
                      for (const item of food) {
                        const course = (item as any).course || 1;
                        if (!courseMap.has(course)) courseMap.set(course, []);
                        courseMap.get(course)!.push(item);
                      }
                      const courseKeys = Array.from(courseMap.keys()).sort((a, b) => a - b);
                      const hasMultipleCourses = courseKeys.length > 1;
                      
                      // Helper: agrupar items por asiento y renderizar
                      const renderSeatGroups = (seatItems: typeof items) => {
                        const seatMap = new Map<string, typeof items>();
                        for (const item of seatItems) {
                          const seat = (item as any).seat || "C";
                          if (!seatMap.has(seat)) seatMap.set(seat, []);
                          seatMap.get(seat)!.push(item);
                        }
                        const seatKeys = Array.from(seatMap.keys()).sort((a, b) => {
                          if (a === "C") return 1;
                          if (b === "C") return -1;
                          return a.localeCompare(b, undefined, { numeric: true });
                        });
                        const hasMultipleSeats = seatKeys.length > 1 || (seatKeys.length === 1 && seatKeys[0] !== "C");
                        
                        return seatKeys.map(seatKey => (
                          <div key={seatKey} className={hasMultipleSeats ? `rounded-lg border ${seatKey === "C" ? "border-amber-800/50 bg-amber-950/20" : "border-blue-800/50 bg-blue-950/20"} p-2.5` : ""}>
                            {hasMultipleSeats && (
                              <div className={`flex items-center gap-1.5 text-xs font-bold mb-2 pb-1.5 border-b ${
                                seatKey === "C" ? "text-amber-400 border-amber-800/40" : "text-blue-400 border-blue-800/40"
                              }`}>
                                {seatKey === "C" 
                                  ? <><ForkKnife className="size-3.5" weight="fill" /> Centro</>
                                  : <><User className="size-3.5" weight="fill" /> {seatKey}</>
                                }
                              </div>
                            )}
                            <div className="space-y-2">
                            {seatMap.get(seatKey)!.map((item, idx) => {
                              const customMods = parseCustomModifiers(item.customModifiers || null);
                              return (
                                <div key={idx} className="text-white">
                                  <div className="flex items-start gap-3">
                                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold">
                                      {item.quantity}
                                    </div>
                                    <div className="flex-1">
                                      <div className="font-semibold text-base">{item.productName}</div>
                                      {item.frostingName && (
                                        <div className="text-blue-400 text-sm flex items-start gap-1 mt-1">
                                          <span className="opacity-50">↳</span>
                                          <span>{item.frostingName}</span>
                                        </div>
                                      )}
                                      {item.dryToppingName && (
                                        <div className="text-purple-400 text-sm flex items-start gap-1 mt-1">
                                          <span className="opacity-50">↳</span>
                                          <span>{item.dryToppingName}</span>
                                        </div>
                                      )}
                                      {item.extraName && (
                                        <div className="text-green-400 text-sm flex items-start gap-1 mt-1">
                                          <span className="opacity-50">↳</span>
                                          <span>{item.extraName}</span>
                                        </div>
                                      )}
                                      {customMods && Object.entries(customMods).map(([key, value]) => {
                                        if (typeof value === 'object' && value !== null && 'stepName' in value && 'options' in value) {
                                          const step = value as { stepName: string; options: Array<{ name: string; price?: string | number }> };
                                          const optionNames = step.options.map(flowOptionLabel).join(', ');
                                          return (
                                            <div key={key} className="text-amber-400 text-sm flex items-start gap-1 mt-1">
                                              <span className="opacity-50">↳</span>
                                              <span>{step.stepName}: {optionNames || 'N/A'}</span>
                                            </div>
                                          );
                                        }
                                        return (
                                          <div key={key} className="text-amber-400 text-sm flex items-start gap-1 mt-1">
                                            <span className="opacity-50">↳</span>
                                            <span>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
                                          </div>
                                        );
                                      })}
                                      {item.notes && (
                                        <div className="text-yellow-400 text-sm flex items-start gap-1 mt-1 italic font-medium">
                                          <span className="opacity-50">↳</span>
                                          <span>{item.notes}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                            </div>
                          </div>
                        ));
                      };
                      
                      return (
                        <>
                          {/* Bebidas siempre arriba */}
                          {beverages.length > 0 && (
                            <div className="rounded-lg border border-cyan-800/50 bg-cyan-950/20 p-3">
                              <div className="flex items-center gap-1.5 text-sm font-bold mb-2 pb-2 border-b border-cyan-800/40 text-cyan-400">
                                <BeerStein className="size-4" weight="fill" /> Bebidas
                              </div>
                              <div className="space-y-2">
                                {beverages.map((item, idx) => {
                                  const customMods = parseCustomModifiers(item.customModifiers || null);
                                  return (
                                    <div key={`bev-${idx}`} className="text-white">
                                      <div className="flex items-start gap-3">
                                        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-cyan-600 flex items-center justify-center text-white text-sm font-bold">
                                          {item.quantity}
                                        </div>
                                        <div className="flex-1">
                                          <div className="font-semibold text-base">{item.productName}</div>
                                          {item.frostingName && (
                                            <div className="text-blue-400 text-sm flex items-start gap-1 mt-1">
                                              <span className="opacity-50">↳</span>
                                              <span>{item.frostingName}</span>
                                            </div>
                                          )}
                                          {customMods && Object.entries(customMods).map(([key, value]) => {
                                            if (typeof value === 'object' && value !== null && 'stepName' in value && 'options' in value) {
                                              const step = value as { stepName: string; options: Array<{ name: string; price?: string | number }> };
                                              return (
                                                <div key={key} className="text-amber-400 text-sm flex items-start gap-1 mt-1">
                                                  <span className="opacity-50">↳</span>
                                                  <span>{step.stepName}: {step.options.map(flowOptionLabel).join(', ')}</span>
                                                </div>
                                              );
                                            }
                                            return null;
                                          })}
                                          {item.notes && (
                                            <div className="text-yellow-400 text-sm flex items-start gap-1 mt-1 italic font-medium">
                                              <span className="opacity-50">↳</span>
                                              <span>{item.notes}</span>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                          
                          {/* Comida agrupada por tiempo */}
                          {courseKeys.map(courseNum => {
                            const courseItems = courseMap.get(courseNum)!;
                            return (
                              <div key={`course-${courseNum}`}>
                                {hasMultipleCourses && (
                                  <div className="flex items-center gap-1.5 text-sm font-bold py-1.5 px-2 mb-2 rounded bg-emerald-950/40 border border-emerald-800/40 text-emerald-400">
                                    <Timer className="size-4" weight="fill" />
                                    <span>Tiempo {courseNum}</span>
                                  </div>
                                )}
                                <div className="space-y-2">
                                  {renderSeatGroups(courseItems)}
                                </div>
                              </div>
                            );
                          })}
                        </>
                      );
                    })()}

                    {/* Botón para expandir/contraer */}
                    {hasMoreItems && (
                      <button
                        onClick={() => toggleExpand(order.id)}
                        className="text-blue-400 text-sm hover:text-blue-300 flex items-center gap-1 mt-2"
                      >
                        <span>↕</span>
                        <span>{isExpanded ? `Ocultar` : `${activeItems.length - 3} producto${activeItems.length - 3 > 1 ? 's' : ''} más`}</span>
                      </button>
                    )}
                  </div>

                  {/* Slide to confirm entrega */}
                  <div className="mt-4">
                    <p className="text-xs text-neutral-400 mb-2 text-center">Desliza para marcar como entregado</p>
                    <SlideToConfirm onConfirm={() => markAsDelivered(order.id, order.orderNumber)} />
                  </div>
                </div>
              </div>
            );
          })
        )}
        </div>
      </div>
    </div>
  );
}
