import { Color3, MeshBuilder, StandardMaterial, Vector3, Vector4 } from "@babylonjs/core";
import * as Forge from "./TextureForge.js";
import { WING_ORIGINS } from "./AreaMap.js";
import {
	LAB,
	LAB_SOLIDS,
	LAB_PLATFORM,
	LAB_PYLONS,
	LAB_ITEMS,
	LAB_LAMPS,
} from "./LabLayout.js";

const FLOOR_Y = 2.52;
const TILE = { floor: 2.0, wall: 3.0, ceiling: 2.0, metal: 1.0, wood: 1.0 };

/**
 * EXPERIMENT CHAMBER
 *
 * Ruangan lanjutan cerita setelah pintu putih (restricted gate) terbuka dan monster
 * muncul. Pemain lari masuk lewat pintu di dinding selatan area terlarang.
 *
 *  - Observation Room (x 0..7): konsol, monitor, lemari arsip, papan tulis, meja Hartwell.
 *  - Chamber (x 7..20): panggung mesin dengan kursi, enam tiang, lingkaran ritual,
 *    rak sampel, brankar, meja bedah, kandang, dan mural wajah tersenyum.
 *  - Main Exit Key ada di mimbar dekat mural. Mengambilnya memecahkan lingkaran
 *    dan memicu pelarian terakhir.
 *
 * Semua tata letak ada di LabLayout.js (sudah dicek tabrakannya oleh tools/check_layout.mjs).
 */
export class LabBuilder {
	constructor(wing) {
		this.wing = wing; // WingBuilder (dipakai untuk helper box/door)
		this.scene = wing.scene;
		this.systems = wing.systems;
		this.meshes = [];
		this.counter = 0;
		this.mats = {};
		this.poundTimer = null;
		this.eventsBound = false;
		this.keyTaken = false;
		this.alarmLamp = null;
		this.screens = [];
	}

	get o() {
		return WING_ORIGINS.lab;
	}

	// ---------------------------------------------------------------
	// MATERIAL HD
	// ---------------------------------------------------------------

