import { WING_ORIGINS, HALL_FLOOR_RECTS, AREA_LABELS, areaAt } from "./AreaMap.js";
import { LAB, labMapWalls } from "./LabLayout.js";

/**
 * MISSION MANAGER: daftar misi di HUD (kanan atas) dan peta (tekan M).
 *
 *  - Daftar misi tampil sejak game dimulai dan diperbarui lewat event game
 *    (kunci diambil, pintu dibuka, generator, masuk lab, dst.).
 *  - Misi baru muncul setelah misi prasyaratnya selesai; yang selesai dicoret.
 *  - Tekan J untuk menyembunyikan / menampilkan daftar, tekan M untuk membuka peta.
 *  - Peta menggambar area tempat pemain berada (hall, wing, atau Experiment Chamber),
 *    posisi + arah pemain, pintu, dan titik tujuan misi aktif.
 *
 * Teks misi dan tujuan peta ada di MISSIONS di bawah. Untuk menambah misi, tambahkan
 * satu objek dan panggil complete("id") dari event yang sesuai di bindEvents().
 */

const O = WING_ORIGINS;
const at = (origin, x, z) => ({ x: origin.x + x, z: origin.z + z });
const hall = (x, z) => ({ x, z });

const TOTAL_DOCS = 10;

const MISSIONS = [
	{
		id: "ward_key",
		text: "Find the Ward Gate Key",
		hint: "A desk near where you woke up.",
		target: () => hall(-1.0, -6.2),
	},
	{
		id: "ward_gate",
		text: "Unlock and open the Ward Gate",
		requires: ["ward_key"],
		target: () => hall(1.2, -5.2),
	},
	{
		id: "cell_key",
		text: "Infirmary: find the Cell Block Key",
		hint: "The infirmary door is in the west alcove of the main hall.",
		requires: ["ward_gate"],
		target: (area) => (area === "infirmary" ? at(O.infirmary, 12.4, 8.45) : hall(-1.81, 1.95)),
	},
	{
		id: "cell_door",
		text: "Unlock the Cell Block door",
		hint: "On the west wall of the long north-south hall.",
		requires: ["cell_key"],
		target: () => hall(2.35, -1.6),
	},
	{
		id: "boiler_key",
		text: "Cell Block: find the Boiler Room Key",
		requires: ["cell_door"],
		target: (area) => (area === "cellblock" ? at(O.cellblock, 17.5, -4.0) : hall(2.35, -1.6)),
	},
	{
		id: "fuse",
		text: "Cell Block: find the Generator Fuse",
		requires: ["cell_door"],
		target: (area) => (area === "cellblock" ? at(O.cellblock, 7.5, 7.0) : hall(2.35, -1.6)),
	},
	{
		id: "boiler_door",
		text: "Unlock the Boiler Room door",
		hint: "East wall of the east alcove.",
		requires: ["boiler_key"],
		target: () => hall(10.4, 2.6),
	},
	{
		id: "generator",
		text: "Boiler Room: install the fuse and start the generator",
		requires: ["boiler_door", "fuse"],
		target: (area) => (area === "boiler" ? at(O.boiler, 11.8, 8.6) : hall(10.4, 2.6)),
	},
	{
		id: "restricted_key",
		text: "Find the Restricted Wing Key",
		hint: "A desk in the east alcove of the main hall.",
		requires: ["ward_gate"],
		target: () => hall(8.4, 3.15),
	},
	{
		id: "restricted_gate",
		text: "Open the Restricted Gate (the white door)",
		hint: "It needs the key and the power. Something waits behind it.",
		requires: ["generator", "restricted_key"],
		target: () => hall(7.6, -5.2),
	},
	{
		id: "lab_enter",
		text: "RUN! Hide in the Experiment Chamber",
		hint: "The door in the south wall, just past the gate.",
		requires: ["restricted_gate"],
		target: () => hall(10.2, -6.62),
	},
	{
		id: "exit_key",
		text: "Take the Main Exit Key from the pedestal",
		requires: ["lab_enter"],
		target: (area) => (area === "lab" ? at(O.lab, 18.9, 7.0) : hall(10.2, -6.62)),
	},
	{
		id: "escape",
		text: "Run to the Main Exit and escape!",
		hint: "The door where you woke up, at the far west end.",
		requires: ["exit_key"],
		target: () => hall(-3.82, -5.13),
	},
];

