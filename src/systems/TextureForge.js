/**
 * TEXTURE FORGE: pembuat tekstur HD prosedural (tanpa DOM, tanpa Babylon).
 *
 * Semua fungsi mengembalikan buffer { w, h, data } (RGBA, Uint8ClampedArray)
 * sehingga bisa diuji di Node dan baru dibungkus menjadi DynamicTexture di
 * TexturePool.js. Tekstur "tile" bisa diulang mulus (noise periodik).
 */

export function makeRng(seed) {
	let s = seed >>> 0 || 1;
	return () => {
		s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
		return s / 4294967296;
	};
}

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const smooth = (t) => t * t * (3 - 2 * t);
const mix = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => smooth(clamp((x - a) / (b - a)));

// Noise nilai periodik: koordinat u,v dalam 0..1, freq = jumlah sel per tile.
class Noise {
	constructor(seed, size = 64) {
		const r = makeRng(seed);
		this.n = size;
		this.g = new Float32Array(size * size);
		for (let i = 0; i < this.g.length; i++) this.g[i] = r();
	}
	at(u, v, freq) {
		const n = this.n;
		const x = u * freq, y = v * freq;
		const x0 = Math.floor(x), y0 = Math.floor(y);
		const fx = smooth(x - x0), fy = smooth(y - y0);
		const X0 = ((x0 % freq) + freq) % freq % n, X1 = (X0 + 1) % freq % n;
		const Y0 = ((y0 % freq) + freq) % freq % n, Y1 = (Y0 + 1) % freq % n;
		const g = this.g;
		return mix(mix(g[Y0 * n + X0], g[Y0 * n + X1], fx), mix(g[Y1 * n + X0], g[Y1 * n + X1], fx), fy);
	}
	fbm(u, v, base = 4, oct = 5) {
		let a = 0.5, f = base, s = 0, t = 0;
		for (let i = 0; i < oct; i++) {
			s += a * this.at(u, v, Math.min(f, this.n));
			t += a;
			a *= 0.5;
			f *= 2;
		}
		return s / t;
	}
}

export function makeBuf(w, h, r = 0, g = 0, b = 0, a = 255) {
	const data = new Uint8ClampedArray(w * h * 4);
	for (let i = 0; i < data.length; i += 4) {
		data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
	}
	return { w, h, data };
}

function put(buf, x, y, r, g, b, a = 1) {
	if (x < 0 || y < 0 || x >= buf.w || y >= buf.h) return;
	const i = (y * buf.w + x) * 4, d = buf.data;
	d[i] = d[i] + (r - d[i]) * a;
	d[i + 1] = d[i + 1] + (g - d[i + 1]) * a;
	d[i + 2] = d[i + 2] + (b - d[i + 2]) * a;
}

function rect(buf, x0, y0, x1, y1, col, a = 1) {
	for (let y = Math.max(0, y0 | 0); y < Math.min(buf.h, y1 | 0); y++)
		for (let x = Math.max(0, x0 | 0); x < Math.min(buf.w, x1 | 0); x++) put(buf, x, y, col[0], col[1], col[2], a);
}

function disc(buf, cx, cy, rad, col, a = 1) {
	const r2 = Math.ceil(rad + 1);
	for (let y = -r2; y <= r2; y++)
		for (let x = -r2; x <= r2; x++) {
			const d = Math.hypot(x, y);
			if (d <= rad + 1) put(buf, Math.round(cx) + x, Math.round(cy) + y, col[0], col[1], col[2], a * clamp(rad + 0.5 - d + 0.5));
		}
}

function line(buf, x0, y0, x1, y1, width, col, a = 1) {
	const len = Math.hypot(x1 - x0, y1 - y0);
	const steps = Math.max(1, Math.ceil(len));
	for (let i = 0; i <= steps; i++) {
		const t = i / steps;
		disc(buf, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, width / 2, col, a);
	}
}

function add(buf, x, y, v) {
	if (x < 0 || y < 0 || x >= buf.w || y >= buf.h) return;
	const i = (y * buf.w + x) * 4;
	buf.data[i] += v; buf.data[i + 1] += v; buf.data[i + 2] += v;
}