	buildMaterials() {
		const pool = this.systems.texturePool;
		const scene = this.scene;
		const std = (name, tex, tint, { spec = 0.12, glow = 0.04, bump = true } = {}) => {
			const m = new StandardMaterial(`lab_${name}`, scene);
			m.diffuseTexture = tex.diff || tex;
			if (bump && tex.normal) m.bumpTexture = tex.normal;
			m.diffuseColor = tint;
			m.specularColor = new Color3(spec, spec, spec);
			m.specularPower = 40;
			m.emissiveColor = new Color3(glow, glow, glow);
			m.maxSimultaneousLights = 6;
			return m;
		};
		const flat = (name, color, glow = 0.03, spec = 0.1) => {
			const m = new StandardMaterial(`lab_${name}`, scene);
			m.diffuseColor = color;
			m.emissiveColor = new Color3(color.r * glow, color.g * glow, color.b * glow);
			m.specularColor = new Color3(spec, spec, spec);
			m.maxSimultaneousLights = 6;
			return m;
		};
		const floorTex = pool.pair("lab_floor", 1024, 1024, () => Forge.genTileFloor(1024, 1024, { seed: 21 }), "#555");
		const wallTex = pool.pair("lab_wall", 1024, 1024, () => Forge.genPlaster(1024, 1024, { seed: 12, base: [136, 140, 126], under: [84, 80, 70] }), "#888");
		const ceilTex = pool.pair("lab_ceiling", 512, 512, () => Forge.genCeiling(512, 512, { seed: 31 }), "#777");
		const metalTex = pool.pair("lab_metal", 512, 512, () => Forge.genMetal(512, 512, { seed: 41, rust: 0.4 }), "#666");
		const woodTex = pool.pair("lab_wood", 512, 512, () => Forge.genWood(512, 512, { seed: 51 }), "#5a3a24");
		const muralTex = pool.pair("lab_mural", 2048, 1024, () => Forge.genMural(2048, 1024, { seed: 81 }), "#8a826c");
		const ritual = pool.single("lab_ritual", 1024, 1024, () => Forge.genRitual(1024, { seed: 91 }), { hasAlpha: true });
		const chalk = pool.single("lab_chalk", 1024, 512, () => Forge.genChalkboard(1024, 512, { seed: 111 }), {
			fallback: "#2c3a34",
			post: (ctx, w, h) => this.writeChalk(ctx, w, h),
		});
		const sheet = pool.single("lab_sheet", 512, 512, () => Forge.genSheet(512, 512, { seed: 121 }), { fallback: "#c8c2b0" });
		const screenA = pool.single("lab_screen_a", 256, 256, () => Forge.genScreen(256, 256, { seed: 101 }), { fallback: "#0a2a18" });
		const screenB = pool.single("lab_screen_b", 256, 256, () => Forge.genScreen(256, 256, { seed: 103, tint: [220, 80, 60] }), { fallback: "#2a0a0a" });

		const mural = new StandardMaterial("lab_mural", scene);
		mural.diffuseTexture = muralTex.diff;
		mural.bumpTexture = muralTex.normal;
		mural.emissiveColor = new Color3(0.07, 0.065, 0.055);
		mural.specularColor = new Color3(0.04, 0.04, 0.04);
		mural.maxSimultaneousLights = 6;

		const ritualMat = new StandardMaterial("lab_ritual", scene);
		ritualMat.diffuseTexture = ritual;
		ritualMat.useAlphaFromDiffuseTexture = true;
		ritualMat.emissiveColor = new Color3(0.28, 0.04, 0.03);
		ritualMat.specularColor = Color3.Black();
		ritualMat.zOffset = -2;

		const emissiveScreen = (name, tex) => {
			const m = new StandardMaterial(name, scene);
			m.diffuseTexture = tex;
			m.emissiveTexture = tex;
			m.emissiveColor = new Color3(0.9, 0.9, 0.9);
			m.specularColor = Color3.Black();
			return m;
		};

		const glass = flat("glass", new Color3(0.35, 0.5, 0.55), 0.1, 0.6);
		glass.alpha = 0.22;

		this.M = {
			floor: std("floor", floorTex, new Color3(1, 1, 1), { spec: 0.18, glow: 0.05 }),
			wall: std("wall", wallTex, new Color3(1, 1, 1), { glow: 0.05 }),
			ceiling: std("ceiling", ceilTex, new Color3(0.9, 0.9, 0.9), { glow: 0.04 }),
			metal: std("metal", metalTex, new Color3(0.95, 1, 1), { spec: 0.3, glow: 0.05 }),
			steel: std("steel", metalTex, new Color3(0.6, 0.65, 0.7), { spec: 0.4, glow: 0.04 }),
			green: std("green", metalTex, new Color3(0.55, 0.78, 0.62), { spec: 0.2, glow: 0.05 }),
			wood: std("wood", woodTex, new Color3(1, 1, 1), { glow: 0.05 }),
			darkwood: std("darkwood", woodTex, new Color3(0.55, 0.5, 0.5), { glow: 0.04 }),
			mural,
			ritual: ritualMat,
			chalk: std("chalk", chalk, new Color3(1, 1, 1), { bump: false, glow: 0.12 }),
			sheet: std("sheet", sheet, new Color3(1, 1, 1), { bump: false, glow: 0.06 }),
			screenA: emissiveScreen("lab_screenA", screenA),
			screenB: emissiveScreen("lab_screenB", screenB),
			glass,
			blood: flat("blood", new Color3(0.26, 0.015, 0.015), 0.5),
			black: flat("black", new Color3(0.03, 0.03, 0.035), 0.1, 0.25),
			rubber: flat("rubber", new Color3(0.07, 0.07, 0.07), 0.2, 0.05),
			leather: flat("leather", new Color3(0.2, 0.09, 0.07), 0.15, 0.2),
			paper: flat("paper", new Color3(0.8, 0.78, 0.68), 0.35, 0.02),
			cable: flat("cable", new Color3(0.02, 0.02, 0.02), 0.1, 0.1),
			liquid: (() => {
				const m = new StandardMaterial("lab_liquid", scene);
				m.diffuseColor = new Color3(0.2, 0.7, 0.35);
				m.emissiveColor = new Color3(0.12, 0.5, 0.25);
				m.alpha = 0.78;
				m.specularColor = new Color3(0.6, 0.6, 0.6);
				return m;
			})(),
			glow: (() => {
				const m = new StandardMaterial("lab_glow", scene);
				m.diffuseColor = new Color3(0.2, 1, 0.9);
				m.emissiveColor = new Color3(0.25, 0.95, 0.85);
				m.specularColor = Color3.Black();
				return m;
			})(),
			redglow: (() => {
				const m = new StandardMaterial("lab_redglow", scene);
				m.diffuseColor = new Color3(1, 0.15, 0.1);
				m.emissiveColor = new Color3(0.95, 0.1, 0.06);
				m.specularColor = Color3.Black();
				return m;
			})(),
		};
	}

	// Tulisan kapur di papan tulis.
	writeChalk(ctx, w, h) {
		ctx.fillStyle = "rgba(232,236,228,0.88)";
		ctx.font = "bold 46px 'Courier New', monospace";
		ctx.fillText("SESSION 47", 60, 90);
		ctx.font = "34px 'Courier New', monospace";
		const lines = [
			"SUBJECT 23   - STABLE",
			"APPARATUS    - 100%",
			"IT SMILES BEFORE IT SPEAKS",
			"DO NOT LOOK AT THE MURAL",
			"CIRCLE HOLDS WHILE KEY RESTS",
			"IF THE KEY MOVES - RUN",
		];
		lines.forEach((t, i) => ctx.fillText(t, 60, 160 + i * 52));
		ctx.strokeStyle = "rgba(232,236,228,0.8)";
		ctx.lineWidth = 5;
		ctx.beginPath();
		ctx.arc(w - 150, 150, 70, 0, Math.PI * 2);
		ctx.stroke();
		ctx.beginPath();
		ctx.arc(w - 170, 130, 8, 0, Math.PI * 2);
		ctx.arc(w - 130, 130, 8, 0, Math.PI * 2);
		ctx.fill();
		ctx.beginPath();
		ctx.arc(w - 150, 160, 38, 0.15 * Math.PI, 0.85 * Math.PI);
		ctx.stroke();
	}

	// ---------------------------------------------------------------
	// ALAT BANTU GEOMETRI
	// ---------------------------------------------------------------

