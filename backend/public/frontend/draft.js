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

// Extract "t.7" -> "7"
function teamIdFromKey(teamKey) {
  const m = String(teamKey).match(/\.t\.(\d+)$/);
  return m ? m[1] : "";
}

// Robustly read teams map from the API payload your server returns
function getTeamsMap(data) {
  // Preferred: { teamsByKey: { "461...t.7": { name, logo } } }
  if (data?.teamsByKey && typeof data.teamsByKey === "object") return data.teamsByKey;

  // Alternate: { teams: { "461...t.7": { name, logo } } }
  if (data?.teams && typeof data.teams === "object") return data.teams;

  // Nothing usable
  return {};
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
  const teamsMap = getTeamsMap(data);

  if (!Array.isArray(draftOrder) || !draftOrder.length || !Array.isArray(rounds) || !rounds.length) {
    console.log("draftboard-data payload:", data);
    setStatus("Draft data looks empty.");
    return;
  }

  // Build lookup: round -> team_key -> pick info
  const byRoundTeam = new Map();
  for (const r of rounds) {
    const m = new Map();
    for (const p of (r.picks || [])) m.set(p.team_key, p);
    byRoundTeam.set(r.round, m);
  }

  // Wrapper (scrolls horizontally)
  const wrapper = el("div", "draft-board-wrapper");

  // Grid wrapper
  const grid = el("div", "draft-grid");
  grid.style.setProperty("--cols", String(draftOrder.length));

  // Header row
  const header = el("div", "draft-grid-header");
  header.appendChild(el("div", "draft-corner", "Rnd"));

  for (const teamKey of draftOrder) {
    const metaObj = getTeamMeta(data, teamKey);
    const name = metaObj?.name || metaObj?.team_name || metaObj?.teamName || teamShort(teamKey);
    const logo = metaObj?.logo || metaObj?.logo_url || metaObj?.logoUrl || metaObj?.team_logo || null;

    const th = el("div", "draft-team-header");

    if (logo) {
      const img = document.createElement("img");
      img.src = logo;
      img.alt = name;
      img.loading = "lazy";
      th.appendChild(img);
    }

    th.appendChild(el("div", "draft-team-name", name));
    boardEl.appendChild(header);
    header.appendChild(th);
  }

  grid.appendChild(header);

  const maxRound = Number(meta?.maxRound || 0) || 0;

  // Body: rounds
  for (let r = 1; r <= maxRound; r++) {
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
        const top = el("div", "draft-pick-top");

        // LEFT: pick number + keeper badge beside it
        const left = el("div", "draft-pick-left");
        left.appendChild(el("div", "draft-pick-num", `#${pick.pick}`));

        if (pick.is_keeper) {
          left.appendChild(el("span", "draft-keeper-badge", "Keeper"));
        }

        // RIGHT: position/team
        const right = el(
          "div",
          "draft-pick-meta",
          `${pick.player_pos || ""}${pick.player_team ? " · " + pick.player_team : ""}`.trim()
        );

        top.appendChild(left);
        top.appendChild(right);

        cell.appendChild(top);
        cell.appendChild(el("div", "draft-player-name", pick.player_name || pick.player_key));
      }

      row.appendChild(cell);
    }

    grid.appendChild(row);
  }

  wrapper.appendChild(grid);
  boardEl.appendChild(wrapper);

  setStatus(`Loaded ${meta?.totalPicks ?? ""} picks · ${maxRound} rounds`);
}

loadDraftBoard();
