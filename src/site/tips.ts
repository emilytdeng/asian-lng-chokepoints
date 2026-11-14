/**
 * Fast hover tooltips for an SVG figure. Any element with a `data-tip` attribute shows that text next to the pointer
 * (mouse hover, or a tap on touch screens). Native <title> tooltips on those elements are removed so they don't double up.
 */
let box: HTMLDivElement | null = null;
const tipBox = () => {
  if (!box) {
    box = document.createElement("div");
    box.className = "tip";
    box.setAttribute("role", "tooltip");
    box.hidden = true;
    document.body.appendChild(box);
    addEventListener("scroll", () => { box!.hidden = true; }, { passive: true });
  }
  return box;
};

export function hoverTips(svg: SVGSVGElement) {
  const show = (e: PointerEvent) => {
    const b = tipBox();
    const el = (e.target as Element).closest<SVGElement>("[data-tip]");
    if (!el || !svg.contains(el) || !el.dataset.tip) { b.hidden = true; return; }
    el.querySelectorAll(":scope > title").forEach((t) => t.remove());
    b.textContent = el.dataset.tip;
    b.hidden = false;
    const pad = 14, r = b.getBoundingClientRect();
    let x = e.clientX + pad, y = e.clientY + pad;
    if (x + r.width > innerWidth - 8) x = e.clientX - r.width - pad;
    if (y + r.height > innerHeight - 8) y = e.clientY - r.height - pad;
    b.style.left = `${Math.max(8, x)}px`;
    b.style.top = `${Math.max(8, y)}px`;
  };
  svg.addEventListener("pointermove", show);
  svg.addEventListener("pointerdown", show);
  svg.addEventListener("pointerleave", () => { tipBox().hidden = true; });
}
