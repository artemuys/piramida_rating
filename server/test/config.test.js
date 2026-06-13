// Фатальные ветки config.js проверяем в дочерних процессах:
// модуль вызывает process.exit(1) при опасных комбинациях env.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function importConfig(envOverrides) {
  const env = { ...process.env, ...envOverrides };
  for (const [k, v] of Object.entries(envOverrides)) if (v === undefined) delete env[k];
  return spawnSync(
    process.execPath,
    ["--input-type=module", "-e", "await import('./src/config.js'); console.log('CONFIG_OK');"],
    { cwd: serverDir, env, encoding: "utf8" }
  );
}

describe("config — защита от опасных конфигураций", () => {
  test("без BOT_TOKEN и без DEV_AUTH — fatal exit 1", () => {
    const r = importConfig({ BOT_TOKEN: undefined, DEV_AUTH: undefined, NODE_ENV: undefined });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /BOT_TOKEN/);
  });

  test("DEV_AUTH=1 в production — fatal exit 1 (обход аутентификации запрещён)", () => {
    const r = importConfig({ DEV_AUTH: "1", NODE_ENV: "production", BOT_TOKEN: "x" });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /DEV_AUTH/);
  });

  test("BOT_TOKEN без DEV_AUTH — нормальный запуск", () => {
    const r = importConfig({ BOT_TOKEN: "real-token", DEV_AUTH: undefined, NODE_ENV: undefined });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /CONFIG_OK/);
  });

  test("DEV_AUTH=1 вне production — запуск с предупреждением", () => {
    const r = importConfig({ DEV_AUTH: "1", BOT_TOKEN: undefined, NODE_ENV: undefined });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /DEV_AUTH/); // warning, не fatal
  });
});