	// Kotak dengan UV yang mengikuti ukuran dunia (tekstur tidak melar).
	tbox(name, cx, cy, cz, w, h, d, material, { collide = true, tile = 2.0, decor = false, pickable = true } = {}) {
		const o = this.o;
		const uv = (a, b) => new Vector4(0, 0, Math.max(0.05, a / tile), Math.max(0.05, b / tile));
		const mesh = MeshBuilder.CreateBox(
			`lab_${name}_${this.counter++}`,
			{ width: w, height: h, depth: d, faceUV: [uv(w, h), uv(w, h), uv(d, h), uv(d, h), uv(w, d), uv(w, d)] },
			this.scene
		);
		mesh.position.set(o.x + cx, FLOOR_Y + cy, o.z + cz);
		mesh.material = material;
		mesh.checkCollisions = collide;
		mesh.isPickable = collide && pickable;
		if (decor) mesh.metadata = { isDecor: true };
		mesh.computeWorldMatrix(true);
		mesh.refreshBoundingInfo();
		this.meshes.push(mesh);
		return mesh;
	}

	// Detail tanpa tabrakan.
	deco(name, cx, cy, cz, w, h, d, material, tile = 1.0) {
		return this.tbox(name, cx, cy, cz, w, h, d, material, { collide: false, tile, pickable: false, decor: true });
	}

	cylinder(name, cx, cy, cz, dia, h, material, { collide = false, tess = 24, rotX = 0, rotZ = 0 } = {}) {
		const o = this.o;
		const m = MeshBuilder.CreateCylinder(`lab_${name}_${this.counter++}`, { diameter: dia, height: h, tessellation: tess }, this.scene);
		m.position.set(o.x + cx, FLOOR_Y + cy, o.z + cz);
		m.rotation.x = rotX;
		m.rotation.z = rotZ;
		m.material = material;
		m.checkCollisions = collide;
		m.isPickable = collide;
		m.metadata = { isDecor: true };
		m.computeWorldMatrix(true);
		m.refreshBoundingInfo();
		this.meshes.push(m);
		return m;
	}

	plane(name, cx, cy, cz, w, h, material, { rotX = 0, rotY = 0 } = {}) {
		const o = this.o;
		const m = MeshBuilder.CreatePlane(`lab_${name}_${this.counter++}`, { width: w, height: h, sideOrientation: 2 }, this.scene);
		m.position.set(o.x + cx, FLOOR_Y + cy, o.z + cz);
		m.rotation.x = rotX;
		m.rotation.y = rotY;
		m.material = material;
		m.checkCollisions = false;
		m.isPickable = false;
		m.metadata = { isDecor: true };
		this.meshes.push(m);
		return m;
	}

	// ---------------------------------------------------------------
	// CANGKANG RUANGAN
	// ---------------------------------------------------------------

	buildShell() {
		const M = this.M, L = LAB, t = L.wallT, H = L.h, D = L.divider;
		// lantai dan plafon
		this.tbox("floor", L.w / 2, -0.25, L.d / 2, L.w + 2, 0.5, L.d + 2, M.floor, { tile: TILE.floor });
		this.tbox("ceiling", L.w / 2, H + 0.25, L.d / 2, L.w + 2, 0.5, L.d + 2, M.ceiling, { tile: TILE.ceiling, decor: false });
		// dinding luar
		this.tbox("wallN", L.w / 2, H / 2, 0, L.w + t, H, t, M.wall, { tile: TILE.wall });
		this.tbox("wallS", L.w / 2, H / 2, L.d, L.w + t, H, t, M.wall, { tile: TILE.wall });
		this.tbox("wallW", 0, H / 2, L.d / 2, t, H, L.d, M.wall, { tile: TILE.wall });
		this.tbox("wallE", L.w, H / 2, L.d / 2, t, H, L.d, M.wall, { tile: TILE.wall });
		// pembatas x = 7 dengan celah pintu dan dua jendela kaca
		const cuts = [{ r: D.doorway, kind: "door" }, ...D.windows.map((r) => ({ r, kind: "window" }))].sort((a, b) => a.r[0] - b.r[0]);
		let cursor = 0;
		const solid = (a, b) => b - a > 0.01 && this.tbox("div", D.x, H / 2, (a + b) / 2, t, H, b - a, M.wall, { tile: TILE.wall });
		cuts.forEach(({ r, kind }) => {
			solid(cursor, r[0]);
			const len = r[1] - r[0], mid = (r[0] + r[1]) / 2;
			if (kind === "door") {
				this.tbox("lintel", D.x, (D.top + 0.4 + H) / 2, mid, t, H - D.top - 0.4, len, M.wall, { tile: TILE.wall });
				// bingkai celah
				this.deco("jambA", D.x, 1.3, r[0] - 0.05, 0.3, 2.6, 0.1, M.steel);
				this.deco("jambB", D.x, 1.3, r[1] + 0.05, 0.3, 2.6, 0.1, M.steel);
			} else {
				this.tbox("sill", D.x, D.sill / 2, mid, t, D.sill, len, M.wall, { tile: TILE.wall });
				this.tbox("top", D.x, (D.top + H) / 2, mid, t, H - D.top, len, M.wall, { tile: TILE.wall });
				// kaca (tabrakan aktif agar tidak bisa ditembus)
				const g = this.tbox("glass", D.x, (D.sill + D.top) / 2, mid, 0.05, D.top - D.sill, len, M.glass, { tile: 2 });
				g.visibility = 1;
				this.deco("mullion", D.x, (D.sill + D.top) / 2, mid, 0.12, D.top - D.sill, 0.1, M.steel);
				this.deco("frameB", D.x, D.sill + 0.03, mid, 0.14, 0.06, len, M.steel);
				this.deco("frameT", D.x, D.top - 0.03, mid, 0.14, 0.06, len, M.steel);
			}
			cursor = r[1];
		});
		solid(cursor, L.d);
		// balok langit-langit dan lampu neon (tanpa tabrakan)
		[3.0, 11.0].forEach((z) => {
			this.deco("fixtureO", 3.0, H - 0.08, z, 1.6, 0.08, 0.35, M.metal);
			this.deco("tubeO", 3.0, H - 0.14, z, 1.4, 0.05, 0.2, M.paper);
		});
		[2.5, 7, 11.5].forEach((z) => {
			this.deco("beam", 13.5, H - 0.2, z, 12.6, 0.3, 0.3, M.steel);
		});
		// pipa ber-karat sepanjang plafon chamber
		[1.2, 12.8].forEach((z) => this.cylinder("pipe", 13.5, H - 0.5, z, 0.22, 12.6, M.metal, { rotZ: Math.PI / 2, tess: 12 }));
	}

