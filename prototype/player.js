// player.js
// The astronaut: walking on a spherical planet + hierarchical model with a walk cycle.

import { surfaceFrame, material } from './renderer.js';

const SUIT   = material({ diffuse: [0.92, 0.92, 0.95], specular: [0.4, 0.4, 0.4], shininess: 30 });
const ACCENT = material({ diffuse: [0.95, 0.55, 0.15] });
const VISOR  = material({ diffuse: [0.1, 0.15, 0.3], specular: [1, 1, 1], shininess: 80, emissive: [0.02, 0.05, 0.12] });
const PACK   = material({ diffuse: [0.45, 0.45, 0.55] });

export class Player {
    constructor(planetRadius) {
        this.R = planetRadius;
        this.up = vec3(0, 1, 0);        // direction from planet center to player
        this.forward = vec3(0, 0, 1);   // facing direction, always tangent to the surface
        this.speed = 3.5;               // surface units / second
        this.turnSpeed = 2.6;           // radians / second
        this.walkPhase = 0;
        this.swing = 0;                 // 0..1, how much the limbs swing
        this.visible = true;
    }

    get position() { return mult(this.R, this.up); }

    update(dt, keys, obstacles) {
        const turn = (keys['a'] || keys['arrowleft'] ? 1 : 0) - (keys['d'] || keys['arrowright'] ? 1 : 0);
        const move = (keys['w'] || keys['arrowup'] ? 1 : 0) - (keys['s'] || keys['arrowdown'] ? 1 : 0);

        // Turning: rotate `forward` around `up`
        if (turn !== 0) {
            const a = turn * this.turnSpeed * dt;
            const side = cross(this.up, this.forward);
            this.forward = normalize(add(mult(Math.cos(a), this.forward), mult(Math.sin(a), side)));
        }

        // Walking: rotate both `up` and `forward` around the side axis (moves us along a great circle)
        if (move !== 0) {
            const a = move * this.speed * dt / this.R;
            const c = Math.cos(a), s = Math.sin(a);
            const newUp = normalize(add(mult(c, this.up), mult(s, this.forward)));
            const newFwd = normalize(subtract(mult(c, this.forward), mult(s, this.up)));

            // Simple collision: refuse moves that go deeper into an obstacle's bounding sphere
            const oldPos = this.position, newPos = mult(this.R, newUp);
            const blocked = obstacles.some(o => {
                const dNew = length(subtract(newPos, o.pos));
                const dOld = length(subtract(oldPos, o.pos));
                return dNew < o.radius + 0.35 && dNew < dOld;
            });
            if (!blocked) { this.up = newUp; this.forward = newFwd; }
            this.walkPhase += dt * 9 * move;
        }

        // keep forward exactly perpendicular to up (fix floating-point drift)
        this.forward = normalize(subtract(this.forward, mult(dot(this.forward, this.up), this.up)));

        // ease limb swing in/out
        const target = move !== 0 ? 1 : 0;
        this.swing += (target - this.swing) * Math.min(1, dt * 10);
    }

    // Hierarchical model: torso is the root; head, arms, legs, backpack are children.
    draw(renderer, meshes, stack) {
        if (!this.visible) return;
        const limb = 35 * this.swing * Math.sin(this.walkPhase);     // degrees
        const bob = 0.04 * this.swing * Math.abs(Math.sin(this.walkPhase));

        stack.load(surfaceFrame(this.up, this.forward, this.R));     // place on planet

        // --- torso (root) ---
        stack.mul(translate(0, 0.75 + bob, 0));
        stack.push();
            stack.mul(scale(0.5, 0.6, 0.3));
            renderer.draw(meshes.cube, stack.top, SUIT);
        stack.pop();

        // chest stripe
        stack.push();
            stack.mul(translate(0, 0.1, 0.155));
            stack.mul(scale(0.3, 0.08, 0.02));
            renderer.draw(meshes.cube, stack.top, ACCENT);
        stack.pop();

        // --- head (child of torso) ---
        stack.push();
            stack.mul(translate(0, 0.48, 0));
            stack.push();
                stack.mul(scale(0.24, 0.24, 0.24));
                renderer.draw(meshes.sphere, stack.top, SUIT);
            stack.pop();
            stack.mul(translate(0, 0.02, 0.17));
            stack.mul(scale(0.3, 0.14, 0.12));
            renderer.draw(meshes.cube, stack.top, VISOR);
        stack.pop();

        // --- backpack ---
        stack.push();
            stack.mul(translate(0, 0.05, -0.22));
            stack.mul(scale(0.36, 0.42, 0.16));
            renderer.draw(meshes.cube, stack.top, PACK);
        stack.pop();

        // --- arms: pivot at shoulder, rotate, then hang the limb below the pivot ---
        for (const side of [1, -1]) {
            stack.push();
                stack.mul(translate(0.33 * side, 0.25, 0));
                stack.mul(rotateX(limb * side));
                stack.mul(translate(0, -0.24, 0));
                stack.mul(scale(0.14, 0.48, 0.14));
                renderer.draw(meshes.cube, stack.top, SUIT);
            stack.pop();
        }

        // --- legs: pivot at hip, opposite phase to arms ---
        for (const side of [1, -1]) {
            stack.push();
                stack.mul(translate(0.13 * side, -0.3, 0));
                stack.mul(rotateX(-limb * side));
                stack.mul(translate(0, -0.22, 0));
                stack.push();
                    stack.mul(scale(0.18, 0.45, 0.18));
                    renderer.draw(meshes.cube, stack.top, SUIT);
                stack.pop();
                stack.mul(translate(0, -0.2, 0.04));      // boot (grandchild)
                stack.mul(scale(0.2, 0.08, 0.26));
                renderer.draw(meshes.cube, stack.top, ACCENT);
            stack.pop();
        }
    }
}
