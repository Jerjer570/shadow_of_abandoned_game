/**
 * DENAH "EXPERIMENT CHAMBER" (ruangan baru setelah pintu putih / restricted gate).
 *
 * File ini hanya berisi DATA (tanpa import) supaya:
 *   - LabBuilder.js bisa membangun ruangannya dari data ini,
 *   - MissionManager.js bisa menggambar peta ruangan ini,
 *   - denah bisa diuji tabrakannya di Node (lihat tools/check_layout.mjs).
 *
 * Koordinat LOKAL: (0,0) = pojok barat laut ruangan, x ke timur, z ke "utara".
 * Posisi dunia = WING_ORIGINS.lab + koordinat lokal.
 *
 * ATURAN PENEMPATAN (agar tidak ada yang nabrak):
 *   - Semua properti padat berjarak minimal 0.15 m dari dinding dan dari properti lain.
 *   - Jalur dari pintu masuk ke tengah ruangan (z 5.8 .. 8.2) tidak boleh terhalang.
 *   - Meja untuk item (meja GLB) dihitung 1.6 x 0.75 m (axis "x") atau 0.75 x 1.6 m (axis "z").
 */

export const LAB = {
	w: 20,
	d: 14,
	h: 4.2, // tinggi plafon dari lantai
	wallT: 0.2,

	// Pintu kembali ke hall (di dinding barat) dan titik pemain muncul di dalam.
	backDoor: { x: 0.18, z: 7.0 },
	arrive: { x: 1.8, z: 7.0, yaw: Math.PI / 2 },

	// Dinding pembatas Observation Room (x 0..7) dan Chamber (x 7..20).
	divider: {
		x: 7,
		doorway: [5.8, 8.2], // celah lewat
		windows: [
			[1.2, 4.2],
			[9.8, 12.8],
		],
		sill: 1.0,
		top: 2.6,
	},
};

// Persegi/lingkaran padat (menghalangi pemain). cx,cz = pusat.
// type dipakai LabBuilder untuk memilih model; h = tinggi.
export const LAB_SOLIDS = [
	// --- Observation Room ---
	{ id: "cab1", type: "cabinet", cx: 1.3, cz: 0.5, w: 0.6, d: 0.6, h: 1.8 },
	{ id: "cab2", type: "cabinet", cx: 2.05, cz: 0.5, w: 0.6, d: 0.6, h: 1.8 },
	{ id: "cab3", type: "cabinet", cx: 2.8, cz: 0.5, w: 0.6, d: 0.6, h: 1.8 },
	{ id: "consoleA", type: "console", cx: 6.2, cz: 2.7, w: 0.9, d: 3.0, h: 0.95 },
	{ id: "consoleB", type: "console", cx: 6.2, cz: 11.3, w: 0.9, d: 3.0, h: 0.95 },
	{ id: "chairA", type: "chair", cx: 5.0, cz: 2.7, w: 0.55, d: 0.55, h: 0.95 },
	{ id: "chairB", type: "chair", cx: 5.0, cz: 11.3, w: 0.55, d: 0.55, h: 0.95 },
	{ id: "shelfS", type: "bookshelf", cx: 4.6, cz: 13.6, w: 2.0, d: 0.5, h: 2.0 },
	{ id: "wheelchair", type: "wheelchair", cx: 2.2, cz: 9.6, w: 0.7, d: 0.9, h: 0.95 },
	{ id: "bin", type: "bin", cx: 0.55, cz: 4.0, w: 0.4, d: 0.4, h: 0.55 },
	{ id: "coatrack", type: "coatrack", cx: 0.55, cz: 10.5, w: 0.4, d: 0.4, h: 1.8 },

	// --- Chamber: mesin di tengah ---
	{ id: "chair", type: "opchair", cx: 13.5, cz: 7.0, w: 0.9, d: 1.3, h: 1.3 },

	// --- Chamber: dinding utara dan selatan ---
	{ id: "jars1", type: "jarshelf", cx: 9.3, cz: 0.55, w: 2.6, d: 0.5, h: 2.1 },
	{ id: "jars2", type: "jarshelf", cx: 12.7, cz: 0.55, w: 2.6, d: 0.5, h: 2.1 },
	{ id: "transformer", type: "transformer", cx: 16.0, cz: 0.6, w: 2.0, d: 0.8, h: 2.2 },
	{ id: "gurney", type: "gurney", cx: 9.4, cz: 13.0, w: 2.0, d: 0.8, h: 0.95 },
	{ id: "dissect", type: "dissect", cx: 12.6, cz: 13.0, w: 2.0, d: 0.9, h: 1.0 },
	{ id: "cart", type: "cart", cx: 14.6, cz: 13.1, w: 0.8, d: 0.6, h: 0.9 },
	{ id: "cages", type: "cages", cx: 18.0, cz: 13.0, w: 3.2, d: 1.4, h: 1.9 },
];