	// ---------------------------------------------------------------
	// PROPERTI OBSERVATION ROOM
	// ---------------------------------------------------------------

	buildProp(s) {
		const M = this.M;
		const { cx, cz, w, d, h } = s;
		// arah hadap perabot: menjauhi dinding terdekat
		const nearW = Math.min(cx, LAB.w - cx), nearZ = Math.min(cz, LAB.d - cz);
		let fx = 0, fz = 0;
		if (nearZ <= nearW) fz = cz < LAB.d / 2 ? 1 : -1;
		else fx = cx < LAB.w / 2 ? 1 : -1;
		if (s.type === "console") { fx = -1; fz = 0; }
		if (s.type === "gurney" || s.type === "dissect" || s.type === "cart" || s.type === "cages") { fx = 0; fz = -1; }

		switch (s.type) {
			case "cabinet": {
				this.tbox(s.id, cx, h / 2, cz, w, h, d, M.green, { tile: TILE.metal });
				for (let i = 0; i < 4; i++) {
					const y = 0.35 + i * 0.4;
					this.deco(`${s.id}_dr`, cx + fx * (d / 2 + 0.01), y, cz + fz * (d / 2 + 0.01), fx ? 0.02 : w * 0.86, 0.015, fx ? d * 0.86 : 0.02, M.black);
					this.deco(`${s.id}_h`, cx + fx * (d / 2 + 0.03), y + 0.08, cz + fz * (d / 2 + 0.03), fx ? 0.04 : 0.2, 0.03, fx ? 0.2 : 0.04, M.steel);
				}
				if (s.id === "cab2") this.deco("drawerOpen", cx, 1.2, cz + 0.45, 0.5, 0.18, 0.55, M.metal);
				break;
			}
			case "console": {
				this.tbox(s.id, cx, h / 2, cz, w, h, d, M.steel, { tile: TILE.metal });
				this.deco(`${s.id}_top`, cx - 0.1, h + 0.02, cz, w * 0.8, 0.04, d * 0.96, M.black);
				for (let i = -1; i <= 1; i++) {
					const z = cz + i * 0.95;
					this.deco(`${s.id}_mon`, cx - 0.05, h + 0.3, z, 0.12, 0.42, 0.62, M.black);
					const scr = this.plane(`${s.id}_scr`, cx - 0.12, h + 0.3, z, 0.54, 0.36, i === 0 && s.id === "consoleB" ? M.screenB : M.screenA, { rotY: Math.PI / 2 });
					this.screens.push(scr);
					this.deco(`${s.id}_stand`, cx - 0.02, h + 0.08, z, 0.14, 0.1, 0.2, M.black);
					for (let k = 0; k < 5; k++) this.deco(`${s.id}_btn`, cx - 0.3, h + 0.045, z + (k - 2) * 0.1, 0.07, 0.02, 0.07, k % 2 ? M.redglow : M.glow);
				}
				break;
			}
			case "chair": {
				this.cylinder(s.id, cx, 0.45, cz, 0.08, 0.5, M.black, { tess: 10 });
				this.tbox(`${s.id}_seat`, cx, 0.52, cz, 0.5, 0.1, 0.5, M.leather, { collide: true, tile: 1 });
				this.deco(`${s.id}_back`, cx - 0.22, 0.85, cz, 0.08, 0.5, 0.45, M.leather);
				this.cylinder(`${s.id}_base`, cx, 0.06, cz, 0.55, 0.05, M.black, { tess: 12 });
				break;
			}
			case "bookshelf": {
				this.tbox(s.id, cx, h / 2, cz, w, h, d, M.darkwood, { tile: TILE.wood });
				for (let r = 0; r < 4; r++) {
					const y = 0.35 + r * 0.45;
					this.deco(`${s.id}_plank`, cx, y, cz + fz * 0.01, w - 0.06, 0.04, d - 0.04, M.wood);
					let x = cx - w / 2 + 0.12;
					while (x < cx + w / 2 - 0.15) {
						const bw = 0.05 + ((x * 37) % 5) * 0.012, bh = 0.26 + ((x * 91) % 4) * 0.035;
						this.deco(`${s.id}_book`, x, y + 0.02 + bh / 2, cz + fz * 0.03, bw, bh, d * 0.7, r % 2 ? M.leather : M.black);
						x += bw + 0.012;
					}
				}
				break;
			}
			case "wheelchair": {
				this.tbox(s.id, cx, 0.5, cz, w * 0.8, 0.1, d * 0.8, M.leather, { tile: 1 });
				this.deco(`${s.id}_back`, cx, 0.85, cz - d * 0.4, w * 0.8, 0.7, 0.06, M.leather);
				[-1, 1].forEach((sx) => {
					this.cylinder(`${s.id}_wheel`, cx + sx * (w / 2), 0.32, cz - 0.1, 0.62, 0.05, M.black, { rotZ: Math.PI / 2, tess: 20 });
					this.cylinder(`${s.id}_cast`, cx + sx * (w / 2 - 0.1), 0.1, cz + 0.32, 0.2, 0.04, M.black, { rotZ: Math.PI / 2, tess: 12 });
				});
				break;
			}
			case "bin":
				this.cylinder(s.id, cx, h / 2, cz, w, h, M.steel, { collide: true, tess: 14 });
				this.deco(`${s.id}_paper`, cx, h + 0.04, cz, 0.28, 0.1, 0.25, M.paper);
				break;
			case "coatrack": {
				this.cylinder(s.id, cx, h / 2, cz, 0.09, h, M.black, { collide: true, tess: 8 });
				this.cylinder(`${s.id}_base`, cx, 0.03, cz, 0.45, 0.05, M.black, { tess: 12 });
				this.deco(`${s.id}_coat`, cx, 1.3, cz + 0.12, 0.38, 0.8, 0.1, M.black);
				this.deco(`${s.id}_coat2`, cx + 0.06, 1.2, cz - 0.14, 0.34, 0.9, 0.08, M.sheet);
				break;
			}
			case "opchair": {
				this.tbox(s.id, cx, 0.55, cz, w, 0.12, d * 0.75, M.leather, { tile: 1 });
				this.deco(`${s.id}_back`, cx - 0.35, 1.05, cz, 0.12, 0.95, d * 0.7, M.leather);
				this.deco(`${s.id}_pedestal`, cx, 0.28, cz, 0.3, 0.55, 0.3, M.steel);
				[-1, 1].forEach((sz) => {
					this.deco(`${s.id}_arm`, cx + 0.05, 0.78, cz + sz * (d / 2 - 0.03), 0.6, 0.06, 0.1, M.steel);
					this.deco(`${s.id}_strap`, cx + 0.05, 0.84, cz + sz * (d / 2 - 0.2), 0.1, 0.02, 0.28, M.black);
					this.deco(`${s.id}_strapL`, cx + 0.5, 0.2, cz + sz * 0.22, 0.1, 0.03, 0.3, M.black);
				});
				this.deco(`${s.id}_head`, cx - 0.42, 1.55, cz, 0.15, 0.28, 0.36, M.steel);
				break;
			}
			case "jarshelf": {
				this.tbox(s.id, cx, h / 2, cz, w, h, d, M.steel, { tile: TILE.metal });
				for (let r = 0; r < 4; r++) {
					const y = 0.4 + r * 0.48;
					this.deco(`${s.id}_plank`, cx, y, cz + 0.02, w - 0.06, 0.03, d - 0.05, M.metal);
					for (let k = 0; k < 6; k++) {
						const x = cx - w / 2 + 0.25 + k * ((w - 0.5) / 5);
						const jar = this.cylinder(`${s.id}_jar`, x, y + 0.2, cz + 0.06, 0.2, 0.34, M.liquid, { tess: 14 });
						jar.isPickable = false;
						this.cylinder(`${s.id}_cap`, x, y + 0.38, cz + 0.06, 0.21, 0.04, M.black, { tess: 14 });
					}
				}
				break;
			}
			case "transformer": {
				this.tbox(s.id, cx, h / 2, cz, w, h, d, M.steel, { tile: TILE.metal });
				for (let i = 0; i < 6; i++) this.deco(`${s.id}_vent`, cx - 0.7 + i * 0.28, 1.6, cz + d / 2 + 0.01, 0.2, 0.03, 0.02, M.black);
				this.deco(`${s.id}_lamp`, cx + 0.7, 1.9, cz + d / 2 + 0.03, 0.12, 0.12, 0.05, M.redglow);
				this.deco(`${s.id}_lamp2`, cx + 0.45, 1.9, cz + d / 2 + 0.03, 0.12, 0.12, 0.05, M.glow);
				this.cylinder(`${s.id}_coil`, cx - 0.5, 2.3, cz, 0.3, 0.25, M.rust || M.metal, { tess: 10 });
				break;
			}
			case "gurney": {
				this.tbox(s.id, cx, 0.8, cz, w, 0.12, d, M.steel, { tile: TILE.metal });
				[-0.8, 0.8].forEach((x) => [-0.28, 0.28].forEach((z) => this.cylinder(`${s.id}_leg`, cx + x, 0.4, cz + z, 0.06, 0.78, M.metal, { tess: 8 })));
				// tubuh tertutup kain
				this.deco(`${s.id}_body`, cx, 0.98, cz, w * 0.88, 0.2, d * 0.7, M.sheet);
				this.deco(`${s.id}_head`, cx - w * 0.38, 1.12, cz, 0.3, 0.16, 0.3, M.sheet);
				this.deco(`${s.id}_stain`, cx + 0.2, 1.085, cz, 0.5, 0.01, 0.4, M.blood);
				break;
			}
			case "dissect": {
				this.tbox(s.id, cx, 0.9, cz, w, 0.1, d, M.steel, { tile: TILE.metal });
				this.deco(`${s.id}_base`, cx, 0.45, cz, w * 0.85, 0.9, d * 0.8, M.metal);
				this.deco(`${s.id}_gutter`, cx, 0.96, cz, w * 0.9, 0.02, 0.05, M.blood);
				// instrumen
				for (let i = 0; i < 5; i++) this.deco(`${s.id}_tool`, cx - 0.7 + i * 0.28, 0.97, cz + 0.28, 0.2, 0.015, 0.03, M.metal);
				this.deco(`${s.id}_lamp`, cx, 1.9, cz, 0.6, 0.06, 0.6, M.steel);
				this.deco(`${s.id}_lampB`, cx, 1.8, cz, 0.45, 0.1, 0.45, M.glow);
				this.deco(`${s.id}_arm`, cx, 2.5, cz, 0.05, 1.2, 0.05, M.metal);
				break;
			}
			case "cart": {
				this.tbox(s.id, cx, 0.78, cz, w, 0.04, d, M.steel, { tile: TILE.metal });
				this.deco(`${s.id}_low`, cx, 0.3, cz, w, 0.04, d, M.steel);
				[-1, 1].forEach((x) => [-1, 1].forEach((z) => this.cylinder(`${s.id}_p`, cx + x * (w / 2 - 0.03), 0.4, cz + z * (d / 2 - 0.03), 0.035, 0.8, M.metal, { tess: 8 })));
				this.deco(`${s.id}_syr`, cx - 0.1, 0.82, cz, 0.2, 0.025, 0.03, M.glass);
				this.deco(`${s.id}_tray`, cx + 0.12, 0.82, cz, 0.28, 0.02, 0.4, M.metal);
				break;
			}
			case "cages": {
				this.tbox(s.id, cx, 0.1, cz, w, 0.2, d, M.steel, { tile: TILE.metal });
				// kerangka kandang dengan jeruji
				for (let i = 0; i <= 8; i++) {
					const x = cx - w / 2 + 0.05 + i * ((w - 0.1) / 8);
					this.cylinder(`${s.id}_bar`, x, 1.05, cz + d / 2 - 0.05, 0.04, 1.8, M.metal, { tess: 6 });
				}
				this.deco(`${s.id}_top`, cx, 1.95, cz, w, 0.06, d, M.steel);
				[-1, 0, 1].forEach((i) => this.deco(`${s.id}_div`, cx + i * (w / 3), 1.0, cz, 0.05, 1.7, d - 0.1, M.metal));
				this.deco(`${s.id}_cot`, cx - w / 3, 0.35, cz - 0.1, 0.9, 0.12, 0.7, M.sheet);
				this.deco(`${s.id}_cot2`, cx + w / 3, 0.35, cz - 0.1, 0.9, 0.12, 0.7, M.black);
				// kandang tengah rusak: jeruji bengkok dan noda
				this.deco(`${s.id}_stain`, cx, 0.215, cz + 0.2, 0.9, 0.01, 0.6, M.blood);
				break;
			}
			default:
				this.tbox(s.id, cx, h / 2, cz, w, h, d, M.metal);
		}
	}

