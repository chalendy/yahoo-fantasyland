// Replace this with your backend URL on Render
const backend = "https://yahoo-fantasyland.onrender.com";

// Replace this with your actual league key from Yahoo Fantasy
const leagueKey = "nfl.l.38076"; // Example: "nfl.l.123456"

// Buttons
const authBtn = document.getElementById("authBtn");
const loadBtn = document.getElementById("loadBtn");
const output = document.getElementById("output");

// Start Yahoo OAuth
authBtn.onclick = () => {
  window.location.href = `${backend}/auth/start`;
};

// Load league scoreboard
loadBtn.onclick = async () => {
  try {
    const res = await fetch(`${backend}/league/${leagueKey}/scoreboard`);
    if (!res.ok) {
      if (res.status === 401) {
        output.textContent = "Not authenticated. Please sign in with Yahoo first.";
        return;
      }
      throw new Error("Network response was not ok");
    }

    const data = await res.json();
    output.textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    console.error(err);
    output.textContent = "Error fetching scoreboard. See console for details.";
  }
};
