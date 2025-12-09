import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 3000;

// Fix for ES modules (__dirname is not available by default)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the frontend build folder
const frontendPath = path.join(__dirname, "backend", "public", "frontend");

// Serve static frontend files
app.use(express.static(frontendPath));

// Catch-all route for Single Page Apps
app.get("*", (req, res) => {
    res.sendFile(path.join(frontendPath, "index.html"));
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
