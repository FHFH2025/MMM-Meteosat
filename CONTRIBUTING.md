# Contributing

Thank you for your interest in contributing to **MMM-Meteosat**.

Contributions of all kinds are welcome, including bug reports, feature requests, documentation improvements and pull requests.

---

## Before Opening an Issue

Before creating a new issue, please:

- update to the latest version of the module,
- read the README and Troubleshooting section,
- search existing GitHub issues,
- remove all credentials from logs and configuration examples.

---

## Reporting Bugs

Please include as much relevant information as possible:

- MagicMirror² version
- Node.js version
- operating system
- module version or Git commit
- installation method
- relevant configuration (without credentials)
- relevant log output
- clear steps to reproduce the issue

Never publish:

- Consumer Keys
- Consumer Secrets
- OAuth access tokens

---

## Feature Requests

Feature requests are welcome.

Please describe:

- the problem you want to solve,
- the proposed behaviour,
- the expected benefit,
- any relevant EUMETSAT product or dataset.

---

## Pull Requests

Please keep pull requests focused on a single feature or bug fix.

Before submitting a pull request:

```bash
npm install
npm run check
```

Please verify that:

- existing configurations remain compatible,
- documentation has been updated if required,
- generated cache files are not included,
- no credentials are committed,
- log messages are written in English,
- the code follows the existing project style.

---

## Coding Style

The project follows a deliberately simple coding style:

- JavaScript compatible with Node.js 20.3 or newer
- 2-space indentation
- semicolons
- camelCase naming
- descriptive variable and method names
- English comments and user-facing messages

Please avoid unnecessary dependencies and unrelated formatting changes.

---

## Commit Messages

Use concise imperative commit messages.

Examples:

```text
Add configurable loading message
Improve edge detection
Update documentation
Fix image cache handling
```

---

## Licensing

By contributing to this project, you agree that your contribution may be distributed under the project's MIT License.
