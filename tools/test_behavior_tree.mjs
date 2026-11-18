// Uji unit BT core tanpa browser: node tools/test_behavior_tree.mjs
import {
	Action,
	BehaviorTree,
	Cooldown,
	Condition,
	FAILURE,
	Inverter,
	RUNNING,
	Selector,
	Sequence,
	SUCCESS,
} from "../src/systems/ai/BehaviorTree.js";

let pass = 0;
let fail = 0;
const check = (name, ok) => {
	if (ok) {
		pass++;
	} else {
		fail++;
		console.log("  ! GAGAL:", name);
	}
};

// 1) Sequence: semua sukses
{
	const calls = [];
	const tree = new BehaviorTree(
		new Sequence("s", [
			new Action("a", () => {
				calls.push("a");
				return SUCCESS;
			}),
			new Action("b", () => {
				calls.push("b");
				return SUCCESS;
			}),
		])
	);
	check("sequence sukses", tree.tick({ dt: 0 }) === SUCCESS && calls.join("") === "ab");
}

// 2) Sequence berhenti saat FAILURE (child berikutnya tidak dipanggil)
{
	let called = false;
	const tree = new BehaviorTree(
		new Sequence("s", [
			new Action("a", () => FAILURE),
			new Action("b", () => {
				called = true;
				return SUCCESS;
			}),
		])
	);
	check("sequence gagal cepat", tree.tick({ dt: 0 }) === FAILURE && !called);
}

// 3) Selector memakai child pertama yang tidak FAILURE
{
	const tree = new BehaviorTree(
		new Selector("sel", [
			new Condition("c1", () => false),
			new Condition("c2", () => true),
			new Action("aksi", () => {
				throw new Error("child setelah sukses tidak boleh dipanggil");
			}),
		])
	);
	check("selector fallback", tree.tick({ dt: 0 }) === SUCCESS);
}

// 4) Inverter membalik status
{
	const tree = new BehaviorTree(new Inverter("inv", new Condition("c", () => true)));
	check("inverter", tree.tick({ dt: 0 }) === FAILURE);
}

// 5) Cooldown: siap di awal, lalu jeda setelah sukses
{
	const tree = new BehaviorTree(new Cooldown("cd", 1.0, new Action("a", () => SUCCESS)));
	check("cooldown siap di awal", tree.tick({ dt: 0.0 }) === SUCCESS);
	check("cooldown menahan", tree.tick({ dt: 0.4 }) === FAILURE);
	check("cooldown masih menahan", tree.tick({ dt: 0.4 }) === FAILURE);
	check("cooldown lepas", tree.tick({ dt: 0.3 }) === SUCCESS);
}

// 6) RUNNING diteruskan lewat Sequence/Selector
{
	const tree = new BehaviorTree(
		new Selector("root", [
			new Sequence("kerja", [
				new Condition("boleh", () => true),
				new Action("tunggu", () => RUNNING),
				new Action("tidak-jalan", () => {
					throw new Error("setelah RUNNING tidak boleh lanjut");
				}),
			]),
		])
	);
	check("running diteruskan", tree.tick({ dt: 0 }) === RUNNING);
}

// 7) Tiruan keputusan ghost: muncul -> tahan -> hilang karena ditatap
{
	const state = { phase: "hidden", cooldown: 0, hold: 0, stared: false, seen: 0, appeared: 0 };
	const visible = () => state.phase === "appearing" || state.phase === "holding";
	const tree = new BehaviorTree(
		new Selector("ghost", [
			new Sequence("vanish-stared", [
				new Condition("visible", visible),
				new Condition("stared", () => state.stared),
				new Action("vanish", () => {
					state.phase = "vanishing";
					state.seen++;
					return SUCCESS;
				}),
			]),
			new Sequence("hold", [
				new Condition("visible", visible),
				new Action("stay", () => RUNNING),
			]),
			new Sequence("appear", [
				new Condition("ready", () => state.cooldown <= 0),
				new Action("appear", () => {
					state.phase = "appearing";
					state.appeared++;
					return SUCCESS;
				}),
			]),
			new Action("idle", () => SUCCESS),
		])
	);

	tree.tick({ dt: 0 });
	check("ghost muncul saat cooldown siap", state.appeared === 1 && state.phase === "appearing");

	state.phase = "holding";
	check("ghost menahan", tree.tick({ dt: 0 }) === RUNNING && state.phase === "holding");

	state.stared = true;
	tree.tick({ dt: 0 });
	check("ghost hilang saat ditatap", state.seen === 1 && state.phase === "vanishing");

	state.cooldown = 5;
	state.phase = "hidden";
	tree.tick({ dt: 0 });
	check("ghost menunggu cooldown", state.phase === "hidden");
}

console.log(`\n${pass} lulus, ${fail} gagal`);
process.exit(fail ? 1 : 0);
