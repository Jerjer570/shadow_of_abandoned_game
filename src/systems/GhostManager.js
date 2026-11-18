import {
	Color3,
	MeshBuilder,
	Ray,
	StandardMaterial,
	TransformNode,
	Vector3,
} from "@babylonjs/core";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader.js";
import { areaAt } from "./AreaMap.js";
import {
	Action,
	BehaviorTree,
	Condition,
	FAILURE,
	RUNNING,
	Selector,
	Sequence,
	SUCCESS,
} from "./ai/BehaviorTree.js";

/**
 * GHOST ANCHOR (tahap 2)
 *
 * Ghost memakai model public/assets/models/entity/ghost_entity.glb dan TIDAK memakai
 * pathfinding: ia berpindah antar "anchor" (titik tetap di tiap area) selama pemain
 * tidak melihat ke arah titik itu. Setelah muncul ia menatap pemain, berbisik, lalu
 * memudar. Kalau pemain menatapnya terlalu lurus, ia langsung hilang.
 *
 * Semua keputusan diambil behavior tree (src/systems/ai/BehaviorTree.js); file ini
 * hanya menyediakan blackboard + aksi (pilih anchor, muncul, memudar) dan animasi.
 *
 * Tidak ada tabrakan/interaksi: ghost murni atmosfer dan tidak pernah menangkap pemain.
 */

export const GHOST_CONFIG = {
	path: "/assets/models/entity/",
	file: "ghost_entity.glb",
	height: 1.9, // tinggi akhir ghost (meter)
	armDelay: 20, // detik setelah game mulai sebelum ghost boleh muncul
	cooldown: 20, // jeda antar kemunculan
	holdMin: 2.4,
	holdMax: 4.2,
	fadeIn: 1.0,
	fadeOut: 0.8,
	alpha: 0.9, // opasitas maksimum
	minDistance: 4.0, // jarak anchor dari pemain
	closeDistance: 3.5, // jarak minimum cadangan untuk ruangan sempit (lihat pickAnchor)
	maxDistance: 14.0,
	lookAwayDot: 0.35, // anchor hanya dipilih kalau tidak sedang di depan mata
	stareDot: 0.9, // seberapa lurus pemain menatap ghost
	stareHold: 0.35, // berapa lama tatapan itu dipertahankan
	whisperVolume: 0.75,
	// Jarak minimum ke properti/dinding saat runtime. Anchor yang lebih dekat dibuang.
	anchorClearance: 0.6,
};

/**
 * Titik kemunculan (koordinat dunia).
 *
 * Semua titik ini sudah diukur terhadap collider nyata di scene (tangki, generator,
 * peti, meja, kursi, sekat): jarak terdekat 0.95 m (kursi pos perawat, meja catatan di
 * hall), terjauh 5.0 m (ujung timur hall), sisanya 1.1-1.95 m.
 *
 * PENTING: resolveAnchors() hanya memeriksa PROPERTI. Shell corridor_baru.glb adalah
 * satu mesh besar sehingga AABB-nya mencakup seluruh hall dan tidak bisa dipakai untuk
 * mengukur dinding; karena itu jarak ke dinding hall TIDAK dicek guard. Titik hall yang
 * aman ditentukan manual dari HALL_FLOOR_RECTS (jarak ke tepi koridor >= 1 m).
 *
 * Saat runtime, guard mengukur ulang jarak ke properti (collider setinggi badan ghost;
 * shell koridor dikecualikan) dan membuang anchor yang jaraknya < cfg.anchorClearance,
 * jadi perubahan tata letak prop tidak membuat ghost muncul di dalam properti.
 */
export const ANCHORS = [
	// Hall utama
	{ x: 4.3, z: 6.0 },
	{ x: 4.3, z: -6.6 },
	{ x: 8.3, z: 1.6 },
	{ x: 0.2, z: 1.8 },
	{ x: 14.0, z: -1.6 },
	// Infirmary (60..76, -40..-31); dua titik terakhir di lorong belakang
	{ x: 64.5, z: -35.0 },
	{ x: 73.5, z: -35.5 },
	{ x: 66.4, z: -38.2 },
	{ x: 61.8, z: -38.6 },
	{ x: 73.8, z: -38.6 },
	// Cell Block (60..80, -4.5..7.5); dua titik di koridor depan sel
	{ x: 63.0, z: 5.5 },
	{ x: 70.0, z: 1.5 },
	{ x: 78.5, z: 4.5 },
	{ x: 62.6, z: 1.5 },
	{ x: 74.2, z: 1.5 },
	// Boiler Room (60..74, 40..50) - jauh dari tangki, generator, dan peti
	{ x: 63.5, z: 45.0 },
	{ x: 68.5, z: 44.0 },
	{ x: 72.5, z: 42.5 },
	// Experiment Chamber
	{ x: 104.0, z: -10.0 },
	{ x: 112.0, z: -9.0 },
	{ x: 117.5, z: -16.5 },
];

