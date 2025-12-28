// -----------------------------
//  SCOREBOARD (supports ?week=)
// -----------------------------
app.get("/scoreboard", async (req, res) => {
  if (!accessToken) {
    return res.status(401).json({ error: "Not authenticated. Please click Sign In first." });
  }

  try {
    const rawWeek = req.query.week;
    const week =
      rawWeek && /^\d+$/.test(String(rawWeek)) ? String(parseInt(rawWeek, 10)) : null;

    // Yahoo expects ;week= in the *path*
    const weekSegment = week ? `;week=${week}` : "";

    const url = `https://fantasysports.yahooapis.com/fantasy/v2/league/${LEAGUE_KEY}/scoreboard${weekSegment}?format=json`;

    const apiRes = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const bodyText = await apiRes.text();
    if (!apiRes.ok) {
      console.error("Yahoo scoreboard error:", apiRes.status, bodyText);
      return res.status(500).json({ error: "Yahoo API error", status: apiRes.status, body: bodyText });
    }

    res.json(JSON.parse(bodyText));
  } catch (err) {
    console.error("Scoreboard error:", err);
    res.status(500).json({ error: "Failed to fetch scoreboard" });
  }
});
