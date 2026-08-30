module.exports = {
  parserOptions: { ecmaVersion: 2021, sourceType: "module", ecmaFeatures: { jsx: true } },
  plugins: ["react"],
  env: { browser: true, es2021: true },
  rules: { "no-undef": "error" },
  globals: { localStorage: "readonly", XLSX: "readonly" },
};
