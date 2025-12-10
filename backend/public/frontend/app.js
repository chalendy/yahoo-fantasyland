const backend = "https://yh-fantasyland.onrender.com";

const authBtn = document.getElementById("authBtn");
const loadBtn = document.getElementById("loadBtn");
const output = document.getElementById("output");

// Sign in with Yahoo
authBtn.onclick = () => {
  window.location.href = `${backend}/auth/start`;
};

// Load scoreboard for your league
loadBtn.onclick = async () => {
  output.textContent = "Loading scoreboard...";

  try {
    const res = await fetch(`${backend}/scoreboard`);
    if (!res.ok) {
      const errText = await res.text();
      console.error("Scoreboard error:", res.status, errText);
      output.textContent = `Error fetching scoreboard: ${res.status}`;
      return;
    }

    const data = await res.json();
    console.log("Scoreboard data:", data);
    output.textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    console.error("Fetch error:", err);
    output.textContent = "Error fetching scoreboard. See console for details.";
  }
};
