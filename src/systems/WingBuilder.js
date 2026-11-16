import {
	Color3,
	MeshBuilder,
	StandardMaterial,
	Vector3,
} from "@babylonjs/core";
import { WING_ORIGINS as ORIGINS } from "./AreaMap.js";
import { attachHDDoor } from "./DoorFactory.js";
import { LabBuilder } from "./LabBuilder.js";
import { LAB } from "./LabLayout.js";

const LAB_ARRIVE = LAB.arrive;

/**
 * WING TAMBAHAN
 *
 * Model corridor_baru.glb hanyalah satu ruang besar; pintu-pintu di dindingnya
 * cuma gambar tanpa ruangan di belakangnya. Supaya game lebih panjang, file ini
 * membangun tiga ruangan baru (dibuat dari kode) di tempat yang jauh dari koridor
 * utama, lalu menyambungkannya lewat pintu yang benar-benar bisa dibuka.
 *
 * Alur permainan setelah ada wing ini:
 *   ward_key -> ward_gate -> Infirmary (bebas) -> cell_key
 *   -> Cell Block -> boiler_key + fuse -> Boiler Room -> generator (butuh fuse)
 *   -> listrik hidup -> restricted_gate (butuh restricted_key + listrik)
 *   -> exit_key (monster muncul) -> pintu keluar di ujung barat koridor.
 *
 * Semua angka tata letak ada di bagian atas file ini. Koordinat wing memakai
 * "origin" (titik pojok barat laut wing) ditambah koordinat lokal x/z.
 */

const FLOOR_Y = 2.52; // sama dengan lantai koridor utama
const WING_HEIGHT = 3.2; // tinggi plafon wing dari lantai
const CEILING_Y = FLOOR_Y + WING_HEIGHT;
const WALL_T = 0.2;

// Pintu-pintu di koridor utama. Posisi diambil dari denah model corridor_baru.glb.
// "arrive" = tempat pemain muncul saat kembali dari wing (menghadap menjauhi pintu).
export const HULL_DOORS = {
	exit: { x: -3.82, z: -5.13 },
	infirmary: {
		x: -1.81,
		z: 1.95,
		arrive: { x: -0.45, z: 1.95, yaw: Math.PI / 2 },
	},
	cellblock: {
		x: 2.35,
		z: -1.6,
		arrive: { x: 3.8, z: -1.6, yaw: Math.PI / 2 },
	},
	boiler: {
		x: 10.4,
		z: 2.6,
		arrive: { x: 9.3, z: 2.3, yaw: -Math.PI / 2 },
	},
};

// Pintu ke Experiment Chamber: di dinding selatan area terlarang (di balik pintu putih / restricted gate).
// "arrive" = tempat pemain muncul di hall saat keluar dari lab (menghadap barat, ke arah pintu keluar).
HULL_DOORS.lab = { x: 10.2, z: -6.62, arrive: { x: 10.2, z: -5.1, yaw: -Math.PI / 2 } };

// Pojok barat laut tiap wing. Jauh dari koridor utama (x maksimal sekitar 16).
export const WING_ORIGINS = ORIGINS;

// Pengali cahaya emissive material wing. Dulu 1.0 (terlalu terang); lampu kini diatur EnvironmentManager.
const WING_GLOW = 0.3;

export class WingBuilder {
	constructor(scene, systems) {
		this.scene = scene;
		this.systems = systems;
		this.sm = null;
		this.meshes = [];
		this.lights = [];
		this.counter = 0;
		this.mats = {};
		this.eventsBound = false;
		this.silhouetteTimeout = null;
		this.silhouette = null;
	}

	// ---------------------------------------------------------------
	// ALAT BANTU
	// ---------------------------------------------------------------

