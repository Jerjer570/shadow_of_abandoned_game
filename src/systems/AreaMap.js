/**
 * DATA AREA (tanpa import apa pun, supaya bisa dipakai oleh semua sistem
 * dan diuji di Node).
 *
 * Koordinat dunia:
 *   - Hall utama (corridor_baru.glb): x -4..15.6, z -8.9..8.9
 *   - Wing tambahan dibuat jauh dari hall (x >= 50) supaya tidak saling tembus.
 *   - Experiment Chamber (ruangan baru) ada di x 100..120.
 */

// Pojok barat laut tiap wing / ruangan tambahan (x, z dunia).
export const WING_ORIGINS = {
	infirmary: { x: 60, z: -40 },
	cellblock: { x: 60, z: 0 },
	boiler: { x: 60, z: 40 },
	lab: { x: 100, z: -20 },
};

// Hall utama: kumpulan persegi lantai yang bisa dilalui (dipakai peta dan deteksi area).
// Diambil dari bentuk lantai corridor_baru.glb.
export const HALL_FLOOR_RECTS = [
	{ x0: -3.99, z0: -6.7, x1: 15.6, z1: -3.7 }, // lorong barat-timur (tempat pemain mulai)
	{ x0: 2.2, z0: -8.87, x1: 6.3, z1: 8.87 }, // lorong utara-selatan
	{ x0: -1.9, z0: 0.6, x1: 2.2, z1: 3.6 }, // ceruk barat
	{ x0: 6.3, z0: 0.6, x1: 10.4, z1: 3.6 }, // ceruk timur
	{ x0: 12.5, z0: -3.7, x1: 15.6, z1: 0.5 }, // ujung timur (area terlarang)
];

export const AREA_LABELS = {
	hall: "Main Hall",
	infirmary: "Infirmary",
	cellblock: "Cell Block",
	boiler: "Boiler Room",
	lab: "Experiment Chamber",
};

// Kelompok pencahayaan: hall, wing biasa, dan lab punya keseimbangan sendiri.
export const AREA_LIGHT_GROUP = {
	hall: "hall",
	infirmary: "wing",
	cellblock: "wing",
	boiler: "wing",
	lab: "lab",
};

// Menentukan area dari posisi dunia.
export function areaAt(x, z) {
	if (x > 90) return "lab";
	if (x > 50) {
		if (z < -20) return "infirmary";
		if (z < 20) return "cellblock";
		return "boiler";
	}
	return "hall";
}
