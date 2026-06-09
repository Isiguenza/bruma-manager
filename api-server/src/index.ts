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

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(",") || "*",
  credentials: true,
}));
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
import ordersRouter from "./routes/orders";
import employeesRouter from "./routes/employees";
import promotionsRouter from "./routes/promotions";
import loyaltyRouter from "./routes/loyalty";
import inventoryRouter from "./routes/inventory";
import flowsRouter from "./routes/flows";
import extrasRouter from "./routes/extras";
import discountsRouter from "./routes/discounts";
import reservationsRouter from "./routes/reservations";

app.use("/api", authRouter);
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
});
