// geometry.js
// Our own vertex data (positions, normals, texture coordinates) + VAO/VBO creation + procedural textures.

// ---------- Upload to GPU ----------
// data = { positions: [[x,y,z,1],...], normals: [[x,y,z],...], texCoords: [[u,v],...] }
export function createMesh(gl, renderer, data, mode = gl.TRIANGLES) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const n = data.positions.length;
    const normals = data.normals || data.positions.map(() => [0, 1, 0]);
    const texCoords = data.texCoords || data.positions.map(() => [0, 0]);

    attach(gl, renderer.attribs.position, data.positions, 4);
    attach(gl, renderer.attribs.normal, normals, 3);
    attach(gl, renderer.attribs.texCoord, texCoords, 2);

    gl.bindVertexArray(null);
    return { vao, count: n, mode };
}

function attach(gl, loc, arr, size) {
    if (loc < 0) return;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(arr), gl.STATIC_DRAW);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(loc);
}

// ---------- Sphere by recursive tetrahedron subdivision (Ch. 6) ----------
export function sphereData(subdivisions) {
    const positions = [], normals = [], texCoords = [];

    const a = vec4(0.0, 0.0, -1.0, 1);
    const b = vec4(0.0, 0.942809, 0.333333, 1);
    const c = vec4(-0.816497, -0.471405, 0.333333, 1);
    const d = vec4(0.816497, -0.471405, 0.333333, 1);

    function uvOf(p) {
        const u = 0.5 - Math.atan2(p[2], p[0]) / (2 * Math.PI);   // minus so images are not mirrored
        const v = 0.5 + Math.asin(Math.max(-1, Math.min(1, p[1]))) / Math.PI;
        return [u, v];
    }

    function triangle(p1, p2, p3) {
        const uvs = [uvOf(p1), uvOf(p2), uvOf(p3)];
        // fix the texture seam where u wraps from 1 back to 0
        const us = uvs.map(t => t[0]);
        if (Math.max(...us) - Math.min(...us) > 0.5) uvs.forEach(t => { if (t[0] < 0.5) t[0] += 1.0; });
        for (const [p, t] of [[p1, uvs[0]], [p2, uvs[1]], [p3, uvs[2]]]) {
            positions.push([p[0], p[1], p[2], 1.0]);
            normals.push([p[0], p[1], p[2]]);        // on a unit sphere, normal == position
            texCoords.push(t);
        }
    }

    function divide(p1, p2, p3, count) {
        if (count > 0) {
            const ab = normalize(mix(p1, p2, 0.5), true);
            const ac = normalize(mix(p1, p3, 0.5), true);
            const bc = normalize(mix(p2, p3, 0.5), true);
            divide(p1, ab, ac, count - 1);
            divide(ab, p2, bc, count - 1);
            divide(bc, p3, ac, count - 1);
            divide(ab, bc, ac, count - 1);
        } else {
            triangle(p1, p2, p3);
        }
    }

    divide(a, b, c, subdivisions);
    divide(d, c, b, subdivisions);
    divide(a, d, b, subdivisions);
    divide(a, c, d, subdivisions);

    return { positions, normals, texCoords };
}

// ---------- Unit cube centered at origin ----------
export function cubeData() {
    const v = [
        [-.5, -.5,  .5], [ .5, -.5,  .5], [ .5,  .5,  .5], [-.5,  .5,  .5],
        [-.5, -.5, -.5], [ .5, -.5, -.5], [ .5,  .5, -.5], [-.5,  .5, -.5],
    ];
    const faces = [
        { idx: [0, 1, 2, 3], n: [ 0,  0,  1] },
        { idx: [1, 5, 6, 2], n: [ 1,  0,  0] },
        { idx: [5, 4, 7, 6], n: [ 0,  0, -1] },
        { idx: [4, 0, 3, 7], n: [-1,  0,  0] },
        { idx: [3, 2, 6, 7], n: [ 0,  1,  0] },
        { idx: [4, 5, 1, 0], n: [ 0, -1,  0] },
    ];
    const quadUV = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const positions = [], normals = [], texCoords = [];
    for (const f of faces) {
        for (const k of [0, 1, 2, 0, 2, 3]) {        // two triangles per face
            const p = v[f.idx[k]];
            positions.push([p[0], p[1], p[2], 1.0]);
            normals.push(f.n);
            texCoords.push(quadUV[k]);
        }
    }
    return { positions, normals, texCoords };
}

// ---------- 3D five-point star (collectible ship parts) ----------
export function starData(points = 5, outer = 0.5, inner = 0.22, rimZ = 0.08, tipZ = 0.2) {
    const rim = [];
    for (let i = 0; i < points * 2; i++) {
        const ang = Math.PI / 2 + i * Math.PI / points;
        const r = (i % 2 === 0) ? outer : inner;
        rim.push([r * Math.cos(ang), r * Math.sin(ang)]);
    }
    const tris = [];
    const n = rim.length;
    const front = [0, 0, tipZ], back = [0, 0, -tipZ];
    for (let i = 0; i < n; i++) {
        const p = rim[i], q = rim[(i + 1) % n];
        const pf = [p[0], p[1], rimZ], qf = [q[0], q[1], rimZ];
        const pb = [p[0], p[1], -rimZ], qb = [q[0], q[1], -rimZ];
        tris.push([front, pf, qf]);       // front face (CCW from +z)
        tris.push([back, qb, pb]);        // back face (CCW from -z)
        tris.push([pf, pb, qb]);          // side walls (outward)
        tris.push([pf, qb, qf]);
    }
    return flatShaded(tris);
}