	mat(key, color, glow = 0.1) {
		if (this.mats[key] && !this.mats[key].isDisposed?.()) return this.mats[key];
		const m = new StandardMaterial(`wing_mat_${key}`, this.scene);
		m.diffuseColor = color;
		const g = key === "blood" || key === "shadow" ? glow : glow * WING_GLOW;
		m.emissiveColor = new Color3(color.r * g, color.g * g, color.b * g);
		m.specularColor = new Color3(0.04, 0.04, 0.04);
		// Lampu koridor utama tidak boleh menghabiskan jatah lampu di wing.
		m.maxSimultaneousLights = 6;
		this.mats[key] = m;
		return m;
	}

	materials() {
		this.mats = {};
		return {
			floor: this.mat("floor", new Color3(0.2, 0.19, 0.18), 0.12),
			ceiling: this.mat("ceiling", new Color3(0.16, 0.16, 0.15), 0.08),
			wall: this.mat("wall", new Color3(0.36, 0.4, 0.37), 0.14),
			wallDark: this.mat("wallDark", new Color3(0.26, 0.28, 0.27), 0.12),
			bed: this.mat("bed", new Color3(0.42, 0.42, 0.4), 0.12),
			metal: this.mat("metal", new Color3(0.3, 0.32, 0.34), 0.1),
			rust: this.mat("rust", new Color3(0.42, 0.22, 0.12), 0.18),
			wood: this.mat("wood", new Color3(0.2, 0.12, 0.08), 0.15),
			blood: this.mat("blood", new Color3(0.28, 0.02, 0.02), 0.5),
			shadow: this.mat("shadow", new Color3(0.01, 0.01, 0.01), 0),
		};
	}

	box(name, cx, cy, cz, w, h, d, material, opts = {}) {
		const { collide = true, decor = false, pickable = true } = opts;
		const mesh = MeshBuilder.CreateBox(
			`wing_${name}_${this.counter++}`,
			{ width: w, height: h, depth: d },
			this.scene
		);
		mesh.position.set(cx, cy, cz);
		mesh.material = material;
		mesh.checkCollisions = collide;
		mesh.isPickable = pickable;
		if (decor) mesh.metadata = { isDecor: true };
		// Matrix dihitung sekarang supaya raycast lantai (findFloorY) langsung bisa mengenai mesh ini.
		mesh.computeWorldMatrix(true);
		mesh.refreshBoundingInfo();
		this.meshes.push(mesh);
		return mesh;
	}

	// Dinding lurus (sejajar sumbu x atau z). Dipakai juga untuk dinding berlubang.
	wall(o, x0, z0, x1, z1, material) {
		const h = WING_HEIGHT;
		const cy = FLOOR_Y + h / 2;
		if (Math.abs(z0 - z1) < 1e-6) {
			const len = Math.abs(x1 - x0) + WALL_T;
			this.box("wall", o.x + (x0 + x1) / 2, cy, o.z + z0, len, h, WALL_T, material);
		} else {
			const len = Math.abs(z1 - z0) + WALL_T;
			this.box("wall", o.x + x0, cy, o.z + (z0 + z1) / 2, WALL_T, h, len, material);
		}
	}

	// Dinding dengan celah pintu. axis "x": dinding memanjang di sumbu x pada z = fixed.
	wallGaps(o, axis, fixed, from, to, gaps, material) {
		let cursor = from;
		const sorted = [...gaps].sort((a, b) => a[0] - b[0]);
		sorted.forEach(([a, b]) => {
			if (a > cursor) this.segment(o, axis, fixed, cursor, a, material);
			cursor = b;
		});
		if (cursor < to) this.segment(o, axis, fixed, cursor, to, material);
	}

	segment(o, axis, fixed, a, b, material) {
		if (axis === "x") this.wall(o, a, fixed, b, fixed, material);
		else this.wall(o, fixed, a, fixed, b, material);
	}

