/**
 * let colorLocation = null;
let isInventorySelected = false;

export function setColorLocation(loc) {
    colorLocation = loc;
}

export function noraVerticesPusher() {
    let inventoryVertices = [
        // 1. The main background rectangle (4 vertices for TRIANGLE_STRIP)
        vec2(-0.5, -1.0), 
        vec2( 0.5, -1.0), 
        vec2(-0.5, -0.8),
        vec2( 0.5, -0.8),

        // 2. Five vertical divider lines for 6 slots (2 vertices per line)
        vec2(-0.33, -1.0), vec2(-0.33, -0.8), // Divider 1
        vec2(-0.17, -1.0), vec2(-0.17, -0.8), // Divider 2
        vec2( 0.00, -1.0), vec2( 0.00, -0.8), // Divider 3 (Middle)
        vec2( 0.17, -1.0), vec2( 0.17, -0.8), // Divider 4
        vec2( 0.33, -1.0), vec2( 0.33, -0.8)  // Divider 5
    ];

    return { positions: flatten(inventoryVertices)};
}

export function noraVerticesDraw(gl, totalVertices) {
    // Draw the main inventory background box
    gl.drawArrays(gl.TRIANGLE_STRIP, totalVertices, 4);

    // Draw the 5 divider lines (10 vertices total)
    gl.drawArrays(gl.LINES, totalVertices + 4, 10);
}

// Wrapped in a function so it doesn't run before the canvas exists!
export function initInventoryClick(canvas) {
    canvas.addEventListener("click", function (event) {
        const rect = canvas.getBoundingClientRect();

        let x = event.clientX - rect.left;
        let y = event.clientY - rect.top;

        let glX = (x / canvas.clientWidth) * 2 - 1;
        let glY = ((canvas.clientHeight - y) / canvas.clientHeight) * 2 - 1;

        if (glX >= -0.5 && glX <= 0.5 && glY >= -1 && glY <= -0.8) {
            isInventorySelected = true;
            console.log("Inventory box clicked and selected!");
        } else {
            isInventorySelected = false;
            console.log("Clicked outside inventory.");
        }
    });
}
    */