// Computes one normal per triangle (faceted look).
function flatShaded(tris) {
    const positions = [], normals = [], texCoords = [];
    for (const [a, b, c] of tris) {
        const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        let nx = u[1] * v[2] - u[2] * v[1];
        let ny = u[2] * v[0] - u[0] * v[2];
        let nz = u[0] * v[1] - u[1] * v[0];
        const len = Math.hypot(nx, ny, nz) || 1;
        nx /= len; ny /= len; nz /= len;
        for (const p of [a, b, c]) {
            positions.push([p[0], p[1], p[2], 1.0]);
            normals.push([nx, ny, nz]);
            texCoords.push([p[0] + 0.5, p[1] + 0.5]);
        }
    }
    return { positions, normals, texCoords };
}

// ---------- Starfield points on a big sphere ----------
export function starfieldData(count, radius, rand = Math.random) {
    const positions = [];
    for (let i = 0; i < count; i++) {
        const z = rand() * 2 - 1;
        const t = rand() * Math.PI * 2;
        const s = Math.sqrt(1 - z * z);
        positions.push([radius * s * Math.cos(t), radius * z, radius * s * Math.sin(t), 1.0]);
    }
    return { positions };
}

// ---------- Procedural textures (no image files needed, so no CORS issues) ----------
function hash(i, j, seed) {
    const h = Math.sin(i * 127.1 + j * 311.7 + seed * 74.7) * 43758.5453;
    return h - Math.floor(h);
}

// Tileable value noise
function valueNoise(x, y, freq, seed) {
    const fx = x * freq, fy = y * freq;
    const i0 = Math.floor(fx), j0 = Math.floor(fy);
    const tx = fx - i0, ty = fy - j0;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const w = (i) => ((i % freq) + freq) % freq;
    const h00 = hash(w(i0), w(j0), seed), h10 = hash(w(i0 + 1), w(j0), seed);
    const h01 = hash(w(i0), w(j0 + 1), seed), h11 = hash(w(i0 + 1), w(j0 + 1), seed);
    const top = h00 + (h10 - h00) * sx;
    const bot = h01 + (h11 - h01) * sx;
    return top + (bot - top) * sy;
}

function uploadTexture(gl, size, data) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    return tex;
}

// ---------- Image textures (custom art) ----------
// Loads an image file (png/jpg) into a texture.
// Images load asynchronously, so we return `fallback` right away and draw with it until the
// image arrives. Then we upload the image INTO THE SAME texture object, so every material that
// already points at it switches over automatically. If the file can't load, the fallback stays.
export function loadImageTexture(gl, url, fallback) {
    const tex = fallback || uploadTexture(gl, 1, new Uint8Array([255, 0, 255, 255])); // magenta = "missing"
    const img = new Image();
    img.onload = () => {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);    // images are stored top-down; GL's v goes bottom-up
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.generateMipmap(gl.TEXTURE_2D);                 // WebGL 2 allows any image size, not just powers of 2
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        console.log(`Loaded texture ${url} (${img.width}x${img.height})`);
    };
    img.onerror = () => console.warn(`Could not load texture "${url}", keeping the placeholder. Check the path, and make sure you're using a local server.`);
    img.src = url;
    return tex;
}

export function makeRockTexture(gl, size = 256) {
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const u = x / size, v = y / size;
            let n = 0.5 * valueNoise(u, v, 8, 1) + 0.25 * valueNoise(u, v, 16, 2)
                  + 0.125 * valueNoise(u, v, 32, 3) + 0.0625 * valueNoise(u, v, 64, 4);
            n = n / 0.9375;
            const k = (y * size + x) * 4;
            data[k]     = 90 + 150 * n;
            data[k + 1] = 80 + 130 * n;
            data[k + 2] = 100 + 140 * n;
            data[k + 3] = 255;
        }
    }
    return uploadTexture(gl, size, data);
}

export function makeHullTexture(gl, size = 128) {
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const seam = (x % 32 < 2) || (y % 32 < 2);
            const rivet = ((x % 32) - 6) ** 2 + ((y % 32) - 6) ** 2 < 4;
            let c = 220 - 30 * hash(Math.floor(x / 32), Math.floor(y / 32), 9);
            if (seam) c = 120;
            if (rivet) c = 160;
            const k = (y * size + x) * 4;
            data[k] = c; data[k + 1] = c; data[k + 2] = c + 10; data[k + 3] = 255;
        }
    }
    return uploadTexture(gl, size, data);
}
