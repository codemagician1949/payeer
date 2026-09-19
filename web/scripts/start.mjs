/**
 * One start command, two services.
 *
 * Both the web app and the chat server deploy from this directory, and some hosts don't let a
 * second service override its start command. `SERVICE=chat` runs the chat server; anything else
 * serves the Next.js app.
 */
import { spawn } from "node:child_process";

const service = (process.env.SERVICE ?? "web").toLowerCase();

if (service === "chat") {
  await import("../server/chat.mjs");
} else {
  const port = process.env.PORT ?? "3000";
  const next = spawn("npx", ["next", "start", "--port", port], { stdio: "inherit" });
  next.on("exit", (code) => process.exit(code ?? 0));
}
