/**
 * FURNITURE KIT (perabot prosedural untuk wing)
 *
 * Semua fungsi menerima WingBuilder sebagai `b` dan memakai koordinat LOKAL ruangan
 * (b.curO sudah diset oleh pemanggil). Mesh dibuat lewat helper builder:
 *   b.tbox(name, cx, cy, cz, w, h, d, material, { collide, decor, pickable })
 *   b.deco(...)      -> detail tanpa tabrakan
 *   b.cylinder(...)  -> tabung (opsi collide/tess/rotX/rotZ)
 *
 * Konvensi `face` = [dx, dz] arah HADAP perabot (arah orang menghadap). Contoh [0, 1]
 * menghadap +z, [-1, 0] menghadap -x. Bagian belakang perabot ada di sisi sebaliknya.
 */

function dir(face) {
	const [x, z] = face || [0, 1];
	return { fx: x === 0 ? 0 : Math.sign(x), fz: z === 0 ? 0 : Math.sign(z) };
}

// Peti kayu dengan rangka baja. cy = pusat tinggi (0.5 = di lantai, 1.5 = ditumpuk).
export function crate(b, id, cx, cy, cz, size = 1.0) {
	const M = b.M;
	const half = size / 2;
	b.tbox(id, cx, cy, cz, size, size, size, M.wood);

	const t = 0.05;
	[-1, 1].forEach((sx) => {
		[-1, 1].forEach((sz) => {
			b.deco(`${id}_post`, cx + sx * (half - t / 2), cy, cz + sz * (half - t / 2), t, size, t, M.steel);
		});
	});
	[-1, 1].forEach((sy) => {
		b.deco(`${id}_band`, cx, cy + sy * (half - 0.08), cz, size + 0.02, 0.06, size + 0.02, M.rust);
	});
	b.deco(`${id}_lid`, cx, cy + half + 0.015, cz, size * 0.9, 0.03, size * 0.9, M.darkwood);
}

// Ranjang besi. alongZ=true: kepala di -z, panjang mengikuti sumbu z.
export function bed(b, id, cx, cz, alongZ = true, ruined = false) {
	const M = b.M;
	const w = alongZ ? 1.0 : 2.0;
	const d = alongZ ? 2.0 : 1.0;
	b.tbox(id, cx, 0.3, cz, w, 0.6, d, M.metal);
	b.deco(`${id}_mattress`, cx, 0.66, cz, w - 0.1, 0.12, d - 0.1, M.sheet);

	// Kepala ranjang dan bantal di ujung -z (atau -x bila ranjang melintang).
	const headOff = alongZ ? { x: 0, z: -d / 2 + 0.05 } : { x: -w / 2 + 0.05, z: 0 };
	b.deco(
		`${id}_head`,
		cx + headOff.x,
		0.8,
		cz + headOff.z,
		alongZ ? w : 0.1,
		0.55,
		alongZ ? 0.1 : w,
		M.metal
	);
	b.deco(
		`${id}_pillow`,
		cx + headOff.x * 0.6,
		0.74,
		cz + headOff.z * 0.6,
		alongZ ? w * 0.55 : 0.3,
		0.1,
		alongZ ? 0.3 : w * 0.55,
		M.sheet
	);

	if (ruined) {
		[-0.35, 0.35].forEach((off) => {
			b.deco(
				`${id}_strap`,
				cx + (alongZ ? 0 : off),
				0.725,
				cz + (alongZ ? off : 0),
				alongZ ? w - 0.12 : 0.12,
				0.03,
				alongZ ? 0.12 : w - 0.12,
				M.black
			);
		});
		b.deco(`${id}_stain`, cx, 0.722, cz + (alongZ ? 0.5 : 0), 0.42, 0.01, 0.36, M.blood);
	}

	[-1, 1].forEach((sx) => {
		[-1, 1].forEach((sz) => {
			b.cylinder(
				`${id}_leg`,
				cx + sx * (w / 2 - 0.1),
				0.15,
				cz + sz * (d / 2 - 0.1),
				0.08,
				0.3,
				M.metal,
				{ tess: 8 }
			);
		});
	});
}

// Loker logam dengan pintu, gagang, dan ventilasi di sisi `face`.
export function locker(b, id, cx, cz, face = [0, 1]) {
	const M = b.M;
	const w = 0.55;
	const h = 1.9;
	const d = 0.5;
	b.tbox(id, cx, h / 2, cz, w, h, d, M.metal);

	const { fx, fz } = dir(face);
	const frontX = cx + fx * (d / 2 + 0.012);
	const frontZ = cz + fz * (d / 2 + 0.012);
	b.deco(`${id}_door`, frontX, 1.15, frontZ, fx ? 0.02 : w - 0.06, 1.3, fx ? w - 0.06 : 0.02, M.steel);

	// Gagang di tepi pintu (lebar pintu mengikuti sumbu yang sejajar dinding).
	const hx = cx + fx * (d / 2 + 0.04) + (fx ? 0 : w * 0.32);
	const hz = cz + fz * (d / 2 + 0.04) + (fx ? w * 0.32 : 0);
	b.deco(`${id}_handle`, hx, 1.05, hz, fx ? 0.03 : 0.05, 0.16, fx ? 0.05 : 0.03, M.brass);

	for (let i = 0; i < 4; i++) {
		const vx = cx + fx * (d / 2 + 0.024);
		const vz = cz + fz * (d / 2 + 0.024);
		b.deco(`${id}_vent`, vx, 1.62 - i * 0.07, vz, fx ? 0.015 : w * 0.6, 0.02, fx ? w * 0.6 : 0.015, M.black);
	}
}

