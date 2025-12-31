const statusEl = document.getElementById("status");
const boardEl = document.getElementById("draftBoard");
const reloadBtn = document.getElementById("reloadBtn");

reloadBtn?.addEventListener("click", () => loadDraftBoard());

function setStatus(msg) {
  statusEl.textContent = msg || "";
}

function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text != null) n.textContent = text;
  return n;
}

function teamShort(teamKey) {
  // "461.l.38076.t.7" -> "T7"
  const m = String(teamKey || "").match(/\.t\.(\d+)$/);
  return m ? `T${m[1]}` : String(teamKey || "");
}

async function loadDraftBoard() {
  setStatus("Loading draft board…");
  boardEl.innerHTML = "";

  let data;
  try {
    const res = await fetch("/draftboard-data");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (e) {
    console.error(e);
    setStatus("Could not load draft board. Are you signed in?");
    return;
  }

  const { draftOrder, rounds, meta, teamsByKey } = data;

  if (!draftOrder?.length || !rounds?.length) {
    setStatus("Draft data looks empty.");
    return;
  }

  // Build lookup: round -> team_key -> pick info
  const byRoundTeam = new Map();
  for (const r of rounds) {
    const m = new Map();
    for (const p of r.picks) m.set(p.team_key, p);
    byRoundTeam.set(r.round, m);
  }

  // Wrapper (your CSS expects this for scroll)
  const wrapper = el("div", "draft-board-wrapper");

  // Grid wrapper
  const grid = el("div", "draft-grid");
  grid.style.setProperty("--cols", String(draftOrder.length));

  // Header row
  const header = el("div", "draft-grid-header");
  header.appendChild(el("div", "draft-corner", "Rnd"));

  for (const teamKey of draftOrder) {
    const info = teamsByKey?.[teamKey];
    const th = el("div", "draft-team-header");

    if (info?.logo) {
      const img = document.createElement("img");
      img.src = info.logo;
      img.alt = info.name || teamShort(teamKey);
      img.loading = "lazy";
      th.appendChild(img);
    }

    th.appendChild(el("div", "draft-team-name", info?.name || teamShort(teamKey)));
    header.appendChild(th);
  }

  grid.appendChild(header);

  // Body: rounds
  for (let r = 1; r <= meta.maxRound; r++) {
    const row = el("div", "draft-row");
    row.style.setProperty("--cols", String(draftOrder.length));

    // Round label
    row.appendChild(el("div", "draft-round-cell", `R${r}`));

    const map = byRoundTeam.get(r) || new Map();

    for (const teamKey of draftOrder) {
      const pick = map.get(teamKey);
      const cell = el("div", "draft-pick-cell");

      if (!pick) {
        cell.appendChild(el("div", "draft-pick-empty", "—"));
      } else {
        // TOP ROW
        const top = el("div", "draft-pick-top");

        // LEFT side of top row: "#69" + [Keeper badge]
        const left = el("div", "draft-pick-left");
        const num = el("div", "draft-pick-num", `#${pick.pick}`);
        left.appendChild(num);

        if (pick.is_keeper) {
          // badge beside the pick number
          left.appendChild(el("span", "keeper-badge", "Keeper"));
        }

        // RIGHT side of top row: "WR · Was"
        const metaTxt = `${pick.player_pos || ""}${pick.player_team ? (pick.player_pos ? " · " : "") + pick.player_team : ""}`.trim();
        const metaEl = el("div", "draft-pick-meta", metaTxt);

        top.appendChild(left);
        top.appendChild(metaEl);

        // NAME ROW
        cell.appendChild(top);
        cell.appendChild(el("div", "draft-player-name", pick.player_name || pick.player_key));

      }

      row.appendChild(cell);
    }

    grid.appendChild(row);
  }

  wrapper.appendChild(grid);
  boardEl.appendChild(wrapper);

  setStatus(`Loaded ${meta.totalPicks} picks · ${meta.maxRound} rounds`);
}

loadDraftBoard();
