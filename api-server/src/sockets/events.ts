import { Server as SocketServer } from "socket.io";

let io: SocketServer | null = null;

// ── Pedido en línea "apartado" ───────────────────────────────────────────
// Cuando un POS entra a revisar un pedido (aceptar/rechazar), los demás dejan
// de sonar y de mostrar la pantalla verde. El apartado es de quien lo pidió
// primero y se suelta solo si ese dispositivo lo libera, se desconecta o se
// tarda demasiado: un pedido nunca se queda callado en todos lados.
// En memoria a propósito: es estado de minutos y este server es un solo proceso.
type OnlineOrderClaim = { orderId: string; deviceId: string; by: string | null; socketId: string; timer: NodeJS.Timeout };
const onlineOrderClaims = new Map<string, OnlineOrderClaim>();
/** Mayor que los 2 min que el POS deja la pantalla de revisión antes de volver a sonar. */
const ONLINE_ORDER_CLAIM_TTL_MS = 150_000;

const claimPayload = (claim: OnlineOrderClaim) => ({ orderId: claim.orderId, deviceId: claim.deviceId, by: claim.by });

function releaseOnlineOrderClaim(orderId: string, reason: string) {
  const claim = onlineOrderClaims.get(orderId);
  if (!claim) return;
  clearTimeout(claim.timer);
  onlineOrderClaims.delete(orderId);
  io?.to("room:pos").emit("online_order:released", { orderId });
  console.log(`🔓 Pedido en línea ${orderId} liberado (${reason})`);
}

export function isOnlineOrderClaimed(orderId: string): boolean {
  return onlineOrderClaims.has(orderId);
}

/** El pedido ya se aceptó o rechazó: todos los POS cierran su aviso. */
export function emitOnlineOrderResolved(orderId: string) {
  const claim = onlineOrderClaims.get(orderId);
  if (claim) {
    clearTimeout(claim.timer);
    onlineOrderClaims.delete(orderId);
  }
  io?.to("room:pos").emit("online_order:resolved", { orderId });
}

export function initSocket(socketServer: SocketServer) {
  io = socketServer;
  
  io.on("connection", (socket) => {
    console.log(`🔌 Client connected: ${socket.id}`);
    
    // Join rooms based on client type
    socket.on("join", (room: string) => {
      socket.join(room);
      console.log(`📍 ${socket.id} joined room: ${room}`);
      // Un POS que se conecta (o reconecta) tarde tiene que saber qué pedidos ya
      // están apartados, o sonaría por uno que otro dispositivo está atendiendo.
      if (room === "room:pos") {
        for (const claim of onlineOrderClaims.values()) socket.emit("online_order:claimed", claimPayload(claim));
      }
    });

    socket.on("online_order:claim", (payload: any) => {
      const orderId = typeof payload?.orderId === "string" ? payload.orderId : "";
      const deviceId = typeof payload?.deviceId === "string" ? payload.deviceId : "";
      if (!orderId || !deviceId) return;
      const existing = onlineOrderClaims.get(orderId);
      // Dos tocaron casi al mismo tiempo: gana el primero y al segundo se le avisa.
      if (existing && existing.deviceId !== deviceId) {
        socket.emit("online_order:claimed", claimPayload(existing));
        return;
      }
      if (existing) clearTimeout(existing.timer);
      const claim: OnlineOrderClaim = {
        orderId,
        deviceId,
        by: typeof payload?.by === "string" && payload.by.trim() ? payload.by.trim() : null,
        socketId: socket.id,
        timer: setTimeout(() => releaseOnlineOrderClaim(orderId, "expiró"), ONLINE_ORDER_CLAIM_TTL_MS),
      };
      onlineOrderClaims.set(orderId, claim);
      socket.to("room:pos").emit("online_order:claimed", claimPayload(claim));
      console.log(`🔒 Pedido en línea ${orderId} apartado por ${claim.by ?? deviceId}`);
    });

    socket.on("online_order:release", (payload: any) => {
      const claim = onlineOrderClaims.get(typeof payload?.orderId === "string" ? payload.orderId : "");
      if (claim && claim.deviceId === payload?.deviceId) releaseOnlineOrderClaim(claim.orderId, "lo soltó");
    });
    
    // Relay customer display updates from POS to display iPad
    socket.on("customer_display:update", (payload: any) => {
      io?.to("room:customer_display").emit("customer_display:update", payload);
      console.log(`📺 Relayed customer_display:update (mode: ${payload?.mode})`);
    });
    
    socket.on("disconnect", () => {
      console.log(`🔌 Client disconnected: ${socket.id}`);
      // Si el POS que lo tenía se cae (sin batería, sin wifi), los demás vuelven a sonar.
      for (const claim of [...onlineOrderClaims.values()]) {
        if (claim.socketId === socket.id) releaseOnlineOrderClaim(claim.orderId, "se desconectó");
      }
    });
  });
}

