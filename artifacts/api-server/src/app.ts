import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { publicMaintenanceGate } from "./middlewares/maintenance";

const app: Express = express();

// We're behind a reverse proxy (Railway + Cloudflare). Without this
// express-rate-limit and req.ip would see the proxy IP, not the real client.
// The "1" tells Express to trust exactly one hop, which is correct for our
// single-proxy setup and avoids the "permissive trust proxy" warning from
// express-rate-limit.
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
// The MCP connector accepts base64 image uploads, which need more headroom
// than regular JSON API calls. Its body is parsed INSIDE the MCP router,
// AFTER the connector-key check, so unauthenticated requests can never make
// the server parse a large payload. Skip global parsing for that path.
const jsonDefault = express.json({ limit: "1mb" });
app.use((req, res, next) =>
  req.path.startsWith("/api/mcp") ? next() : jsonDefault(req, res, next),
);
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// Public maintenance gate: when maintenance mode is on, public API requests
// get a 503. Admin, health, and the public status endpoint stay exempt so the
// site can still be managed and the frontend can poll its status.
app.use("/api", publicMaintenanceGate);
app.use("/api", router);

export default app;
