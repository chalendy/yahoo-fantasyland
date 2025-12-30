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

// If Yahoo couldn't map player_key -> real player metadata, we assume it's a keeper slot.
// (Keepers can be dropped later, so roster lookup isn't reliable.)
function isKeeperPick(pick) {
  if (!pick) return false;

  const key = String(pick.player_key || "");
  const name = String(pick.player_name || "");

  const nameLooksLikeKey =
    name === key ||
    /^(\d+\.)?p\.\d+$/i.test(name) ||           // "461.p.40899" or "p.40899"
    /(^|\.)(p)\.\d+$/i.test(name);              // catches "461.p.12345"

  const missingMeta = !pick.player_pos && !pick.player_team;

  return nameLooksLikeKey || missingMeta;
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

  // Grid wrapper
  const grid = el("div", "draft-grid");
  grid.style.setProperty("--cols", String(draftOrder.length + 1)); // +1 for round column

  // Header row
  const header = el("div", "draft-grid-header");

  // top-left corner cell
  header.appendChild(el("div", "draft-corner", "Rnd"));

  for (const teamKey of draftOrder) {
    const th = el("div", "draft-team-header");
    th.appendChild(el("div", "draft-team-key", teamKey.replace(/^.*\.t\./, "T")));
    header.appendChild(th);
  }

  grid.appendChild(header);

  // Body: rounds
  for (let r = 1; r <= meta.maxRound; r++) {
    const row = el("div", "draft-row");

    // Round label
    row.appendChild(el("div", "draft-round-cell", `R${r}`));

    const map = byRoundTeam.get(r) || new Map();

    for (const teamKey of draftOrder) {
      const pick = map.get(teamKey);
      const cell = el("div", "draft-pick-cell");

      if (!pick) {
        cell.appendChild(el("div", "draft-pick-empty", "—"));
      } else {
        const keeper = isKeeperPick(pick);

        // top line: pick # + meta + optional keeper tag
        const top = el("div", "draft-pick-top");

        top.appendChild(el("div", "draft-pick-num", `#${pick.pick}`));

        const metaText = (pick.player_pos || "") + (pick.player_team ? ` · ${pick.player_team}` : "");
        top.appendChild(el("div", "draft-pick-meta", metaText || "—"));

        if (keeper) {
          top.appendChild(el("div", "draft-keeper-tag", "Keeper"));
          cell.classList.add("is-keeper");
        }

        cell.appendChild(top);

        // name line (if unmapped, show something nicer than "461.p.x")
        const displayName = keeper ? "Keeper (unmapped)" : (pick.player_name || "Unknown");
        cell.appendChild(el("div", "draft-player-name", displayName));
      }

      row.appendChild(cell);
    }

    grid.appendChild(row);
  }

  boardEl.appendChild(grid);
  setStatus(`Loaded ${meta.totalPicks} picks · ${meta.maxRound} rounds`);
}

loadDraftBoard();
