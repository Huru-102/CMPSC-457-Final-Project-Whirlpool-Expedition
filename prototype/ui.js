// ui.js
// HTML overlay: objective, repair progress, inventory, scanner, messages, buttons/slider.

const $ = (id) => document.getElementById(id);
const last = {};
function setText(id, html) {
    if (last[id] === html) return;      // only touch the DOM when something changed
    last[id] = html;
    $(id).innerHTML = html;
}

export function initUI(handlers) {
    $('btn-interact').onclick = () => { handlers.onInteract(); $('btn-interact').blur(); };
    $('btn-camera').onclick = () => { handlers.onToggleCamera(); $('btn-camera').blur(); };
    $('btn-reset').onclick = () => { handlers.onReset(); $('btn-reset').blur(); };
    $('btn-again').onclick = () => handlers.onReset();
    $('zoom-slider').oninput = (e) => handlers.onZoom(parseFloat(e.target.value));
}

export function setCameraLabel(useOrtho) {
    $('btn-camera').textContent = 'Camera: ' + (useOrtho ? 'Ortho' : 'Perspective');
}

export function setZoomSlider(z) { $('zoom-slider').value = z; }

// scan = { dist, elsewhere } from gameplay.scanParts; planetName = planet the player is on
export function updateUI(game, scan, planetName) {
    const total = game.parts.length;
    const allCollected = game.parts.every(p => p.collected);

    let objective;
    if (game.phase === 'won') objective = 'Escaped!';
    else if (game.phase === 'escaping') objective = 'Escaping the planet...';
    else if (game.phase === 'geyser' || game.phase === 'flight') objective = 'Hold on tight!';
    else if (game.installed === total) objective = 'Ship repaired. Go to the ship and press <b>E</b> to launch!';
    else if (planetName !== 'Planet 1' && allCollected) objective = 'Step into the glowing <b>steam vent</b> to fly back to the ship.';
    else if (planetName === 'Planet 1' && !isFinite(scan.dist) && scan.elsewhere)
        objective = game.inventory.length
            ? 'Install your parts at the ship (<b>E</b>), then climb the <b>volcano</b>: a part is on ' + scan.elsewhere + '.'
            : 'A part is on ' + scan.elsewhere + '! Jump (<b>Space</b>) up the platforms around the <b>volcano</b> and ride the geyser.';
    else if (game.inventory.length > 0 && planetName === 'Planet 1') objective = 'Bring the parts back to the ship and press <b>E</b>.';
    else objective = 'Explore ' + planetName + ' and collect the glowing ship parts.';
    setText('objective', objective);

    setText('repair', game.parts.map(p =>
        `<span style="color:rgb(${p.color.map(c => Math.round(c * 255)).join(',')})">${p.installed ? '&#9632;' : '&#9633;'}</span> ${p.name}`
    ).join('<br>') + `<br><small>${game.installed}/${total} installed</small>`);

    setText('inventory', game.inventory.length ? game.inventory.map(p => p.name).join(', ') : '<i>empty</i>');

    let scanner;
    if (isFinite(scan.dist)) scanner = `Nearest part: ${scan.dist.toFixed(1)} m`;
    else if (scan.elsewhere) scanner = `No parts here. Signal from <b>${scan.elsewhere}</b>.`;
    else scanner = 'All parts found.';
    setText('scanner', `<small>Location: ${planetName}</small><br>` + scanner);

    const msg = $('message');
    msg.style.display = game.messageTime > 0 ? 'block' : 'none';
    setText('message', game.message);

    const prompt = $('prompt');
    let t = null;
    if (game.phase === 'explore' && game.nearShip) {
        if (game.inventory.length) t = 'Press <b>E</b> to install parts';
        else if (game.installed === total) t = 'Press <b>E</b> to launch!';
        else t = 'Crashed ship';
    } else if (game.phase === 'explore' && game.nearVolcano) {
        t = 'Volcano: <b>Space</b> to jump up the platforms. Reach the top to ride the geyser!';
    }
    prompt.style.display = t ? 'block' : 'none';
    if (t) setText('prompt', t);

    $('win').style.display = game.phase === 'won' ? 'block' : 'none';
}
