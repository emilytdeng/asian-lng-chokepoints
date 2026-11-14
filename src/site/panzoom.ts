/**
 * Zoom and drag for an SVG figure, by moving its viewBox. Buttons (+, −, reset) sit in the corner.
 * Mouse: drag to pan once zoomed in; ctrl/⌘ + wheel or a trackpad pinch zooms (a plain wheel still scrolls the page).
 * Touch: pinch with two fingers; drag with one once zoomed in. A drag never counts as a click on what's under it.
 */
export function panZoom(svg: SVGSVGElement, holder: HTMLElement) {
  const [x0, y0, W, H] = svg.getAttribute("viewBox")!.split(/[\s,]+/).map(Number);
  let k = 1, cx = x0 + W / 2, cy = y0 + H / 2; // zoom factor and view centre
  const MAX = 6;
  const apply = () => {
    k = Math.min(MAX, Math.max(1, k));
    const w = W / k, h = H / k;
    cx = Math.min(x0 + W - w / 2, Math.max(x0 + w / 2, cx));
    cy = Math.min(y0 + H - h / 2, Math.max(y0 + h / 2, cy));
    svg.setAttribute("viewBox", `${cx - w / 2} ${cy - h / 2} ${w} ${h}`);
    svg.classList.toggle("zoomed", k > 1.001);
    svg.style.touchAction = k > 1.001 ? "none" : "pan-y pinch-zoom";
    reset.disabled = k <= 1.001;
  };
  /** svg units per screen pixel */
  const unit = () => W / k / svg.getBoundingClientRect().width;
  /** zoom by f keeping the point under (clientX, clientY) fixed */
  const zoomAt = (f: number, clientX?: number, clientY?: number) => {
    const r = svg.getBoundingClientRect();
    const px = clientX === undefined ? 0.5 : (clientX - r.left) / r.width, py = clientY === undefined ? 0.5 : (clientY - r.top) / r.height;
    const w = W / k, h = H / k, ax = cx - w / 2 + px * w, ay = cy - h / 2 + py * h;
    k *= f;
    const w2 = W / Math.min(MAX, Math.max(1, k)), h2 = H / Math.min(MAX, Math.max(1, k));
    cx = ax - px * w2 + w2 / 2; cy = ay - py * h2 + h2 / 2;
    apply();
  };

  const bar = document.createElement("div");
  bar.className = "zoombar";
  bar.innerHTML = `<button type="button" aria-label="Zoom in">+</button><button type="button" aria-label="Zoom out">−</button><button type="button" aria-label="Reset zoom">Reset</button>`;
  const [zin, zout, reset] = Array.from(bar.querySelectorAll("button"));
  zin.onclick = () => zoomAt(1.6);
  zout.onclick = () => zoomAt(1 / 1.6);
  reset.onclick = () => { k = 1; cx = x0 + W / 2; cy = y0 + H / 2; apply(); };
  holder.classList.add("zoomable");
  holder.appendChild(bar);

  svg.addEventListener("wheel", (e) => {
    if (!e.ctrlKey && !e.metaKey) return; // plain wheel keeps scrolling the page
    e.preventDefault();
    zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
  }, { passive: false });

  const pts = new Map<number, { x: number; y: number }>();
  let moved = 0, pinch = 0;
  svg.addEventListener("pointerdown", (e) => {
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = 0;
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); }
  });
  svg.addEventListener("pointermove", (e) => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    if (pts.size === 2) {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch > 0) zoomAt(d / pinch, (a.x + b.x) / 2, (a.y + b.y) / 2);
      pinch = d; moved += 10;
      return;
    }
    if (k <= 1.001) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    moved += Math.abs(dx) + Math.abs(dy);
    if (moved > 4) {
      svg.setPointerCapture(e.pointerId);
      svg.classList.add("dragging");
      const u = unit();
      cx -= dx * u; cy -= dy * u;
      apply();
    }
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  });
  const end = (e: PointerEvent) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = 0; svg.classList.remove("dragging"); };
  svg.addEventListener("pointerup", end);
  svg.addEventListener("pointercancel", end);
  // a drag shouldn't also close the strait it started on
  svg.addEventListener("click", (e) => { if (moved > 4) { e.stopPropagation(); e.preventDefault(); moved = 0; } }, true);
  apply();
}
