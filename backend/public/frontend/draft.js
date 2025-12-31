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

// Detect "unmapped" player: name is literally a yahoo player key string
function isUnmappedPick(pick) {
  if (!pick) return false;

  // The main signal you showed: player_name becomes the player_key string
  if (pick.player_name && pick.player_key && pick.player_name === pick.player_key) return true;

  // Also catch cases where player_name itself looks like a key
  if (typeof pick.player_name === "string" && /^461\.p\.\d+$/.test(pick.player_name.trim())) return true;

  // Optional extra fallback: if all the display fields are empty, treat as unmapped
  const nameMissing = !pick.player_name || pick.player_name.trim() === "";
  const posMissing = !pick.player_pos || pick.player_pos.trim() === "";
  const teamMissing = !pick.player_team || pick.player_team.trim() === "";
  if (nameMissing && posMissing && teamMissing) return true;

  return false;
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

  const grid = el("div", "draft-grid");
  grid.style.setProperty("--cols", String(draftOrder.length + 1)); // +1 for round column

  // Header row
  const header = el("div", "draft-grid-header");
  header.style.setProperty("--cols", String(draftOrder.length + 1));

  header.appendChild(el("div", "draft-corner", "Rnd"));

  for (const teamKey of draftOrder) {
    const team = teamsByKey?.[teamKey] || {};
    const th = el("div", "draft-team-header");

    const top = el("div", "draft-team-header-top");

    if (team.logo) {
      const img = document.createElement("img");
      img.src = team.logo;
      img.alt = team.name || teamKey;
      img.className = "draft-team-logo";
      top.appendChild(img);
    }

    const nameWrap = el("div", "draft-team-name-wrap");
    nameWrap.appendChild(el("div", "draft-team-name", team.name || teamKey));
    nameWrap.appendChild(el("div", "draft-team-key", teamKey.replace(/^.*\.t\./, "T")));
    top.appendChild(nameWrap);

    th.appendChild(top);
    header.appendChild(th);
  }

  grid.appendChild(header);

  // Body rows (rounds)
  for (let r = 1; r <= meta.maxRound; r++) {
    const row = el("div", "draft-row");
    row.style.setProperty("--cols", String(draftOrder.length + 1));

    row.appendChild(el("div", "draft-round-cell", `R${r}`));

    const map = byRoundTeam.get(r) || new Map();

    for (const teamKey of draftOrder) {
      const pick = map.get(teamKey);
      const cell = el("div", "draft-pick-cell");

      if (!pick) {
        cell.appendChild(el("div", "draft-pick-empty", "—"));
      } else {
        const keeper = isUnmappedPick(pick);

        const top = el("div", "draft-pick-top");
        top.appendChild(el("div", "draft-pick-num", `#${pick.pick}`));

        const metaText = keeper
          ? "Keeper"
          : `${pick.player_pos || ""}${pick.player_team ? " · " + pick.player_team : ""}`.trim();

        const metaEl = el("div", "draft-pick-meta", metaText);
        if (keeper) metaEl.classList.add("draft-keeper-tag");
        top.appendChild(metaEl);

        cell.appendChild(top);

        const displayName = keeper ? "(Kept player)" : (pick.player_name || "");
        const nameEl = el("div", "draft-player-name", displayName);
        if (keeper) nameEl.classList.add("draft-keeper-name");
        cell.appendChild(nameEl);
      }

      row.appendChild(cell);
    }

    grid.appendChild(row);
  }

  boardEl.appendChild(grid);
  setStatus(`Loaded ${meta.totalPicks} picks · ${meta.maxRound} rounds`);
}

loadDraftBoard();