// Peta tinggi (grayscale di channel R) -> peta normal (konvensi Babylon: +Y = atas tekstur).
export function heightToNormal(hb, strength = 2) {
	const { w, h } = hb;
	const out = makeBuf(w, h, 128, 128, 255);
	const H = (x, y) => hb.data[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
	for (let y = 0; y < h; y++)
		for (let x = 0; x < w; x++) {
			const nx = (H(x - 1, y) - H(x + 1, y)) * strength;
			const ny = (H(x, y + 1) - H(x, y - 1)) * strength;
			const l = Math.hypot(nx, ny, 1);
			const i = (y * w + x) * 4;
			out.data[i] = (nx / l * 0.5 + 0.5) * 255;
			out.data[i + 1] = (ny / l * 0.5 + 0.5) * 255;
			out.data[i + 2] = (1 / l * 0.5 + 0.5) * 255;
		}
	return out;
}

// Kotoran, noda dan butiran halus di atas buffer diffuse.
function grime(buf, noise, { amount = 0.4, seed = 1, drips = 0 } = {}) {
	const { w, h, data } = buf;
	const r = makeRng(seed);
	for (let y = 0; y < h; y++)
		for (let x = 0; x < w; x++) {
			const u = x / w, v = y / h;
			const g = noise.fbm(u, v, 3, 5);
			const dirt = smoothstep(0.45, 0.8, g) * amount;
			const grain = (r() - 0.5) * 14;
			const i = (y * w + x) * 4;
			const k = 1 - dirt * 0.65;
			data[i] = data[i] * k + grain; data[i + 1] = data[i + 1] * k + grain; data[i + 2] = data[i + 2] * (k - 0.02) + grain;
		}
	for (let n = 0; n < drips; n++) {
		const x = r() * w, y0 = r() * h * 0.5, len = 40 + r() * h * 0.4;
		line(buf, x, y0, x + (r() - 0.5) * 6, y0 + len, 2 + r() * 4, [60, 48, 36], 0.07 + r() * 0.1);
	}
}

function cracks(buf, count, seed, col = [20, 18, 16], height = null) {
	const r = makeRng(seed);
	for (let c = 0; c < count; c++) {
		let x = r() * buf.w, y = r() * buf.h, a = r() * Math.PI * 2;
		const len = 30 + r() * 140;
		for (let i = 0; i < len; i++) {
			a += (r() - 0.5) * 0.7;
			const nx = x + Math.cos(a) * 2, ny = y + Math.sin(a) * 2;
			line(buf, x, y, nx, ny, 1.2, col, 0.7);
			if (height) line(height, x, y, nx, ny, 2, [0, 0, 0], 0.9);
			x = nx; y = ny;
		}
	}
}

// -----------------------------------------------------------------
// PERMUKAAN TILE
// -----------------------------------------------------------------

export function genPlaster(w, h, { base = [150, 148, 132], under = [92, 84, 72], seed = 11, peel = 0.62 } = {}) {
	const n = new Noise(seed), n2 = new Noise(seed + 7);
	const diff = makeBuf(w, h), height = makeBuf(w, h, 140, 140, 140);
	for (let y = 0; y < h; y++)
		for (let x = 0; x < w; x++) {
			const u = x / w, v = y / h;
			const low = n.fbm(u, v, 3, 6);
			const fine = n2.fbm(u, v, 16, 4);
			const peelMask = smoothstep(peel, peel + 0.05, n.fbm(u, v, 4, 4) * 0.7 + fine * 0.3);
			const tone = 0.82 + low * 0.35 + (fine - 0.5) * 0.12;
			const i = (y * w + x) * 4;
			for (let c = 0; c < 3; c++) diff.data[i + c] = mix(base[c] * tone, under[c] * (0.8 + fine * 0.4), peelMask);
			const hv = 150 + fine * 40 - peelMask * 55 + (low - 0.5) * 20;
			height.data[i] = height.data[i + 1] = height.data[i + 2] = hv;
		}
	grime(diff, n2, { amount: 0.5, seed: seed + 3, drips: Math.floor(w / 40) });
	cracks(diff, Math.floor(w / 200), seed + 5, [24, 22, 20], height);
	return { diff, normal: heightToNormal(height, 2.2) };
}

export function genTileFloor(w, h, { seed = 21, tiles = 8, a = [118, 120, 112], b = [86, 90, 84] } = {}) {
	const n = new Noise(seed), n2 = new Noise(seed + 2);
	const diff = makeBuf(w, h), height = makeBuf(w, h, 200, 200, 200);
	const ts = w / tiles, grout = Math.max(3, w / 200);
	const r = makeRng(seed + 9);
	const tint = [];
	for (let i = 0; i < tiles * tiles; i++) tint.push(0.85 + r() * 0.3);
	for (let y = 0; y < h; y++)
		for (let x = 0; x < w; x++) {
			const tx = Math.floor(x / ts), ty = Math.floor(y / (h / tiles));
			const lx = x - tx * ts, ly = y - ty * (h / tiles);
			const checker = (tx + ty) % 2 ? a : b;
			const t = tint[ty * tiles + tx];
			const u = x / w, v = y / h;
			const dirt = n.fbm(u, v, 4, 5), fine = n2.fbm(u, v, 24, 3);
			const edge = Math.min(lx, ly, ts - lx, h / tiles - ly);
			const isGrout = edge < grout;
			const i = (y * w + x) * 4;
			const k = t * (0.7 + dirt * 0.5) + (fine - 0.5) * 0.15;
			for (let c = 0; c < 3; c++) diff.data[i + c] = isGrout ? 30 + dirt * 20 : checker[c] * k;
			const hv = isGrout ? 90 : 205 + (fine - 0.5) * 30 - (edge < grout * 2 ? 20 : 0);
			height.data[i] = height.data[i + 1] = height.data[i + 2] = hv;
		}
	grime(diff, n, { amount: 0.35, seed: seed + 4 });
	cracks(diff, 4, seed + 6, [16, 15, 14], height);
	return { diff, normal: heightToNormal(height, 2.5) };
}

export function genCeiling(w, h, { seed = 31 } = {}) {
	const n = new Noise(seed);
	const diff = makeBuf(w, h), height = makeBuf(w, h, 190, 190, 190);
	const cell = w / 4;
	for (let y = 0; y < h; y++)
		for (let x = 0; x < w; x++) {
			const lx = x % cell, ly = y % cell;
			const edge = Math.min(lx, ly, cell - lx, cell - ly);
			const u = x / w, v = y / h;
			const st = n.fbm(u, v, 4, 5), fine = n.fbm(u, v, 32, 2);
			const stain = smoothstep(0.55, 0.85, st);
			const i = (y * w + x) * 4;
			const base = 150 + (fine - 0.5) * 30;
			diff.data[i] = edge < 3 ? 40 : base * (1 - stain * 0.45) + stain * 8;
			diff.data[i + 1] = edge < 3 ? 38 : base * (1 - stain * 0.5) + stain * 2;
			diff.data[i + 2] = edge < 3 ? 34 : base * (1 - stain * 0.7);
			height.data[i] = height.data[i + 1] = height.data[i + 2] = edge < 3 ? 60 : 190 + (fine - 0.5) * 60;
		}
	return { diff, normal: heightToNormal(height, 1.6) };
}

export function genMetal(w, h, { seed = 41, base = [118, 122, 126], rust = 0.5 } = {}) {
	const n = new Noise(seed), n2 = new Noise(seed + 1);
	const diff = makeBuf(w, h), height = makeBuf(w, h, 140, 140, 140);
	const r = makeRng(seed + 2);
	for (let y = 0; y < h; y++)
		for (let x = 0; x < w; x++) {
			const u = x / w, v = y / h;
			const streak = n2.at(u, v * 0.02 + 0.0, 64) * 0.5 + n.at(u * 1, v, 2) * 0.1;
			const brushed = n2.at(u * 1, v, 64) - 0.5;
			const rs = smoothstep(1 - rust, 1 - rust + 0.15, n.fbm(u, v, 4, 5) * 0.8 + n2.fbm(u, v, 12, 3) * 0.25);
			const i = (y * w + x) * 4;
			const k = 0.85 + brushed * 0.25 + streak * 0.1;
			diff.data[i] = mix(base[0] * k, 128 * (0.7 + n2.fbm(u, v, 20, 2) * 0.5), rs);
			diff.data[i + 1] = mix(base[1] * k, 62 * (0.7 + n2.fbm(u, v, 20, 2) * 0.5), rs);
			diff.data[i + 2] = mix(base[2] * k, 30, rs);
			const hv = 150 + brushed * 30 + rs * 30 * n2.fbm(u, v, 32, 2);
			height.data[i] = height.data[i + 1] = height.data[i + 2] = hv;
		}
	for (let s = 0; s < 40; s++) {
		const x = r() * w, y = r() * h, a = r() * 0.4 - 0.2;
		line(diff, x, y, x + Math.cos(a) * (20 + r() * 60), y + Math.sin(a) * 8, 1, [190, 190, 190], 0.25);
	}
	return { diff, normal: heightToNormal(height, 1.8) };
}

export function genWood(w, h, { seed = 51, base = [92, 58, 36] } = {}) {
	const n = new Noise(seed), n2 = new Noise(seed + 5);
	const diff = makeBuf(w, h), height = makeBuf(w, h, 140, 140, 140);
	const planks = 4, ph = h / planks;
	for (let y = 0; y < h; y++)
		for (let x = 0; x < w; x++) {
			const u = x / w, v = y / h;
			const p = Math.floor(y / ph), ly = y - p * ph;
			const warp = n.fbm(u, v, 3, 3) * 6;
			const grain = Math.sin((v * planks * 3 + p * 1.7 + warp + n2.fbm(u, v, 8, 3) * 2) * 40) * 0.5 + 0.5;
			const seam = ly < 3 || ly > ph - 3;
			const i = (y * w + x) * 4;
			const k = seam ? 0.25 : 0.7 + grain * 0.35 + (n2.fbm(u, v, 16, 3) - 0.5) * 0.3;
			diff.data[i] = base[0] * k; diff.data[i + 1] = base[1] * k; diff.data[i + 2] = base[2] * k;
			const hv = seam ? 60 : 150 + grain * 40;
			height.data[i] = height.data[i + 1] = height.data[i + 2] = hv;
		}
	grime(diff, n, { amount: 0.3, seed: seed + 3 });
	return { diff, normal: heightToNormal(height, 2) };
}

// -----------------------------------------------------------------
// DAUN PINTU PUTIH (cat putih terkelupas di atas baja berkarat)
// -----------------------------------------------------------------

export function genDoorLeaf(w, h, { seed = 61, paint = [212, 208, 196], hazard = false, windowFrac = [0.16, 0.5, 0.84, 0.72] } = {}) {
	const n = new Noise(seed), n2 = new Noise(seed + 3);
	const diff = makeBuf(w, h), height = makeBuf(w, h, 170, 170, 170);
	const r = makeRng(seed + 8);
	const mxW = w * 0.1, panelTop = h * 0.08, kick = h * 0.16;
	const panels = [
		[mxW, panelTop, w - mxW, h * 0.40],
		[mxW, h * 0.46, w - mxW, h - kick - h * 0.04],
	];
	for (let y = 0; y < h; y++)
		for (let x = 0; x < w; x++) {
			const u = x / w, v = y / h;
			const low = n.fbm(u, v, 3, 5), fine = n2.fbm(u, v, 20, 4);
			const edgeWear = smoothstep(0.1, 0.0, Math.min(u, 1 - u, v, 1 - v)) * 0.6;
			const rustBottom = smoothstep(0.7, 1.0, v) * 0.7;
			const peelN = low * 0.6 + fine * 0.3 + edgeWear * 0.4 + rustBottom * 0.5;
			const peelMask = smoothstep(0.66, 0.72, peelN);
			const tone = 0.86 + low * 0.2 + (fine - 0.5) * 0.1;
			const i = (y * w + x) * 4;
			const rustC = [110 + fine * 40, 58 + fine * 20, 30];
			const steel = [96, 98, 100];
			const under = fine > 0.55 ? rustC : steel;
			for (let c = 0; c < 3; c++) diff.data[i + c] = mix(paint[c] * tone, under[c] * (0.75 + fine * 0.5), peelMask);
			let hv = 170 + (fine - 0.5) * 16 - peelMask * 30;
			// panel timbul
			for (const p of panels) {
				const e = Math.min(x - p[0], p[2] - x, y - p[1], p[3] - y);
				if (e > 0) {
					hv -= 25;
					if (e < 8) hv += (8 - e) * 2.2;
				}
			}
			if (y > h - kick) hv += 12;
			height.data[i] = height.data[i + 1] = height.data[i + 2] = hv;
		}
	// pelat tendang logam
	for (let y = Math.floor(h - kick); y < h; y++)
		for (let x = 0; x < w; x++) {
			const fine = n2.fbm(x / w, y / h, 24, 3);
			const rs = smoothstep(0.55, 0.8, n.fbm(x / w, y / h, 6, 4));
			put(diff, x, y, mix(120, 125, rs) * (0.8 + fine * 0.3), mix(124, 66, rs) * (0.8 + fine * 0.3), mix(128, 34, rs), 0.9);
		}
	rect(diff, 0, h - kick - 4, w, h - kick, [50, 48, 44], 0.8);
	// bekas bingkai panel (garis bayangan)
	panels.forEach((p) => {
		line(diff, p[0], p[1], p[2], p[1], 3, [60, 56, 48], 0.55);
		line(diff, p[0], p[1], p[0], p[3], 3, [60, 56, 48], 0.55);
		line(diff, p[0], p[3], p[2], p[3], 2, [250, 248, 240], 0.45);
		line(diff, p[2], p[1], p[2], p[3], 2, [250, 248, 240], 0.35);
	});
	// jendela pengintai berkawat
	const wx0 = w * 0.3, wx1 = w * 0.7, wy0 = h * 0.12, wy1 = h * 0.26;
	rect(diff, wx0 - 8, wy0 - 8, wx1 + 8, wy1 + 8, [58, 54, 48], 1);
	rect(diff, wx0, wy0, wx1, wy1, [14, 18, 20], 1);
	for (let y = Math.floor(wy0); y < wy1; y++)
		for (let x = Math.floor(wx0); x < wx1; x++) {
			const a = (x + y) % 14, b = (x - y + 4000) % 14;
			if (a < 1.6 || b < 1.6) put(diff, x, y, 104, 108, 108, 0.6);
		}
	rect(diff, wx0, wy0, wx1, wy1, [0, 0, 0], 0);
	// goresan
	for (let s = 0; s < 70; s++) {
		const x = r() * w, y = r() * h, a = r() * Math.PI;
		line(diff, x, y, x + Math.cos(a) * (10 + r() * 50), y + Math.sin(a) * (10 + r() * 50), 1, [70, 66, 60], 0.35);
		line(height, x, y, x + Math.cos(a) * 20, y + Math.sin(a) * 20, 1.5, [110, 110, 110], 0.5);
	}
	// bekas telapak tangan / noda gelap sekitar gagang
	for (let s = 0; s < 6; s++) disc(diff, w * (0.78 + r() * 0.1), h * (0.5 + r() * 0.08), 12 + r() * 20, [70, 52, 40], 0.12);
	// aliran karat dari engsel dan dasar
	for (let s = 0; s < 22; s++) {
		const x = r() * w, y0 = r() * h * 0.7;
		line(diff, x, y0, x + (r() - 0.5) * 8, y0 + 30 + r() * h * 0.3, 2 + r() * 4, [104, 54, 28], 0.1 + r() * 0.18);
	}
	if (hazard) {
		const y0 = h * 0.84, hh = h * 0.045;
		for (let x = -hh; x < w + hh; x += hh * 1.6) {
			for (let k = 0; k < hh; k++) line(diff, x + k, y0, x + k - hh * 0.8, y0 + hh, 1.6, [200, 40, 34], 0.8);
		}
	}
	return { diff, normal: heightToNormal(height, 3) };
}

export function genWireGlass(w, h, { seed = 71 } = {}) {
	const n = new Noise(seed);
	const diff = makeBuf(w, h, 16, 22, 24), height = makeBuf(w, h, 140, 140, 140);
	const step = w / 14;
	for (let y = 0; y < h; y++)
		for (let x = 0; x < w; x++) {
			const u = x / w, v = y / h;
			const dirt = n.fbm(u, v, 4, 5);
			const i = (y * w + x) * 4;
			const k = 0.5 + dirt * 0.9;
			diff.data[i] = 22 * k; diff.data[i + 1] = 30 * k; diff.data[i + 2] = 32 * k;
		}
	for (let k = -14; k < 28; k++) {
		line(diff, k * step, 0, k * step + h, h, 1.6, [120, 126, 126], 0.7);
		line(diff, k * step + h, 0, k * step, h, 1.6, [120, 126, 126], 0.7);
		line(height, k * step, 0, k * step + h, h, 3, [230, 230, 230], 0.9);
		line(height, k * step + h, 0, k * step, h, 3, [230, 230, 230], 0.9);
	}
	return { diff, normal: heightToNormal(height, 2) };
}

// -----------------------------------------------------------------
// MURAL WAJAH TERSENYUM (dinding timur Experiment Chamber)
// -----------------------------------------------------------------

export function genMural(w, h, { seed = 81 } = {}) {
	const { diff, normal } = genPlaster(w, h, { seed, base: [160, 154, 136] });
	const r = makeRng(seed + 1);
	const ink = [14, 10, 10], blood = [92, 10, 10];
	const cx = w * 0.5, cy = h * 0.5, R = h * 0.42;
	// lingkaran wajah (sapuan tebal)
	for (let a = 0; a < Math.PI * 2; a += 0.004) {
		const rr = R * (1 + Math.sin(a * 5 + 1) * 0.015);
		disc(diff, cx + Math.cos(a) * rr * 1.25, cy + Math.sin(a) * rr, 7 + r() * 5, ink, 0.85);
	}
	// mata: dua lonjong gelap
	[-1, 1].forEach((s) => {
		for (let y = -R * 0.2; y < R * 0.2; y += 3)
			for (let x = -R * 0.1; x < R * 0.1; x += 3) {
				if ((x / (R * 0.1)) ** 2 + (y / (R * 0.2)) ** 2 < 1) disc(diff, cx + s * R * 0.5 + x, cy - R * 0.25 + y, 3, ink, 0.9);
			}
	});
	// senyum lebar dengan gigi
	const pts = [];
	for (let t = -1; t <= 1.0001; t += 0.01) pts.push([cx + t * R * 0.95, cy + R * 0.12 + (1 - t * t) * R * 0.45]);
	for (let i = 1; i < pts.length; i++) line(diff, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], 12, ink, 0.9);
	for (let i = 6; i < pts.length - 6; i += 5) line(diff, pts[i][0], pts[i][1] - 4, pts[i][0] + (r() - 0.5) * 6, pts[i][1] - R * 0.18, 5, ink, 0.85);
	// cat merah menetes dari mulut dan mata
	for (let k = 0; k < 40; k++) {
		const p = pts[Math.floor(r() * pts.length)];
		line(diff, p[0], p[1], p[0] + (r() - 0.5) * 6, p[1] + 20 + r() * h * 0.28, 3 + r() * 5, blood, 0.5 + r() * 0.4);
	}
	// coretan tangan di sekeliling
	for (let k = 0; k < 160; k++) {
		const a = r() * Math.PI * 2, d = R * (1.35 + r() * 0.4);
		const x = cx + Math.cos(a) * d * 1.25, y = cy + Math.sin(a) * d;
		line(diff, x, y, x + (r() - 0.5) * 40, y + (r() - 0.5) * 40, 2 + r() * 2, blood, 0.35 + r() * 0.4);
	}
	return { diff, normal };
}