export class GhostManager {
	constructor(scene, systems) {
		this.scene = scene;
		this.systems = systems;
		this.cfg = { ...GHOST_CONFIG };

		this.pivot = null;
		this.bob = null;
		this.meshes = [];
		this.loaded = false;
		this.loadPromise = null;

		this.phase = "hidden"; // hidden | appearing | holding | vanishing
		this.alpha = 0;
		this.anchor = null;
		this.anchors = [];
		this.anchorsResolved = false;
		this.elapsed = 0;
		this.time = 0;
		this.cooldownLeft = 0;
		this.holdLeft = 0;
		this.stareTime = 0;

		this.tree = this.buildTree();
	}

	// ---------------------------------------------------------------
	// BEHAVIOR TREE
	// ---------------------------------------------------------------

	buildTree() {
		return new BehaviorTree(
			new Selector("ghost-root", [
				// 0) Monster sedang mengejar / pemain dikunci / transisi pintu: ghost menyingkir.
				new Sequence("hide-when-suppressed", [
					new Condition("visible", (c) => c.visible),
					new Condition("suppressed", (c) => c.suppressed),
					new Action("vanish-suppressed", () => this.vanish("suppressed")),
				]),
				// 1) Pemain menatap lurus cukup lama: hilang seketika (efek kaget).
				new Sequence("vanish-when-stared", [
					new Condition("visible", (c) => c.visible),
					new Condition("stared", (c) => c.staredAtGhost),
					new Action("vanish-seen", () => this.vanish("seen")),
				]),
				// 2) Sudah tampil cukup lama: memudar.
				new Sequence("vanish-when-timeout", [
					new Condition("visible", (c) => c.visible),
					new Condition("hold-over", (c) => c.holdLeft <= 0),
					new Action("vanish-soft", () => this.vanish("timeout")),
				]),
				// 3) Masih tampil: tahan (RUNNING supaya cabang lain tidak dijalankan).
				new Sequence("hold", [
					new Condition("visible", (c) => c.visible),
					new Action("stay", () => RUNNING),
				]),
				// 4) Waktunya muncul: pilih anchor lalu muncul di sana.
				new Sequence("appear", [
					new Condition("can-appear", (c) => c.canAppear),
					new Action("pick-anchor", (c) => this.pickAnchor(c)),
					new Action("appear", (c) => this.appear(c)),
				]),
				// 5) Selain itu diam menunggu cooldown.
				new Action("idle", () => SUCCESS),
			])
		);
	}

	// ---------------------------------------------------------------
	// MODEL
	// ---------------------------------------------------------------

	preload() {
		if (!this.loadPromise) this.loadPromise = this.loadModel();
		return this.loadPromise;
	}

	async loadModel() {
		this.pivot = new TransformNode("ghost_pivot", this.scene);
		this.bob = new TransformNode("ghost_bob", this.scene);
		this.bob.parent = this.pivot;

		try {
			const container = await SceneLoader.LoadAssetContainerAsync(
				this.cfg.path,
				this.cfg.file,
				this.scene
			);
			container.addAllToScene();

			const root = container.rootNodes[0];
			root.parent = this.bob;

			this.pivot.computeWorldMatrix(true);
			const bounds = this.getBounds(container.meshes);
			const size = bounds.max.subtract(bounds.min);
			const scale = size.y > 1e-4 && Number.isFinite(size.y) ? this.cfg.height / size.y : 1;
			root.position.set(
				-(bounds.min.x + bounds.max.x) / 2,
				-bounds.min.y,
				-(bounds.min.z + bounds.max.z) / 2
			);
			this.pivot.scaling.setAll(scale);

			container.meshes.forEach((mesh) => {
				this.meshes.push(mesh);
				mesh.isPickable = false;
				mesh.checkCollisions = false;
				mesh.alwaysSelectAsActiveMesh = true;
				const mat = mesh.material;
				if (mat) {
					// Sedikit berpendar supaya tetap terbaca di lorong gelap.
					if (mat.emissiveColor) mat.emissiveColor = new Color3(0.06, 0.1, 0.12);
					mat.backFaceCulling = false;
				}
			});

			container.animationGroups?.forEach((group) => {
				group.stop();
				group.start(true, 0.6);
			});

			console.log(`[Ghost] model dimuat: tinggi asli ${size.y.toFixed(2)} m, skala ${scale.toFixed(3)}`);
		} catch (error) {
			console.warn("[Ghost] model gagal dimuat, placeholder dipakai:", error);
			this.buildPlaceholder();
		}

		this.alpha = 0;
		this.applyAlpha();
		this.pivot.setEnabled(false);
		this.loaded = true;
		return true;
	}

