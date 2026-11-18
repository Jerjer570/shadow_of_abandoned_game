import { Vector3 } from "@babylonjs/core";
import { areaAt } from "./AreaMap.js";

/**
 * SEATING SYSTEM: duduk di kursi dan minum dari dispenser (SEMUA di sisi client).
 *
 * Proyek ini belum punya backend (tidak ada server/API/database), jadi seluruh state
 * (sedang duduk, kursi mana yang sudah memicu kejadian, berapa kali minum) disimpan
 * di memori game. Bagian yang nantinya perlu dihubungkan ke backend ditandai
 *   // BACKEND HOOK
 * dan sudah memancarkan event lewat EventSystem ("seat_sat", "seat_stood", "water_drunk"),
 * jadi cukup berlangganan event itu untuk mengirim ke server / menyimpan progres.
 *
 * Perilaku duduk:
 *   - E pada kursi: kamera turun halus ke kursi, menghadap arah kursi, bisa menoleh terbatas.
 *   - E (atau W/A/S/D/Spasi) untuk bangun; pemain berdiri di titik bebas di depan kursi.
 *   - Tidak bisa duduk saat monster mengejar; kalau monster mulai mengejar, pemain langsung dipaksa bangun.
 *   - Horor: duduk terlalu lama memicu kejadian (lampu berkedip, napas di belakang).
 */

const SIT_EYE = 0.68; // tinggi mata di atas lantai saat duduk (berdiri sekitar 0.9)
const FLOOR_Y = 2.52;
const TRANSITION = 0.7; // detik
const YAW_RANGE = (75 * Math.PI) / 180;
const PITCH_RANGE = (38 * Math.PI) / 180;
const SCARE_AFTER = 14; // detik duduk di satu kursi sebelum kejadian

export class SeatingSystem {
	constructor(scene, systems) {
		this.scene = scene;
		this.systems = systems;
		this.camera = null;
		this.isSeated = false;
		this.current = null;
		this.phase = "none"; // "sitting" | "seated" | "standing" | "none"
		this.t = 0;
		this.seatedTime = 0;
		this.scared = new Set(); // BACKEND HOOK: simpan agar kejadian tidak berulang setelah load game
		this.saved = null;
		this.from = null;
		this.drinkCount = 0;

		window.addEventListener("keydown", (e) => {
			if (!this.isSeated || e.repeat) return;
			const k = e.key.toLowerCase();
			if (["w", "a", "s", "d", " "].includes(k)) this.stand();
		});
	}

	get player() {
		return this.systems.playerController;
	}

	ui(text, ms = 3200) {
		this.systems.interactionManager?.showMessage(text, ms);
	}

	// ---------------------------------------------------------------
	// DUDUK
	// ---------------------------------------------------------------

	sit(interactable) {
		if (this.isSeated) return false;
		const monster = this.systems.monsterManager;
		if (monster && ["pending", "spawning", "chasing", "caught"].includes(monster.state)) {
			this.ui("No time to sit. It is coming.", 2200);
			return false;
		}
		const cam = this.scene.activeCamera;
		if (!cam) return false;
		this.camera = cam;
		const d = interactable.data;

		this.current = d;
		this.isSeated = true;
		this.phase = "sitting";
		this.t = 0;
		this.seatedTime = 0;
		this.saved = { applyGravity: cam.applyGravity, checkCollisions: cam.checkCollisions };
		cam.applyGravity = false;
		cam.checkCollisions = false;
		this.from = { pos: cam.position.clone(), yaw: cam.rotation.y, pitch: cam.rotation.x };
		this.target = {
			pos: new Vector3(d.seatPos.x, FLOOR_Y + SIT_EYE, d.seatPos.z),
			yaw: this.nearestYaw(this.from.yaw, d.viewYaw),
		};
		if (this.player) this.player.seated = true;
		this.systems.audioManager.playSound("door_locked", { volume: 0.25 }); // dipakai sebagai bunyi kursi berderit
		// BACKEND HOOK: laporkan pemain duduk (id kursi) bila nanti ada penyimpanan progres
		this.systems.eventSystem.emit("seat_sat", { id: d.id });
		return true;
	}

	// Sudut target yang paling dekat dengan yaw sekarang (hindari berputar 300 derajat).
	nearestYaw(from, to) {
		let diff = Math.atan2(Math.sin(to - from), Math.cos(to - from));
		return from + diff;
	}

