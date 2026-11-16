import { HemisphericLight, DirectionalLight, SpotLight, PointLight, Light, Color3, Vector3,
         ParticleSystem, Texture, Animation, MeshBuilder } from '@babylonjs/core';
import { areaAt, AREA_LIGHT_GROUP } from './AreaMap.js';

/**
 * KESEIMBANGAN PENCAHAYAAN
 * Hall (corridor_baru.glb, material PBR), wing (material standar) dan Experiment Chamber
 * dihitung berbeda oleh mesin render, jadi masing-masing punya pengaturan sendiri.
 *   ambient    : cahaya dasar area (0 = gelap total)
 *   lampScale  : pengali semua lampu langit-langit di area itu
 * Ubah angka di sini kalau satu area terasa terlalu terang / gelap. Saat bermain
 * juga bisa disetel langsung: 1/2 = hall redup/terang, 3/4 = wing, 5/6 = lab.
 */
// Suasana in-game dibuat lebih gelap: ambient turun ~35% dan lampu diredupkan.
export const LIGHT_BALANCE = {
    hall: { ambient: 0.12, lampScale: 0.75 },
    wing: { ambient: 0.09, lampScale: 0.65 },
    lab:  { ambient: 0.08, lampScale: 0.65 },
};

// Lampu langit-langit hall: [x, z, intensitas, jangkauan, warna]. Tinggi lampu: 6.0 (plafon 6.66).
// Semua berada DI DALAM ruang yang bisa dilalui (diambil dari denah lantai model).
const HALL_LAMPS = [
    ['west',     -1.6, -5.2, 0.70, 10, [1.0, 0.93, 0.78]],
    ['junction',  4.2, -5.2, 0.80, 12, [1.0, 0.93, 0.78]],
    ['east',     10.8, -4.5, 0.75, 11, [1.0, 0.90, 0.75]],
    ['north',     4.2,  3.5, 0.80, 13, [1.0, 0.93, 0.78]],
];
const HALL_LAMP_Y = 6.0;

export class EnvironmentManager {
    constructor(scene, systems) {
        this.scene = scene;
        this.systems = systems;
        this.lights = [];
        this.areaLamps = { hall: [], infirmary: [], cellblock: [], boiler: [], lab: [] };
        this.ambient = null;
        this.currentArea = 'hall';
        this.userScale = { hall: 1, wing: 1, lab: 1 };
        this.powerBoost = 1;
        this.powerBoostTarget = 1;
        this.particleSystems = [];
        this.flickerInterval = null;
        this.powerRestored = false;
        this.ambientTarget = LIGHT_BALANCE.hall.ambient;

        this.setupBasicLighting();
        this.createAtmosphericEffects();
        this.setupTuningKeys();
    }

    // ---------------------------------------------------------------
    // LAMPU PER AREA
    // ---------------------------------------------------------------

    group(area) {
        return AREA_LIGHT_GROUP[area] || 'hall';
    }

    // Intensitas akhir sebuah lampu = dasar x pengali area x pengaturan pemain.
    effective(light) {
        const meta = light.metadata || {};
        const group = this.group(meta.area);
        const boost = meta.area === 'hall' ? this.powerBoost : 1;
        return (meta.base ?? 0.5) * LIGHT_BALANCE[group].lampScale * this.userScale[group] * boost;
    }

    /**
     * Membuat lampu titik untuk sebuah area. Hanya lampu area tempat pemain berada yang
     * dinyalakan, jadi batas jumlah lampu per material tidak pernah habis oleh area lain.
     */
    createAreaLamp(area, name, position, base, range, color) {
        const light = new PointLight(name, position, this.scene);
        light.falloffType = Light.FALLOFF_STANDARD; // peluruhan linear, sama untuk PBR dan material standar
        light.range = range;
        light.diffuse = color || new Color3(1, 0.9, 0.7);
        light.specular = new Color3(0.1, 0.1, 0.1);
        light.metadata = { base, area };
        light.intensity = 0;
        this.areaLamps[area].push(light);
        this.lights.push(light);
        light.setEnabled(area === this.currentArea);
        light.intensity = this.effective(light);
        return light;
    }

    allLamps() {
        return Object.values(this.areaLamps).flat().filter((l) => l && !l.isDisposed());
    }

    activeLamps() {
        return this.areaLamps[this.currentArea].filter((l) => l && !l.isDisposed());
    }

    refreshIntensities() {
        this.allLamps().forEach((l) => {
            l.setEnabled(l.metadata.area === this.currentArea);
            l.intensity = this.effective(l);
        });
    }

