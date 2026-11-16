import { Color3, MeshBuilder, StandardMaterial } from "@babylonjs/core";
import * as Forge from "./TextureForge.js";

/**
 * GENERATOR HD: generator diesel industri (rangka baja, grille radiator, knalpot,
 * panel kontrol dengan tuas + lampu indikator, slot sekering, label bahaya).
 * Anchor (kotak 1.2 x 1.0 x 0.8) tetap jadi sasaran interaksi dan tabrakan; visual
 * tidak keluar dari jejak kotak itu. Sisi depan menghadap -z.
 * Saat generator dinyalakan: lampu hijau, tuas turun, badan bergetar halus.
 */
export function attachHDGenerator(scene, anchor, pool) {
	const paint = pool.pair("gen_paint", 512, 512, () => Forge.genMetal(512, 512, { seed: 77, base: [70, 96, 78], rust: 0.3 }), "#4a6050");
	const steel = pool.pair("gen_steel", 512, 512, () => Forge.genMetal(512, 512, { seed: 78, base: [110, 112, 116], rust: 0.15 }), "#6a6c70");

	const mk = (name, tex, tint, withBump = false) => {
		const m = new StandardMaterial(name, scene);
		m.diffuseTexture = tex.diff;
		if (withBump) m.bumpTexture = tex.normal;
		m.diffuseColor = tint;
		m.specularColor = new Color3(0.3, 0.3, 0.3);
		m.specularPower = 40;
		m.emissiveColor = new Color3(0.05, 0.05, 0.05);
		m.maxSimultaneousLights = 6;
		return m;
	};
	const flat = (name, c, glow = 0.1) => {
		const m = new StandardMaterial(name, scene);
		m.diffuseColor = c;
		m.emissiveColor = new Color3(c.r * glow, c.g * glow, c.b * glow);
		m.specularColor = new Color3(0.2, 0.2, 0.2);
		m.maxSimultaneousLights = 6;
		return m;
	};
	const body = mk("gen_body", paint, new Color3(1, 1, 1), true);
	const metal = mk("gen_metal", steel, new Color3(0.9, 0.9, 0.9));
	const black = flat("gen_black", new Color3(0.04, 0.04, 0.045), 0.2);
	const red = flat("gen_red", new Color3(0.75, 0.08, 0.06), 0.3);
	const lampOff = flat("gen_lamp_off", new Color3(0.35, 0.05, 0.04), 0.9);
	const lampOn = flat("gen_lamp_on", new Color3(0.1, 1, 0.35), 0.9);
	lampOn.emissiveColor = new Color3(0.1, 0.9, 0.3);
	const gaugeFace = flat("gen_gauge", new Color3(0.9, 0.88, 0.7), 0.5);

	const label = (key, text, bg, fg) => {
		const t = pool.sign(key, text, { w: 256, h: 96, bg, fg, border: fg, font: "bold 40px 'Courier New', monospace" });
		const m = new StandardMaterial(`${key}_m`, scene);
		m.diffuseTexture = t;
		m.emissiveTexture = t;
		m.emissiveColor = new Color3(0.5, 0.5, 0.5);
		m.specularColor = Color3.Black();
		return m;
	};

	const root = anchor; // anak langsung dari anchor; titik (0,0,0) = pusat kotak
	const base = -0.5; // lantai
	const parts = [];
	const add = (m, x, y, z, mat, { rx = 0, rz = 0 } = {}) => {
		m.parent = root;
		m.position.set(x, base + y, z);
		m.rotation.x = rx;
		m.rotation.z = rz;
		m.material = mat;
		m.isPickable = false;
		m.checkCollisions = false;
		parts.push(m);
		return m;
	};
	const box = (n, w, h, d, x, y, z, mat) => add(MeshBuilder.CreateBox(`${anchor.id}_${n}`, { width: w, height: h, depth: d }, scene), x, y, z, mat);
	const cyl = (n, dia, h, x, y, z, mat, o) => add(MeshBuilder.CreateCylinder(`${anchor.id}_${n}`, { diameter: dia, height: h, tessellation: 18 }, scene), x, y, z, mat, o);

	// Rangka dan badan
	box("skid", 1.2, 0.1, 0.8, 0, 0.05, 0, black);
	const bodyMesh = box("body", 1.12, 0.72, 0.7, 0, 0.46, 0.02, body);
	box("topframe", 1.18, 0.05, 0.76, 0, 0.84, 0, metal);
	[-0.56, 0.56].forEach((x) => [-0.34, 0.34].forEach((z) => box("post", 0.05, 0.78, 0.05, x, 0.47, z, metal)));

	// Grille radiator di sisi kiri depan
	box("grille", 0.5, 0.5, 0.03, -0.3, 0.5, -0.355, black);
	for (let i = 0; i < 8; i++) box("slat", 0.46, 0.02, 0.04, -0.3, 0.28 + i * 0.06, -0.37, metal);

	// Knalpot
	cyl("exhaust", 0.1, 0.6, 0.45, 1.12, 0.2, metal);
	cyl("exhaustCap", 0.14, 0.04, 0.45, 1.44, 0.2, black);
	cyl("exhaustRing", 0.13, 0.03, 0.45, 0.9, 0.2, metal);

	// Panel kontrol di sisi kanan depan
	box("panel", 0.46, 0.5, 0.04, 0.3, 0.5, -0.37, black);
	[-0.1, 0.1].forEach((dx, i) => {
		cyl(`gauge${i}`, 0.14, 0.02, 0.3 + dx, 0.66, -0.4, gaugeFace, { rx: Math.PI / 2 });
		box(`needle${i}`, 0.012, 0.06, 0.01, 0.3 + dx, 0.67, -0.415, red);
	});
	const lamp = box("lamp", 0.07, 0.07, 0.03, 0.46, 0.45, -0.395, lampOff);
	box("lampB", 0.05, 0.05, 0.03, 0.36, 0.45, -0.395, flat("gen_amber", new Color3(0.9, 0.55, 0.08), 0.8));
	// slot sekering
	box("fuseSlot", 0.12, 0.08, 0.03, 0.14, 0.45, -0.395, metal);
	box("fuseSlotIn", 0.08, 0.05, 0.035, 0.14, 0.45, -0.405, black);
	// tuas
	const leverPivot = box("leverBase", 0.07, 0.07, 0.04, 0.3, 0.32, -0.4, metal);
	const lever = box("lever", 0.03, 0.2, 0.03, 0.3, 0.43, -0.43, red);
	lever.rotation.x = -0.5;
	cyl("leverKnob", 0.06, 0.06, 0.3, 0.53, -0.45, red);

	// Label
	const danger = box("danger", 0.4, 0.15, 0.01, 0.3, 0.22, -0.395, black);
	danger.material = label("gen_label_danger", "DANGER 480V", "#d9b400", "#1a1a1a");
	const fuse = box("fuseLabel", 0.2, 0.07, 0.01, 0.14, 0.53, -0.395, black);
	fuse.material = label("gen_label_fuse", "FUSE", "#1a1a1a", "#e9e4d2");

	// Kabel keluar ke samping
	cyl("cable", 0.05, 0.5, -0.62, 0.3, 0.15, black, { rz: Math.PI / 2 });

	let running = false;
	let t = 0;
	const observer = scene.onBeforeRenderObservable.add(() => {
		if (!running) return;
		t += scene.getEngine().getDeltaTime() / 1000;
		const j = Math.sin(t * 55) * 0.0035;
		bodyMesh.position.y = base + 0.46 + j;
		bodyMesh.position.x = Math.sin(t * 43) * 0.002;
	});

	const gen = {
		parts,
		start() {
			running = true;
			lamp.material = lampOn;
			lever.rotation.x = 0.55;
		},
		dispose() {
			scene.onBeforeRenderObservable.remove(observer);
			parts.forEach((p) => p.dispose());
		},
	};
	anchor.metadata = anchor.metadata || {};
	anchor.metadata.hdGenerator = gen;
	anchor.visibility = 0;
	return gen;
}