// -----------------------------------------------------------------
// LINGKARAN RITUAL (decal lantai, punya alpha)
// -----------------------------------------------------------------

export function genRitual(size, { seed = 91 } = {}) {
	const mask = makeBuf(size, size, 0, 0, 0, 255);
	const W = [255, 255, 255];
	const n = new Noise(seed);
	const c = size / 2, r = makeRng(seed + 1);
	const ring = (rad, wid) => {
		for (let t = 0; t < Math.PI * 2; t += 0.0015) disc(mask, c + Math.cos(t) * rad, c + Math.sin(t) * rad, wid / 2, W, 1);
	};
	ring(size * 0.46, 10); ring(size * 0.43, 5); ring(size * 0.32, 8); ring(size * 0.2, 5);
	for (let k = 0; k < 12; k++) {
		const a = (k / 12) * Math.PI * 2;
		line(mask, c + Math.cos(a) * size * 0.2, c + Math.sin(a) * size * 0.2, c + Math.cos(a) * size * 0.43, c + Math.sin(a) * size * 0.43, 4, W, 0.9);
		const sx = c + Math.cos(a + 0.26) * size * 0.375, sy = c + Math.sin(a + 0.26) * size * 0.375;
		line(mask, sx - 14, sy - 14, sx + 14, sy + 14, 4, W, 0.9);
		line(mask, sx + 14, sy - 14, sx - 14, sy + 14, 4, W, 0.9);
	}
	for (let tri = 0; tri < 2; tri++) {
		const P = [0, 1, 2].map((i) => {
			const a = ((i * 120 + tri * 60) * Math.PI) / 180 - Math.PI / 2;
			return [c + Math.cos(a) * size * 0.32, c + Math.sin(a) * size * 0.32];
		});
		for (let i = 0; i < 3; i++) line(mask, P[i][0], P[i][1], P[(i + 1) % 3][0], P[(i + 1) % 3][1], 6, W, 0.95);
	}
	const buf = makeBuf(size, size, 150, 20, 18, 0);
	for (let y = 0; y < size; y++)
		for (let x = 0; x < size; x++) {
			const i = (y * size + x) * 4;
			const wear = n.fbm(x / size, y / size, 16, 4);
			buf.data[i + 3] = mask.data[i] * smoothstep(0.25, 0.55, wear + (r() - 0.5) * 0.2);
		}
	return buf;
}