	stand() {
		if (!this.isSeated || this.phase === "standing") return false;
		const cam = this.camera;
		this.phase = "standing";
		this.t = 0;
		this.from = { pos: cam.position.clone(), yaw: cam.rotation.y, pitch: cam.rotation.x };
		const s = this.current.standPos;
		this.target = { pos: new Vector3(s.x, FLOOR_Y + 0.9, s.z), yaw: cam.rotation.y };
		return true;
	}

	finishStand() {
		const cam = this.camera;
		cam.applyGravity = this.saved ? this.saved.applyGravity : true;
		cam.checkCollisions = this.saved ? this.saved.checkCollisions : true;
		this.isSeated = false;
		this.phase = "none";
		if (this.player) this.player.seated = false;
		// BACKEND HOOK: laporkan pemain bangun + lama duduk
		this.systems.eventSystem.emit("seat_stood", { id: this.current && this.current.id, seconds: Math.round(this.seatedTime) });
		this.current = null;
	}

	// Pemain tidak boleh tetap duduk saat monster mengejar.
	forceStandIfThreat() {
		const monster = this.systems.monsterManager;
		if (monster && ["pending", "spawning", "chasing", "caught"].includes(monster.state)) {
			this.ui("Get up!", 1800);
			this.stand();
		}
	}

	update(dt) {
		if (!this.isSeated || !this.camera) return;
		const cam = this.camera;

		if (this.phase === "sitting" || this.phase === "standing") {
			this.t += dt / TRANSITION;
			const k = Math.min(1, this.t);
			const e = k * k * (3 - 2 * k);
			cam.position = Vector3.Lerp(this.from.pos, this.target.pos, e);
			cam.rotation.y = this.from.yaw + (this.target.yaw - this.from.yaw) * e;
			if (this.phase === "sitting") cam.rotation.x = this.from.pitch * (1 - e);
			if (k >= 1) {
				if (this.phase === "sitting") this.phase = "seated";
				else this.finishStand();
			}
			return;
		}

		// Duduk: napas halus + batas menoleh
		this.seatedTime += dt;
		const base = this.target.pos;
		cam.position.x = base.x;
		cam.position.z = base.z;
		cam.position.y = base.y + Math.sin(this.seatedTime * 1.6) * 0.012;
		const centerYaw = this.target.yaw;
		const dy = Math.atan2(Math.sin(cam.rotation.y - centerYaw), Math.cos(cam.rotation.y - centerYaw));
		if (Math.abs(dy) > YAW_RANGE) cam.rotation.y = centerYaw + Math.sign(dy) * YAW_RANGE;
		cam.rotation.x = Math.max(-PITCH_RANGE, Math.min(PITCH_RANGE, cam.rotation.x));

		this.forceStandIfThreat();

		// Horor: duduk terlalu lama
		if (this.seatedTime > SCARE_AFTER && this.current && !this.scared.has(this.current.id)) {
			this.scared.add(this.current.id);
			this.scare();
		}
	}

	scare() {
		const env = this.systems.environmentManager;
		env?.flickerLights?.();
		this.systems.audioManager.playSound("heartbeat", { volume: 0.7 });
		this.ui("The chair creaks. Something is breathing behind you.", 4200);
	}

	// ---------------------------------------------------------------
	// DISPENSER AIR MINUM
	// ---------------------------------------------------------------

	drink(interactable) {
		if (this.isSeated) return false;
		const d = interactable.data;
		d.uses = (d.uses || 0) + 1;
		this.drinkCount++;
		const audio = this.systems.audioManager;
		audio.playSound("static", { volume: 0.12 });
		const lines = [
			"The water is cold. It tastes faintly of iron.",
			"Something drips in the jug long after you stop pouring.",
			"The jug is nearly empty, yet the water keeps running.",
		];
		if (d.uses >= 4) {
			this.systems.environmentManager?.flickerLights?.();
			audio.playSound("heartbeat", { volume: 0.6 });
			this.ui("The water runs red for a second. Then it is clear again.", 3800);
		} else {
			this.ui(lines[Math.min(d.uses, lines.length) - 1], 3200);
		}
		// BACKEND HOOK: laporkan jumlah minum (mis. untuk statistik / save game)
		this.systems.eventSystem.emit("water_drunk", { id: d.id, uses: d.uses });
		return true;
	}
}
