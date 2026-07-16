# Security Policy

## Reporting a Vulnerability

Do not disclose security vulnerabilities in a public issue.

Use GitHub's private vulnerability reporting feature to contact the repository maintainer.

Include enough information to reproduce and assess the issue, but do not include active
credentials.

## Sensitive Information

Never include any of the following in issues, discussions, pull requests, screenshots or logs:

- EUMETSAT Consumer Keys
- EUMETSAT Consumer Secrets
- OAuth access tokens
- account passwords
- complete private MagicMirror² configurations

Redact sensitive values before sharing diagnostic information.

## Exposed Credentials

If credentials are exposed:

1. Revoke or regenerate them in EUMETSAT API Key Management.
2. Update the local MagicMirror² configuration.
3. Remove the credentials from Git history if they were committed.
4. Treat previously issued tokens as compromised.

## Supported Versions

Security fixes are applied to the latest released version.
