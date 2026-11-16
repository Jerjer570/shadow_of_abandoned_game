import { DynamicTexture, Texture } from "@babylonjs/core";

/**
 * TEXTURE POOL
 *
 * Membungkus buffer dari TextureForge menjadi DynamicTexture. Pembuatan tekstur
 * HD butuh beberapa detik kalau dilakukan sekaligus, jadi dikerjakan satu per satu
 * di latar belakang (antrean setTimeout). Tekstur langsung bisa dipakai material;
 * isinya terisi begitu generatornya selesai (sementara berisi warna dasar).
 *
 * Kualitas: mipmap trilinear + anisotropic 16x supaya tetap tajam saat dilihat
 * miring (lantai, dinding lorong).
 */
export class TexturePool {
	constructor(scene) {
		this.scene = scene;
		this.cache = new Map();
		this.queue = [];
		this.running = false;
		this.maxAniso = 16;
	}

	create(name, w, h, fallback, hasAlpha = false) {
		const tex = new DynamicTexture(name, { width: w, height: h }, this.scene, true, Texture.TRILINEAR_SAMPLINGMODE);
		tex.anisotropicFilteringLevel = this.maxAniso;
		tex.hasAlpha = hasAlpha;
		tex.wrapU = Texture.WRAP_ADDRESSMODE;
		tex.wrapV = Texture.WRAP_ADDRESSMODE;
		const ctx = tex.getContext();
		if (!hasAlpha) {
			ctx.fillStyle = fallback;
			ctx.fillRect(0, 0, w, h);
		}
		tex.update();
		return tex;
	}

	upload(tex, buf, post) {
		const ctx = tex.getContext();
		ctx.putImageData(new ImageData(buf.data, buf.w, buf.h), 0, 0);
		if (post) post(ctx, buf.w, buf.h);
		tex.update(true);
	}

	schedule(job) {
		this.queue.push(job);
		if (!this.running) {
			this.running = true;
			setTimeout(() => this.pump(), 50);
		}
	}

	pump() {
		const job = this.queue.shift();
		if (!job) {
			this.running = false;
			return;
		}
		try {
			job();
		} catch (error) {
			console.warn("[TexturePool] gagal membuat tekstur:", error);
		}
		setTimeout(() => this.pump(), 16);
	}

	/**
	 * Tekstur diffuse + normal dari satu generator ({diff, normal}).
	 * Hasilnya disimpan per key, jadi pemanggilan berikutnya memakai tekstur yang sama.
	 */
	pair(key, w, h, generator, fallback = "#777") {
		if (this.cache.has(key)) return this.cache.get(key);
		const diff = this.create(`${key}_diff`, w, h, fallback);
		const normal = this.create(`${key}_nrm`, w, h, "#8080ff");
		const entry = { diff, normal };
		this.cache.set(key, entry);
		this.schedule(() => {
			const out = generator();
			this.upload(diff, out.diff);
			this.upload(normal, out.normal);
		});
		return entry;
	}

	/** Satu tekstur (buffer langsung dari generator). post(ctx,w,h) opsional untuk menggambar teks. */
	single(key, w, h, generator, { fallback = "#555", hasAlpha = false, post = null } = {}) {
		if (this.cache.has(key)) return this.cache.get(key);
		const tex = this.create(key, w, h, fallback, hasAlpha);
		this.cache.set(key, tex);
		this.schedule(() => this.upload(tex, generator(), post));
		return tex;
	}

	/** Papan teks kecil (dibuat langsung karena murah). */
	sign(key, text, { w = 512, h = 128, bg = "#1b1b1b", fg = "#e9e4d2", font = "bold 64px 'Courier New', monospace", border = "#777" } = {}) {
		if (this.cache.has(key)) return this.cache.get(key);
		const tex = this.create(key, w, h, bg);
		const ctx = tex.getContext();
		ctx.fillStyle = bg;
		ctx.fillRect(0, 0, w, h);
		ctx.strokeStyle = border;
		ctx.lineWidth = 6;
		ctx.strokeRect(5, 5, w - 10, h - 10);
		ctx.fillStyle = fg;
		ctx.font = font;
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillText(text, w / 2, h / 2 + 3, w - 30);
		tex.update(true);
		this.cache.set(key, tex);
		return tex;
	}
}