// Peta area wing (bentuk disederhanakan dari WingBuilder): lantai + garis dinding lokal.
function wingMap(area) {
	switch (area) {
		case "infirmary":
			return {
				origin: O.infirmary,
				w: 16,
				d: 9,
				walls: [
					[0, 3, 2.4, 3], [4.2, 3, 11.6, 3], [13.4, 3, 16, 3],
					[8, 3, 8, 9],
				],
				doors: [{ x: 0, z: 1.5, color: "#e8a13c", label: "Hall" }],
			};
		case "cellblock":
			return {
				origin: O.cellblock,
				w: 20,
				d: 12,
				zMin: -4.5,
				walls: [
					[0, 0, 1.7, 0], [3.3, 0, 6.7, 0], [8.3, 0, 11.7, 0], [13.3, 0, 16.7, 0], [18.3, 0, 20, 0],
					[0, 3, 1.7, 3], [3.3, 3, 6.7, 3], [8.3, 3, 11.7, 3], [13.3, 3, 16.7, 3], [18.3, 3, 20, 3],
					[5, -4.5, 5, 0], [10, -4.5, 10, 0], [15, -4.5, 15, 0],
					[5, 3, 5, 7.5], [10, 3, 10, 7.5], [15, 3, 15, 7.5],
				],
				doors: [{ x: 0, z: 1.5, color: "#e8a13c", label: "Hall" }],
			};
		case "boiler":
			return {
				origin: O.boiler,
				w: 14,
				d: 10,
				walls: [[7, 0, 7, 3.6], [7, 6.4, 7, 10]],
				doors: [{ x: 0, z: 5, color: "#e8a13c", label: "Hall" }],
			};
		default:
			return null;
	}
}

export class MissionManager {
	constructor(scene, systems) {
		this.scene = scene;
		this.systems = systems;
		this.done = new Set();
		this.seen = new Set(); // misi yang sudah pernah tampil (untuk pemberitahuan misi baru)
		this.docs = new Set();
		this.panelVisible = true;
		this.mapVisible = false;
		this.mapTimer = 0;
		this.gatesOpen = { ward_gate: false, restricted_gate: false };
		this.finished = false;

		this.buildUI();
		this.bindEvents();
		this.render();

		window.addEventListener("keydown", (e) => {
			if (e.repeat) return;
			const key = e.key.toLowerCase();
			if (key === "m") this.toggleMap();
			if (key === "j") this.togglePanel();
		});

		// Petunjuk tombol untuk pemain baru
		setTimeout(() => this.toast("Press M to open the map, J to hide the objectives."), 9000);
	}

	// ---------------------------------------------------------------
	// UI
	// ---------------------------------------------------------------

	buildUI() {
		const root = document.querySelector(".ui-overlay") || document.body;

		this.panel = document.getElementById("missionPanel");
		if (!this.panel) {
			this.panel = document.createElement("div");
			this.panel.id = "missionPanel";
			root.appendChild(this.panel);
		}

		this.mapPanel = document.getElementById("mapPanel");
		if (!this.mapPanel) {
			this.mapPanel = document.createElement("div");
			this.mapPanel.id = "mapPanel";
			root.appendChild(this.mapPanel);
		}
		this.mapPanel.innerHTML = `
			<div class="map-title"><span id="mapArea">Main Hall</span><span class="map-key">[M] close</span></div>
			<canvas id="mapCanvas" width="360" height="320"></canvas>
			<div class="map-legend">
				<span><i style="background:#ffd24a"></i>You</span>
				<span><i style="background:#ff5a4a"></i>Objective</span>
				<span><i style="background:#e8a13c"></i>Door</span>
				<span><i style="background:#c9c24a"></i>Gate</span>
			</div>
			<div id="mapNote" class="map-note"></div>`;
		this.mapPanel.style.display = "none";
		this.canvas = this.mapPanel.querySelector("#mapCanvas");
		this.ctx = this.canvas.getContext("2d");

		this.toastEl = document.createElement("div");
		this.toastEl.id = "missionToast";
		root.appendChild(this.toastEl);
	}