	shell(o, x0, z0, x1, z1, M) {
		// Lantai dan plafon satu lempeng besar; dinding menutup semua sisi.
		const w = x1 - x0 + 2;
		const d = z1 - z0 + 2;
		const cx = o.x + (x0 + x1) / 2;
		const cz = o.z + (z0 + z1) / 2;
		this.box("floor", cx, FLOOR_Y - 0.25, cz, w, 0.5, d, M.floor);
		this.box("ceiling", cx, CEILING_Y + 0.25, cz, w, 0.5, d, M.ceiling, { pickable: true });
	}

	light(name, x, y, z, intensity, range, color) {
		// Nama lampu menentukan areanya; EnvironmentManager hanya menyalakan lampu area tempat pemain berada.
		const area = name.startsWith("cell") ? "cellblock" : name.startsWith("boiler") ? "boiler" : "infirmary";
		const l = this.systems.environmentManager.createAreaLamp(
			area,
			`wing_${name}_${this.counter++}`,
			new Vector3(x, y, z),
			intensity,
			range,
			color || new Color3(1, 0.85, 0.6)
		);
		this.lights.push(l);
		return l;
	}

	bed(o, cx, cz, M, alongZ = true) {
		const w = alongZ ? 1.0 : 2.0;
		const d = alongZ ? 2.0 : 1.0;
		this.box("bed", o.x + cx, FLOOR_Y + 0.3, o.z + cz, w, 0.6, d, M.metal, { decor: true });
		this.box("mattress", o.x + cx, FLOOR_Y + 0.66, o.z + cz, w - 0.1, 0.12, d - 0.1, M.bed, {
			decor: true,
			collide: false,
		});
	}

	locker(o, cx, cz, M) {
		this.box("locker", o.x + cx, FLOOR_Y + 0.95, o.z + cz, 0.55, 1.9, 0.5, M.metal, { decor: true });
	}

	stain(o, cx, cz, w, d, M) {
		this.box("stain", o.x + cx, FLOOR_Y + 0.011, o.z + cz, w, 0.02, d, M.blood, {
			collide: false,
			decor: true,
			pickable: false,
		});
	}

	// ---------------------------------------------------------------
	// PINTU PORTAL
	// ---------------------------------------------------------------

	/**
	 * Pintu HD (cat putih terkelupas) yang bisa dibuka. Jika punya "portal", menekan E
	 * memindahkan pemain (layar menggelap sebentar). Jika punya "ending", game selesai.
	 * cfg.label = teks papan di atas pintu. cfg.portal.allowDuringChase = boleh dipakai saat monster mengejar.
	 */
	createDoor(cfg) {
		const size = cfg.size || { w: 1.3, h: 2.4, d: 0.14 };
		const axis = cfg.axis || "x";
		const M = this.M;
		const bw = axis === "x" ? size.d : size.w;
		const bd = axis === "x" ? size.w : size.d;
		const mesh = this.box(`door_${cfg.id}`, cfg.x, FLOOR_Y + size.h / 2, cfg.z, bw, size.h, bd, M.wood);
		mesh.isPickable = true;

		let hd = null;
		try {
			const exit = cfg.sign === "exit" || cfg.label === "MAIN EXIT" || cfg.label === "EXIT";
			hd = attachHDDoor(this.scene, mesh, {
				pool: this.systems.texturePool,
				type: "single",
				width: size.w,
				height: size.h,
				axis,
				sign: cfg.label || null,
				signStyle: exit
					? { bg: "#0b3a17", fg: "#7dff9a", border: "#2fbf55" }
					: { bg: "#1b1b1b", fg: "#e9e4d2", border: "#777" },
			});
		} catch (error) {
			console.warn("[WingBuilder] Pintu HD gagal dibuat; kotak kayu dipakai:", error);
		}
		if (hd) hd.meshes.forEach((m) => this.meshes.push(m));

		if (!hd) {
			// Cadangan: gagang kuningan sederhana
			const handle = MeshBuilder.CreateBox(
				`wing_handle_${this.counter++}`,
				{ width: axis === "x" ? 0.22 : 0.1, height: 0.1, depth: axis === "x" ? 0.1 : 0.22 },
				this.scene
			);
			handle.parent = mesh;
			if (axis === "x") handle.position.z = size.w * 0.38;
			else handle.position.x = size.w * 0.38;
			handle.material = this.mat("brass", new Color3(0.7, 0.55, 0.2), 0.4);
			handle.isPickable = false;
			handle.checkCollisions = false;
			this.meshes.push(handle);
		}

		const data = {
			id: cfg.id,
			axis,
			locked: !!cfg.locked,
			keyId: cfg.keyId,
			requiresName: cfg.requiresName,
			size,
			portal: cfg.portal || null,
			ending: cfg.ending || null,
		};
		this.systems.interactionManager.registerInteractable(mesh, "door", data);
		return mesh;
	}

