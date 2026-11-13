"""Writes data/ESTIMATES.md: every value in data/network.json with is_estimate = true, for review."""
import json, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
net = json.loads((root / "data" / "network.json").read_text())

def walk(x, path):
    if isinstance(x, dict):
        if "value" in x and "is_estimate" in x:
            yield path, x
            return
        label = x.get("id") or x.get("name")
        for k, v in x.items():
            yield from walk(v, f"{path}.{k}" if path else k)
    elif isinstance(x, list):
        for item in x:
            key = item.get("id", "?") if isinstance(item, dict) else "?"
            yield from walk(item, f"{path}[{key}]")

rows = [(p, d) for p, d in walk(net, "") if d["is_estimate"]]
lines = ["# Estimated values in data/network.json", "",
         f"{len(rows)} of {sum(1 for _ in walk(net, ''))} values are estimates. Each row gives the value, its basis, and where to check it.", "",
         "| Field | Value | Basis |", "|---|---|---|"]
for p, d in rows:
    src = "" if d["source_url"] == "estimate" else f" ([source]({d['source_url']}))"
    lines.append(f"| `{p}` | {d['value']} {d['unit']} | {d['note'].replace('|', '/')}{src} |")
(root / "data" / "ESTIMATES.md").write_text("\n".join(lines) + "\n")
print(f"{len(rows)} estimates")