// Brankar: rangka roda, alas, dan kasur tipis.
export function gurney(b, id, cx, cz, w = 1.9, d = 0.7) {
	const M = b.M;
	b.tbox(`${id}_top`, cx, 0.8, cz, w, 0.1, d, M.steel);
	b.deco(`${id}_pad`, cx, 0.87, cz, w - 0.16, 0.05, d - 0.14, M.sheet);

	[-1, 1].forEach((sx) => {
		[-1, 1].forEach((sz) => {
			const x = cx + sx * (w / 2 - 0.12);
			const z = cz + sz * (d / 2 - 0.1);
			b.cylinder(`${id}_leg`, x, 0.4, z, 0.06, 0.78, M.metal, { tess: 8 });
			b.cylinder(`${id}_wheel`, x, 0.09, z, 0.16, 0.05, M.black, { rotZ: Math.PI / 2, tess: 12 });
		});
	});

	b.deco(`${id}_rail`, cx, 0.72, cz + d / 2 - 0.04, w - 0.2, 0.04, 0.04, M.metal);
}

// Kursi yang bisa diduduki. Mesh alas didaftarkan ke b.seatMeshes supaya
// WingBuilder.registerFurniture() bisa menjadikannya interactable "seat".
export function chair(b, id, cx, cz, face = [0, 1]) {
	const M = b.M;
	const { fx, fz } = dir(face);
	const seat = b.tbox(id, cx, 0.45, cz, 0.5, 0.12, 0.5, M.leather);

	[-1, 1].forEach((sx) => {
		[-1, 1].forEach((sz) => {
			b.cylinder(`${id}_leg`, cx + sx * 0.19, 0.2, cz + sz * 0.19, 0.05, 0.4, M.metal, { tess: 8 });
		});
	});

	// Sandaran ada di belakang (sisi berlawanan dengan arah hadap).
	const bx = cx - fx * 0.21;
	const bz = cz - fz * 0.21;
	b.deco(`${id}_back`, bx, 0.76, bz, fx ? 0.08 : 0.46, 0.52, fx ? 0.46 : 0.08, M.leather);
	b.deco(`${id}_frame`, bx, 0.5, bz, fx ? 0.06 : 0.48, 0.06, fx ? 0.48 : 0.06, M.metal);

	if (b.seatMeshes) b.seatMeshes[id] = seat;
	return seat;
}

// Meja: papan atas + empat kaki + rak bawah.
export function table(b, id, cx, cz, w = 1.2, d = 0.8, h = 0.78) {
	const M = b.M;
	b.tbox(id, cx, h - 0.03, cz, w, 0.06, d, M.wood);

	[-1, 1].forEach((sx) => {
		[-1, 1].forEach((sz) => {
			b.cylinder(
				`${id}_leg`,
				cx + sx * (w / 2 - 0.08),
				(h - 0.06) / 2,
				cz + sz * (d / 2 - 0.08),
				0.07,
				h - 0.06,
				M.darkwood,
				{ tess: 8 }
			);
		});
	});

	b.deco(`${id}_shelf`, cx, 0.22, cz, w - 0.2, 0.04, d - 0.16, M.darkwood);
}

// Dispenser air: badan logam, galon, panel, dan kran. Mengembalikan badan (interactable).
export function dispenser(b, id, cx, cz, face = [0, 1]) {
	const M = b.M;
	const { fx, fz } = dir(face);
	const body = b.tbox(id, cx, 0.55, cz, 0.45, 1.1, 0.35, M.steel);

	b.cylinder(`${id}_jug`, cx, 1.3, cz, 0.3, 0.4, M.glass, { tess: 14 });
	b.cylinder(`${id}_cap`, cx, 1.52, cz, 0.12, 0.06, M.black, { tess: 10 });

	const px = cx + fx * 0.185;
	const pz = cz + fz * 0.185;
	b.deco(`${id}_panel`, px, 0.62, pz, fx ? 0.02 : 0.3, 0.4, fx ? 0.3 : 0.02, M.black);

	[-0.08, 0.08].forEach((off) => {
		const tx = px + fx * 0.03 + (fx ? 0 : off);
		const tz = pz + fz * 0.03 + (fx ? off : 0);
		b.deco(`${id}_tap`, tx, 0.45, tz, fx ? 0.05 : 0.04, 0.06, fx ? 0.04 : 0.05, M.brass);
	});

	b.deco(`${id}_tray`, px + fx * 0.05, 0.36, pz + fz * 0.05, fx ? 0.16 : 0.24, 0.02, fx ? 0.24 : 0.16, M.metal);

	return body;
}
