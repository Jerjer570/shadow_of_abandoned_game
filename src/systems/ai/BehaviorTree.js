/**
 * BEHAVIOR TREE KECIL (tanpa dependency)
 *
 * Node dasar untuk AI entitas: Selector, Sequence, Condition, Action, Inverter, Cooldown.
 * Status yang dikembalikan: SUCCESS, FAILURE, RUNNING.
 *
 * Aturan tick:
 *   - Sequence : children dijalankan berurutan; FAILURE/RUNNING menghentikan sisanya.
 *   - Selector : child pertama yang tidak FAILURE dipakai; RUNNING juga menghentikan.
 *   - Tree     : tick(blackboard) dipanggil dari loop AI (5-10 Hz cukup), blackboard
 *                berisi data dunia (posisi pemain, jarak, timer) dan dibagi ke semua node.
 *
 * Node menyimpan state sendiri (mis. Cooldown), jadi satu instance tree dipakai terus.
 */

export const SUCCESS = "success";
export const FAILURE = "failure";
export const RUNNING = "running";

export class Node {
	constructor(name = "node") {
		this.name = name;
		this.status = null;
	}

	tick() {
		throw new Error(`[BT] node "${this.name}" belum punya tick()`);
	}
}

export class Action extends Node {
	constructor(name, fn) {
		super(name);
		this.fn = fn;
	}

	tick(ctx) {
		this.status = this.fn(ctx) ?? SUCCESS;
		return this.status;
	}
}

export class Condition extends Node {
	constructor(name, fn) {
		super(name);
		this.fn = fn;
	}

	tick(ctx) {
		this.status = this.fn(ctx) ? SUCCESS : FAILURE;
		return this.status;
	}
}

export class Sequence extends Node {
	constructor(name, children) {
		super(name);
		this.children = children;
	}

	tick(ctx) {
		for (const child of this.children) {
			const status = child.tick(ctx);
			if (status !== SUCCESS) {
				this.status = status;
				return status;
			}
		}
		this.status = SUCCESS;
		return SUCCESS;
	}
}

export class Selector extends Node {
	constructor(name, children) {
		super(name);
		this.children = children;
	}

	tick(ctx) {
		for (const child of this.children) {
			const status = child.tick(ctx);
			if (status !== FAILURE) {
				this.status = status;
				return status;
			}
		}
		this.status = FAILURE;
		return FAILURE;
	}
}

export class Inverter extends Node {
	constructor(name, child) {
		super(name);
		this.child = child;
	}

	tick(ctx) {
		const status = this.child.tick(ctx);
		this.status = status === SUCCESS ? FAILURE : status === FAILURE ? SUCCESS : RUNNING;
		return this.status;
	}
}

/**
 * Cooldown: mulai dalam keadaan siap. Setelah child SUCCESS, node menahan `seconds`
 * detik (FAILURE) sebelum boleh jalan lagi. reset() memaksa jeda lebih awal.
 */
export class Cooldown extends Node {
	constructor(name, seconds, child) {
		super(name);
		this.seconds = seconds;
		this.child = child;
		this.remaining = 0;
	}

	reset(seconds = this.seconds) {
		this.remaining = Math.max(0, seconds);
	}

	tick(ctx) {
		this.remaining = Math.max(0, this.remaining - (ctx.dt || 0));
		if (this.remaining > 0) {
			this.status = FAILURE;
			return FAILURE;
		}
		const status = this.child.tick(ctx);
		if (status === SUCCESS) this.remaining = Math.max(0, this.seconds);
		this.status = status;
		return status;
	}
}

export class BehaviorTree {
	constructor(root) {
		this.root = root;
		this.blackboard = {};
		this.status = null;
		this.ticks = 0;
	}

	tick(blackboard = this.blackboard) {
		this.blackboard = blackboard;
		this.ticks++;
		this.status = this.root.tick(blackboard);
		return this.status;
	}
}
