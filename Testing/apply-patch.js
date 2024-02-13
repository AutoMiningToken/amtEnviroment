const { exec } = require("child_process");
const path = require("path");

const patchFilePath = path.join(__dirname, "..", "patches", "FixedPoint.patch");
const targetDirectory = path.join(
  __dirname,
  "node_modules",
  "@uniswap",
  "lib",
  "contracts",
  "libraries"
);

const command = `patch -p0 -d "${targetDirectory}" < "${patchFilePath}"`;

exec(command, (error, stdout, stderr) => {
  if (error) {
    console.error(`Error applying patch: ${error}`);
    return;
  }
  console.log(`Patch applied successfully: ${stdout}`);
  if (stderr) {
    console.error(`Patch applied with errors: ${stderr}`);
  }
});
