import express from "express";
import { createServer } from "http";
import { Server as SocketServer } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import { initSocket } from "./sockets/events";
import healthRouter from "./routes/health";

// Load environment variables
dotenv.config();

const app = express();
const httpServer = createServer(app);

// Socket.io setup
const io = new SocketServer(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN?.split(",") || "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  },
});

// Initialize socket events
initSocket(io);

// CORS: when credentials=true, origin cannot be "*"
const defaultOrigins = ["https://admin.cocinabruma.com.mx", "https://cocinabruma.com.mx", "https://www.cocinabruma.com.mx", "http://localhost:3000"];
const envOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",") : [];
const allowedOrigins = [...new Set([...defaultOrigins, ...envOrigins])];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked: ${origin}`));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
}));
// Stripe webhook: se monta con body RAW ANTES de express.json (para verificar firma).
import onlineOrdersRouter, { stripeWebhookHandler, cleanupAbandonedOnlineOrders, remindPendingOnlineOrders } from "./routes/online-orders";
app.post("/api/webhooks/stripe", express.raw({ type: "application/json" }), stripeWebhookHandler);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  if (req.method === "POST" || req.method === "PATCH") {
    console.log("📦 Body:", JSON.stringify(req.body).substring(0, 500));
  }
  next();
});

// Routes
app.use(healthRouter);

// API Routes
import authRouter from "./routes/auth";
import cashRegisterRouter from "./routes/cash-register";
import tablesRouter from "./routes/tables";
import productsRouter from "./routes/products";
import ordersRouter, { cleanupPracticeOrders } from "./routes/orders";
import employeesRouter from "./routes/employees";
import promotionsRouter from "./routes/promotions";
import loyaltyRouter from "./routes/loyalty";
import inventoryRouter from "./routes/inventory";
import flowsRouter from "./routes/flows";
import extrasRouter from "./routes/extras";
import discountsRouter from "./routes/discounts";
import reservationsRouter from "./routes/reservations";
import walletRouter from "./routes/wallet";
import whatsappRouter from "./routes/whatsapp";
import quickNotesRouter from "./routes/quick-notes";
import mapFixturesRouter from "./routes/mapFixtures";
import customerAddressesRouter from "./routes/customer-addresses";
import paymentMethodsRouter from "./routes/payment-methods";

app.use("/api", authRouter);
app.use("/api", onlineOrdersRouter);
app.use("/api", customerAddressesRouter);
app.use("/api", paymentMethodsRouter);
app.use("/api", cashRegisterRouter);
app.use("/api", tablesRouter);
app.use("/api", productsRouter);
app.use("/api", ordersRouter);
app.use("/api", employeesRouter);
app.use("/api", promotionsRouter);
app.use("/api", loyaltyRouter);
app.use("/api", inventoryRouter);
app.use("/api", flowsRouter);
app.use("/api", extrasRouter);
app.use("/api", discountsRouter);
app.use("/api", reservationsRouter);
app.use("/api", walletRouter);
app.use("/api", whatsappRouter);
app.use("/api", quickNotesRouter);
app.use("/api", mapFixturesRouter);

// Open cash drawer — proxy to print server
app.post("/api/open-drawer", async (req, res) => {
  try {
    const printServerUrl = process.env.PRINT_SERVER_URL || "http://print-server:3001";
    const response = await fetch(`${printServerUrl}/open-drawer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error: any) {
    console.error("❌ Error proxying open-drawer:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Error:", err);
  res.status(err.status || 500).json({
    error: err.message || "Internal server error",
  });
});

// Start server
const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
  console.log(`🚀 API Server running on port ${PORT}`);
  console.log(`📡 WebSocket server ready`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);

  // Pedidos web que se quedaron "pending" a medio pago (sin succeeded, sin
  // failed, sin canceled) — se barren cada 10 min.
  cleanupAbandonedOnlineOrders();
  setInterval(cleanupAbandonedOnlineOrders, 10 * 60 * 1000);

  // Red de seguridad: re-empuja (socket + push) los pedidos en línea que
  // llevan rato sin que el POS los acepte ni rechace.
  setInterval(remindPendingOnlineOrders, 60 * 1000);

  // Órdenes de Modo Práctica (Bruma POS Mobile) con más de 2h — se borran
  // solas, no deben acumularse para siempre en la BD.
  cleanupPracticeOrders();
  setInterval(cleanupPracticeOrders, 30 * 60 * 1000);
});
