const bcrypt = require("bcrypt");
const { execSync } = require("child_process");

const hash = bcrypt.hashSync("demo123", 10);
console.log("Generated hash:", hash);

// Create SQL file
const fs = require("fs");
fs.writeFileSync(
  "/tmp/update_pass.sql",
  `UPDATE staff_members SET password_hash = '${hash}' WHERE email = 'demo@tash8eel.com';`,
);

console.log("SQL written to file");
