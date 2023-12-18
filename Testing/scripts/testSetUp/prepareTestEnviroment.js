const fs = require("fs");
const path = require("path");

const modifyInitCodeHash = (hash) => {
  const filePath = path.join(
    __dirname,
    "..",
    "..",
    "contracts",
    "Pancake-exchange-contracts",
    "contracts",
    "libraries",
    "PancakeLibrary.sol"
  );
  let content = fs.readFileSync(filePath, "utf8");
  // Regular expression to match the specific hex string in the function
  const regex = /hex"[a-fA-F0-9]{64}"/; // Matches a hex string of 64 characters
  content = content.replace(regex, `hex"${hash}"`);

  fs.writeFileSync(filePath, content, "utf8");
};

// Get the hash from command line arguments
const newHash = process.argv[2];
if (!newHash) {
  console.error("Error: No init code hash provided.");
  process.exit(1);
}

modifyInitCodeHash(newHash);
