import express, { type Request, type Response, type NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { createServer } from 'http';
import { Server } from 'socket.io';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const IS_PROD = process.env.NODE_ENV === 'production';

// ── Zod validation schemas ───────────────────────────────────────────────────
const GuardianSchema = z.object({
  role: z.enum(['Father', 'Mother', 'Guardian']),
  name: z.string().min(1).max(200),
  faceDescriptor: z.array(z.number()).length(128),
  photo: z.string().max(200_000).optional(),
});

const RegistryEntrySchema = z.object({
  id: z.string().uuid(),
  childName: z.string().min(1).max(200),
  scholarNo: z.string().min(1).max(100),
  classSec: z.string().min(1).max(50),
  guardians: z.array(GuardianSchema).min(1).max(5),
  studentFaceDescriptor: z.array(z.number()).length(128),
  studentPhoto: z.string().max(200_000).optional(),
  createdAt: z.number().int().positive(),
});

const PickupLogSchema = z.object({
  id: z.string().uuid(),
  studentName: z.string().max(200),
  guardianName: z.string().max(200),
  guardianRole: z.string().max(50),
  scholarNo: z.string().max(100),
  classSec: z.string().max(50),
  timestamp: z.number().int().positive(),
  cameraLabel: z.string().max(100).optional(),
});

const SystemSettingsSchema = z.object({
  systemPassword: z.string().min(1).max(200).optional(),
  backupEnabled: z.boolean().optional(),
});

// ── File-write mutex (prevents corrupt JSON from concurrent writes) ──────────
const writeLocks = new Map<string, Promise<void>>();

async function safeWrite(filePath: string, data: string): Promise<void> {
  const prev = writeLocks.get(filePath) ?? Promise.resolve();
  const op = prev
    .then(() => fs.writeFile(filePath, data, 'utf-8'))
    .finally(() => { if (writeLocks.get(filePath) === op) writeLocks.delete(filePath); });
  writeLocks.set(filePath, op);
  await op;
}

// ── Validation middleware factory ────────────────────────────────────────────
function validate(schema: z.ZodTypeAny) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: 'Validation failed', issues: result.error.issues });
      return;
    }
    req.body = result.data;
    next();
  };
}

// ── Server bootstrap ─────────────────────────────────────────────────────────
async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: IS_PROD ? false : '*', methods: ['GET', 'POST'] },
  });

  const PORT = Number(process.env.PORT) || 3000;
  const DATA_DIR = path.join(__dirname, 'data');
  const REGISTRY_FILE = path.join(DATA_DIR, 'registry.json');
  const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
  const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

  await fs.mkdir(DATA_DIR, { recursive: true });

  // ── Middleware ───────────────────────────────────────────────────────────
  app.use(
    helmet({
      contentSecurityPolicy: false,   // CSP controlled by Vite in dev
      crossOriginEmbedderPolicy: false,
    })
  );
  app.use(compression());
  app.use(morgan(IS_PROD ? 'combined' : 'dev'));
  app.use(express.json({ limit: '50mb' }));

  // Rate limit: 300 req / 15 min per IP
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests — please try again later.' },
  });
  app.use('/api', apiLimiter);

  // ── API routes ────────────────────────────────────────────────────────────
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime(), ts: Date.now() });
  });

  // Registry
  app.get('/api/registry', async (_req, res, next) => {
    try {
      const raw = await fs.readFile(REGISTRY_FILE, 'utf-8').catch(() => '[]');
      res.json(JSON.parse(raw));
    } catch (err) { next(err); }
  });

  app.post(
    '/api/registry',
    validate(z.array(RegistryEntrySchema).max(2000)),
    async (req, res, next) => {
      try {
        await safeWrite(REGISTRY_FILE, JSON.stringify(req.body, null, 2));
        io.emit('registry-updated', req.body);
        res.json({ success: true });
      } catch (err) { next(err); }
    }
  );

  // Settings
  app.get('/api/settings', async (_req, res, next) => {
    try {
      const raw = await fs.readFile(SETTINGS_FILE, 'utf-8')
        .catch(() => '{"systemPassword":"admin","backupEnabled":true}');
      res.json(JSON.parse(raw));
    } catch (err) { next(err); }
  });

  app.post(
    '/api/settings',
    validate(SystemSettingsSchema),
    async (req, res, next) => {
      try {
        await safeWrite(SETTINGS_FILE, JSON.stringify(req.body, null, 2));
        res.json({ success: true });
      } catch (err) { next(err); }
    }
  );

  // History
  app.get('/api/history', async (_req, res, next) => {
    try {
      const raw = await fs.readFile(HISTORY_FILE, 'utf-8').catch(() => '[]');
      res.json(JSON.parse(raw));
    } catch (err) { next(err); }
  });

  app.post(
    '/api/history',
    validate(z.array(PickupLogSchema).max(10_000)),
    async (req, res, next) => {
      try {
        await safeWrite(HISTORY_FILE, JSON.stringify(req.body, null, 2));
        io.emit('history-updated', req.body);
        res.json({ success: true });
      } catch (err) { next(err); }
    }
  );

  // ── Global error handler ─────────────────────────────────────────────────
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[Server Error]', err.message);
    res.status(500).json({ error: 'Internal server error' });
  });

  // ── Static / Vite middleware ─────────────────────────────────────────────
  if (!IS_PROD) {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath, { maxAge: '1d', etag: true }));
    app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀  Sentinel  →  http://localhost:${PORT}  [${IS_PROD ? 'production' : 'development'}]\n`);
  });
}

startServer().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