	buildPlaceholder() {
		const mat = new StandardMaterial("ghost_placeholder_mat", this.scene);
		mat.diffuseColor = new Color3(0.5, 0.55, 0.58);
		mat.emissiveColor = new Color3(0.08, 0.12, 0.14);
		mat.specularColor = new Color3(0.05, 0.05, 0.05);
		mat.backFaceCulling = false;

		const body = MeshBuilder.CreateCylinder(
			"ghost_placeholder_body",
			{ height: 1.45, diameter: 0.5, tessellation: 12 },
			this.scene
		);
		body.material = mat;
		body.parent = this.bob;
		body.position.y = 0.75;

		const head = MeshBuilder.CreateSphere(
			"ghost_placeholder_head",
			{ diameter: 0.42, segments: 8 },
			this.scene
		);
		head.material = mat;
		head.parent = this.bob;
		head.position.y = 1.63;

		[body, head].forEach((mesh) => {
			mesh.isPickable = false;
			mesh.checkCollisions = false;
			this.meshes.push(mesh);
		});
		console.warn("[Ghost] memakai placeholder (model ghost_entity.glb tidak terpakai).");
	}

	getBounds(meshes) {
		const bounds = {
			min: new Vector3(Infinity, Infinity, Infinity),
			max: new Vector3(-Infinity, -Infinity, -Infinity),
		};
		meshes.forEach((mesh) => {
			mesh.computeWorldMatrix(true);
			const box = mesh.getBoundingInfo().boundingBox;
			const matrix = mesh.getWorldMatrix();
			for (const x of [box.minimum.x, box.maximum.x]) {
				for (const y of [box.minimum.y, box.maximum.y]) {
					for (const z of [box.minimum.z, box.maximum.z]) {
						const p = Vector3.TransformCoordinates(new Vector3(x, y, z), matrix);
						bounds.min.minimizeInPlace(p);
						bounds.max.maximizeInPlace(p);
					}
				}
			}
		});
		return bounds;
	}

	// ---------------------------------------------------------------
	// AKSI BT
	// ---------------------------------------------------------------

	pickAnchor(bb) {
		const camera = this.scene.activeCamera;
		if (!camera) return FAILURE;
		const playerArea = areaAt(bb.playerPos.x, bb.playerPos.z);
		const forward = camera.getForwardRay().direction;
		const collect = (minDistance) => {
			const found = [];
			for (const anchor of this.anchors) {
				if (areaAt(anchor.x, anchor.z) !== playerArea) continue;
				const dx = anchor.x - bb.playerPos.x;
				const dz = anchor.z - bb.playerPos.z;
				const dist = Math.hypot(dx, dz);
				if (dist < minDistance || dist > this.cfg.maxDistance) continue;
				// Jangan muncul tepat di depan mata.
				if ((forward.x * dx + forward.z * dz) / (dist || 1) > this.cfg.lookAwayDot) continue;
				// Jangan muncul di balik dinding/partisi: pemain cuma akan mendengar bisikan.
				if (!this.hasLineOfSight(camera, anchor)) continue;
				found.push(anchor);
			}
			return found;
		};

		let candidates = collect(this.cfg.minDistance);
		// Ruangan sempit (mis. sel tahanan) sering hanya punya satu anchor yang terlihat dan
		// jaraknya < minDistance. Jarak minimum dilonggarkan, syarat garis pandang tetap.
		if (!candidates.length) candidates = collect(this.cfg.closeDistance);
		if (!candidates.length) return FAILURE;
		this.anchor = candidates[Math.floor(Math.random() * candidates.length)];
		return SUCCESS;
	}