	// ---------------------------------------------------------------
	// MEMBANGUN SEMUANYA
	// ---------------------------------------------------------------

	build(sm) {
		this.sm = sm;
		// Mesh baru harus ikut dihitung ulang saat pencarian lantai pertama.
		sm.floorMatrixRetryDone = false;
		this.M = this.materials();
		this.bindEvents();

		this.buildInfirmary();
		this.buildCellBlock();
		this.buildBoilerRoom();
		this.lab = new LabBuilder(this);
		this.lab.build();
		this.buildHullDoors();

		// Pastikan matrix dan bounding box siap sebelum raycast lantai pertama.
		this.meshes.forEach((m) => {
			m.computeWorldMatrix(true);
			if (m.geometry) m.refreshBoundingInfo();
		});
	}

	// --- Infirmary: bebas dimasuki, berisi cell_key ---------------
	buildInfirmary() {
		const o = WING_ORIGINS.infirmary;
		const M = this.M;
		this.shell(o, 0, 0, 16, 9, M);

		// Dinding luar
		this.wall(o, 0, 0, 16, 0, M.wall);
		this.wall(o, 0, 9, 16, 9, M.wall);
		this.wall(o, 0, 0, 0, 9, M.wall);
		this.wall(o, 16, 0, 16, 9, M.wall);
		// Sekat lorong dengan dua pintu masuk ke ruang rawat
		this.wallGaps(o, "x", 3, 0, 16, [[2.4, 4.2], [11.6, 13.4]], M.wallDark);
		this.wall(o, 8, 3, 8, 9, M.wallDark);

		// Ruang rawat A
		this.bed(o, 1.2, 4.6, M);
		this.bed(o, 1.2, 7.0, M);
		this.bed(o, 6.6, 4.6, M);
		this.bed(o, 6.6, 7.0, M);
		// Ruang rawat B
		this.bed(o, 9.4, 4.6, M);
		this.bed(o, 9.4, 7.0, M);
		this.bed(o, 14.6, 6.8, M);

		// Lorong: loker, brankar, noda darah
		[4.0, 4.65, 5.3].forEach((x) => this.locker(o, x, 0.4, M));
		this.box("gurney", o.x + 11.5, FLOOR_Y + 0.45, o.z + 0.65, 1.9, 0.9, 0.7, M.metal, { decor: true });
		this.stain(o, 9.5, 1.8, 1.4, 1.0, M);
		this.stain(o, 3.3, 5.2, 0.8, 1.2, M);

		this.light("infirmary_hall", o.x + 8, FLOOR_Y + 2.5, o.z + 1.5, 0.5, 11);
		this.light("infirmary_b", o.x + 12, FLOOR_Y + 2.5, o.z + 6, 0.25, 7, new Color3(0.8, 0.9, 1));

		this.sm.createInteractables([
			{
				type: "note",
				snapToFloor: true,
				position: new Vector3(o.x + 3.2, FLOOR_Y, o.z + 8.45),
				deskAxis: "x",
				data: {
					id: "doc_nurse",
					title: "Nurse Marta - Night Shift",
					content:
						"Bed 14 stopped talking on the fourth night. He only points at the ceiling and smiles. Dr. Hartwell says it is a side effect. The cell block key is kept in the east ward. I locked the cell block myself, because the screaming comes from down there and it never stops.",
				},
			},
			{
				type: "key",
				snapToFloor: true,
				position: new Vector3(o.x + 12.4, FLOOR_Y, o.z + 8.45),
				deskAxis: "x",
				data: { id: "cell_key", name: "Cell Block Key", spin: true },
			},
			{
				type: "battery",
				position: new Vector3(o.x + 15.0, FLOOR_Y, o.z + 4.2),
				data: { amount: 30 },
			},
		]);

		this.sm.setupTriggers([
			{
				position: new Vector3(o.x + 8, FLOOR_Y, o.z + 1.5),
				radius: 2.2,
				event: "wing_scare",
				data: {
					intensity: 1,
					silhouette: { x: o.x + 15.2, z: o.z + 1.5 },
					message: "Something is standing at the end of the hall.",
				},
			},
		]);

		this.createDoor({
			id: "back_infirmary",
			x: o.x + 0.18,
			z: o.z + 1.5,
			axis: "x",
			portal: { ...HULL_DOORS.infirmary.arrive, areaLabel: null, message: "You are back in the main hall." },
		});
	}