	// ---------------------------------------------------------------
	// MESIN CHAMBER
	// ---------------------------------------------------------------

	buildApparatus() {
		const M = this.M, P = LAB_PLATFORM;
		// panggung bundar (tanpa tabrakan, setinggi 0.18 m)
		this.cylinder("platform", P.cx, P.h / 2, P.cz, P.r * 2, P.h, M.steel, { tess: 40 });
		this.cylinder("platformRim", P.cx, P.h + 0.01, P.cz, P.r * 2 - 0.2, 0.02, M.black, { tess: 40 });
		// lingkaran ritual di lantai (decal alpha)
		this.plane("ritual", P.cx, 0.012, P.cz, 9.2, 9.2, M.ritual, { rotX: Math.PI / 2 });
		// enam tiang berpendar
		LAB_PYLONS.forEach((p) => {
			this.cylinder(p.id, p.cx, p.h / 2, p.cz, p.r * 2, p.h, M.metal, { collide: true, tess: 20 });
			this.cylinder(`${p.id}_base`, p.cx, 0.1, p.cz, p.r * 2 + 0.25, 0.2, M.steel, { tess: 20 });
			[0.9, 1.7, 2.5].forEach((y, i) => {
				const ring = this.cylinder(`${p.id}_ring`, p.cx, y, p.cz, p.r * 2 + 0.1, 0.07, i === 1 ? M.redglow : M.glow, { tess: 20 });
				ring.isPickable = false;
			});
			this.cylinder(`${p.id}_cap`, p.cx, p.h, p.cz, p.r * 2 + 0.2, 0.15, M.steel, { tess: 20 });
			// kabel dari tiang ke trafo
			this.cableTo(p.cx, p.cz);
		});
		// cincin cermin di atas kursi
		this.cylinder("mirrorRing", P.cx, 3.35, P.cz, 3.2, 0.08, M.steel, { tess: 32 });
		this.cylinder("mirrorCone", P.cx, 3.8, P.cz, 0.5, 0.7, M.steel, { tess: 16 });
		this.cylinder("mirrorLens", P.cx, 3.42, P.cz, 1.0, 0.05, M.glow, { tess: 24 });
		for (let i = 0; i < 8; i++) {
			const a = (i / 8) * Math.PI * 2;
			this.deco("mirrorPanel", P.cx + Math.cos(a) * 1.5, 3.15, P.cz + Math.sin(a) * 1.5, 0.35, 0.35, 0.04, M.glass);
		}
	}