	toast(text, ms = 4200) {
		this.toastEl.textContent = text;
		this.toastEl.classList.add("show");
		clearTimeout(this.toastTimer);
		this.toastTimer = setTimeout(() => this.toastEl.classList.remove("show"), ms);
	}

	togglePanel() {
		this.panelVisible = !this.panelVisible;
		this.render();
	}

	toggleMap() {
		this.mapVisible = !this.mapVisible;
		this.mapPanel.style.display = this.mapVisible ? "block" : "none";
		if (this.mapVisible) this.drawMap();
	}

	// ---------------------------------------------------------------
	// LOGIKA MISI
	// ---------------------------------------------------------------

	isVisible(m) {
		return (m.requires || []).every((id) => this.done.has(id));
	}

	activeMissions() {
		return MISSIONS.filter((m) => !this.done.has(m.id) && this.isVisible(m));
	}

	complete(id) {
		if (this.done.has(id)) return;
		this.done.add(id);
		this.render();
		this.announceNew();
	}

	announceNew() {
		const fresh = this.activeMissions().filter((m) => !this.seen.has(m.id));
		fresh.forEach((m) => this.seen.add(m.id));
		if (fresh.length) this.toast(`New objective: ${fresh[0].text}`);
	}

	render() {
		const active = this.activeMissions();
		active.forEach((m) => this.seen.add(m.id));
		const completed = MISSIONS.filter((m) => this.done.has(m.id)).slice(-2);

		const docDone = this.docs.size >= TOTAL_DOCS;
		let html = `<div class="mission-title">Objectives <span class="mission-key">[J]</span></div><div id="missionGuide" class="mission-guide"></div>`;
		if (!this.panelVisible) {
			const first = active[0];
			html += `<div class="mission-item active">${first ? "&#9656; " + first.text : this.finished ? "Escaped" : "..."}</div>`;
		} else {
			completed.forEach((m) => {
				html += `<div class="mission-item done"><span class="box">&#10003;</span>${m.text}</div>`;
			});
			active.forEach((m, i) => {
				html += `<div class="mission-item active"><span class="box">&#9633;</span>${m.text}${
					i === 0 && m.hint ? `<div class="hint">${m.hint}</div>` : ""
				}</div>`;
			});
			html += `<div class="mission-item optional ${docDone ? "done" : ""}"><span class="box">${docDone ? "&#10003;" : "&#9633;"}</span>Optional: read documents (${this.docs.size}/${TOTAL_DOCS})</div>`;
		}
		this.panel.innerHTML = html;
		this.panel.style.display = "block";
	}

	bindEvents() {
		const ev = this.systems.eventSystem;

		ev.on("key_collected", (d) => {
			const map = { ward_key: "ward_key", cell_key: "cell_key", boiler_key: "boiler_key", fuse: "fuse", restricted_key: "restricted_key", exit_key: "exit_key" };
			if (d && map[d.id]) this.complete(map[d.id]);
		});
		ev.on("door_opened", (d) => {
			if (d && (d.id === "ward_gate" || d.id === "restricted_gate")) {
				this.gatesOpen[d.id] = true;
				this.complete(d.id);
			}
		});
		ev.on("door_unlocked", (d) => {
			if (!d) return;
			if (d.id === "door_cellblock") this.complete("cell_door");
			if (d.id === "door_boiler") this.complete("boiler_door");
		});
		ev.on("generator_started", () => this.complete("generator"));
		ev.on("portal_used", (d) => {
			if (d && d.id === "door_lab") this.complete("lab_enter");
		});
		ev.on("document_found", (d) => {
			if (d && d.id) {
				this.docs.add(d.id);
				this.render();
				if (this.docs.size === TOTAL_DOCS) this.toast("You have read every document.");
			}
		});
		ev.on("game_escaped", () => {
			this.finished = true;
			this.complete("escape");
		});
	}

	// ---------------------------------------------------------------
	// PETA
	// ---------------------------------------------------------------

	currentTarget(area) {
		const m = this.activeMissions().find((x) => x.target);
		return m ? { mission: m, pos: m.target(area) } : null;
	}

