import { config } from "./config.js";
import { buildApp } from "./app.js";
import { startSweeper } from "./sweeper.js";

const app = await buildApp({ logger: { level: "info" } });

startSweeper(app.log);

try {
  await app.listen({ port: config.port, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