export function genScreen(w, h, { seed = 101, tint = [60, 220, 140] } = {}) {
	const buf = makeBuf(w, h);
	const r = makeRng(seed);
	for (let y = 0; y < h; y++)
		for (let x = 0; x < w; x++) {
			const sc = y % 4 < 2 ? 1 : 0.72;
			const v = (0.25 + r() * 0.6) * sc;
			const band = Math.sin(y / h * 9 + seed) > 0.85 ? 1.4 : 1;
			const i = (y * w + x) * 4;
			buf.data[i] = tint[0] * v * band; buf.data[i + 1] = tint[1] * v * band; buf.data[i + 2] = tint[2] * v * band;
		}
	return buf;
}

export function genChalkboard(w, h, { seed = 111 } = {}) {
	const n = new Noise(seed), r = makeRng(seed);
	const buf = makeBuf(w, h);
	for (let y = 0; y < h; y++)
		for (let x = 0; x < w; x++) {
			const sm = n.fbm(x / w, y / h, 6, 4);
			const i = (y * w + x) * 4;
			buf.data[i] = 30 + sm * 40; buf.data[i + 1] = 44 + sm * 44; buf.data[i + 2] = 40 + sm * 36;
		}
	for (let s = 0; s < 18; s++) disc(buf, r() * w, r() * h, 30 + r() * 80, [150, 156, 150], 0.05);
	rect(buf, 0, 0, w, 10, [70, 48, 30]); rect(buf, 0, h - 10, w, h, [70, 48, 30]);
	rect(buf, 0, 0, 10, h, [70, 48, 30]); rect(buf, w - 10, 0, w, h, [70, 48, 30]);
	return buf;
}

export function genSheet(w, h, { seed = 121 } = {}) {
	const n = new Noise(seed), r = makeRng(seed);
	const buf = makeBuf(w, h);
	for (let y = 0; y < h; y++)
		for (let x = 0; x < w; x++) {
			const fold = Math.sin(x / w * 24 + n.fbm(x / w, y / h, 4, 3) * 4) * 0.5 + 0.5;
			const i = (y * w + x) * 4, k = 0.72 + fold * 0.2 + n.fbm(x / w, y / h, 16, 3) * 0.1;
			buf.data[i] = 205 * k; buf.data[i + 1] = 200 * k; buf.data[i + 2] = 186 * k;
		}
	for (let s = 0; s < 8; s++) disc(buf, r() * w, r() * h, 20 + r() * 50, [96, 14, 12], 0.5);
	return buf;
}
