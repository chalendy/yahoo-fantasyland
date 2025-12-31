const statusEl = document.getElementById("status");
const boardEl = document.getElementById("draftBoard");
const reloadBtn = document.getElementById("reloadBtn");

reloadBtn?.addEventListener("click", () => loadDraftBoard());

function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg || "";
}

function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text != null) n.textContent = text;
  return n;
}

// Try multiple possible shapes for team metadata coming from /draftboard-data
function getTeamMeta(data, teamKey) {
  const sources = [data?.teamsByKey, data?.teams, data?.teamMeta, data?.teamMap];
  for (const src of sources) {
    if (src && typeof src === "object") {
      const v = src[teamKey];
      if (v) return v;
    }
  }
  return null;
}

function teamShort(teamKey) {
  const m = String(teamKey).match(/\.t\.(\d+)$/);
  return m ? `T${m[1]}` : teamKey;
}

async function loadDraftBoard() {
  setStatus("Loading draft board…");
  boardEl.innerHTML = "";

  let data;
  try {
    const res = await fetch("/draftboard-data", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (e) {
    console.error(e);
    setStatus("Could not load draft board. Are you signed in?");
    return;
  }

  const { draftOrder, rounds, meta } = data || {};
  if (!Array.isArray(draftOrder) || !draftOrder.length || !Array.isArray(rounds) || !rounds.length) {
    setStatus("Draft data looks empty.");
    return;
  }

  // Build lookup: round -> team_key -> pick info
  const byRoundTeam = new Map();
  for (const r of rounds) {
    const m = new Map();
    for (const p of (r?.picks || [])) m.set(p.team_key, p);
    byRoundTeam.set(r.round, m);
  }

  // set CSS var once; it inherits into header/rows
  boardEl.style.setProperty("--cols", String(draftOrder.length));

  // -----------------------
  // Header row (append ONCE)
  // -----------------------
  const header = el("div", "draft-grid-header");
  header.appendChild(el("div", "draft-corner", "Rnd"));

  for (const teamKey of draftOrder) {
    const metaObj = getTeamMeta(data, teamKey);
    const name =
      metaObj?.name ||
      metaObj?.team_name ||
      metaObj?.teamName ||
      teamShort(teamKey);

    const logo =
      metaObj?.logo ||
      metaObj?.logo_url ||
      metaObj?.logoUrl ||
      metaObj?.team_logo ||
      null;

    const th = el("div", "draft-team-header");

    if (logo) {
      const img = document.createElement("img");
      img.src = logo;
      img.alt = name;
      img.loading = "lazy";
      th.appendChild(img);
    }

    th.appendChild(el("div", "draft-team-name", name));
    header.appendChild(th);
  }

  boardEl.appendChild(header);

  // -----------------------
  // Grid body
  // -----------------------
  const grid = el("div", "draft-grid");

  const maxRound =
    Number(meta?.maxRound) ||
    Math.max(...rounds.map((r) => Number(r.round || 0)));

  for (let r = 1; r <= maxRound; r++) {
    const row = el("div", "draft-row");
    row.appendChild(el("div", "draft-round-cell", `R${r}`));

    const map = byRoundTeam.get(r) || new Map();

    for (const teamKey of draftOrder) {
      const pick = map.get(teamKey);
      const cell = el("div", "draft-pick-cell");

      if (!pick) {
        cell.appendChild(el("div", "draft-pick-empty", "—"));
      } else {
        const top = el("div", "draft-pick-top");

        // left: #pick + keeper badge beside it
        const left = el("div", "draft-pick-left");
        left.appendChild(el("div", "draft-pick-num", `#${pick.pick}`));

        if (pick.is_keeper) {
          left.appendChild(el("span", "draft-keeper-badge", "Keeper"));
        }

        // right: pos/team
        const metaText = `${pick.player_pos || ""}${pick.player_team ? " · " + pick.player_team : ""}`.trim();
        const right = el("div", "draft-pick-meta", metaText);

        top.appendChild(left);
        top.appendChild(right);

        cell.appendChild(top);
        cell.appendChild(el("div", "draft-player-name", pick.player_name || "—"));
      }

      row.appendChild(cell);
    }

    grid.appendChild(row);
  }

  boardEl.appendChild(grid);

  const total = Number(meta?.totalPicks) || 0;
  setStatus(`Loaded ${total || "?"} picks · ${maxRound} rounds`);
}

loadDraftBoard();
