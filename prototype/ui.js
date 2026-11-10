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

export function updateUI(game, nearestDist) {
    const total = game.parts.length;

    let objective;
    if (game.phase === 'won') objective = 'Escaped!';
    else if (game.phase === 'escaping') objective = 'Escaping the planet...';
    else if (game.installed === total) objective = 'Ship repaired. Go to the ship and press <b>E</b> to launch!';
    else if (game.inventory.length > 0) objective = 'Bring the parts back to the ship and press <b>E</b>.';
    else objective = 'Explore the planet and collect the glowing ship parts.';
    setText('objective', objective);

    setText('repair', game.parts.map(p =>
        `<span style="color:rgb(${p.color.map(c => Math.round(c * 255)).join(',')})">${p.installed ? '&#9632;' : '&#9633;'}</span> ${p.name}`
    ).join('<br>') + `<br><small>${game.installed}/${total} installed</small>`);

    setText('inventory', game.inventory.length ? game.inventory.map(p => p.name).join(', ') : '<i>empty</i>');

    setText('scanner', isFinite(nearestDist)
        ? `Nearest part: ${nearestDist.toFixed(1)} m`
        : 'All parts found.');

    const msg = $('message');
    msg.style.display = game.messageTime > 0 ? 'block' : 'none';
    setText('message', game.message);

    const prompt = $('prompt');
    const showPrompt = game.phase === 'explore' && game.nearShip;
    prompt.style.display = showPrompt ? 'block' : 'none';
    if (showPrompt) {
        let t;
        if (game.inventory.length) t = 'Press <b>E</b> to install parts';
        else if (game.installed === total) t = 'Press <b>E</b> to launch!';
        else t = 'Crashed ship';
        setText('prompt', t);
    }

    $('win').style.display = game.phase === 'won' ? 'block' : 'none';
}