	// --- Cell Block: boiler_key dan fuse ---------------------------
	buildCellBlock() {
		const o = WING_ORIGINS.cellblock;
		const M = this.M;
		this.shell(o, 0, -4.5, 20, 7.5, M);

		this.wall(o, 0, -4.5, 20, -4.5, M.wall);
		this.wall(o, 0, 7.5, 20, 7.5, M.wall);
		this.wall(o, 0, -4.5, 0, 7.5, M.wall);
		this.wall(o, 20, -4.5, 20, 7.5, M.wall);

		// Pintu sel menghadap lorong tengah (z 0..3)
		const gaps = [0, 5, 10, 15].map((x0) => [x0 + 1.7, x0 + 3.3]);
		this.wallGaps(o, "x", 0, 0, 20, gaps, M.wallDark);
		this.wallGaps(o, "x", 3, 0, 20, gaps, M.wallDark);
		[5, 10, 15].forEach((x) => {
			this.wall(o, x, -4.5, x, 0, M.wallDark);
			this.wall(o, x, 3, x, 7.5, M.wallDark);
		});

		// Ranjang sel
		[0, 5, 10, 15].forEach((x0) => {
			this.bed(o, x0 + 1.0, -2.2, M);
			this.bed(o, x0 + 1.0, 5.2, M);
		});
		this.stain(o, 10, 1.5, 2.2, 0.9, M);
		this.stain(o, 17.5, 1.2, 1.0, 1.4, M);

		this.light("cell_hall", o.x + 10, FLOOR_Y + 2.4, o.z + 1.5, 0.5, 13);
		this.light("cell_red", o.x + 17.5, FLOOR_Y + 2.2, o.z + 5, 0.3, 5, new Color3(1, 0.2, 0.15));

		this.sm.createInteractables([
			{
				type: "note",
				snapToFloor: true,
				position: new Vector3(o.x + 2.5, FLOOR_Y, o.z - 4.0),
				deskAxis: "x",
				data: {
					id: "doc_patient14",
					title: "Letter From Cell 1",
					content:
						"To whoever finds this: they moved us to the lower wing one by one. The ones who came back did not blink anymore. Cell 4 still has the boiler room key hidden in it. Nobody wants to get close to that cell. It smiles at night.",
				},
			},
			{
				type: "key",
				snapToFloor: true,
				position: new Vector3(o.x + 17.5, FLOOR_Y, o.z - 4.0),
				deskAxis: "x",
				data: { id: "boiler_key", name: "Boiler Room Key", spin: true },
			},
			{
				type: "key",
				snapToFloor: true,
				position: new Vector3(o.x + 7.5, FLOOR_Y, o.z + 7.0),
				deskAxis: "x",
				data: { id: "fuse", name: "Generator Fuse", spin: true, color: "fuse", noProp: true },
			},
			{
				type: "note",
				snapToFloor: true,
				position: new Vector3(o.x + 17.5, FLOOR_Y, o.z + 7.0),
				deskAxis: "x",
				data: {
					id: "doc_hartwell_memo",
					title: "Hartwell - Internal Memo",
					content:
						"Power is the only thing that holds it back. The backup generator in the boiler room still works, but someone removed its fuse and I do not know where it went. Without power the restricted gate stays dead. If the gate ever opens, do not run toward the lights. Run toward the way out.",
				},
			},
			{
				type: "battery",
				position: new Vector3(o.x + 12.5, FLOOR_Y, o.z + 5.2),
				data: { amount: 30 },
			},
			{
				type: "battery",
				position: new Vector3(o.x + 12.5, FLOOR_Y, o.z - 2.2),
				data: { amount: 30 },
			},
		]);

		this.sm.setupTriggers([
			{
				position: new Vector3(o.x + 10, FLOOR_Y, o.z + 1.5),
				radius: 2.5,
				event: "wing_scare",
				data: {
					intensity: 2,
					silhouette: { x: o.x + 19.0, z: o.z + 1.5 },
					message: "Something scratched on the bars behind you.",
				},
			},
		]);

		this.createDoor({
			id: "back_cellblock",
			x: o.x + 0.18,
			z: o.z + 1.5,
			axis: "x",
			portal: { ...HULL_DOORS.cellblock.arrive, areaLabel: null, message: "You are back in the main hall." },
		});
	}