    setActiveArea(area) {
        if (area === this.currentArea) return;
        this.currentArea = area;
        this.ambientTarget = LIGHT_BALANCE[this.group(area)].ambient * this.userScale[this.group(area)];
        this.refreshIntensities();
    }

    setupBasicLighting() {
        // Dipanggil saat awal dan setiap memuat scene. Lampu lama sudah dibuang SceneManager.
        this.lights = [];
        Object.keys(this.areaLamps).forEach((k) => (this.areaLamps[k] = []));

        const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), this.scene);
        ambient.diffuse = new Color3(0.58, 0.6, 0.74);
        ambient.groundColor = new Color3(0.2, 0.17, 0.17);
        ambient.specular = Color3.Black();
        ambient.intensity = LIGHT_BALANCE.hall.ambient;
        this.ambient = ambient;
        this.lights.push(ambient);
        this.currentArea = 'hall';
        this.ambientTarget = LIGHT_BALANCE.hall.ambient;

        HALL_LAMPS.forEach(([name, x, z, base, range, color]) => {
            this.createAreaLamp('hall', `hall_${name}`, new Vector3(x, HALL_LAMP_Y, z), base, range, new Color3(...color));
        });
    }

    setupTuningKeys() {
        // 1/2 hall, 3/4 wing, 5/6 lab: kurangi / tambah 15% (hasil dicetak di konsol)
        const map = { '1': ['hall', 1 / 1.15], '2': ['hall', 1.15], '3': ['wing', 1 / 1.15], '4': ['wing', 1.15], '5': ['lab', 1 / 1.15], '6': ['lab', 1.15] };
        window.addEventListener('keydown', (e) => {
            const m = map[e.key];
            if (!m) return;
            const [group, k] = m;
            this.userScale[group] = Math.min(4, Math.max(0.25, this.userScale[group] * k));
            this.ambientTarget = LIGHT_BALANCE[this.group(this.currentArea)].ambient * this.userScale[this.group(this.currentArea)];
            this.refreshIntensities();
            console.log(`[Light] ${group} x${this.userScale[group].toFixed(2)} (ubah LIGHT_BALANCE di EnvironmentManager.js agar permanen)`);
        });
    }

        setupDimLighting() {
        this.clearLights();
        
        // Minimal ambient
        const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), this.scene);
        ambient.intensity = 0.05;
        ambient.diffuse = new Color3(0.3, 0.3, 0.4);
        this.lights.push(ambient);
        
        // Single overhead light
        const overhead = new SpotLight('overhead', 
            new Vector3(0, 3.5, 0), 
            new Vector3(0, -1, 0), 
            Math.PI / 3, 2, this.scene);
        overhead.intensity = 0.3;
        overhead.diffuse = new Color3(0.8, 0.7, 0.5);
        this.lights.push(overhead);
    }
    
    setupFlickeringLights() {
        this.clearLights();
        
        // Dim ambient
        const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), this.scene);
        ambient.intensity = 0.03;
        ambient.diffuse = new Color3(0.2, 0.2, 0.3);
        this.lights.push(ambient);
        
        // Flickering corridor lights
        const positions = [
            new Vector3(0, 3.5, -8),
            new Vector3(0, 3.5, -3),
            new Vector3(0, 3.5, 3),
            new Vector3(0, 3.5, 8)
        ];
        
        positions.forEach((pos, index) => {
            const light = new SpotLight(`flicker_${index}`, 
                pos, 
                new Vector3(0, -1, 0), 
                Math.PI / 4, 2, this.scene);
            light.intensity = 0.2;
            light.diffuse = new Color3(0.9, 0.8, 0.6);
            this.lights.push(light);
        });
        
        this.startFlickering();
    }
    
    setupEmergencyLighting() {
        this.clearLights();
        
        // Red emergency ambient
        const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), this.scene);
        ambient.intensity = 0.08;
        ambient.diffuse = new Color3(0.4, 0.1, 0.1);
        this.lights.push(ambient);
        
        // Emergency exit lights
        const exitLight1 = new SpotLight('exit1', 
            new Vector3(-5, 3, 8), 
            new Vector3(0, -1, 0.2), 
            Math.PI / 6, 1, this.scene);
        exitLight1.intensity = 0.4;
        exitLight1.diffuse = new Color3(1, 0.2, 0.2);
        this.lights.push(exitLight1);
        
        const exitLight2 = new SpotLight('exit2', 
            new Vector3(5, 3, 8), 
            new Vector3(0, -1, -0.2), 
            Math.PI / 6, 1, this.scene);
        exitLight2.intensity = 0.4;
        exitLight2.diffuse = new Color3(1, 0.2, 0.2);
        this.lights.push(exitLight2);
    }
    
    startFlickering() {
        if (this.flickerInterval) {
            clearInterval(this.flickerInterval);
        }
        
        this.flickerInterval = setInterval(() => {
            this.lights.forEach(light => {
                if (light.name.includes('flicker')) {
                    // Random flicker
                    if (Math.random() < 0.3) {
                        const originalIntensity = light.intensity;
                        light.intensity = Math.random() * 0.1;
                        
                        setTimeout(() => {
                            light.intensity = originalIntensity;
                        }, 50 + Math.random() * 200);
                    }
                }
            });
        }, 1000 + Math.random() * 2000);
    }
    
    flickerLights() {
        // Aman dipanggil berulang (dua listener memanggilnya sekaligus): semua lampu
        // selalu dikembalikan ke intensitas efektif, bukan ke nilai sementara.
        const lamps = this.activeLamps();
        lamps.forEach((l) => (l.intensity = 0));
        setTimeout(() => lamps.forEach((l) => !l.isDisposed() && (l.intensity = this.effective(l) * 0.3)), 50);
        setTimeout(() => this.refreshIntensities(), 160);
    }
    
    createAtmosphericEffects() {
        this.createDustParticles();
        this.createFogEffect();
    }
    
    createDustParticles() {
        const dustSystem = new ParticleSystem('dust', 200, this.scene);
        
        // Dust texture (create simple white texture)
        dustSystem.particleTexture = new Texture('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', this.scene);
        
        // Emitter
        dustSystem.emitter = this.scene.activeCamera;
        dustSystem.minEmitBox = new Vector3(-10, -2, -10);
        dustSystem.maxEmitBox = new Vector3(10, 4, 10);
        
        // Particle properties
        dustSystem.color1 = new Color3(0.8, 0.8, 0.7);
        dustSystem.color2 = new Color3(0.6, 0.6, 0.5);
        dustSystem.colorDead = new Color3(0.4, 0.4, 0.3);
        
        dustSystem.minSize = 0.01;
        dustSystem.maxSize = 0.05;
        dustSystem.minLifeTime = 5;
        dustSystem.maxLifeTime = 15;
        dustSystem.emitRate = 20;
        
        // Movement
        dustSystem.direction1 = new Vector3(-0.1, -0.1, -0.1);
        dustSystem.direction2 = new Vector3(0.1, 0.1, 0.1);
        dustSystem.minEmitPower = 0.1;
        dustSystem.maxEmitPower = 0.3;
        dustSystem.updateSpeed = 0.01;
        
        dustSystem.gravity = new Vector3(0, -0.1, 0);
        
        dustSystem.start();
        this.particleSystems.push(dustSystem);
    }
    
    createFogEffect() {
        // Enhanced fog for horror atmosphere
        this.scene.fogEnabled = true;
        this.scene.fogMode = 3; // FOGMODE_EXP2
        this.scene.fogColor = new Color3(0.08, 0.08, 0.12);
        this.scene.fogDensity = 0.015;
        this.scene.fogStart = 5.0;
        this.scene.fogEnd = 30.0;
    }
    
    restorePower() {
        // Listrik menyala: lampu hall naik bertahap (tanpa lampu global yang menerangi semua area).
        this.powerRestored = true;
        this.powerBoostTarget = 1.35;
        this.powerRestoreDone = false;
    }
    
    startChaseSequence() {
        // Dramatic lighting changes for chase
        this.lights.forEach(light => {
            if (!light.name.includes('flashlight')) {
                // Strobe effect
                let strobeCount = 0;
                const strobeInterval = setInterval(() => {
                    light.intensity = light.intensity > 0 ? 0 : 0.8;
                    strobeCount++;
                    
                    if (strobeCount > 10) {
                        clearInterval(strobeInterval);
                        light.intensity = 0.1; // Dim after strobe
                    }
                }, 200);
            }
        });
        
        // Add red warning lights
        this.addChaseWarningLights();
    }
    
    addChaseWarningLights() {
        const warningPositions = [
            new Vector3(-3, 3, 0),
            new Vector3(3, 3, 0),
            new Vector3(0, 3, -5),
            new Vector3(0, 3, 5)
        ];
        
        warningPositions.forEach((pos, index) => {
            const warningLight = new SpotLight(`chase_warning_${index}`, 
                pos, 
                new Vector3(0, -1, 0), 
                Math.PI / 4, 2, this.scene);
            warningLight.intensity = 0.6;
            warningLight.diffuse = new Color3(1, 0, 0);
            this.lights.push(warningLight);
            
            // Pulsing animation: 0.6 -> 0.1 berulang (loopmode CYCLE).
            // Jangan kirim callback sebagai easingFunction: Babylon akan memanggil easingFunction.ease().
            Animation.CreateAndStartAnimation(
                `pulse_${index}`, warningLight, 'intensity',
                30, 60, 0.6, 0.1, Animation.ANIMATIONLOOPMODE_CYCLE
            );
        });
    }
    
    lockDoorsInArea(area) {
        // Find and lock doors in the current area
        this.systems.interactionManager.interactables.forEach(interactable => {
            if (interactable.type === 'door') {
                interactable.data.locked = true;
                interactable.data.chaseMode = true;
            }
        });
    }
    
    startEntityPursuit() {
        // Create entity presence effects
        this.createEntityEffects();
        
        // Start pursuit audio
        this.systems.audioManager.playAmbient('entity_pursuit');
        
        // Periodic entity encounters
        this.entityPursuitInterval = setInterval(() => {
            const playerPos = this.scene.activeCamera.position;
            const entityPos = playerPos.add(new Vector3(
                (Math.random() - 0.5) * 10,
                0,
                (Math.random() - 0.5) * 10
            ));
            
            this.systems.eventSystem.emit('entity_encounter', {
                position: entityPos,
                intensity: 2
            });
        }, 3000 + Math.random() * 2000);
    }
    
    createEntityEffects() {
        // Shadow particles
        const shadowSystem = new ParticleSystem('shadows', 100, this.scene);
        shadowSystem.particleTexture = new Texture('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAFfeTFYmwAAAABJRU5ErkJggg==', this.scene);
        
        shadowSystem.emitter = this.scene.activeCamera;
        shadowSystem.minEmitBox = new Vector3(-5, 0, -5);
        shadowSystem.maxEmitBox = new Vector3(5, 3, 5);
        
        shadowSystem.color1 = new Color3(0.1, 0.1, 0.1);
        shadowSystem.color2 = new Color3(0.05, 0.05, 0.05);
        shadowSystem.colorDead = new Color3(0, 0, 0);
        
        shadowSystem.minSize = 0.5;
        shadowSystem.maxSize = 2.0;
        shadowSystem.minLifeTime = 2;
        shadowSystem.maxLifeTime = 5;
        shadowSystem.emitRate = 30;
        
        shadowSystem.start();
        this.particleSystems.push(shadowSystem);
    }
    
    clearLights() {
        this.lights.forEach(light => {
            if (light.name !== 'flashlight') {
                light.dispose();
            }
        });
        this.lights = this.lights.filter(light => light.name === 'flashlight');
        
        if (this.flickerInterval) {
            clearInterval(this.flickerInterval);
            this.flickerInterval = null;
        }
    }
    
    update(deltaTime) {
        const cam = this.scene.activeCamera;
        if (cam) {
            this.setActiveArea(areaAt(cam.position.x, cam.position.z));

            // Cahaya dasar bergeser halus saat pindah area
            if (this.ambient) {
                const k = Math.min(1, deltaTime * 4);
                this.ambient.intensity += (this.ambientTarget - this.ambient.intensity) * k;
            }
        }

        if (this.powerBoost !== this.powerBoostTarget) {
            const step = deltaTime * 0.35;
            this.powerBoost += Math.sign(this.powerBoostTarget - this.powerBoost) * Math.min(step, Math.abs(this.powerBoostTarget - this.powerBoost));
            this.refreshIntensities();
            if (this.powerBoost === this.powerBoostTarget && !this.powerRestoreDone) {
                this.powerRestoreDone = true;
                this.systems.eventSystem.emit('power_fully_restored');
            }
        }

        // Debu mengikuti pemain
        this.particleSystems.forEach(system => {
            if (system.emitter === this.scene.activeCamera) {
                system.minEmitBox = this.scene.activeCamera.position.add(new Vector3(-5, -1, -5));
                system.maxEmitBox = this.scene.activeCamera.position.add(new Vector3(5, 2, 5));
            }
        });
    }
    
    dispose() {
        this.clearLights();
        
        this.particleSystems.forEach(system => {
            system.dispose();
        });
        this.particleSystems = [];
        
        if (this.entityPursuitInterval) {
            clearInterval(this.entityPursuitInterval);
        }
    }
}