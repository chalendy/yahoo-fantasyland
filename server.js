// server.js
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 3000;

// Fix __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to frontend folder
const frontendPath = path.join(__dirname, "backend", "public", "frontend");

// Serve static frontend files
app.use(express.static(frontendPath));

// Optional API route example
app.get("/api/hello", (req, res) => {
  res.json({ msg: "API is working!" });
});

// Catch-all → send frontend index.html
app.get("*", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