	// --- Boiler Room: generator butuh fuse -------------------------
	buildBoilerRoom() {
		const o = WING_ORIGINS.boiler;
		const M = this.M;
		this.shell(o, 0, 0, 14, 10, M);

		this.wall(o, 0, 0, 14, 0, M.wallDark);
		this.wall(o, 0, 10, 14, 10, M.wallDark);
		this.wall(o, 0, 0, 0, 10, M.wallDark);
		this.wall(o, 14, 0, 14, 10, M.wallDark);
		// Sekat tengah dengan celah lebar
		this.wallGaps(o, "z", 7, 0, 10, [[3.6, 6.4]], M.wall);

		// Dua tangki boiler besar di ruang depan
		[
			[3.2, 1.9],
			[3.2, 8.1],
		].forEach(([x, z]) => {
			const tank = MeshBuilder.CreateCylinder(
				`wing_tank_${this.counter++}`,
				{ diameter: 2.3, height: 3.0, tessellation: 20 },
				this.scene
			);
			tank.position.set(o.x + x, FLOOR_Y + 1.5, o.z + z);
			tank.material = M.rust;
			tank.checkCollisions = true;
			tank.metadata = { isDecor: true };
			tank.computeWorldMatrix(true);
			tank.refreshBoundingInfo();
			this.meshes.push(tank);
		});

		// Pipa di langit-langit (tanpa tabrakan)
		[2.0, 5.0, 8.0].forEach((z) => {
			const pipe = MeshBuilder.CreateCylinder(
				`wing_pipe_${this.counter++}`,
				{ diameter: 0.28, height: 14, tessellation: 10 },
				this.scene
			);
			pipe.rotation.z = Math.PI / 2;
			pipe.position.set(o.x + 7, FLOOR_Y + 2.8, o.z + z);
			pipe.material = M.rust;
			pipe.checkCollisions = false;
			pipe.isPickable = false;
			this.meshes.push(pipe);
		});

		// Peti kayu di ruang belakang
		this.box("crate", o.x + 9.5, FLOOR_Y + 0.5, o.z + 2.2, 1.0, 1.0, 1.0, M.wood, { decor: true });
		this.box("crate", o.x + 10.7, FLOOR_Y + 0.5, o.z + 2.2, 1.0, 1.0, 1.0, M.wood, { decor: true });
		this.box("crate", o.x + 10.1, FLOOR_Y + 1.5, o.z + 2.2, 1.0, 1.0, 1.0, M.wood, { decor: true });
		this.stain(o, 9.5, 5.0, 1.8, 1.4, M);

		this.light("boiler_front", o.x + 4, FLOOR_Y + 2.5, o.z + 5, 0.4, 9, new Color3(1, 0.6, 0.35));
		this.light("boiler_back", o.x + 11, FLOOR_Y + 2.5, o.z + 5, 0.35, 9);

		this.sm.createInteractables([
			{
				type: "generator",
				snapToFloor: true,
				position: new Vector3(o.x + 11.8, FLOOR_Y, o.z + 8.6),
				data: {
					id: "boiler_generator",
					requiresItem: { type: "key", id: "fuse" },
					requiresName: "Generator Fuse",
				},
			},
			{
				type: "note",
				snapToFloor: true,
				position: new Vector3(o.x + 9.2, FLOOR_Y, o.z + 9.5),
				deskAxis: "x",
				data: {
					id: "doc_boiler_log",
					title: "Boiler Room Log",
					content:
						"Fuse goes into the generator, then pull the lever. It will take a few seconds to spin up and everything in the building will hear it. The thing in the restricted wing only sleeps while the power is off. Wake the power, and you wake it too.",
				},
			},
			{
				type: "battery",
				position: new Vector3(o.x + 12.8, FLOOR_Y, o.z + 1.4),
				data: { amount: 30 },
			},
		]);

		this.sm.setupTriggers([
			{
				position: new Vector3(o.x + 7, FLOOR_Y, o.z + 5),
				radius: 2.4,
				event: "wing_scare",
				data: {
					intensity: 2,
					silhouette: { x: o.x + 13, z: o.z + 1.0 },
					message: "The pipes went silent all at once.",
				},
			},
		]);

		this.createDoor({
			id: "back_boiler",
			x: o.x + 0.18,
			z: o.z + 5,
			axis: "x",
			portal: { ...HULL_DOORS.boiler.arrive, areaLabel: null, message: "You are back in the main hall." },
		});
	}

