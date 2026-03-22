const fs = require("fs");
const path = require("path");

const tmpDir = path.resolve(__dirname, ".tmp");
fs.mkdirSync(tmpDir, { recursive: true });
process.env.TMPDIR = tmpDir;
process.env.TMP = tmpDir;
process.env.TEMP = tmpDir;
const { createDefaultPreset } = require("ts-jest");

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} **/
module.exports = {
  testEnvironment: "node",
  cacheDirectory: path.resolve(__dirname, ".jest-cache"),
  testPathIgnorePatterns: [
    "/node_modules/",
    "<rootDir>/dist/",
    "<rootDir>/dist-validation/",
  ],
  transform: {
    ...tsJestTransformCfg,
  },
};