	// Geometri peta untuk satu area: { rects, walls, doors, bounds }
	areaGeometry(area) {
		if (area === "hall") {
			const doors = [
				{ x: -3.9, z: -5.13, color: "#7dff9a", label: "Exit" },
				{ x: -1.9, z: 1.95, color: "#e8a13c", label: "Infirmary" },
				{ x: 2.2, z: -1.6, color: "#e8a13c", label: "Cell Block" },
				{ x: 10.4, z: 2.6, color: "#e8a13c", label: "Boiler" },
				{ x: 10.2, z: -6.7, color: "#e8a13c", label: "Chamber" },
			];
			const gates = [
				{ x: 1.2, z0: -6.7, z1: -3.7, open: this.gatesOpen.ward_gate, label: "Ward Gate" },
				{ x: 7.6, z0: -6.7, z1: -3.7, open: this.gatesOpen.restricted_gate, label: "White Door" },
			];
			return {
				rects: HALL_FLOOR_RECTS,
				walls: [],
				doors,
				gates,
				bounds: { x0: -4.6, x1: 16.2, z0: -9.6, z1: 9.6 },
			};
		}
		if (area === "lab") {
			const o = O.lab;
			const walls = labMapWalls().map(([a, b, c, d]) => [o.x + a, o.z + b, o.x + c, o.z + d]);
			return {
				rects: [{ x0: o.x, z0: o.z, x1: o.x + LAB.w, z1: o.z + LAB.d }],
				walls,
				doors: [{ x: o.x, z: o.z + LAB.backDoor.z, color: "#e8a13c", label: "Hall" }],
				gates: [],
				bounds: { x0: o.x - 0.8, x1: o.x + LAB.w + 0.8, z0: o.z - 0.8, z1: o.z + LAB.d + 0.8 },
			};
		}
		const wm = wingMap(area);
		if (!wm) return null;
		const o = wm.origin;
		const z0 = wm.zMin ?? 0;
		return {
			rects: [{ x0: o.x, z0: o.z + z0, x1: o.x + wm.w, z1: o.z + z0 + wm.d }],
			walls: wm.walls.map(([a, b, c, d]) => [o.x + a, o.z + b, o.x + c, o.z + d]),
			doors: wm.doors.map((d) => ({ ...d, x: o.x + d.x, z: o.z + d.z })),
			gates: [],
			bounds: { x0: o.x - 0.8, x1: o.x + wm.w + 0.8, z0: o.z + z0 - 0.8, z1: o.z + z0 + wm.d + 0.8 },
		};
	}

