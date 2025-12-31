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

function normalizeTeamKey(teamKey) {
  // "461.l.38076.t.12" -> "12"
  const m = String(teamKey || "").match(/\.t\.(\d+)$/);
  return m ? m[1] : String(teamKey || "");
}

function isUnmappedKeeperPick(pick) {
  // Your rule: if it doesn't get mapped, treat it as keeper-ish and flag it.
  // Typical symptom: player_name == player_key AND pos/team empty
  if (!pick) return false;

  const name = String(pick.player_name || "");
  const key = String(pick.player_key || "");
  const pos = String(pick.player_pos || "");
  const team = String(pick.player_team || "");

  const looksLikeKey = name === key || /^(\d+\.)?p\./.test(name) || /^461\.p\./.test(name);
  const missingDetails = !pos.trim() && !team.trim();

  return looksLikeKey && missingDetails;
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

  if (!draftOrder?.length || !rounds?.length) {
    setStatus("Draft data looks empty.");
    return;
  }

  // teams map shape expected from server:
  // teams = { "461.l.38076.t.1": { name, logo }, ... }
  const teamMap = teams || {};

  // Build lookup: round -> team_key -> pick info
  const byRoundTeam = new Map();
  for (const r of rounds) {
    const m = new Map();
    for (const p of r.picks) m.set(p.team_key, p);
    byRoundTeam.set(r.round, m);
  }

  // Grid wrapper
  const grid = el("div", "draft-grid");
  grid.style.setProperty("--cols", String(draftOrder.length));

  // Header row
  const header = el("div", "draft-grid-header");

  // top-left corner
  header.appendChild(el("div", "draft-corner", "Rnd"));

  for (const teamKey of draftOrder) {
    const team = teamMap[teamKey] || {};
    const teamName = team.name || `Team ${normalizeTeamKey(teamKey)}`;
    const teamLogo = team.logo || "";

    const th = el("div", "draft-team-header");

    if (teamLogo) {
      const img = document.createElement("img");
      img.className = "draft-team-logo";
      img.src = teamLogo;
      img.alt = teamName;
      img.loading = "lazy";
      th.appendChild(img);
    } else {
      // fallback circle
      const fallback = el("div", "team-logo placeholder-logo", `T${normalizeTeamKey(teamKey)}`);
      fallback.classList.add("draft-team-logo");
      th.appendChild(fallback);
    }

    const textWrap = el("div", "draft-team-text");
    textWrap.appendChild(el("div", "draft-team-name", teamName));
    textWrap.appendChild(el("div", "draft-team-sub", `T${normalizeTeamKey(teamKey)}`));
    th.appendChild(textWrap);

    header.appendChild(th);
  }

  boardEl.appendChild(header);

  // Body rows
  for (let r = 1; r <= meta.maxRound; r++) {
    const row = el("div", "draft-row");

    // Round label cell
    row.appendChild(el("div", "draft-round-cell", `R${r}`));

    const map = byRoundTeam.get(r) || new Map();

    for (const teamKey of draftOrder) {
      const pick = map.get(teamKey);
      const cell = el("div", "draft-pick-cell");

      if (!pick) {
        cell.appendChild(el("div", "draft-pick-empty", "—"));
      } else {
        const keeperFlag = isUnmappedKeeperPick(pick);
        if (keeperFlag) cell.classList.add("is-keeper");

        const top = el("div", "draft-pick-top");

        const left = el("div", "draft-pick-num", `#${pick.pick}`);

        const metaText = `${pick.player_pos || ""}${pick.player_team ? " · " + pick.player_team : ""}`.trim();
        const right = el("div", "draft-pick-meta", metaText || "—");

        top.appendChild(left);

        // Add keeper badge on the right side of the top row if keeper-ish
        if (keeperFlag) {
          const wrap = el("div", "");
          wrap.style.display = "flex";
          wrap.style.alignItems = "center";
          wrap.style.gap = "8px";

          wrap.appendChild(right);
          const badge = el("span", "draft-keeper-badge", "KEEPER");
          badge.title = "Unmapped player (often a keeper / offboard pick / missing lookup)";
          wrap.appendChild(badge);

          top.appendChild(wrap);
        } else {
          top.appendChild(right);
        }

        cell.appendChild(top);

        // Player name row (fallback)
        const displayName = pick.player_name && pick.player_name !== pick.player_key
          ? pick.player_name
          : `(${pick.player_key})`;

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
