import { spawn } from "node:child_process";
import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 8787;
const HEALTH_PATH = "/__onkoflow_health";
const HEALTH_SIGNATURE = "onkoflow-local-launcher-v1";

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".wasm", "application/wasm"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

const securityHeaders = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'none'",
  ].join("; "),
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

function sendText(response, statusCode, text) {
  const body = Buffer.from(text, "utf8");
  response.writeHead(statusCode, {
    ...securityHeaders,
    "Content-Length": body.length,
    "Content-Type": "text/plain; charset=utf-8",
  });
  response.end(body);
}

function isAllowedHost(hostHeader, port) {
  return hostHeader === `${DEFAULT_HOST}:${port}` || hostHeader === `localhost:${port}`;
}

function resolveRequestPath(appDirectory, requestUrl) {
  let pathname;
  try {
    const rawPathname = requestUrl.split("?", 1)[0].split("#", 1)[0];
    if (!rawPathname.startsWith("/")) return null;
    pathname = decodeURIComponent(rawPathname);
  } catch {
    return null;
  }

  if (pathname.includes("\0") || pathname.includes("\\")) return null;

  const segments = pathname.split("/");
  if (segments.some((segment) => segment === "..")) return null;

  const relativePath = segments.filter(Boolean).join(path.sep) || "index.html";
  const root = path.resolve(appDirectory);
  const candidate = path.resolve(root, relativePath);
  const relative = path.relative(root, candidate);

  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return candidate;
}

export function createOnkoFlowServer({ appDirectory, port = DEFAULT_PORT } = {}) {
  if (!appDirectory) throw new Error("appDirectory is required");

  const server = http.createServer(async (request, response) => {
    const address = server.address();
    const activePort = typeof address === "object" && address ? address.port : port;
    if (!isAllowedHost(request.headers.host, activePort)) {
      sendText(response, 403, "Forbidden");
      return;
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      response.setHeader("Allow", "GET, HEAD");
      sendText(response, 405, "Method Not Allowed");
      return;
    }

    let requestPath;
    try {
      requestPath = new URL(request.url ?? "/", "http://localhost").pathname;
    } catch {
      sendText(response, 400, "Bad Request");
      return;
    }
    if (requestPath === HEALTH_PATH) {
      const body = JSON.stringify({ application: HEALTH_SIGNATURE, status: "ok" });
      response.writeHead(200, {
        ...securityHeaders,
        "Content-Length": Buffer.byteLength(body),
        "Content-Type": "application/json; charset=utf-8",
      });
      response.end(request.method === "HEAD" ? undefined : body);
      return;
    }

    let filePath = resolveRequestPath(appDirectory, request.url ?? "/");
    if (!filePath) {
      sendText(response, 400, "Bad Request");
      return;
    }

    try {
      let fileStat = await stat(filePath);
      if (fileStat.isDirectory()) {
        filePath = path.join(filePath, "index.html");
        fileStat = await stat(filePath);
      }
      if (!fileStat.isFile()) throw new Error("Not a file");

      response.writeHead(200, {
        ...securityHeaders,
        "Content-Length": fileStat.size,
        "Content-Type": contentTypes.get(path.extname(filePath).toLowerCase()) ?? "application/octet-stream",
      });

      if (request.method === "HEAD") {
        response.end();
        return;
      }

      const stream = createReadStream(filePath);
      stream.on("error", () => response.destroy());
      stream.pipe(response);
    } catch {
      sendText(response, 404, "Not Found");
    }
  });

  return server;
}

function probeExistingServer(url) {
  return new Promise((resolve) => {
    const request = http.get(`${url}${HEALTH_PATH.slice(1)}`, { timeout: 800 }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        try {
          resolve(JSON.parse(body).application === HEALTH_SIGNATURE);
        } catch {
          resolve(false);
        }
      });
    });
    request.on("timeout", () => request.destroy());
    request.on("error", () => resolve(false));
  });
}

function openBrowser(url) {
  if (process.env.ONKOFLOW_NO_BROWSER === "1") return;

  const candidates = [
    process.env["PROGRAMFILES(X86)"] && path.join(process.env["PROGRAMFILES(X86)"], "Microsoft", "Edge", "Application", "msedge.exe"),
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, "Microsoft", "Edge", "Application", "msedge.exe"),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Microsoft", "Edge", "Application", "msedge.exe"),
  ].filter(Boolean);

  const edge = candidates.find((candidate) => existsSync(candidate));
  const child = edge
    ? spawn(edge, ["--new-window", url], { detached: true, stdio: "ignore", windowsHide: true })
    : spawn("cmd.exe", ["/d", "/s", "/c", "start", "", url], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      });
  child.unref();
}

async function main() {
  const launcherDirectory = path.dirname(fileURLToPath(import.meta.url));
  const appDirectory = path.resolve(launcherDirectory, "..", "app");
  const port = DEFAULT_PORT;
  const url = `http://${DEFAULT_HOST}:${port}/`;

  if (!existsSync(path.join(appDirectory, "index.html"))) {
    console.error("CHYBA: Chybí app\\index.html. Rozbalte prosím celý OnkoFlow ZIP.");
    process.exitCode = 1;
    return;
  }

  if (await probeExistingServer(url)) {
    console.log("OnkoFlow již běží. Otevírám existující lokální aplikaci…");
    openBrowser(url);
    return;
  }

  const server = createOnkoFlowServer({ appDirectory, port });
  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(`CHYBA: Port ${port} používá jiná aplikace. Ukončete ji a spusťte OnkoFlow znovu.`);
    } else {
      console.error(`CHYBA: Lokální server nelze spustit: ${error.message}`);
    }
    process.exitCode = 1;
  });
  server.listen(port, DEFAULT_HOST, () => {
    console.log("OnkoFlow běží pouze na tomto počítači:");
    console.log(url);
    console.log("");
    console.log("Toto okno ponechte otevřené. Zavřením okna aplikaci zastavíte.");
    console.log("Internet není potřeba; pacientská data se na internet neodesílají.");
    openBrowser(url);
  });
}

const invokedAsScript = process.argv[1]
  ? import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
  : false;

if (invokedAsScript) {
  await main();
}