	// kabel tipis di lantai menuju trafo di dinding utara
	cableTo(x, z) {
		const M = this.M;
		const tx = 16.0, tz = 1.2;
		const dz = tz - z;
		if (Math.abs(dz) > 0.2) this.deco("cableZ", x, 0.03, z + dz / 2, 0.06, 0.05, Math.abs(dz), M.cable);
		const dx = tx - x;
		if (Math.abs(dx) > 0.2) this.deco("cableX", x + dx / 2, 0.03, tz, Math.abs(dx), 0.05, 0.06, M.cable);
	}

	// ---------------------------------------------------------------
	// DEKORASI: MURAL, PAPAN TULIS, NODA, KERTAS
	// ---------------------------------------------------------------

	buildDecor() {
		const M = this.M, L = LAB;
		// mural wajah tersenyum di dinding timur (2:1)
		this.plane("mural", L.w - 0.12, 2.15, 7.0, 9.0, 4.0, M.mural, { rotY: Math.PI / 2 });
		// papan tulis di dinding utara Observation Room
		this.plane("chalk", 4.9, 1.7, 0.13, 2.7, 1.35, M.chalk, { rotY: Math.PI });
		this.deco("chalkFrame", 4.9, 0.95, 0.15, 2.8, 0.06, 0.06, M.darkwood);
		// karpet dan noda darah
		this.deco("rug", 3.3, 0.012, 7.0, 3.0, 0.02, 2.0, M.leather);
		const stains = [
			[10.2, 7.6, 1.8, 1.2], [14.5, 4.2, 1.4, 1.0], [8.4, 11.0, 1.2, 1.6], [2.2, 8.2, 0.9, 0.7],
			[17.2, 8.7, 1.5, 1.1], [12.0, 9.6, 0.9, 0.8], [4.4, 5.0, 0.6, 0.6],
		];
		stains.forEach(([x, z, w, d]) => this.deco("stain", x, 0.014, z, w, 0.01, d, M.blood));
		// jejak seret menuju kandang
		for (let i = 0; i < 9; i++) this.deco("drag", 16.8 - i * 0.55, 0.015, 11.6 + Math.sin(i) * 0.15, 0.5, 0.01, 0.22, M.blood);
		// kertas berserakan
		const papers = [[3.4, 6.2], [4.1, 8.6], [5.2, 7.4], [9.1, 6.6], [10.4, 9.3], [8.0, 4.4], [15.0, 10.6], [18.2, 4.8], [11.4, 2.3]];
		papers.forEach(([x, z], i) => {
			const p = this.deco("paper", x, 0.016, z, 0.28, 0.006, 0.2, M.paper);
			p.rotation.y = i * 0.9;
		});
		// peti kayu dan tabung gas di sudut
		this.tbox("crateA", 19.2, 0.4, 2.5, 0.8, 0.8, 0.8, M.wood, { tile: TILE.wood });
		this.tbox("crateB", 19.2, 0.3, 3.45, 0.6, 0.6, 0.6, M.darkwood, { tile: TILE.wood });
		this.cylinder("tank1", 8.0, 0.65, 2.8, 0.3, 1.3, M.green, { collide: true, tess: 14 });
		this.cylinder("tank2", 8.4, 0.65, 3.4, 0.3, 1.3, M.metal, { collide: true, tess: 14 });
		this.cylinder("tankN", 8.0, 1.35, 2.8, 0.22, 0.1, M.black, { tess: 10 });
		// sisi mimbar kunci: kain merah di meja (dekor tanpa tabrakan)
		this.deco("clothKey", 18.9, 0.805, 7.0, 0.7, 0.01, 1.2, M.leather);
		// tanda peringatan di dinding
		const sign = this.deco("warning", 10.0, 2.0, 13.88, 0.9, 0.5, 0.03, M.redglow);
		sign.material = this.M.redglow;
	}

