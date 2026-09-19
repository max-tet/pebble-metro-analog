// Weather icons drawn with Poco primitives, so the build needs no image resources.
// Each icon is drawn inside a 24x24 box centred on (cx, cy).

function cloud(render, cx, cy, fg) {
    render.drawCircle(fg, cx - 5, cy, 5, 0, 360);
    render.drawCircle(fg, cx + 3, cy - 3, 7, 0, 360);
    render.fillRectangle(fg, cx - 6, cy, 15, 5);
}

function drops(render, cx, cy, fg, length) {
    for (let dx = -5; dx <= 5; dx += 5)
        render.drawLine(cx + dx, cy + 7, cx + dx - 2, cy + 7 + length, fg, 2);
}

export function drawIcon(render, cx, cy, fg, bg, code, isDay) {
    if (code === 0) {
        if (isDay) {
            render.drawCircle(fg, cx, cy, 6, 0, 360);
            for (let i = 0; i < 8; i++) {
                const a = i * Math.PI / 4;
                const s = Math.sin(a);
                const c = Math.cos(a);
                render.drawLine(
                    Math.round(cx + s * 9), Math.round(cy - c * 9),
                    Math.round(cx + s * 12), Math.round(cy - c * 12), fg, 2);
            }
        } else {
            render.drawCircle(fg, cx, cy, 9, 0, 360);
            render.drawCircle(bg, cx + 5, cy - 5, 8, 0, 360);
        }
        return;
    }
    if (code <= 2) {
        render.drawCircle(fg, cx - 4, cy - 7, 5, 0, 360);
        cloud(render, cx + 1, cy + 2, fg);
        return;
    }
    if (code === 3) {
        cloud(render, cx, cy, fg);
        return;
    }
    if (code <= 48) {
        for (let i = 0; i < 4; i++)
            render.drawLine(cx - 9, cy - 6 + i * 5, cx + 9, cy - 6 + i * 5, fg, 2);
        return;
    }
    if (code <= 57) {
        cloud(render, cx, cy - 3, fg);
        drops(render, cx, cy - 3, fg, 3);
        return;
    }
    if (code <= 67 || (code >= 80 && code <= 82)) {
        cloud(render, cx, cy - 3, fg);
        drops(render, cx, cy - 3, fg, 6);
        return;
    }
    if (code <= 77 || code === 85 || code === 86) {
        cloud(render, cx, cy - 3, fg);
        for (let dx = -5; dx <= 5; dx += 5)
            render.drawCircle(fg, cx + dx, cy + 8, 2, 0, 360);
        return;
    }
    cloud(render, cx, cy - 4, fg);
    render.drawLine(cx + 2, cy + 3, cx - 3, cy + 9, fg, 2);
    render.drawLine(cx - 3, cy + 9, cx + 3, cy + 9, fg, 2);
    render.drawLine(cx + 3, cy + 9, cx - 2, cy + 14, fg, 2);
}
