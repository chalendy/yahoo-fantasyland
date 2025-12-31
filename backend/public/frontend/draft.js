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

function isLikelyKeeperPick(pick) {
  // Your rule: anything that doesn't get mapped => looks like "461.p.40899" and has no pos/team
  if (!pick) return false;
  const name = (pick.player_name || "").trim();
  const key = (pick.player_key || "").trim();
  const looksUnmapped = name && key && name === key;
  const noMeta = !(pick.player_pos || "").trim() && !(pick.player_team || "").trim();
  return looksUnmapped || noMeta;
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

  const { draftOrder, rounds, meta, teamsByKey } = data;

  if (!draftOrder?.length || !rounds?.length) {
    setStatus("Draft data looks empty.");
    return;
  }

  const teams = teamsByKey || {};

  // Build lookup: round -> team_key -> pick info
  const byRoundTeam = new Map();
  for (const r of rounds) {
    const m = new Map();
    for (const p of r.picks) m.set(p.team_key, p);
    byRoundTeam.set(r.round, m);
  }

  // Main grid wrapper
  const grid = el("div", "draft-grid");
  grid.style.setProperty("--cols", String(draftOrder.length + 1)); // +1 for round column

  // Header row
  const header = el("div", "draft-grid-header");
  header.style.setProperty("--cols", String(draftOrder.length + 1));

  // Corner
  header.appendChild(el("div", "draft-corner", "Rnd"));

  // Team headers aligned to columns
  for (const teamKey of draftOrder) {
    const t = teams[teamKey] || { name: teamKey, logoUrl: "" };

    const th = el("div", "draft-team-header");

    const top = el("div", "draft-team-top");
    if (t.logoUrl) {
      const img = document.createElement("img");
      img.className = "draft-team-logo";
      img.src = t.logoUrl;
      img.alt = t.name || "Team";
      img.loading = "lazy";
      top.appendChild(img);
    } else {
      top.appendChild(el("div", "draft-team-logo draft-team-logo--placeholder", "🏈"));
    }

    const nameWrap = el("div", "draft-team-namewrap");
    nameWrap.appendChild(el("div", "draft-team-name", t.name || teamKey));
    nameWrap.appendChild(el("div", "draft-team-key", teamKey.replace(/^.*\.t\./, "T")));
    top.appendChild(nameWrap);

    th.appendChild(top);
    header.appendChild(th);
  }

  grid.appendChild(header);

  // Body rows
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
        const keeper = isLikelyKeeperPick(pick);

        const top = el("div", "draft-pick-top");
        top.appendChild(el("div", "draft-pick-num", `#${pick.pick}`));

        const metaText = `${pick.player_pos || ""}${pick.player_team ? " · " + pick.player_team : ""}`.trim();
        top.appendChild(el("div", "draft-pick-meta", metaText || (keeper ? "Keeper" : "")));

        if (keeper) {
          top.appendChild(el("div", "draft-keeper-badge", "KEEP"));
        }

        cell.appendChild(top);

        const displayName = keeper ? "(Keeper/kept player)" : pick.player_name;
        cell.appendChild(el("div", "draft-player-name", displayName));

        if (!keeper && pick.player_name && pick.player_name === pick.player_key) {
          cell.appendChild(el("div", "draft-player-sub", pick.player_key));
        }
      }

      row.appendChild(cell);
    }

    grid.appendChild(row);
  }

  boardEl.appendChild(grid);
  setStatus(`Loaded ${meta.totalPicks} picks · ${meta.maxRound} rounds`);
}

loadDraftBoard();
