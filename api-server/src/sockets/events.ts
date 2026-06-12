import { Server as SocketServer } from "socket.io";

let io: SocketServer | null = null;

export function initSocket(socketServer: SocketServer) {
  io = socketServer;
  
  io.on("connection", (socket) => {
    console.log(`🔌 Client connected: ${socket.id}`);
    
    // Join rooms based on client type
    socket.on("join", (room: string) => {
      socket.join(room);
      console.log(`📍 ${socket.id} joined room: ${room}`);
    });
    
    socket.on("disconnect", () => {
      console.log(`🔌 Client disconnected: ${socket.id}`);
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
  console.log(`📡 Emitted order:paid`);
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