export function getIO(): SocketServer {
  if (!io) {
    throw new Error("Socket.io not initialized");
  }
  return io;
}

// Event emitters
export function emitOrderNew(order: any) {
  if (!io) return;
  io.to("room:dispatch").emit("order:new", order);
  console.log(`📡 Emitted order:new to dispatch`);
}

// Pedido en línea recién pagado → pantalla verde del POS (aceptar/rechazar).
export function emitOnlineOrder(order: any) {
  if (!io) return;
  io.to("room:pos").emit("order:online", order);
  console.log(`📡 Emitted order:online to pos`);
}

export function emitOrderUpdated(order: any) {
  if (!io) return;
  io.to("room:dispatch").emit("order:updated", order);
  io.to("room:pos").emit("order:updated", order);
  io.to("room:waitress").emit("order:updated", order);
  console.log(`📡 Emitted order:updated`);
}

export function emitOrderPaid(order: any) {
  if (!io) return;
  io.to("room:pos").emit("order:paid", order);
  // Tell customer display to return to idle
  io.to("room:customer_display").emit("customer_display:update", { mode: "idle" });
  console.log(`📡 Emitted order:paid + customer_display idle`);
}

export function emitOrderItemsReady(orderItems: any[]) {
  if (!io) return;
  io.to("room:waitress").emit("order:items_ready", orderItems);
  console.log(`📡 Emitted order:items_ready - ${orderItems.length} items`);
}

export function emitTableUpdated(table: any) {
  if (!io) return;
  io.to("room:pos").emit("table:updated", table);
  io.to("room:waitress").emit("table:updated", table);
  io.to("room:tables").emit("table:updated", table);
  console.log(`📡 Emitted table:updated - ${table.id}`);
}

export function emitTableLayoutUpdated(tables: any[]) {
  if (!io) return;
  io.to("room:pos").emit("table:layout:updated", tables);
  io.to("room:waitress").emit("table:layout:updated", tables);
  io.to("room:tables").emit("table:layout:updated", tables);
  console.log(`📡 Emitted table:layout:updated - ${tables.length} tables`);
}

export function emitTableMerged(merge: any) {
  if (!io) return;
  io.to("room:pos").emit("table:merged", merge);
  io.to("room:waitress").emit("table:merged", merge);
  io.to("room:tables").emit("table:merged", merge);
  console.log(`📡 Emitted table:merged - ${merge.id}`);
}

export function emitTableUnmerged(payload: { id: string; primaryTableId: string; mergedTableId: string }) {
  if (!io) return;
  io.to("room:pos").emit("table:unmerged", payload);
  io.to("room:waitress").emit("table:unmerged", payload);
  io.to("room:tables").emit("table:unmerged", payload);
  console.log(`📡 Emitted table:unmerged - ${payload.id}`);
}

export function emitCashRegisterOpened(register: any) {
  if (!io) return;
  io.to("room:pos").emit("cash_register:opened", register);
  console.log(`📡 Emitted cash_register:opened`);
}

export function emitCashRegisterClosed(register: any) {
  if (!io) return;
  io.to("room:pos").emit("cash_register:closed", register);
  console.log(`📡 Emitted cash_register:closed`);
}

export function emitStockUpdated(item: any) {
  if (!io) return;
  io.to("room:pos").emit("stock:updated", item);
  console.log(`📡 Emitted stock:updated`);
}

export function emitDeliveryNewOrder(order: any) {
  if (!io) return;
  io.to("room:dispatch").emit("delivery:new_order", order);
  console.log(`📡 Emitted delivery:new_order`);
}

export function emitReservationNew(reservation: any) {
  if (!io) return;
  io.to("room:pos").emit("reservation:new", reservation);
  console.log(`📅 Emitted reservation:new - ${reservation.id}`);
}

export function emitOrderRush(order: any) {
  if (!io) return;
  io.to("room:dispatch").emit("order:rush", order);
  io.to("room:pos").emit("order:rush", order);
  console.log(`📡 Emitted order:rush - ${order.id}`);
}

export function emitOrderHold(order: any) {
  if (!io) return;
  io.to("room:dispatch").emit("order:hold", order);
  io.to("room:pos").emit("order:hold", order);
  console.log(`📡 Emitted order:hold - ${order.id}`);
}

export function emitPromotionsUpdated(promotion?: any) {
  if (!io) return;
  io.to("room:pos").emit("promotions:updated", promotion || {});
  io.to("room:waitress").emit("promotions:updated", promotion || {});
  console.log(`📡 Emitted promotions:updated`);
}

export function emitFlowsUpdated() {
  if (!io) return;
  io.to("room:pos").emit("flows:updated", {});
  io.to("room:waitress").emit("flows:updated", {});
  io.to("room:bar").emit("flows:updated", {});
  console.log("📡 Emitted flows:updated");
}
