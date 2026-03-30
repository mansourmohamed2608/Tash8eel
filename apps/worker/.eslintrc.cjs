module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
  },
  env: {
    node: true,
    es2022: true,
    jest: true,
  },
  plugins: ["@typescript-eslint", "prettier"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:prettier/recommended",
  ],
  ignorePatterns: ["dist", "node_modules", "coverage"],
  rules: {
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-unused-vars": "off",
    "@typescript-eslint/ban-ts-comment": "off",
    "@typescript-eslint/no-var-requires": "off",
    "@typescript-eslint/no-require-imports": "off",
    "@typescript-eslint/no-namespace": "off",
    "@typescript-eslint/no-unsafe-function-type": "off",
    "@typescript-eslint/prefer-as-const": "off",
    "no-case-declarations": "off",
    "no-useless-escape": "off",
    "no-misleading-character-class": "off",
    "no-useless-catch": "off",
  },
};
