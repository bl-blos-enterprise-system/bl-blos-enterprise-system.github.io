import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (relative) => fs.readFile(path.join(root, relative), "utf8");

const [index, app, css, readme, manifestText] = await Promise.all([
  read("index.html"),
  read("assets/js/app.js"),
  read("assets/css/ubl.css"),
  read("README.md"),
  read("documents/release-manifest.json"),
]);

for (const marker of [
  'data-page="onboarding"',
  'data-page="university"',
  'id="onboardingStage"',
  'id="ublEvaluationForm"',
  'assets/css/ubl.css?v=2.2.0',
  'assets/js/app.js?v=2.2.0',
]) assert.ok(index.includes(marker), `Falta marcador HTML: ${marker}`);

for (const marker of [
  'const APP_VERSION = "2.2.0"',
  "save_my_ubl_progress",
  "get_ubl_dashboard",
  "onboardingCompleted",
  "UBL-IND-001",
  "UBL-LID-301",
  "Excelencia UBL",
]) assert.ok(app.includes(marker), `Falta comportamiento JS: ${marker}`);

assert.ok(css.includes("@media(max-width:650px)"), "Falta regla móvil UBL");
assert.ok(readme.includes("v2.2.0"), "README no reporta v2.2.0");

const removedPresentation = "BES-13-PPT-001-v2.0_Presentacion_Ejecutiva_Expansion_BES.pptx";
for (const content of [index, app, readme, manifestText]) {
  assert.ok(!content.includes(removedPresentation), "La presentación privada sigue referenciada públicamente");
}
await assert.rejects(
  fs.access(path.join(root, "documents", removedPresentation)),
  "La presentación privada sigue dentro de documents",
);

const manifest = JSON.parse(manifestText);
assert.equal(manifest.portal_version, "2.2.0");
assert.equal(manifest.published_files, manifest.files.length);
assert.equal(new Set(manifest.files.map((item) => item.code)).size, manifest.controlled_document_codes);

for (const item of manifest.files) {
  const bytes = await fs.readFile(path.join(root, "documents", item.file));
  assert.equal(bytes.length, item.bytes, `Tamaño incorrecto: ${item.file}`);
  assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), item.sha256, `SHA-256 incorrecto: ${item.file}`);
}

console.log(`Smoke BES v${manifest.portal_version}: ${manifest.files.length} archivos controlados verificados.`);
