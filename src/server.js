import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { reconcileEvents } from "./reconcile.js";

const dataDirectory = new URL("../data/", import.meta.url);
const [crmText, calendarText] = await Promise.all([
  readFile(new URL("crm_events.json", dataDirectory), "utf8"),
  readFile(new URL("calendar_events.json", dataDirectory), "utf8"),
]);
const result = reconcileEvents(JSON.parse(crmText), JSON.parse(calendarText));
const port = Number(process.env.PORT ?? 3000);
const publicDirectory = new URL("../public/", import.meta.url);
const staticFiles = new Map([
  ["/", { file: "index.html", type: "text/html; charset=utf-8" }],
  ["/app.css", { file: "app.css", type: "text/css; charset=utf-8" }],
  ["/app.js", { file: "app.js", type: "text/javascript; charset=utf-8" }],
]);

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
  });
  response.end(JSON.stringify(payload));
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (request.method !== "GET") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  const staticFile = staticFiles.get(url.pathname);
  if (staticFile) {
    readFile(new URL(staticFile.file, publicDirectory))
      .then((content) => {
        response.writeHead(200, { "content-type": staticFile.type });
        response.end(content);
      })
      .catch(() => sendJson(response, 500, { error: "Unable to load application" }));
    return;
  }

  if (url.pathname === "/api/health") {
    sendJson(response, 200, { status: "ok" });
    return;
  }

  if (url.pathname === "/api/meetings") {
    const meetings = url.searchParams.has("status")
      ? result.meetings.filter((meeting) => meeting.matchStatus === url.searchParams.get("status"))
      : result.meetings;
    sendJson(response, 200, { ...result, meetings });
    return;
  }

  if (url.pathname.startsWith("/api/meetings/")) {
    const id = decodeURIComponent(url.pathname.slice("/api/meetings/".length));
    const meeting = result.meetings.find((item) => item.id === id);
    sendJson(response, meeting ? 200 : 404, meeting ?? { error: "Meeting not found" });
    return;
  }

  sendJson(response, 404, { error: "Not found" });
});

server.listen(port, () => {
  console.log(`Event Sync API listening at http://localhost:${port}`);
});