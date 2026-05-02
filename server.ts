import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";
import { createServer } from "http";
import { Server } from "socket.io";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: "*" }
  });

  const PORT = 3000;
  const DATA_DIR = path.join(__dirname, "data");
  const REGISTRY_FILE = path.join(DATA_DIR, "registry.json");
  const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
  const HISTORY_FILE = path.join(DATA_DIR, "history.json");

  // Ensure data directory exists
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch (err) {
    console.error("Error creating data directory:", err);
  }

  app.use(express.json({ limit: '50mb' }));

  // API Routes
  app.get("/api/registry", async (req, res) => {
    try {
      const data = await fs.readFile(REGISTRY_FILE, "utf-8");
      res.json(JSON.parse(data || "[]"));
    } catch (err) {
      res.json([]);
    }
  });

  app.post("/api/registry", async (req, res) => {
    try {
      await fs.writeFile(REGISTRY_FILE, JSON.stringify(req.body, null, 2));
      io.emit("registry-updated", req.body);
      res.json({ success: true });
    } catch (err) {
      console.error("Registry write error:", err);
      res.status(500).json({ error: "Failed to save registry" });
    }
  });

  app.get("/api/settings", async (req, res) => {
    try {
      const data = await fs.readFile(SETTINGS_FILE, "utf-8");
      res.json(JSON.parse(data || '{"systemPassword": "admin"}'));
    } catch (err) {
      res.json({ systemPassword: "admin", backupEnabled: true });
    }
  });

  app.post("/api/settings", async (req, res) => {
    try {
      await fs.writeFile(SETTINGS_FILE, JSON.stringify(req.body, null, 2));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to save settings" });
    }
  });

  app.get("/api/history", async (req, res) => {
    try {
      const data = await fs.readFile(HISTORY_FILE, "utf-8");
      res.json(JSON.parse(data || "[]"));
    } catch (err) {
      res.json([]);
    }
  });

  app.post("/api/history", async (req, res) => {
    try {
      await fs.writeFile(HISTORY_FILE, JSON.stringify(req.body, null, 2));
      io.emit("history-updated", req.body);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to save history" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