	// --- Pintu di koridor utama -----------------------------------
	buildHullDoors() {
		const H = HULL_DOORS;
		const w = WING_ORIGINS;

		this.createDoor({
			id: "main_exit",
			x: H.exit.x,
			z: H.exit.z,
			axis: "x",
			size: { w: 1.3, h: 2.4, d: 0.14 },
			locked: true,
			keyId: "exit_key",
			requiresName: "Main Exit Key",
			ending: "escape",
			label: "MAIN EXIT",
			sign: "exit",
		});

		this.createDoor({
			id: "door_infirmary",
			x: H.infirmary.x,
			z: H.infirmary.z,
			axis: "x",
			label: "INFIRMARY",
			portal: {
				x: w.infirmary.x + 1.7,
				z: w.infirmary.z + 1.5,
				yaw: Math.PI / 2,
				areaLabel: "Infirmary",
				message: "The infirmary smells of rust and old medicine.",
			},
		});

		this.createDoor({
			id: "door_cellblock",
			x: H.cellblock.x,
			z: H.cellblock.z,
			axis: "x",
			label: "CELL BLOCK",
			locked: true,
			keyId: "cell_key",
			requiresName: "Cell Block Key",
			portal: {
				x: w.cellblock.x + 1.7,
				z: w.cellblock.z + 1.5,
				yaw: Math.PI / 2,
				areaLabel: "Cell Block",
				message: "Cold air. Something scratched at the walls here.",
			},
		});

		this.createDoor({
			id: "door_boiler",
			x: H.boiler.x,
			z: H.boiler.z,
			axis: "x",
			label: "BOILER ROOM",
			locked: true,
			keyId: "boiler_key",
			requiresName: "Boiler Room Key",
			portal: {
				x: w.boiler.x + 1.7,
				z: w.boiler.z + 5,
				yaw: Math.PI / 2,
				areaLabel: "Boiler Room",
				message: "The pipes are groaning. Somewhere a generator waits.",
			},
		});

		// Pintu ke Experiment Chamber (lanjutan cerita setelah pintu putih). Tidak terkunci dan boleh
		// dipakai saat monster mengejar: inilah tempat berlindung pertama.
		this.createDoor({
			id: "door_lab",
			x: H.lab.x,
			z: H.lab.z,
			axis: "z",
			label: "CHAMBER",
			portal: {
				x: w.lab.x + LAB_ARRIVE.x,
				z: w.lab.z + LAB_ARRIVE.z,
				yaw: LAB_ARRIVE.yaw,
				areaLabel: "Experiment Chamber",
				allowDuringChase: true,
				message: "A cold, humming room. Something was done here.",
			},
		});
	}

