# Security Policy

## Supported version

Security fixes are applied to the current `main` branch.

## Reporting a vulnerability

Do not disclose a suspected vulnerability, credential, or personal-data
exposure in a public issue.

Use GitHub's private **Report a vulnerability** option when it is available for
this repository. If it is unavailable, contact the repository owner privately
through their GitHub profile before sharing reproduction details.

Include:

- the affected route, file, or workflow;
- the minimum steps needed to reproduce the issue;
- the expected and observed authorization boundary;
- whether production data or credentials may have been exposed; and
- a safe way to contact you for follow-up.

Never include live passwords, tokens, private keys, service-role keys, database
connection strings, or user data in an issue, pull request, screenshot, or log.

## Credential response

If a secret is exposed, revoke or rotate it first, then remove it from the
current tree and Git history as appropriate. A deletion commit alone does not
remove a secret from earlier commits.
