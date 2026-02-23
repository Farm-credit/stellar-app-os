// commitlint.config.mjs
/** @type {import('@commitlint/types').UserConfig} */
const config = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Enforce one of the standard Conventional Commits types
    "type-enum": [
      2,
      "always",
      [
        "feat", // A new feature
        "fix", // A bug fix
        "docs", // Documentation changes only
        "style", // Formatting, whitespace – no logic change
        "refactor", // Code change that is neither a fix nor a feature
        "perf", // Performance improvement
        "test", // Adding or correcting tests
        "build", // Changes to build system or external dependencies
        "ci", // CI/CD configuration changes
        "chore", // Maintenance tasks (e.g. dependency bumps)
        "revert", // Reverts a previous commit
      ],
    ],
    "type-case": [2, "always", "lower-case"],
    "type-empty": [2, "never"],
    "scope-case": [2, "always", "lower-case"],
    "subject-empty": [2, "never"],
    "subject-full-stop": [2, "never", "."],
    "header-max-length": [2, "always", 100],
    "body-leading-blank": [1, "always"],
    "footer-leading-blank": [1, "always"],
  },
};

export default config;
