import express from "express";
import YahooFantasy from "yahoo-fantasy";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();


const app = express();
app.use(cors());


const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;


const yf = new YahooFantasy(CLIENT_ID, CLIENT_SECRET);


// Start OAuth
app.get("/auth/start", (req, res) => {
const url = yf.authURL();
res.redirect(url);
});


// OAuth callback
app.get("/auth/callback", async (req, res) => {
try {
const { code } = req.query;
const tokens = await yf.authCallback(code);
global.oauthTokens = tokens; // TEMP storage
res.send("Yahoo authentication successful! You may now close this page.");
} catch (err) {
console.error(err);
res.status(500).send("Authentication failed");
}
});


// Example: League scoreboard
app.get("/league/:leagueKey/scoreboard", async (req, res) => {
try {
const leagueKey = req.params.leagueKey;
yf.setUserToken(global.oauthTokens.access_token);
const data = await yf.league.scoreboard(leagueKey);
res.json(data);
} catch (err) {
console.error(err);
res.status(500).send("Error fetching scoreboard");
}
});


app.listen(3000, () => console.log("Backend running on port 3000"));
