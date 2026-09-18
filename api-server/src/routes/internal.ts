import { Router } from "express";
import { emitPromotionsUpdated } from "../sockets/events";

const router = Router();

// This is intentionally a small server-to-server endpoint. The Next.js
// dashboard owns the promotion CRUD, while Socket.IO only lives in this
// Express process.
router.post("/promotions/notify", (_req, res) => {
  emitPromotionsUpdated();
  res.status(204).end();
});

export default router;