	/**
	 * True kalau tidak ada collider yang menghalangi pandangan dari mata pemain ke dada
	 * ghost. Dipanggil sekali per pemilihan anchor (bukan per frame).
	 */
	hasLineOfSight(camera, anchor) {
		const from = camera.position;
		const dx = anchor.x - from.x;
		const dy = anchor.y + 0.9 - from.y;
		const dz = anchor.z - from.z;
		const dist = Math.hypot(dx, dy, dz);
		if (dist < 0.01) return true;

		const ray = new Ray(from, new Vector3(dx / dist, dy / dist, dz / dist), dist + 0.5);
		const hit = this.scene.pickWithRay(ray, (m) => m.checkCollisions && m.isEnabled());
		// Toleransi kecil supaya permukaan yang menempel di dinding tidak ikut menolak.
		return !hit || !hit.hit || hit.distance >= dist - 0.35;
	}

	appear(bb) {
		const anchor = this.anchor;
		const camera = this.scene.activeCamera;
		if (!anchor || !camera || !this.pivot) return FAILURE;

		this.pivot.position.set(anchor.x, anchor.y, anchor.z);
		const dx = bb.playerPos.x - anchor.x;
		const dz = bb.playerPos.z - anchor.z;
		this.pivot.rotation.y = Math.atan2(dx, dz);
		this.pivot.setEnabled(true);

		this.phase = "appearing";
		this.stareTime = 0;
		this.holdLeft = this.cfg.holdMin + Math.random() * (this.cfg.holdMax - this.cfg.holdMin);

		this.systems.audioManager?.playSound?.("entity_whisper", {
			position: new Vector3(anchor.x, anchor.y + 1.4, anchor.z),
			volume: this.cfg.whisperVolume,
		});
		return SUCCESS;
	}

	vanish(reason) {
		if (this.phase === "hidden" || this.phase === "vanishing") return SUCCESS;
		this.phase = "vanishing";
		this.stareTime = 0;
		this.cooldownLeft = this.cfg.cooldown;
		if (reason === "seen") {
			this.systems.audioManager?.playSound?.("static", { volume: 0.25 });
		}
		return SUCCESS;
	}

	hideNow() {
		this.phase = "hidden";
		this.alpha = 0;
		this.anchor = null;
		this.applyAlpha();
		this.pivot?.setEnabled(false);
	}

	applyAlpha() {
		for (const mesh of this.meshes) {
			if (mesh && !mesh.isDisposed()) mesh.visibility = this.alpha;
		}
	}

	// ---------------------------------------------------------------
	// LOOP
	// ---------------------------------------------------------------

	makeBlackboard(camera, dt) {
		const playerPos = camera.position;
		const ghostPos = this.pivot.position;
		const dx = ghostPos.x - playerPos.x;
		const dz = ghostPos.z - playerPos.z;
		const dist = Math.hypot(dx, dz);
		const forward = camera.getForwardRay().direction;
		const lookDot = dist > 0.01 ? (forward.x * dx + forward.z * dz) / dist : 0;

		const visible =
			this.phase === "appearing" || this.phase === "holding" || this.phase === "vanishing";

		if (this.phase === "appearing" || this.phase === "holding") {
			this.stareTime = lookDot > this.cfg.stareDot && dist < 16 ? this.stareTime + dt : 0;
		} else {
			this.stareTime = 0;
		}

		const monster = this.systems.monsterManager;
		const monsterBusy = !!monster && ["pending", "spawning", "chasing", "caught"].includes(monster.state);
		const frozen = !!this.systems.playerController?.frozen;
		const transitioning = !!this.systems.interactionManager?.transitioning;

		return {
			dt,
			dist,
			lookDot,
			visible,
			suppressed: monsterBusy || frozen || transitioning,
			// Baru dianggap "dilihat" kalau ghost sudah cukup terlihat, supaya efeknya tidak
			// hangus saat ia masih memudar masuk.
			staredAtGhost: this.stareTime > this.cfg.stareHold && this.alpha > 0.55,
			holdLeft: this.holdLeft,
			canAppear:
				this.cooldownLeft <= 0 &&
				this.elapsed >= this.cfg.armDelay &&
				!monsterBusy &&
				!frozen &&
				!transitioning,
			playerPos,
		};
	}

