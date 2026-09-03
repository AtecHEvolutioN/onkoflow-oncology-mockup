import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { createOnkoFlowServer } from "./server.mjs";

let appDirectory;
let baseUrl;
let port;
let server;

before(async () => {
  appDirectory = await mkdtemp(path.join(os.tmpdir(), "onkoflow-launcher-"));
  await writeFile(path.join(appDirectory, "index.html"), "<!doctype html><title>OnkoFlow test</title>");
  await writeFile(path.join(appDirectory, "app.css"), "body { color: teal; }");

  server = createOnkoFlowServer({ appDirectory, port: 0 });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(appDirectory, { recursive: true, force: true });
});

function rawRequest({ method = "GET", path: requestPath = "/", host = `127.0.0.1:${port}` } = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      { host: "127.0.0.1", port, method, path: requestPath, headers: { Host: host } },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => resolve({ body, headers: response.headers, status: response.statusCode }));
      },
    );
    request.on("error", reject);
    request.end();
  });
}

test("serves the application only to the expected local Host header", async () => {
  const response = await rawRequest();
  assert.equal(response.status, 200);
  assert.match(response.body, /OnkoFlow test/);
  assert.equal(response.headers["x-frame-options"], "DENY");
  assert.match(response.headers["content-security-policy"], /connect-src 'self'/);

  const rejected = await rawRequest({ host: "attacker.example" });
  assert.equal(rejected.status, 403);
});

test("serves static assets and supports HEAD", async () => {
  const asset = await rawRequest({ path: "/app.css" });
  assert.equal(asset.status, 200);
  assert.equal(asset.headers["content-type"], "text/css; charset=utf-8");

  const head = await rawRequest({ method: "HEAD", path: "/app.css" });
  assert.equal(head.status, 200);
  assert.equal(head.body, "");
});

test("exposes a signed local health endpoint", async () => {
  const response = await fetch(`${baseUrl}/__onkoflow_health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    application: "onkoflow-local-launcher-v1",
    status: "ok",
  });
});

test("rejects mutation methods and traversal attempts", async () => {
  const post = await rawRequest({ method: "POST" });
  assert.equal(post.status, 405);
  assert.equal(post.headers.allow, "GET, HEAD");

  const traversal = await rawRequest({ path: "/%2e%2e/secret.txt" });
  assert.equal(traversal.status, 400);

  const windowsTraversal = await rawRequest({ path: "/..%5csecret.txt" });
  assert.equal(windowsTraversal.status, 400);
});

test("returns 404 for files outside the packaged application", async () => {
  const response = await rawRequest({ path: "/missing.json" });
  assert.equal(response.status, 404);
});
