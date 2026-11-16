import { areaAt, AREA_LABELS } from "./AreaMap.js";

const STORAGE_KEY = "soa.checkpoint.v1";
const SAVE_DELAY = 700; // debounce: banyak event beruntun cukup satu kali simpan

/**
 * Checkpoint per area.
 *
 * Menyimpan posisi pemain, item yang sudah diambil, pintu yang sudah dibuka,
 * progres misi/dokumen, dan status listrik ke localStorage. Saat halaman
 * dimuat ulang, restore() mengembalikan semuanya supaya pemain tidak
 * mengulang dari awal.
 */
export class CheckpointManager {
	constructor(scene, systems) {
		this.scene = scene;
		this.systems = systems;
		this.ready = false;
		this.timer = null;
		this.collected = new Set(); // "key:ward_key", "note:doc_...", "battery:battery_3"
		this.openedDoors = new Set();
		this.unlockedDoors = new Set();
		this.generators = new Set();
		this.bindEvents();

		// Jaring pengaman: pemain bisa berjalan jauh tanpa memicu event apa pun.
		this.autoSave = setInterval(() => this.save(), 15000);
	}

	// ---------------------------------------------------------------
	// PENYIMPANAN
	// ---------------------------------------------------------------

	read() {
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			return raw ? JSON.parse(raw) : null;
		} catch {
			return null;
		}
	}

	has() {
		return !!this.read();
	}

	clear() {
		try {
			localStorage.removeItem(STORAGE_KEY);
		} catch {}
	}

	bindEvents() {
		const ev = this.systems.eventSystem;

		ev.on("key_collected", (d) => {
			if (d && d.id) this.collected.add(`key:${d.id}`);
			this.scheduleSave();
		});
		ev.on("battery_collected", (d) => {
			if (d && d.id) this.collected.add(`battery:${d.id}`);
			this.scheduleSave();
		});
		ev.on("note_read", (d) => {
			if (d && d.id) this.collected.add(`note:${d.id}`);
			this.scheduleSave();
		});
		ev.on("document_found", (d) => {
			if (d && d.id) this.collected.add(`note:${d.id}`);
			this.scheduleSave();
		});
		ev.on("door_opened", (d) => {
			if (d && d.id) this.openedDoors.add(d.id);
			this.scheduleSave();
		});
		ev.on("door_unlocked", (d) => {
			if (d && d.id) this.unlockedDoors.add(d.id);
			this.scheduleSave();
		});

		// Generator yang sudah dinyalakan: jangan muncul "mati" lagi setelah reload.
		["generator_started", "generator_activated"].forEach((name) =>
			ev.on(name, (d) => {
				if (d && d.id) this.generators.add(d.id);
				this.scheduleSave();
			})
		);

		// Perubahan penting lain: pindah area, listrik pulih, saklar, pilihan ending.
		["portal_used", "power_restored", "switch_activated", "ending_choice_requested"].forEach((name) =>
			ev.on(name, () => this.scheduleSave())
		);
	}

	scheduleSave() {
		if (!this.ready || this.timer) return;
		this.timer = setTimeout(() => {
			this.timer = null;
			this.save();
		}, SAVE_DELAY);
	}

	snapshot() {
		const cam = this.scene.activeCamera;
		const im = this.systems.interactionManager;
		const mm = this.systems.missionManager;
		const pc = this.systems.playerController;
		const ev = this.systems.eventSystem;

		const inventory = [];
		if (im && im.inventory) {
			im.inventory.forEach((value, key) => inventory.push({ key, type: value.type, data: value.data }));
		}

		return {
			v: 1,
			savedAt: Date.now(),
			pos: { x: +cam.position.x.toFixed(2), y: +cam.position.y.toFixed(2), z: +cam.position.z.toFixed(2) },
			rot: { x: +cam.rotation.x.toFixed(3), y: +cam.rotation.y.toFixed(3) },
			battery: pc ? +pc.batteryLevel.toFixed(1) : 100,
			area: areaAt(cam.position.x, cam.position.z),
			collected: [...this.collected],
			openedDoors: [...this.openedDoors],
			unlockedDoors: [...this.unlockedDoors],
			generators: [...this.generators],
			inventory,
			missions: mm ? [...mm.done] : [],
			docs: mm ? [...mm.docs] : [],
			powerRestored: !!ev.gameState.powerRestored,
			generatorStarted: !!ev.gameState.generatorStarted,
		};
	}

	save() {
		if (!this.ready) return;
		// Jangan timpa checkpoint saat pemain tertangkap atau sudah di layar ending.
		if (document.querySelector(".caught-overlay, .ending-overlay")) return;
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(this.snapshot()));
		} catch (error) {
			console.warn("[Checkpoint] gagal menyimpan checkpoint:", error);
		}
	}

	// ---------------------------------------------------------------
	// PEMULIHAN
	// ---------------------------------------------------------------

	restore() {
		const data = this.read();
		if (!data || data.v !== 1 || !data.pos) {
			// Tidak ada checkpoint: mulai menyimpan sejak sekarang.
			this.ready = true;
			return null;
		}

		const sys = this.systems;
		const im = sys.interactionManager;
		const mm = sys.missionManager;
		const ev = sys.eventSystem;

		// Jangan menyimpan selama proses pemulihan berjalan.
		this.ready = false;

		this.collected = new Set(data.collected || []);
		this.openedDoors = new Set(data.openedDoors || []);
		this.unlockedDoors = new Set(data.unlockedDoors || []);
		this.generators = new Set(data.generators || []);

		if (im) {
			// 1. Buang pickup yang dulu sudah diambil.
			const taken = [];
			im.interactables.forEach((it) => {
				const id = it.data && it.data.id;
				if (id && this.collected.has(`${it.type}:${id}`)) taken.push(it);
			});
			taken.forEach((it) => im.removePickup(it));

			// 2. Kembalikan isi tas.
			if (im.inventory) {
				im.inventory.clear();
				(data.inventory || []).forEach((entry) => {
					im.inventory.set(entry.key, { type: entry.type, data: entry.data });
				});
			}

			// 3. Kembalikan daftar dokumen yang sudah dibaca (HUD + misi opsional).
			if (Array.isArray(im.documentsFound)) {
				im.documentsFound.length = 0;
				(data.docs || []).forEach((id) => im.documentsFound.push(id));
			}

			// 4. Pintu: buka/tandai terbuka sesuai checkpoint.
			im.interactables.forEach((it) => {
				if (it.type !== "door" || !it.data) return;
				const id = it.data.id;
				if (!id) return;
				if (this.unlockedDoors.has(id)) it.data.locked = false;
				if (this.openedDoors.has(id)) {
					it.data.locked = false;
					try {
						im.openDoor(it);
					} catch (error) {
						console.warn("[Checkpoint] gagal membuka pintu", id, error);
					}
				}
			});
		}

		// 4b. Generator yang sudah menyala tetap menyala.
		if (im) {
			im.interactables.forEach((it) => {
				if (it.type !== "generator" || !it.data || !it.data.id) return;
				if (!this.generators.has(it.data.id)) return;
				it.data.isRunning = true;
				it.isActive = false;
				try {
					it.mesh.metadata?.hdGenerator?.start?.();
				} catch {}
			});
		}

		// 5. Progres misi.
		if (mm) {
			mm.done = new Set(data.missions || []);
			mm.docs = new Set(data.docs || []);
			mm.finished = mm.done.has("escape");
			mm.render?.();
		}

		// 6. Listrik & status cerita.
		ev.setGameState({
			powerRestored: !!data.powerRestored,
			generatorStarted: !!data.generatorStarted,
			keysCollected: (data.inventory || []).filter((e) => e.type === "key").length,
			notesRead: (data.docs || []).length,
		});
		if (data.powerRestored) sys.environmentManager?.restorePower?.();

		// 7. Label area di HUD (dipakai juga sebelum pemain melewati pintu berikutnya).
		if (sys.sceneManager) sys.sceneManager.areaLabel = AREA_LABELS[data.area] || null;

		// 8. Posisi & senter pemain.
		const cam = this.scene.activeCamera;
		cam.position.set(data.pos.x, data.pos.y, data.pos.z);
		cam.rotation.x = data.rot ? data.rot.x : 0;
		cam.rotation.y = data.rot ? data.rot.y : 0;
		if (sys.playerController && typeof data.battery === "number") {
			sys.playerController.batteryLevel = data.battery;
		}

		this.ready = true;

		const label = AREA_LABELS[data.area] || "checkpoint";
		sys.interactionManager?.showMessage?.(`Checkpoint restored: ${label}`, 4200);
		return { area: data.area, label };
	}
}
