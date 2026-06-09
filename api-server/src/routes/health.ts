import { Router } from "express";

const router = Router();

router.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "bruma-api-server",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

export default router;
