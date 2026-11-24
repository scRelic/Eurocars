import { readFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";

const [port, targetPort, keyPath, certPath] = process.argv.slice(2);
if (!/^\d+$/.test(port ?? "") || !/^\d+$/.test(targetPort ?? "") || !keyPath || !certPath) {
  throw new Error("Provide local proxy port, target port, key and certificate paths.");
}

https.createServer({ key: readFileSync(keyPath), cert: readFileSync(certPath) }, (request, response) => {
  const upstream = http.request({
    hostname: "127.0.0.1",
    port: Number(targetPort),
    method: request.method,
    path: request.url,
    headers: request.headers,
  }, (result) => {
    response.writeHead(result.statusCode ?? 502, result.headers);
    result.pipe(response);
  });
  upstream.on("error", (error) => {
    console.error("Test proxy upstream error:", error.message);
    if (!response.headersSent) response.writeHead(502);
    response.end();
  });
  request.pipe(upstream);
}).listen(Number(port), "127.0.0.1");
