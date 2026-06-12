import crypto from "node:crypto";
process.env.DEV_AUTH = "1";
process.env.BOT_TOKEN = "12345:TEST_TOKEN";
const { verifyInitData } = await import("./src/auth.js");

function makeInitData(token, ageSec = 0, tamper = false) {
  const user = JSON.stringify({ id: 777, first_name: "Test" });
  const authDate = Math.floor(Date.now() / 1000) - ageSec;
  const params = new URLSearchParams({ user, auth_date: String(authDate), query_id: "AAA" });
  const dcs = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(token).digest();
  let hash = crypto.createHmac("sha256", secret).update(dcs).digest("hex");
  if (tamper) hash = hash.slice(0, -1) + (hash.endsWith("0") ? "1" : "0");
  params.set("hash", hash);
  return params.toString();
}

console.log("valid signature:", verifyInitData(makeInitData("12345:TEST_TOKEN"))?.id === 777 ? "PASS" : "FAIL");
console.log("tampered hash rejected:", verifyInitData(makeInitData("12345:TEST_TOKEN", 0, true)) === null ? "PASS" : "FAIL");
console.log("wrong bot token rejected:", verifyInitData(makeInitData("999:OTHER")) === null ? "PASS" : "FAIL");
console.log("stale auth_date rejected:", verifyInitData(makeInitData("12345:TEST_TOKEN", 100000)) === null ? "PASS" : "FAIL");
console.log("garbage rejected:", verifyInitData("hash=zzzz&user=1") === null ? "PASS" : "FAIL");