	drawMap() {
		const cam = this.scene.activeCamera;
		if (!cam || !this.ctx) return;
		const area = areaAt(cam.position.x, cam.position.z);
		const g = this.areaGeometry(area);
		const ctx = this.ctx;
		const W = this.canvas.width, H = this.canvas.height;
		ctx.clearRect(0, 0, W, H);
		ctx.fillStyle = "rgba(6,8,12,0.92)";
		ctx.fillRect(0, 0, W, H);
		this.mapPanel.querySelector("#mapArea").textContent = AREA_LABELS[area] || "Unknown";
		if (!g) return;

		const b = g.bounds;
		const pad = 14;
		const scale = Math.min((W - pad * 2) / (b.x1 - b.x0), (H - pad * 2) / (b.z1 - b.z0));
		const offX = (W - (b.x1 - b.x0) * scale) / 2;
		const offY = (H - (b.z1 - b.z0) * scale) / 2;
		const px = (x) => offX + (x - b.x0) * scale;
		const py = (z) => H - offY - (z - b.z0) * scale; // z naik = ke atas peta

		// lantai
		ctx.fillStyle = "#262a36";
		g.rects.forEach((r) => ctx.fillRect(px(r.x0), py(r.z1), (r.x1 - r.x0) * scale, (r.z1 - r.z0) * scale));
		// garis tepi lantai dan dinding
		ctx.strokeStyle = "#9aa0b4";
		ctx.lineWidth = 2;
		g.rects.forEach((r) => ctx.strokeRect(px(r.x0), py(r.z1), (r.x1 - r.x0) * scale, (r.z1 - r.z0) * scale));
		ctx.lineWidth = 3;
		ctx.strokeStyle = "#7c8296";
		g.walls.forEach(([x0, z0, x1, z1]) => {
			ctx.beginPath();
			ctx.moveTo(px(x0), py(z0));
			ctx.lineTo(px(x1), py(z1));
			ctx.stroke();
		});

		// gerbang
		(g.gates || []).forEach((gt) => {
			ctx.strokeStyle = gt.open ? "#58d68d" : "#c9c24a";
			ctx.lineWidth = 4;
			ctx.setLineDash(gt.open ? [4, 5] : []);
			ctx.beginPath();
			ctx.moveTo(px(gt.x), py(gt.z0));
			ctx.lineTo(px(gt.x), py(gt.z1));
			ctx.stroke();
			ctx.setLineDash([]);
		});

		// pintu
		ctx.font = "10px 'Courier New', monospace";
		g.doors.forEach((d) => {
			ctx.fillStyle = d.color;
			ctx.fillRect(px(d.x) - 4, py(d.z) - 4, 8, 8);
			ctx.fillStyle = "#cfd3e0";
			ctx.fillText(d.label, px(d.x) + 7, py(d.z) + 3);
		});

		// tujuan misi
		const t = this.currentTarget(area);
		const note = this.mapPanel.querySelector("#mapNote");
		if (t) {
			const tArea = areaAt(t.pos.x, t.pos.z);
			if (tArea === area) {
				const pulse = 5 + Math.sin(performance.now() / 220) * 2;
				ctx.fillStyle = "#ff5a4a";
				ctx.beginPath();
				ctx.arc(px(t.pos.x), py(t.pos.z), pulse, 0, Math.PI * 2);
				ctx.fill();
				ctx.strokeStyle = "#ffd0ca";
				ctx.lineWidth = 1.5;
				ctx.beginPath();
				ctx.arc(px(t.pos.x), py(t.pos.z), pulse + 4, 0, Math.PI * 2);
				ctx.stroke();
				note.textContent = t.mission.text;
			} else {
				note.textContent = `${t.mission.text} (${AREA_LABELS[tArea]})`;
			}
		} else {
			note.textContent = "";
		}

		// pemain: segitiga searah pandang (forward = (sin yaw, cos yaw))
		const yaw = cam.rotation.y;
		const cx = px(cam.position.x), cy = py(cam.position.z);
		const dx = Math.sin(yaw), dy = -Math.cos(yaw);
		ctx.fillStyle = "#ffd24a";
		ctx.beginPath();
		ctx.moveTo(cx + dx * 9, cy + dy * 9);
		ctx.lineTo(cx - dx * 5 - dy * 5, cy - dy * 5 + dx * 5);
		ctx.lineTo(cx - dx * 5 + dy * 5, cy - dy * 5 - dx * 5);
		ctx.closePath();
		ctx.fill();
	}

	// Jarak dan arah ke tujuan misi aktif, tampil di bawah judul daftar misi.
	updateGuide(deltaTime) {
		this.guideTimer = (this.guideTimer || 0) + deltaTime;
		if (this.guideTimer < 0.25) return;
		this.guideTimer = 0;
		const el = this.panel.querySelector("#missionGuide");
		const cam = this.scene.activeCamera;
		if (!el || !cam) return;
		const area = areaAt(cam.position.x, cam.position.z);
		const t = this.currentTarget(area);
		if (!t) {
			el.textContent = "";
			return;
		}
		const tArea = areaAt(t.pos.x, t.pos.z);
		if (tArea !== area) {
			el.textContent = `Go to: ${AREA_LABELS[tArea]}`;
			return;
		}
		const dx = t.pos.x - cam.position.x, dz = t.pos.z - cam.position.z;
		const dist = Math.hypot(dx, dz);
		// sudut relatif terhadap arah pandang (forward = (sin yaw, cos yaw))
		const yaw = cam.rotation.y;
		let rel = Math.atan2(dx, dz) - yaw;
		rel = Math.atan2(Math.sin(rel), Math.cos(rel));
		const deg = (rel * 180) / Math.PI;
		const dir = Math.abs(deg) < 25 ? "ahead" : Math.abs(deg) > 150 ? "behind you" : deg > 0 ? "to your right" : "to your left";
		el.textContent = `Target: ${Math.round(dist)} m, ${dir}`;
	}

	update(deltaTime) {
		this.updateGuide(deltaTime);
		if (!this.mapVisible) return;
		this.mapTimer += deltaTime;
		if (this.mapTimer > 0.08) {
			this.mapTimer = 0;
			this.drawMap();
		}
	}
}
