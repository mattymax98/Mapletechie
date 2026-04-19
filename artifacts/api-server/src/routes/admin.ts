import { Router } from "express";
import { AdminVerifyBody } from "@workspace/api-zod";

const router = Router();

router.post("/admin/verify", async (req, res): Promise<void> => {
  const parsed = AdminVerifyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: "Invalid request" });
    return;
  }

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    res.status(500).json({ success: false, message: "Admin not configured" });
    return;
  }

  if (parsed.data.password !== adminPassword) {
    res.status(401).json({ success: false, message: "Incorrect password" });
    return;
  }

  res.json({ success: true, message: "Authenticated" });
});

export default router;
