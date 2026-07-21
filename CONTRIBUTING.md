# Contributing

Thank you for your interest in contributing to **MMM-Meteosat**.

Contributions of all kinds are welcome, including bug reports, feature requests, documentation improvements and pull requests.

## Before Opening an Issue

Before creating a new issue, please:

- update to the latest version of the module,
- read the README and Troubleshooting section,
- search existing GitHub issues,
- verify the problem with the default `wmsImageSize`,
- remove private paths, hostnames, addresses and unrelated configuration from diagnostic material.

## Reporting Bugs

Please include as much relevant information as possible:

- MagicMirror² version
- Node.js version
- operating system
- module version or Git commit
- installation method
- selected product and relevant module configuration
- whether one or multiple module instances are configured
- relevant MagicMirror log output
- clear steps to reproduce the issue
- whether a cached `latest.png` is still displayed

When the issue concerns a particular product, state both the configured value and the product shown in the caption or `status.json`.

Do not publish complete private MagicMirror² configurations, private network information or unrelated log content.

## Feature Requests

Please describe:

- the problem you want to solve,
- the proposed behaviour,
- the expected benefit,
- any relevant EUMETView WMS product or layer,
- whether the change affects caching, image processing or multiple module instances.

## Pull Requests

Please keep pull requests focused on a single feature or bug fix.

Before submitting a pull request:

```bash
npm install
npm run check
```

Please verify that:

- existing configuration values remain compatible,
- all affected product profiles have been tested,
- the default `geocolour` product still loads correctly,
- multiple module instances use separate cache folders,
- the cached-image fallback still works when a WMS request fails,
- unchanged source images are not processed again,
- documentation and `CHANGELOG.md` have been updated when required,
- generated files below `cache/` are not included,
- log messages are written in English,
- the code follows the existing project style,
- the version in `package.json` and the `USER_AGENT` in `node_helper.js` remain consistent when a release version changes.

## Coding Style

The project follows a deliberately simple coding style:

- JavaScript compatible with Node.js 20.3.0 or newer
- 2-space indentation
- semicolons
- camelCase naming
- descriptive variable and method names
- English comments and user-facing messages

Please avoid unnecessary dependencies and unrelated formatting changes.

## Commit Messages

Use concise imperative commit messages.

Examples:

```text
Add another WMS product
Clarify timestamp fallback
Update cache metadata
Fix multi-instance image refresh
```

## Licensing

By contributing to this project, you agree that your contribution may be distributed under the project's MIT License.
