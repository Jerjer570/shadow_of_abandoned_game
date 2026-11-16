import { Color3, MeshBuilder, StandardMaterial, TransformNode, Vector3 } from "@babylonjs/core";
import * as Forge from "./TextureForge.js";

/**
 * DOOR FACTORY: pintu putih HD.
 *
 * Tekstur 1024x2048 (cat putih terkelupas, karat, panel timbul dengan normal map,
 * jendela berkawat, pelat tendang), bingkai baja, engsel, gagang, dan papan nama.
 * Dipakai untuk:
 *   - gerbang ganda ward_gate dan restricted_gate ("pintu putih"),
 *   - pintu tunggal wing, pintu keluar utama, dan pintu Experiment Chamber.
 *
 * Mesh visual tidak bisa diklik dan tidak punya tabrakan; anchor (kotak tak terlihat
 * milik SceneManager/WingBuilder) tetap menjadi sasaran interaksi dan tabrakan.
 */

const ease = (k) => 1 - Math.pow(1 - k, 3);

function materials(scene, pool) {
	if (pool.doorMats && !pool.doorMats.leaf.isDisposed?.()) return pool.doorMats;
	const leafTex = pool.pair("door_leaf", 1024, 2048, () => Forge.genDoorLeaf(1024, 2048, { seed: 61 }), "#cfcbbd");
	const hazardTex = pool.pair("door_leaf_hazard", 1024, 2048, () => Forge.genDoorLeaf(1024, 2048, { seed: 62, hazard: true }), "#cfcbbd");
	const metalTex = pool.pair("door_frame_metal", 512, 512, () => Forge.genMetal(512, 512, { seed: 44, base: [96, 98, 100], rust: 0.35 }), "#666");
	const glassTex = pool.pair("door_glass", 512, 512, () => Forge.genWireGlass(512, 512, { seed: 71 }), "#101618");

	const mk = (name, tex, color, spec = 0.18, glow = 0.05) => {
		const m = new StandardMaterial(name, scene);
		m.diffuseTexture = tex.diff;
		m.bumpTexture = tex.normal;
		m.diffuseColor = color;
		m.specularColor = new Color3(spec, spec, spec);
		m.specularPower = 48;
		m.emissiveColor = new Color3(glow, glow, glow * 0.95);
		m.maxSimultaneousLights = 6;
		return m;
	};
	pool.doorMats = {
		leaf: mk("hd_door_leaf", leafTex, new Color3(1, 1, 1)),
		hazard: mk("hd_door_leaf_hazard", hazardTex, new Color3(1, 1, 1)),
		frame: mk("hd_door_frame", metalTex, new Color3(0.82, 0.82, 0.78), 0.25, 0.03),
		glass: mk("hd_door_glass", glassTex, new Color3(1, 1, 1), 0.5, 0.02),
		brass: (() => {
			const m = new StandardMaterial("hd_door_brass", scene);
			m.diffuseColor = new Color3(0.62, 0.48, 0.2);
			m.specularColor = new Color3(0.8, 0.7, 0.4);
			m.specularPower = 24;
			m.emissiveColor = new Color3(0.08, 0.06, 0.02);
			m.maxSimultaneousLights = 6;
			return m;
		})(),
		dark: (() => {
			const m = new StandardMaterial("hd_door_dark", scene);
			m.diffuseColor = new Color3(0.08, 0.08, 0.08);
			m.specularColor = new Color3(0.3, 0.3, 0.3);
			m.maxSimultaneousLights = 6;
			return m;
		})(),
	};
	return pool.doorMats;
}

function box(scene, parent, name, w, h, d, x, y, z, mat) {
	const m = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
	m.parent = parent;
	m.position.set(x, y, z);
	m.material = mat;
	m.isPickable = false;
	m.checkCollisions = false;
	return m;
}

function cyl(scene, parent, name, dia, h, x, y, z, mat, rotZ = 0) {
	const m = MeshBuilder.CreateCylinder(name, { diameter: dia, height: h, tessellation: 14 }, scene);
	m.parent = parent;
	m.position.set(x, y, z);
	m.rotation.z = rotZ;
	m.material = mat;
	m.isPickable = false;
	m.checkCollisions = false;
	return m;
}

function signPlate(scene, pool, parent, text, y, z, opts = {}) {
	const tex = pool.sign(`sign_${text}_${opts.bg || "d"}`, text, opts);
	const m = new StandardMaterial(`sign_mat_${text}`, scene);
	m.diffuseTexture = tex;
	m.emissiveTexture = tex;
	m.emissiveColor = new Color3(0.55, 0.55, 0.55);
	m.specularColor = Color3.Black();
	const plate = MeshBuilder.CreatePlane(`sign_${text}`, { width: opts.planeW || 1.1, height: (opts.planeW || 1.1) / 4 }, scene);
	plate.parent = parent;
	plate.position.set(0, y, z);
	plate.material = m;
	plate.isPickable = false;
	plate.checkCollisions = false;
	// sisi belakang juga bisa dibaca
	const back = plate.clone(`sign_${text}_b`);
	back.parent = parent;
	back.rotation.y = Math.PI;
	back.position.set(0, y, -z);
	return [plate, back];
}

/**
 * Memasang pintu HD pada anchor.
 * opts: { type: "double" | "single", width, height, axis: "x" | "z", variant: "plain" | "hazard",
 *         sign: "TEKS", signStyle: {...}, swing: 1 | -1, pool }
 * Mengembalikan objek { root, open(onDone), meshes } dan menyimpannya di anchor.metadata.hdDoor.
 */
