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

function safeTeamLabel(teamKey) {
  // 461.l.38076.t.11 -> T11
  return teamKey?.replace(/^.*\.t\./, "T") || "";
}

async function loadDraftBoard() {
  setStatus("Loading draft board…");
  boardEl.innerHTML = "";

  let data;
  try {
    const res = await fetch("/draftboard-data", { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (e) {
    console.error(e);
    setStatus("Could not load draft board. Are you signed in?");
    return;
  }

  const { draftOrder, rounds, meta, teamsByKey } = data || {};
  if (!draftOrder?.length || !rounds?.length) {
    setStatus("Draft data looks empty.");
    return;
  }

  // Build lookup: round -> team_key -> pick
  const byRoundTeam = new Map();
  for (const r of rounds) {
    const m = new Map();
    for (const p of r.picks) m.set(p.team_key, p);
    byRoundTeam.set(r.round, m);
  }

  // We include the left "Rnd" column
  const totalCols = draftOrder.length + 1;

  // Create grid
  const grid = el("div", "draft-grid");

  // Set grid columns in JS (more reliable than CSS var in repeat())
  grid.style.gridTemplateColumns = `84px repeat(${draftOrder.length}, minmax(180px, 1fr))`;

  // --- Header row ---
  const corner = el("div", "draft-cell draft-head-cell draft-sticky-corner");
  corner.appendChild(el("div", "draft-round-label", "Rnd"));
  grid.appendChild(corner);

  for (const teamKey of draftOrder) {
    const t = teamsByKey?.[teamKey]; // optional (if your server provides it)

    const head = el("div", "draft-cell draft-head-cell draft-sticky-top");
    const wrap = el("div", "draft-team-head");

    if (t?.logo) {
      const img = document.createElement("img");
      img.src = t.logo;
      img.alt = t.name || safeTeamLabel(teamKey);
      img.className = "draft-team-logo";
      wrap.appendChild(img);
    } else {
      // fallback blank avatar
      const ph = el("div", "draft-team-logo");
      wrap.appendChild(ph);
    }

    const text = el("div", "draft-team-text");
    text.appendChild(el("div", "draft-team-name", t?.name || safeTeamLabel(teamKey)));
    if (t?.manager) text.appendChild(el("div", "draft-team-owner", t.manager));
    wrap.appendChild(text);

    head.appendChild(wrap);
    grid.appendChild(head);
  }

  // --- Body rows ---
  for (let r = 1; r <= meta.maxRound; r++) {
    // Round label cell (sticky left)
    const roundCell = el("div", "draft-cell draft-sticky-left");
    roundCell.appendChild(el("div", "draft-round-label", `R${r}`));
    grid.appendChild(roundCell);

    const map = byRoundTeam.get(r) || new Map();

    for (const teamKey of draftOrder) {
      const pick = map.get(teamKey);
      const cell = el("div", "draft-cell draft-pick");

      if (!pick) {
        cell.appendChild(el("div", "draft-empty", "—"));
      } else {
        const top = el("div", "draft-pick-top");
        top.appendChild(el("div", "draft-pick-num", `#${pick.pick}`));

        const metaText =
          (pick.player_pos ? pick.player_pos : "") +
          (pick.player_team ? ` · ${pick.player_team}` : "");
        top.appendChild(el("div", "draft-pick-meta", metaText || "Pick"));

        cell.appendChild(top);
        cell.appendChild(el("div", "draft-player-name", pick.player_name || "Unknown Player"));
      }

      grid.appendChild(cell);
    }
  }

  boardEl.appendChild(grid);
  setStatus(`Loaded ${meta.totalPicks} picks · ${meta.maxRound} rounds`);
}

loadDraftBoard();