	// ---------------------------------------------------------------
	// EVENT
	// ---------------------------------------------------------------

	bindEvents() {
		if (this.eventsBound) return;
		this.eventsBound = true;
		const events = this.systems.eventSystem;

		events.on("wing_scare", (data) => this.onWingScare(data));

		// Petunjuk singkat setelah mengambil kunci penting
		const hints = {
			restricted_key: "The restricted gate also needs power.",
			cell_key: "CELL BLOCK. A locked door in the main hall.",
			boiler_key: "BOILER ROOM. The east arm of the main hall.",
			fuse: "A heavy fuse. It belongs in the generator.",
			exit_key: "MAIN EXIT. The door where you started. RUN.",
		};
		events.on("key_collected", (data) => {
			const hint = hints[data && data.id];
			if (!hint) return;
			setTimeout(() => this.systems.interactionManager?.showMessage(hint, 3500), 900);
		});

		events.on("power_restored", () => {
			setTimeout(
				() =>
					this.systems.interactionManager?.showMessage(
						"Far away, the restricted gate hums with power.",
						4000
					),
				3500
			);
		});
	}

	onWingScare(data) {
		this.systems.environmentManager?.flickerLights?.();
		this.systems.audioManager?.playStinger?.(data.intensity || 1);
		if (data.message) this.systems.interactionManager?.showMessage(data.message, 3000);
		if (data.silhouette) this.flashSilhouette(data.silhouette.x, data.silhouette.z);
	}

	// Sosok hitam berdiri diam sebentar lalu hilang.
	flashSilhouette(x, z) {
		this.removeSilhouette();
		const mesh = MeshBuilder.CreateBox(
			`wing_silhouette_${this.counter++}`,
			{ width: 0.55, height: 2.0, depth: 0.3 },
			this.scene
		);
		mesh.position.set(x, FLOOR_Y + 1.0, z);
		mesh.material = this.M?.shadow || this.mat("shadow", new Color3(0.01, 0.01, 0.01), 0);
		mesh.checkCollisions = false;
		mesh.isPickable = false;
		this.silhouette = mesh;
		this.silhouetteTimeout = setTimeout(() => this.removeSilhouette(), 1500);
	}

	removeSilhouette() {
		clearTimeout(this.silhouetteTimeout);
		this.silhouetteTimeout = null;
		if (this.silhouette && !this.silhouette.isDisposed()) this.silhouette.dispose();
		this.silhouette = null;
	}

	// ---------------------------------------------------------------
	// PEMBERSIHAN
	// ---------------------------------------------------------------

	dispose() {
		this.removeSilhouette();
		if (this.lab) this.lab.dispose();
		this.meshes.forEach((m) => {
			if (m && !m.isDisposed()) m.dispose();
		});
		this.lights.forEach((l) => {
			if (l && !l.isDisposed()) l.dispose();
		});
		const envLights = this.systems.environmentManager?.lights;
		if (envLights) {
			for (let i = envLights.length - 1; i >= 0; i--) {
				if (envLights[i] && envLights[i].isDisposed && envLights[i].isDisposed()) envLights.splice(i, 1);
			}
		}
		this.meshes = [];
		this.lights = [];
	}
}
