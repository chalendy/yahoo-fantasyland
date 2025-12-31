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
  // 461.l.38076.t.7 -> T7
  const m = String(teamKey).match(/\.t\.(\d+)$/);
  return m ? `T${m[1]}` : teamKey;
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

  const { draftOrder, rounds, meta, teams } = data;
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

  // Single aligned grid (includes header row)
  const cols = draftOrder.length + 1; // +1 for the round label column
  const grid = el("div", "draft-grid");
  grid.style.setProperty("--cols", String(cols));

  // ---- Header row ----
  grid.appendChild(el("div", "draft-corner", "Rnd"));

  for (const teamKey of draftOrder) {
    const metaTeam = teams?.[teamKey];
    const th = el("div", "draft-team-header");

    // logo
    const logoUrl = metaTeam?.logo_url || "";
    if (logoUrl) {
      const img = document.createElement("img");
      img.className = "draft-team-logo";
      img.src = logoUrl;
      img.alt = metaTeam?.name || shortTeamKey(teamKey);
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      th.appendChild(img);
    } else {
      th.appendChild(el("div", "draft-team-logo placeholder-logo", "🏈"));
    }

    // name
    th.appendChild(el("div", "draft-team-name", metaTeam?.name || shortTeamKey(teamKey)));
    th.appendChild(el("div", "draft-team-key", shortTeamKey(teamKey)));

    grid.appendChild(th);
  }

  // ---- Body (rounds) ----
  for (let r = 1; r <= meta.maxRound; r++) {
    // round label
    grid.appendChild(el("div", "draft-round-cell", `R${r}`));

    const map = byRoundTeam.get(r) || new Map();

    for (const teamKey of draftOrder) {
      const pick = map.get(teamKey);
      const cell = el("div", "draft-pick-cell");

      if (!pick) {
        cell.appendChild(el("div", "draft-pick-empty", "—"));
      } else {
        const top = el("div", "draft-pick-top");

        top.appendChild(el("div", "draft-pick-num", `#${pick.pick}`));

        const metaTxt =
          `${pick.player_pos || ""}${pick.player_team ? (pick.player_pos ? " · " : "") + pick.player_team : ""}`.trim();

        top.appendChild(el("div", "draft-pick-meta", metaTxt || "\u00A0"));

        cell.appendChild(top);

        const nameLine = el("div", "draft-player-name");
        nameLine.textContent = pick.player_name || "";

        // Your rule: if unmapped => is_kept true
        if (pick.is_kept) {
          const badge = el("span", "draft-kept-badge", "Kept");
          nameLine.appendChild(document.createTextNode(" "));
          nameLine.appendChild(badge);
        }

        cell.appendChild(nameLine);
      }

      grid.appendChild(cell);
    }
  }

  boardEl.appendChild(grid);
  setStatus(`Loaded ${meta.totalPicks} picks · ${meta.maxRound} rounds`);
}

loadDraftBoard();