// Peti dan tabung gas dekorasi yang juga padat (dibangun oleh LabBuilder.buildDecor).
export const LAB_EXTRA = [
	{ id: "crateA", shape: "rect", x0: 18.8, x1: 19.6, z0: 2.1, z1: 2.9 },
	{ id: "crateB", shape: "rect", x0: 18.9, x1: 19.5, z0: 3.15, z1: 3.75 },
	{ id: "tank1", shape: "circle", cx: 8.0, cz: 2.8, r: 0.15 },
	{ id: "tank2", shape: "circle", cx: 8.4, cz: 3.4, r: 0.15 },
];

// Enam tiang mesin mengelilingi panggung (lingkaran, jari-jari tiang 0.38).
export const LAB_PLATFORM = { cx: 13.5, cz: 7.0, r: 2.6, h: 0.18 };
export const LAB_PYLONS = [30, 90, 150, 210, 270, 330].map((deg, i) => {
	const a = (deg * Math.PI) / 180;
	return {
		id: `pylon${i + 1}`,
		cx: LAB_PLATFORM.cx + Math.cos(a) * 3.6,
		cz: LAB_PLATFORM.cz + Math.sin(a) * 3.6,
		r: 0.38,
		h: 3.6,
	};
});

// Item interaktif. Meja GLB dibuat otomatis oleh SceneManager.createInteractables.
export const LAB_ITEMS = [
	{ kind: "note", id: "doc_hartwell_rec", x: 2.0, z: 12.9, deskAxis: "x" },
	{ kind: "note", id: "doc_subject23", x: 18.6, z: 1.3, deskAxis: "x" },
	{ kind: "note", id: "doc_marta_last", x: 18.9, z: 10.0, deskAxis: "z" },
	{ kind: "key", id: "exit_key", x: 18.9, z: 7.0, deskAxis: "z" },
	{ kind: "battery", id: "lab_battery_1", x: 2.8, z: 4.4 },
	{ kind: "battery", id: "lab_battery_2", x: 8.4, z: 2.0 },
	{ kind: "battery", id: "lab_battery_3", x: 19.0, z: 4.2 },
];

// Ukuran meja (meter) untuk pengecekan tabrakan.
export const DESK_SIZE = { x: { w: 1.6, d: 0.75 }, z: { w: 0.75, d: 1.6 } };

// Lampu ruangan: [nama, x, z, tinggi dari lantai, intensitas dasar, jangkauan, warna RGB]
export const LAB_LAMPS = [
	["obs", 3.5, 7.0, 3.5, 0.6, 11, [1.0, 0.95, 0.8]],
	["chamberS", 11.5, 11.0, 3.6, 0.5, 10, [0.85, 0.95, 1.0]],
	["chamberE", 18.0, 7.0, 3.6, 0.5, 10, [1.0, 0.6, 0.5]],
	["apparatus", 13.5, 7.0, 3.9, 0.6, 9, [0.45, 1.0, 0.9]],
];

// Dinding untuk peta (garis: x0,z0,x1,z1) dan persegi lantai.
export function labMapWalls() {
	const L = LAB;
	const d = L.divider;
	const walls = [
		[0, 0, L.w, 0],
		[0, L.d, L.w, L.d],
		[0, 0, 0, L.d],
		[L.w, 0, L.w, L.d],
	];
	// Dinding pembatas, dipecah di celah pintu.
	const cuts = [d.doorway, ...d.windows].sort((a, b) => a[0] - b[0]);
	let cursor = 0;
	cuts.forEach(([a, b]) => {
		if (a > cursor) walls.push([d.x, cursor, d.x, a]);
		cursor = b;
	});
	if (cursor < L.d) walls.push([d.x, cursor, d.x, L.d]);
	return walls;
}

// Semua bentuk padat (untuk pengecekan tabrakan) dalam satu daftar.
export function labFootprints() {
	const out = [];
	LAB_SOLIDS.forEach((s) =>
		out.push({ id: s.id, shape: "rect", x0: s.cx - s.w / 2, x1: s.cx + s.w / 2, z0: s.cz - s.d / 2, z1: s.cz + s.d / 2 })
	);
	LAB_EXTRA.forEach((e) => out.push(e));
	LAB_PYLONS.forEach((p) => out.push({ id: p.id, shape: "circle", cx: p.cx, cz: p.cz, r: p.r }));
	LAB_ITEMS.forEach((it) => {
		if (it.kind === "battery") {
			out.push({ id: it.id, shape: "rect", x0: it.x - 0.12, x1: it.x + 0.12, z0: it.z - 0.12, z1: it.z + 0.12 });
			return;
		}
		const sz = DESK_SIZE[it.deskAxis || "x"];
		out.push({ id: `desk_${it.id}`, shape: "rect", x0: it.x - sz.w / 2, x1: it.x + sz.w / 2, z0: it.z - sz.d / 2, z1: it.z + sz.d / 2 });
	});
	return out;
}
