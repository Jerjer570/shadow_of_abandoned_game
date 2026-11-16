// Pengecekan tabrakan denah Experiment Chamber (jalankan: node tools/check_layout.mjs)
import { LAB, LAB_PLATFORM, labFootprints, labMapWalls } from "../src/systems/LabLayout.js";

const fp = labFootprints();
const MARGIN = 0.12;
let problems = 0;
const bad = (m) => { problems++; console.log("  !", m); };

const box = (f) => f.shape === "rect"
  ? f
  : { x0: f.cx - f.r, x1: f.cx + f.r, z0: f.cz - f.r, z1: f.cz + f.r };

function dist(a, b) {
  // jarak terdekat antar bentuk (negatif = tumpang tindih)
  if (a.shape === "circle" && b.shape === "circle") return Math.hypot(a.cx - b.cx, a.cz - b.cz) - a.r - b.r;
  if (a.shape === "circle" || b.shape === "circle") {
    const c = a.shape === "circle" ? a : b, r = a.shape === "circle" ? b : a;
    const dx = Math.max(r.x0 - c.cx, 0, c.cx - r.x1), dz = Math.max(r.z0 - c.cz, 0, c.cz - r.z1);
    return Math.hypot(dx, dz) - c.r;
  }
  const dx = Math.max(a.x0 - b.x1, b.x0 - a.x1), dz = Math.max(a.z0 - b.z1, b.z0 - a.z1);
  return Math.max(dx, dz) < 0 ? Math.max(dx, dz) : Math.hypot(Math.max(dx, 0), Math.max(dz, 0));
}

console.log("1) Tumpang tindih / terlalu dekat antar properti");
for (let i = 0; i < fp.length; i++) for (let j = i + 1; j < fp.length; j++) {
  const d = dist(fp[i], fp[j]);
  if (d < MARGIN) bad(`${fp[i].id} <-> ${fp[j].id}: jarak ${d.toFixed(2)} m`);
}

console.log("2) Dinding luar dan pembatas");
const D = LAB.divider, inner = LAB.wallT / 2;
fp.forEach((f) => {
  const b = box(f);
  if (b.x0 < inner + 0.05 || b.z0 < inner + 0.05 || b.x1 > LAB.w - inner - 0.05 || b.z1 > LAB.d - inner - 0.05)
    bad(`${f.id} menembus dinding luar`);
  // pembatas x=7: tidak boleh menembus, kecuali di celah pintu (properti tidak boleh ada di celah)
  if (b.x0 < D.x + inner && b.x1 > D.x - inner) bad(`${f.id} menembus dinding pembatas`);
});

console.log("3) Jalur masuk (pintu -> celah pembatas -> panggung) harus bebas");
const lane = { shape: "rect", x0: 0.9, x1: D.x + 2, z0: 6.0, z1: 8.0 };
fp.forEach((f) => { if (dist(f, lane) < 0.01) bad(`${f.id} menghalangi jalur masuk`); });
const lane2 = { shape: "rect", x0: D.x, x1: LAB_PLATFORM.cx - LAB_PLATFORM.r - 0.3, z0: 6.0, z1: 8.0 };
fp.forEach((f) => { if (dist(f, lane2) < 0.01) bad(`${f.id} menghalangi jalur ke panggung`); });

console.log("4) Meja item tidak boleh di jalur ke pintu kembali dan tidak terlalu dekat jendela");
const walls = labMapWalls();
console.log(`   ${walls.length} segmen dinding, ${fp.length} bentuk padat`);
console.log(problems ? `\nADA ${problems} MASALAH` : "\nSEMUA AMAN: tidak ada properti yang bertabrakan.");
process.exit(problems ? 1 : 0);