	/**
	 * Ukur ulang semua anchor terhadap properti di scene. Dipanggil sekali setelah model
	 * siap; anchor tanpa lantai atau yang terlalu dekat properti dibuang. Dinding hall
	 * tidak ikut diukur (lihat catatan pada ANCHORS).
	 */
	resolveAnchors() {
		const sm = this.systems.sceneManager;
		const solids = [];
		for (const mesh of this.scene.meshes) {
			// Shell corridor_baru.glb mencakup seluruh hall; jarak ke dinding hall memakai
			// HALL_FLOOR_RECTS saat titik anchor ditentukan, bukan AABB mesh ini.
			if (!mesh.checkCollisions || !mesh.isEnabled()) continue;
			if (/FrontSide|BackSide|corridor/i.test(mesh.name)) continue;
			const bb = mesh.getBoundingInfo().boundingBox;
			solids.push({
				minX: bb.minimumWorld.x,
				maxX: bb.maximumWorld.x,
				minY: bb.minimumWorld.y,
				maxY: bb.maximumWorld.y,
				minZ: bb.minimumWorld.z,
				maxZ: bb.maximumWorld.z,
				name: mesh.name,
			});
		}

		const valid = [];
		for (const anchor of ANCHORS) {
			const y = sm.findFloorY(anchor.x, anchor.z);
			if (typeof y !== "number") {
				console.warn(`[Ghost] anchor (${anchor.x}, ${anchor.z}) dibuang: tidak ada lantai.`);
				continue;
			}

			let clearance = Infinity;
			let nearest = null;
			for (const s of solids) {
				// Hanya collider yang setinggi badan ghost.
				if (s.maxY <= y + 0.3 || s.minY >= y + this.cfg.height) continue;
				const dx = Math.max(s.minX - anchor.x, 0, anchor.x - s.maxX);
				const dz = Math.max(s.minZ - anchor.z, 0, anchor.z - s.maxZ);
				const d = Math.hypot(dx, dz);
				if (d < clearance) {
					clearance = d;
					nearest = s.name;
				}
			}

			if (clearance < this.cfg.anchorClearance) {
				console.warn(
					`[Ghost] anchor (${anchor.x}, ${anchor.z}) dibuang: ${clearance.toFixed(2)} m dari ${nearest}.`
				);
				continue;
			}
			valid.push({ x: anchor.x, y, z: anchor.z });
		}

		this.anchors = valid;
		console.log(`[Ghost] anchor valid: ${valid.length}/${ANCHORS.length}`);
	}

	update(deltaTime) {
		if (!this.loaded || !this.pivot) return;
		const camera = this.scene.activeCamera;
		if (!camera) return;
		if (!this.anchorsResolved) {
			this.resolveAnchors();
			this.anchorsResolved = true;
		}

		const dt = Math.min(Math.max(deltaTime, 0), 0.1);
		this.elapsed += dt;
		this.time += dt;
		this.cooldownLeft = Math.max(0, this.cooldownLeft - dt);

		const visible =
			this.phase === "appearing" || this.phase === "holding" || this.phase === "vanishing";
		if (visible) this.holdLeft = Math.max(0, this.holdLeft - dt);

		this.tree.tick(this.makeBlackboard(camera, dt));

		const fadingIn = this.phase === "appearing";
		const target = fadingIn || this.phase === "holding" ? this.cfg.alpha : 0;
		const speed = 1 / (fadingIn ? this.cfg.fadeIn : this.cfg.fadeOut);
		this.alpha =
			target > this.alpha
				? Math.min(target, this.alpha + speed * dt)
				: Math.max(target, this.alpha - speed * dt);

		if (this.phase === "appearing" && this.alpha >= this.cfg.alpha - 0.001) this.phase = "holding";
		if (this.phase === "vanishing" && this.alpha <= 0.001) this.hideNow();

		this.applyAlpha();
		if (visible) {
			this.bob.position.y = Math.sin(this.time * 1.3) * 0.05;
			this.bob.rotation.y = Math.sin(this.time * 0.7) * 0.06;
		}
	}

	dispose() {
		this.meshes.forEach((mesh) => {
			if (mesh && !mesh.isDisposed()) mesh.dispose();
		});
		this.meshes = [];
		this.pivot?.dispose();
		this.bob?.dispose();
		this.pivot = null;
		this.bob = null;
		this.loaded = false;
	}
}
