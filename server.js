import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve frontend
app.use(express.static(path.join(__dirname, "backend/public/frontend")));

// Yahoo OAuth2 constants
const CLIENT_ID = process.env.YAHOO_CLIENT_ID;
const CLIENT_SECRET = process.env.YAHOO_CLIENT_SECRET;

// IMPORTANT: Your actual Render domain
const REDIRECT_URI = "https://yh-fantasyland.onrender.com/auth/callback";

// --- 1) AUTH START: Redirect user to Yahoo ---
app.get("/auth/start", (req, res) => {
    const authURL = new URL("https://api.login.yahoo.com/oauth2/request_auth");
    authURL.searchParams.set("client_id", CLIENT_ID);
    authURL.searchParams.set("redirect_uri", REDIRECT_URI);
    authURL.searchParams.set("response_type", "code");
    authURL.searchParams.set("language", "en-us");

    res.redirect(authURL.toString());
});

// --- 2) AUTH CALLBACK: Yahoo sends ?code=VALUE ---
app.get("/auth/callback", async (req, res) => {
    const code = req.query.code;

    if (!code) {
        return res.status(400).send("Missing authorization code.");
    }

    try {
        const tokenResponse = await fetch("https://api.login.yahoo.com/oauth2/get_token", {
            method: "POST",
            headers: {
                "Authorization": "Basic " + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64"),
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: new URLSearchParams({
                grant_type: "authorization_code",
                redirect_uri: REDIRECT_URI,
                code
            })
        });

        const tokenData = await tokenResponse.json();

        if (tokenData.error) {
            return res.status(400).send("Token error: " + JSON.stringify(tokenData));
        }

        console.log("Yahoo OAuth Token:", tokenData);

        // Redirect back to homepage (you can store token in session later)
        res.redirect("/");
    } catch (err) {
        console.error("Callback error:", err);
        res.status(500).send("OAuth callback failure");
    }
});

// --- Default route (frontend) ---
app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "backend/public/frontend/index.html"));
});

// --- Start Server ---
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
