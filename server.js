const express = require("express");
const fs = require("fs-extra");
const path = require("path");

const app = express();

app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

const leadsFile = path.join(__dirname, "leads.csv");

app.get("/", (req, res) => {
  res.render("index", {
    success: req.query.success === "true",
  });
});

app.post("/waitlist", async (req, res) => {
  const email = req.body.email;
  const timestamp = new Date().toISOString();

  if (!email) {
    return res.redirect("/");
  }

  const row = `"${timestamp}","${email}"\n`;

  const fileExists = await fs.pathExists(leadsFile);

  if (!fileExists) {
    await fs.writeFile(leadsFile, `"timestamp","email"\n`);
  }

  await fs.appendFile(leadsFile, row);

  console.log("New waitlist signup:", email);

  res.redirect("/?success=true");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Cavryon landing page running at http://localhost:${PORT}`);
});