	// ---------------------------------------------------------------
	// BANGUN SEMUANYA
	// ---------------------------------------------------------------

	build() {
		this.buildMaterials();
		this.buildShell();
		LAB_SOLIDS.forEach((s) => this.buildProp(s));
		this.buildApparatus();
		this.buildDecor();
		this.buildLamps();
		this.buildInteractables();
		this.buildDoors();
		this.bindEvents();

		this.meshes.forEach((m) => {
			m.computeWorldMatrix(true);
			if (m.geometry) m.refreshBoundingInfo();
			// Semua perabot diam: kunci matrix supaya hemat CPU (ruangan ini punya banyak mesh).
			m.freezeWorldMatrix();
		});
		this.wing.meshes.push(...this.meshes);
		this.meshes = [];
	}

	buildLamps() {
		const env = this.systems.environmentManager;
		const o = this.o;
		LAB_LAMPS.forEach(([name, x, z, y, intensity, range, c]) => {
			const l = env.createAreaLamp("lab", `lab_${name}`, new Vector3(o.x + x, FLOOR_Y + y, o.z + z), intensity, range, new Color3(...c));
			this.wing.lights.push(l);
			if (name === "apparatus") this.apparatusLamp = l;
			if (name === "chamberE") this.alarmLamp = l;
		});
	}

