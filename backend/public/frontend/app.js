const backend = "https://yahoo-fantasyland.onrender.com/";


document.getElementById("authBtn").onclick = () => {
window.location.href = backend + "/auth/start";
};


document.getElementById("loadBtn").onclick = async () => {
const leagueKey = "nfl.l.123456"; // replace with real key
const res = await fetch(`${backend}/league/${leagueKey}/scoreboard`);
const data = await res.json();
document.getElementById("output").textContent = JSON.stringify(data, null, 2);
};
