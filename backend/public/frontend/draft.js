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

  const { draftOrder, rounds, meta, teamsByKey } = data || {};
  if (!Array.isArray(draftOrder) || !draftOrder.length || !Array.isArray(rounds) || !rounds.length) {
    setStatus("Draft data looks empty.");
    return;
  }

  // round -> team_key -> pick
  const byRoundTeam = new Map();
  for (const r of rounds) {
    const m = new Map();
    for (const p of (r?.picks || [])) m.set(p.team_key, p);
    byRoundTeam.set(r.round, m);
  }

  // Let CSS know how many team columns we have
  boardEl.style.setProperty("--cols", String(draftOrder.length));

  // Header
  const header = el("div", "draft-grid-header");
  header.appendChild(el("div", "draft-corner", "Rnd"));

  for (const teamKey of draftOrder) {
    const team = teamsByKey?.[teamKey] || {};
    const name = team?.name || teamShort(teamKey);
    const logo = team?.logo || null;

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

  // Body grid
  const grid = el("div", "draft-grid");
  const maxRound = Number(meta?.maxRound) || Math.max(...rounds.map((r) => Number(r.round || 0)));

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
        // top line (# + keeper badge left, pos/team right)
        const top = el("div", "draft-pick-top");

        const left = el("div", "draft-pick-left");
        left.appendChild(el("div", "draft-pick-num", `#${pick.pick}`));

        if (pick.is_keeper) {
          left.appendChild(el("span", "draft-keeper-badge", "Keeper"));
        }

        const right = el(
          "div",
          "draft-pick-meta",
          `${pick.player_pos || ""}${pick.player_team ? " · " + pick.player_team : ""}`.trim()
        );

        top.appendChild(left);
        top.appendChild(right);
        cell.appendChild(top);

        // main row: portrait + name
        const main = el("div", "draft-pick-main");

        const portraitWrap = el("div", "draft-portrait");
        if (pick.player_headshot) {
          const img = document.createElement("img");
          img.src = pick.player_headshot;
          img.alt = pick.player_name || "Player headshot";
          img.loading = "lazy";
          portraitWrap.appendChild(img);
        } else {
          // keep your placeholder if you want it
          portraitWrap.appendChild(el("div", "draft-portrait-placeholder", " "));
        }

        main.appendChild(portraitWrap);
        main.appendChild(el("div", "draft-player-name", pick.player_name || "—"));

        cell.appendChild(main);
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