export function attachHDDoor(scene, anchor, opts) {
	const { pool, width, height, axis = "x", type = "single", variant = "plain", sign = null, swing = 1 } = opts;
	const M = materials(scene, pool);
	const leafMat = variant === "hazard" ? M.hazard : M.leaf;
	const id = anchor.id;

	const root = new TransformNode(`${id}_hd_door`, scene);
	root.parent = anchor;
	root.position.set(0, -height / 2, 0);
	// Lebar pintu selalu di sumbu x lokal; axis "x" berarti dinding tegak lurus sumbu x.
	root.rotation.y = axis === "x" ? Math.PI / 2 : 0;

	const meshes = [];
	const jamb = 0.14, depth = 0.26, header = 0.18;
	const leafH = type === "double" ? Math.min(height - 1.1, 2.8) : height - header;
	const innerW = width - jamb * 2;
	const add = (m) => (meshes.push(m), m);

	// Bingkai baja
	add(box(scene, root, `${id}_jambL`, jamb, height, depth, -width / 2 + jamb / 2, height / 2, 0, M.frame));
	add(box(scene, root, `${id}_jambR`, jamb, height, depth, width / 2 - jamb / 2, height / 2, 0, M.frame));
	add(box(scene, root, `${id}_header`, width, header, depth, 0, height - header / 2, 0, M.frame));
	add(box(scene, root, `${id}_sill`, innerW, 0.05, depth, 0, 0.025, 0, M.frame));

	const leaves = [];
	const leafThick = 0.07;

	const makeLeaf = (name, w, hingeX, dir) => {
		const pivot = new TransformNode(`${id}_${name}_pivot`, scene);
		pivot.parent = root;
		pivot.position.set(hingeX, 0, 0);
		const slab = box(scene, pivot, `${id}_${name}`, w - 0.02, leafH, leafThick, dir * (w / 2), leafH / 2, 0, leafMat);
		add(slab);
		// engsel
		[0.35, leafH * 0.5, leafH - 0.35].forEach((y, i) => add(cyl(scene, pivot, `${id}_${name}_hinge${i}`, 0.07, 0.16, 0, y, 0, M.dark)));
		// gagang tekan (bar) dan pelat kunci di sisi tengah
		const gx = dir * (w - 0.16);
		add(box(scene, pivot, `${id}_${name}_plate`, 0.09, 0.32, 0.015, gx, leafH * 0.48, leafThick / 2 + 0.008, M.brass));
		add(box(scene, pivot, `${id}_${name}_plateB`, 0.09, 0.32, 0.015, gx, leafH * 0.48, -leafThick / 2 - 0.008, M.brass));
		add(cyl(scene, pivot, `${id}_${name}_bar`, 0.035, 0.6, gx, leafH * 0.46, leafThick / 2 + 0.05, M.brass));
		add(cyl(scene, pivot, `${id}_${name}_barB`, 0.035, 0.6, gx, leafH * 0.46, -leafThick / 2 - 0.05, M.brass));
		leaves.push({ pivot, dir });
		return pivot;
	};

	if (type === "double") {
		const lw = innerW / 2;
		makeLeaf("leafL", lw, -innerW / 2, 1);
		makeLeaf("leafR", lw, innerW / 2, -1);
		// kaca berkawat di atas daun (transom)
		const tH = height - header - leafH - 0.08;
		if (tH > 0.2) {
			add(box(scene, root, `${id}_transomBar`, innerW, 0.08, depth * 0.9, 0, leafH + 0.04, 0, M.frame));
			add(box(scene, root, `${id}_transom`, innerW, tH, 0.05, 0, leafH + 0.08 + tH / 2, 0, M.glass));
			add(box(scene, root, `${id}_transomMid`, 0.08, tH, depth * 0.9, 0, leafH + 0.08 + tH / 2, 0, M.frame));
		}
		// rantai dan gembok pada varian terlarang
		if (variant === "hazard") {
			const chain = box(scene, root, `${id}_chain`, innerW * 0.9, 0.05, 0.05, 0, leafH * 0.55, leafThick / 2 + 0.1, M.dark);
			chain.rotation.z = 0.04;
			add(chain);
			add(box(scene, root, `${id}_lock`, 0.16, 0.2, 0.08, 0.0, leafH * 0.5, leafThick / 2 + 0.11, M.brass));
		}
	} else {
		makeLeaf("leaf", innerW, -innerW / 2, 1);
	}

	if (sign) {
		const style = opts.signStyle || {};
		const y = opts.signY ?? height + 0.13;
		signPlate(scene, pool, root, sign, y, opts.signZ ?? depth / 2 + 0.02, { planeW: type === "double" ? 1.5 : 1.2, ...style }).forEach((m) => add(m));
	}

	const dispose = () => meshes.forEach((m) => m.dispose());

	const hd = {
		root,
		meshes,
		leaves,
		isOpen: false,
		// Daun pintu berayun menjauhi pemain; onDone dipanggil setelah selesai.
		open(onDone, seconds = 1.4) {
			if (hd.isOpen) return;
			hd.isOpen = true;
			let t = 0;
			const observer = scene.onBeforeRenderObservable.add(() => {
				t += scene.getEngine().getDeltaTime() / 1000 / seconds;
				const k = ease(Math.min(1, t));
				leaves.forEach((leaf) => {
					leaf.pivot.rotation.y = -leaf.dir * swing * 1.75 * k;
				});
				if (t >= 1) {
					scene.onBeforeRenderObservable.remove(observer);
					if (onDone) onDone();
				}
			});
		},
		dispose,
	};

	anchor.metadata = anchor.metadata || {};
	anchor.metadata.hdDoor = hd;
	anchor.visibility = 0;
	return hd;
}

export const HD_DOOR_DEFAULTS = { gateWidth: 3.1, gateHeight: 4.15 };
export { Vector3 };
