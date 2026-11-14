// camera.js
// Smoothed follow camera built with lookAt(). Toggles between ortho() and perspective().

export class Camera {
    constructor() {
        this.useOrtho = true;
        this.zoom = 6;             // ortho half-height (and distance scale)
        this.currentZoom = 6;
        this.eye = vec3(0, 20, -10);
        this.at = vec3(0, 6, 0);
        this.upv = vec3(0, 1, 0);
        this.snapNext = true;      // jump straight to the target on the first frame / reset
    }

    // target = { pos, up, forward, zoomScale, upOffset, backOffset }
    //   upOffset / backOffset: how far above / behind the target the camera sits.
    //   Normal walking uses a high view (10 up, 7 back); parkour uses a lower one so heights are readable.
    update(dt, target) {
        const z = this.zoom * (target.zoomScale || 1);
        const d = z / 6;
        const upOff = target.upOffset ?? 10, backOff = target.backOffset ?? 7;
        const desiredEye = add(target.pos, add(mult(upOff * d, target.up), mult(-backOff * d, target.forward)));

        const k = this.snapNext ? 1 : 1 - Math.exp(-5 * dt);   // frame-rate independent smoothing
        this.snapNext = false;
        this.eye = mix(this.eye, desiredEye, k);
        this.at = mix(this.at, target.pos, k);
        this.upv = normalize(mix(this.upv, target.up, k));
        this.currentZoom += (z - this.currentZoom) * k;
    }

    viewMatrix() {
        return lookAt(this.eye, this.at, this.upv);
    }

    projectionMatrix(aspect) {
        const z = this.currentZoom;
        return this.useOrtho
            ? ortho(-z * aspect, z * aspect, -z, z, 0.1, 300)
            : perspective(50, aspect, 0.1, 300);
    }
}
