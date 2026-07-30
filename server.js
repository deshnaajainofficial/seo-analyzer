const express = require("express");
const cors = require("cors");
const path = require("path");
const analyzeRouter = require("./routes/analyze");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use("/api", analyzeRouter);

app.listen(PORT, () => {
  console.log(`SEO Analyzer running at http://localhost:${PORT}`);
});