	buildInteractables() {
		const o = this.o;
		const docs = {
			doc_hartwell_rec: {
				title: "Hartwell - Last Recording (Transcript)",
				content:
					"Session 47 was the last. I finally understand: it never needed the apparatus. We built it a mouth, and it learned to smile. The patients were not taken, they were fed to it. I have sealed this chamber and painted the circle with my own hands. As long as the key to the main door rests on the pedestal, the circle holds and it cannot cross. If you are reading this, you want out. Lift the key and the circle breaks. Do not look back.",
			},
			doc_subject23: {
				title: "Subject 23 - Final Session Log",
				content:
					"09:14 Subject restrained. Apparatus at 80%. 09:31 Subject stopped screaming and began to smile. 09:32 Subject said, in a voice that was not his: 'Thank you for the door.' 09:33 Every monitor in the observation room went to static. 09:40 Subject no longer in the chair. The straps are still buckled. Something is standing in the corridor outside, and it is taller than the door.",
			},
			doc_marta_last: {
				title: "Nurse Marta - Last Page",
				content:
					"Bed 14 never spoke again, but this morning he drew a picture of me with a long, wide smile. Dr. Hartwell locked himself in the chamber and told us to leave the lamps on. He says it hates the dark less than it hates the light. I am taking the stairs to the front door. If you find this page, I did not make it. Run toward the way out, and never stop to look at what follows you.",
			},
		};
		const items = LAB_ITEMS.map((it) => {
			const position = new Vector3(o.x + it.x, FLOOR_Y, o.z + it.z);
			if (it.kind === "battery") return { type: "battery", position, data: { amount: 30 } };
			if (it.kind === "key") {
				return {
					type: "key",
					snapToFloor: true,
					position,
					deskAxis: it.deskAxis,
					data: { id: it.id, name: "Main Exit Key", spin: true },
				};
			}
			return { type: "note", snapToFloor: true, position, deskAxis: it.deskAxis, data: { id: it.id, ...docs[it.id] } };
		});
		this.wing.sm.createInteractables(items);

		this.wing.sm.setupTriggers([
			{
				position: new Vector3(o.x + 12.0, FLOOR_Y, o.z + 7.0),
				radius: 2.6,
				event: "wing_scare",
				data: {
					intensity: 2,
					silhouette: { x: o.x + 18.2, z: o.z + 8.6 },
					message: "The mural is watching. The machine is warm.",
				},
			},
		]);
	}

	buildDoors() {
		const o = this.o;
		this.wing.createDoor({
			id: "back_lab",
			x: o.x + LAB.backDoor.x,
			z: o.z + LAB.backDoor.z,
			axis: "x",
			label: "HALL",
			portal: {
				x: 10.2,
				z: -5.1,
				yaw: -Math.PI / 2,
				areaLabel: null,
				allowDuringChase: true,
				message: "RUN.",
			},
		});
	}

	// ---------------------------------------------------------------
	// EVENT CERITA
	// ---------------------------------------------------------------

	bindEvents() {
		if (this.eventsBound) return;
		this.eventsBound = true;
		const events = this.systems.eventSystem;

		// Masuk lab: pintu terbanting, monster menggedor dari luar.
		events.on("portal_used", (data) => {
			if (data.id === "door_lab") this.onEnter();
			if (data.id === "back_lab") this.stopPounding();
		});

		// Mengambil kunci keluar: lingkaran pecah.
		events.on("key_collected", (data) => {
			if (data && data.id === "exit_key") this.onKeyTaken();
		});
	}

	onEnter() {
		this.stopPounding();
		const audio = this.systems.audioManager;
		const ui = this.systems.interactionManager;
		setTimeout(() => {
			audio.playSound("door_slam", { volume: 0.9 });
			ui?.showMessage("The door slams behind you. Something hammers on it from outside.", 4200);
		}, 700);
		if (this.keyTaken) return;
		this.poundTimer = setInterval(() => {
			audio.playSound("door_slam", { volume: 0.28 + Math.random() * 0.2 });
		}, 6500);
	}

	stopPounding() {
		if (this.poundTimer) clearInterval(this.poundTimer);
		this.poundTimer = null;
	}

	onKeyTaken() {
		if (this.keyTaken) return;
		this.keyTaken = true;
		this.stopPounding();
		const env = this.systems.environmentManager;
		env?.flickerLights?.();
		this.systems.audioManager.playSound("static", { volume: 0.7 });
		if (this.apparatusLamp) {
			this.apparatusLamp.diffuse = new Color3(1, 0.15, 0.1);
		}
		if (this.alarmLamp) this.alarmLamp.diffuse = new Color3(1, 0.1, 0.05);
		setTimeout(() => {
			this.systems.audioManager.playSound("heartbeat", { volume: 0.9 });
			this.systems.interactionManager?.showMessage("The circle breaks. The pounding stops. It is waiting outside.", 5000);
		}, 900);
	}

	dispose() {
		this.stopPounding();
		this.meshes.forEach((m) => m && !m.isDisposed() && m.dispose());
		this.meshes = [];
		this.screens = [];
	}
}
