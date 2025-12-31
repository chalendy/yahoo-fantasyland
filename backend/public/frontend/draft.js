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

function shortTeamKey(teamKey) {
  // "461.l.38076.t.7" -> "T7"
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

  const { draftOrder, rounds, meta, teams } = data;

  if (!Array.isArray(draftOrder) || draftOrder.length === 0) {
    setStatus("Draft order missing.");
    return;
  }
  if (!Array.isArray(rounds) || rounds.length === 0) {
    setStatus("Draft rounds missing.");
    return;
  }

  // Build lookup: round -> (team_key -> pick)
  const byRoundTeam = new Map();
  for (const r of rounds) {
    const m = new Map();
    for (const p of (r?.picks || [])) m.set(p.team_key, p);
    byRoundTeam.set(Number(r.round), m);
  }

  const cols = draftOrder.length + 1; // +1 for the left "Rnd" column

  // Outer grid that includes header row + all round rows
  const grid = el("div", "draft-grid");
  grid.style.gridTemplateColumns = `repeat(${cols}, minmax(160px, 1fr))`;

  // --- Header row (aligned with grid columns) ---
  grid.appendChild(el("div", "draft-corner", "Rnd"));

  for (const teamKey of draftOrder) {
    const t = teams?.[teamKey]; // optional: { name, logo_url }
    const th = el("div", "draft-team-header");

    const top = el("div", "draft-team-header-top");
    if (t?.logo_url) {
      const img = document.createElement("img");
      img.className = "draft-team-logo";
      img.src = t.logo_url;
      img.alt = t?.name ? `${t.name} logo` : "team logo";
      img.loading = "lazy";
      top.appendChild(img);
    }

    const nameWrap = el("div", "draft-team-namewrap");
    nameWrap.appendChild(el("div", "draft-team-name", t?.name || shortTeamKey(teamKey)));
    nameWrap.appendChild(el("div", "draft-team-key", shortTeamKey(teamKey)));
    top.appendChild(nameWrap);

    th.appendChild(top);
    grid.appendChild(th);
  }

  // --- Body rows (ONE ROW PER ROUND) ---
  const maxRound = Number(meta?.maxRound || 0);
  for (let r = 1; r <= maxRound; r++) {
    // Round label cell
    grid.appendChild(el("div", "draft-round-cell", `R${r}`));

    const map = byRoundTeam.get(r) || new Map();

    // One cell per team (in draftOrder)
    for (const teamKey of draftOrder) {
      const pick = map.get(teamKey);
      const cell = el("div", "draft-pick-cell");

      if (!pick) {
        cell.appendChild(el("div", "draft-pick-empty", "—"));
      } else {
        const top = el("div", "draft-pick-top");

        top.appendChild(el("div", "draft-pick-num", `#${pick.pick}`));

        const metaLine = [];
        if (pick.player_pos) metaLine.push(pick.player_pos);
        if (pick.player_team) metaLine.push(pick.player_team);

        const metaEl = el("div", "draft-pick-meta", metaLine.join(" · "));
        top.appendChild(metaEl);

        cell.appendChild(top);

        const nameRow = el("div", "draft-player-row");
        nameRow.appendChild(el("div", "draft-player-name", pick.player_name || "Unknown"));

        if (pick.is_keeper) {
          nameRow.appendChild(el("span", "draft-keeper-badge", "KEEPER"));
        }

        cell.appendChild(nameRow);
      }

      grid.appendChild(cell);
    }
  }

  boardEl.appendChild(grid);
  setStatus(`Loaded ${meta?.totalPicks ?? "?"} picks · ${meta?.maxRound ?? "?"} rounds`);
}

loadDraftBoard();
