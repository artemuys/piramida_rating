// Целостность переводов: все языки имеют одинаковую структуру ключей.
// Пропущенный ключ в одном из языков = undefined в рендере у части игроков.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { T, LANGS, LOCALES, getT } from "../src/i18n.js";

/** Все пути-листья объекта переводов: "nav.home", "discOpts[2]", … */
function leafPaths(obj, prefix = "") {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (Array.isArray(v)) {
      out.push(`${p}[len=${v.length}]`);
      v.forEach((item, i) => {
        if (typeof item === "object" && item !== null) out.push(...leafPaths(item, `${p}[${i}]`));
        else out.push(`${p}[${i}]:${typeof item}`);
      });
    } else if (typeof v === "object" && v !== null) {
      out.push(...leafPaths(v, p));
    } else {
      out.push(`${p}:${typeof v}`);
    }
  }
  return out.sort();
}

describe("i18n", () => {
  const langs = Object.keys(T);

  test("LANGS, LOCALES и T согласованы по набору языков", () => {
    assert.deepEqual(LANGS.map((l) => l.code).sort(), langs.slice().sort());
    assert.deepEqual(Object.keys(LOCALES).sort(), langs.slice().sort());
  });

  test("у всех языков идентичная структура ключей (эталон — ru)", () => {
    const reference = leafPaths(T.ru);
    for (const lang of langs) {
      if (lang === "ru") continue;
      const actual = leafPaths(T[lang]);
      const missing = reference.filter((p) => !actual.includes(p));
      const extra = actual.filter((p) => !reference.includes(p));
      assert.deepEqual(
        { missing, extra },
        { missing: [], extra: [] },
        `язык "${lang}" расходится с ru`
      );
    }
  });

  test("ни один перевод не пустая строка", () => {
    for (const lang of langs) {
      for (const p of leafPaths(T[lang])) {
        // путь вида "a.b:string" — добираемся до значения и проверяем непустоту
        if (!p.endsWith(":string")) continue;
        const segs = p.slice(0, -7).split(/\.|\[|\]\.?/).filter(Boolean);
        let v = T[lang];
        for (const s of segs) v = v[s];
        assert.ok(String(v).trim().length > 0, `${lang}: пустой перевод по пути ${p}`);
      }
    }
  });

  test("getT отдаёт словарь языка с пометкой _lang, для неизвестного — ru", () => {
    // getT возвращает поверхностную копию словаря + поле _lang (не тот же объект).
    assert.deepEqual(getT("en"), { ...T.en, _lang: "en" });
    assert.deepEqual(getT("xx"), { ...T.ru, _lang: "xx" }); // контент — ru, но метка сохраняет запрошенный код
    assert.deepEqual(getT(undefined), { ...T.ru, _lang: "ru" });
  });
});
