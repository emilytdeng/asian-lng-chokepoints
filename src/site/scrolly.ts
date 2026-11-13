/**
 * Scrollytelling: a sticky graphic beside a column of text steps; the step in the middle of the screen drives it.
 * On phones, "sticky" keeps the graphic pinned at the top with the text scrolling over it; "inline" instead gives
 * every step its own static copy of the graphic (for wide maps that would be unreadable when shrunk).
 */
export interface Step {
  html: string;
  enter: () => void;
  /** phones, inline mode: draw this step's graphic into `host` */
  inline?: (host: HTMLElement) => void;
}

export function scrolly(host: HTMLElement, graphic: HTMLElement, steps: Step[], narrow: "sticky" | "inline" = "sticky") {
  host.classList.add("scrolly", `scrolly-${narrow}`);
  const g = document.createElement("div");
  g.className = "scrolly-graphic";
  g.appendChild(graphic);
  const col = document.createElement("div");
  col.className = "scrolly-steps";
  host.append(g, col);
  const els = steps.map((s, i) => {
    const a = document.createElement("article");
    a.className = "step";
    a.dataset.i = String(i);
    a.innerHTML = `${narrow === "inline" && s.inline ? `<div class="step-inline"></div>` : ""}<div class="step-text">${s.html}</div>`;
    col.appendChild(a);
    return a;
  });
  let cur = -1;
  const go = (i: number) => {
    if (i === cur) return;
    cur = i;
    els.forEach((e, k) => e.classList.toggle("active", k === i));
    steps[i].enter();
  };
  const io = new IntersectionObserver((es) => {
    for (const e of es) if (e.isIntersecting) go(Number((e.target as HTMLElement).dataset.i));
  }, { rootMargin: "-48% 0px -48% 0px" });
  els.forEach((e) => io.observe(e));
  go(0);

  if (narrow === "inline") {
    // draw each step's own graphic shortly before it scrolls into view
    const lazy = new IntersectionObserver((es) => {
      for (const e of es) {
        if (!e.isIntersecting) continue;
        const el = e.target as HTMLElement;
        const box = el.querySelector<HTMLElement>(".step-inline");
        if (box && !box.childElementCount && getComputedStyle(box).display !== "none") steps[Number(el.dataset.i)].inline?.(box);
        lazy.unobserve(el);
      }
    }, { rootMargin: "400px 0px" });
    if (matchMedia("(max-width: 880px)").matches) els.forEach((e) => lazy.observe(e));
  }
  return { go };
}
