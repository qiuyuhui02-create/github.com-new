import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, seed, shotPrompt, validateAsset } from "../lib/model";
test("asset names must contain text", () => {
  assert.throws(() => validateAsset({ name: "  " }));
  assert.doesNotThrow(() => validateAsset({ name: "主角" }));
});
test("production analysis detects incomplete and dangling assets", () => {
  const report = analyze({
    ...seed,
    shots: [{ ...seed.shots[0], assets: ["deleted"] }],
  });
  assert.match(report, /3 项待完成/);
  assert.match(report, /SH-001：请检查关联资产/);
});
test("shot prompt resolves linked asset descriptions", () => {
  const p = shotPrompt(seed);
  assert.match(p, /黑色风衣/);
  assert.match(p, /SH-003/);
  assert.match(p, /3秒/);
});
import { parseStudio } from "../lib/model";
test("imports reject corrupt nested records and duplicate IDs", () => {
  assert.deepEqual(parseStudio(seed), seed);
  assert.throws(() => parseStudio({ ...seed, shots: [{ id: "oops" }] }));
  assert.throws(() =>
    parseStudio({ ...seed, assets: [seed.assets[0], seed.assets[0]] }),
  );
  assert.throws(() =>
    parseStudio({
      ...seed,
      assets: [{ ...seed.assets[0], versions: [{ at: "invalid" }] }],
    }),
  );
});
