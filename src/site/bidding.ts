/** Chapter 6: who goes without. Max-flow fixes the total that arrives; a sharing rule only splits it. */
import { RULE_HELP, SITE_VIEWS, VIEW_LABEL, fmt, pct, type SiteView } from "./compute";
import { S_HZ, ev } from "./story";

export function mountBidding(host: HTMLElement) {
  const Z = ev(S_HZ);
  const gap = Z.demand - Z.supply;
  const row = (id: string) => Z.rows.find((r) => r.id === id)!;
  host.innerHTML = `
    <div class="wrap chap-head"><p class="chap-n">Chapter 6</p><h2 id="h-bid">Who goes without?</h2>
      <p class="dek">Max-flow fixes how much gas arrives. A sharing rule only decides who gets it.</p></div>
    <div class="wrap real-rules">
      <p class="prose-narrow">With Hormuz closed, the min cut caps what these eight economies can receive at ${fmt(Z.supply, 0)} of the ${fmt(Z.demand, 0)} mtpa they need. No sharing rule can change that total; a rule only decides who absorbs the missing ${fmt(gap, 0)} mtpa. Here are two rules.</p>
      <div class="seg" id="rules" role="group" aria-label="How the shortage is shared"></div>
      <p class="rule-help" id="rule-help"></p>
      <div class="missing-line"><span>Missing under either rule</span><b>${fmt(gap, 0)} mtpa</b></div>
      <div class="bars" id="rule-bars"></div>
      <p class="note">Bars show the share of each country's import needs that is met. Below 50% is highlighted.</p>
      <p class="keypoint">The total shortage is the same under either rule. The rule only decides who goes without, and when the richest buy first, the poorest buyers lose first: under “${VIEW_LABEL.priority}”, Pakistan, which got ${pct(row("PAK").exposure)} of its LNG through Hormuz in 2025, is shut out entirely.</p>
    </div>
    <div class="wrap takeaway" id="takeaway"></div>`;
  let view: SiteView = "rationed";
  const rules = host.querySelector("#rules")!;
  for (const v of SITE_VIEWS) {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = VIEW_LABEL[v]; b.dataset.v = v;
    b.onclick = () => { view = v; draw(); };
    rules.appendChild(b);
  }
  const draw = () => {
    rules.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String((b as HTMLElement).dataset.v === view)));
    host.querySelector("#rule-help")!.textContent = RULE_HELP[view];
    const rows = [...Z.rows].sort((a, b) => a.share[view] - b.share[view] || a.name.localeCompare(b.name));
    host.querySelector("#rule-bars")!.innerHTML = rows.map((r) => {
      const sh = r.share[view];
      return `<div class="bar-row${sh < 0.5 ? " low" : ""}"><span class="bar-name">${r.name}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${(100 * sh).toFixed(1)}%"></span></span><span class="bar-val">${pct(sh)}</span></div>`;
    }).join("");
  };
  draw();
  host.querySelector("#takeaway")!.innerHTML = `
    <h3>So what would help most?</h3>
    <div class="cards">
      <div class="card"><p class="big">Any new gas<br />outside the Gulf</p><p>Only new supply that doesn't pass Hormuz helps everyone, because the cut runs through the exporters. Since gas can go to any buyer, each extra tonne counts the same wherever it's produced: a bigger Power of Siberia pipeline and new US LNG each raise the equal share by the same 0.3 percentage points per extra mtpa.</p></div>
      <div class="card"><p class="big">Not more terminals<br />in South Asia</p><p>A new import terminal for Pakistan or Bangladesh changes nothing in a Hormuz closure. Their problem is getting cargoes, not unloading them.</p></div>
      <div class="card"><p class="big">Storage buys time,<br />for its owner only</p><p>Doubling Taiwan's LNG storage adds about 150 days before its tanks run dry if everyone shares equally, but only 11 if other buyers take the cargoes first. Storage is insurance for the country that builds it, not for the region.</p></div>
    </div>`;
}
