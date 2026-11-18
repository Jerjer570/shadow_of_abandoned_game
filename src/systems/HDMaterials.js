import { Color3, StandardMaterial } from "@babylonjs/core";
import * as Forge from "./TextureForge.js";

/**
 * MATERIAL HD UNTUK WING (Infirmary, Cell Block, Boiler Room)
 *
 * Tekstur dibuat lewat TexturePool (buffer dari TextureForge) supaya sama kualitasnya
 * dengan Experiment Chamber: diffuse + normal map, tile trilinear + anisotropic.
 *
 * Setiap material bertekstur menyimpan `metadata.tile` (ukuran satu petak tekstur dalam
 * meter). WingBuilder.box() memakai nilai itu untuk membuat faceUV yang mengikuti ukuran
 * dunia, jadi pola bata/plester tidak melar di dinding sepanjang 14 m.
 */

// Satu petak tekstur mewakili berapa meter.
const TILE = { floor: 2.0, wall: 3.0, ceiling: 2.0, metal: 1.0, wood: 1.0 };

export function getHDMaterials(scene, pool) {
	if (!scene || !pool) throw new Error("[HDMaterials] butuh scene dan texturePool");

	const textured = (name, tex, tile, tint, { spec = 0.12, glow = 0.045, bump = true } = {}) => {
		const m = new StandardMaterial(`wing_${name}`, scene);
		m.diffuseTexture = tex.diff || tex;
		if (bump && tex.normal) m.bumpTexture = tex.normal;
		m.diffuseColor = tint;
		m.specularColor = new Color3(spec, spec, spec);
		m.specularPower = 40;
		m.emissiveColor = new Color3(glow, glow, glow);
		m.maxSimultaneousLights = 6;
		m.metadata = { tile };
		return m;
	};

	const flat = (name, color, glow = 0.04, spec = 0.1) => {
		const m = new StandardMaterial(`wing_${name}`, scene);
		m.diffuseColor = color;
		m.emissiveColor = new Color3(color.r * glow, color.g * glow, color.b * glow);
		m.specularColor = new Color3(spec, spec, spec);
		m.maxSimultaneousLights = 6;
		return m;
	};

	const floorTex = pool.pair(
		"wing_floor",
		1024,
		1024,
		() => Forge.genTileFloor(1024, 1024, { seed: 23, a: [110, 106, 98], b: [80, 76, 70] }),
		"#4e4a44"
	);
	const ceilTex = pool.pair("wing_ceiling", 512, 512, () => Forge.genCeiling(512, 512, { seed: 33 }), "#6f6d66");
	const wallTex = pool.pair(
		"wing_wall",
		1024,
		1024,
		() => Forge.genPlaster(1024, 1024, { seed: 13, base: [150, 146, 128], under: [86, 78, 66] }),
		"#8a8578"
	);
	const wardTex = pool.pair(
		"wing_wall_ward",
		1024,
		1024,
		() => Forge.genPlaster(1024, 1024, { seed: 17, base: [176, 182, 170], under: [104, 112, 96] }),
		"#a8b0a2"
	);
	const cellTex = pool.pair(
		"wing_wall_cell",
		1024,
		1024,
		() => Forge.genPlaster(1024, 1024, { seed: 19, base: [118, 112, 96], under: [62, 58, 48], peel: 0.8 }),
		"#5f5a4c"
	);
	const boilerTex = pool.pair(
		"wing_wall_boiler",
		1024,
		1024,
		() => Forge.genPlaster(1024, 1024, { seed: 29, base: [124, 96, 74], under: [66, 44, 32], peel: 0.75 }),
		"#6a4f3c"
	);
	const metalTex = pool.pair(
		"wing_metal",
		512,
		512,
		() => Forge.genMetal(512, 512, { seed: 41, rust: 0.45 }),
		"#6a6c70"
	);
	const rustTex = pool.pair(
		"wing_rust",
		512,
		512,
		() => Forge.genMetal(512, 512, { seed: 47, base: [124, 78, 52], rust: 0.85 }),
		"#6b4327"
	);
	const woodTex = pool.pair(
		"wing_wood",
		512,
		512,
		() => Forge.genWood(512, 512, { seed: 53, base: [88, 62, 40] }),
		"#4f3722"
	);

	const mats = {
		// Lantai & plafon
		floor: textured("floor", floorTex, TILE.floor, new Color3(0.92, 0.9, 0.86), { spec: 0.18, glow: 0.05 }),
		ceiling: textured("ceiling", ceilTex, TILE.ceiling, new Color3(0.8, 0.8, 0.78), { glow: 0.035 }),
		// Dinding: dasar, partisi gelap, lalu varian per ruangan
		wall: textured("wall", wallTex, TILE.wall, new Color3(1, 1, 1), { glow: 0.045 }),
		wallDark: textured("wallDark", wallTex, TILE.wall, new Color3(0.6, 0.58, 0.55), { glow: 0.035 }),
		wallInf: textured("wallInf", wardTex, TILE.wall, new Color3(0.95, 0.98, 0.94), { glow: 0.05 }),
		wallCell: textured("wallCell", cellTex, TILE.wall, new Color3(0.85, 0.82, 0.76), { glow: 0.035 }),
		wallBoiler: textured("wallBoiler", boilerTex, TILE.wall, new Color3(1, 0.95, 0.9), { glow: 0.04 }),
		// Logam & kayu
		metal: textured("metal", metalTex, TILE.metal, new Color3(0.9, 0.93, 0.96), { spec: 0.3, glow: 0.04 }),
		steel: textured("steel", metalTex, TILE.metal, new Color3(0.62, 0.66, 0.7), { spec: 0.38, glow: 0.035 }),
		rust: textured("rust", rustTex, TILE.metal, new Color3(1, 1, 1), { spec: 0.16, glow: 0.05 }),
		wood: textured("wood", woodTex, TILE.wood, new Color3(1, 1, 1), { glow: 0.045 }),
		darkwood: textured("darkwood", woodTex, TILE.wood, new Color3(0.55, 0.5, 0.48), { glow: 0.035 }),
		// Warna rata (tanpa tekstur)
		brass: flat("brass", new Color3(0.7, 0.55, 0.24), 0.12, 0.35),
		black: flat("black", new Color3(0.04, 0.04, 0.045), 0.1, 0.25),
		leather: flat("leather", new Color3(0.22, 0.1, 0.08), 0.14, 0.2),
		sheet: flat("sheet", new Color3(0.64, 0.62, 0.56), 0.16, 0.05),
		paper: flat("paper", new Color3(0.8, 0.78, 0.68), 0.25, 0.02),
		blood: flat("blood", new Color3(0.26, 0.015, 0.015), 0.5, 0.08),
		shadow: flat("shadow", new Color3(0.01, 0.01, 0.01), 0, 0.02),
	};

	const glass = new StandardMaterial("wing_glass", scene);
	glass.diffuseColor = new Color3(0.35, 0.5, 0.55);
	glass.specularColor = new Color3(0.6, 0.6, 0.6);
	glass.alpha = 0.22;
	glass.maxSimultaneousLights = 6;
	mats.glass = glass;

	const glow = new StandardMaterial("wing_glow", scene);
	glow.diffuseColor = new Color3(0.25, 0.95, 0.8);
	glow.emissiveColor = new Color3(0.25, 0.95, 0.8);
	glow.specularColor = Color3.Black();
	glow.maxSimultaneousLights = 6;
	mats.glow = glow;

	return mats;
}
