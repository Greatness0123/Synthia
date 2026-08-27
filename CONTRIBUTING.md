# Contributing to SYNTHIA

Thank you for your interest in contributing to SYNTHIA. This document outlines the process for contributing code, documentation, and other improvements.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Branching Strategy](#branching-strategy)
- [Commit Messages](#commit-messages)
- [Pull Request Checklist](#pull-request-checklist)
- [Testing](#testing)
- [Issues and Bug Reports](#issues-and-bug-reports)
- [Code Style](#code-style)
- [Documentation](#documentation)

---

## Code of Conduct

By participating in this project, you agree to abide by the [Code of Conduct](CODE_OF_CONDUCT.md). Please read it before contributing.

---

## Getting Started

### Prerequisites

- **Node.js** 20 or newer (see `.nvmrc`)
- **npm** (comes with Node.js)
- A modern browser with **WebGL 2.0** support for testing the app

### Local Setup

```bash
# 1. Clone the repository
git clone https://github.com/Greatness0123/synthia.git
cd synthia

# 2. Install dependencies
npm install

# 3. Start the development server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) to see the app.

---

## Development Workflow

1. **Pick an issue** from the [issue tracker](https://github.com/Greatness0123/synthia/issues), or create one if you've found a bug or want to propose a feature.
2. **Create a branch** off `main` (see [Branching Strategy](#branching-strategy)).
3. **Make your changes.** Keep each PR focused on one concern.
4. **Run the verification checks** before submitting:
   ```bash
   npm run typecheck    # no TypeScript errors
   npm run lint         # no ESLint errors
   npm test             # all tests pass
   ```
5. **Submit a pull request** against `main`. Fill out the [PR template](.github/PULL_REQUEST_TEMPLATE.md).

---

## Branching Strategy

We use a simple, linear branching model:

| Branch | Purpose |
|---|---|
| `main` | Production-ready code. Only merged via PR. |
| `feat/*` | New features. Example: `feat/reaction-mass-controller` |
| `fix/*` | Bug fixes. Example: `fix/spawn-ramp-timing` |
| `docs/*` | Documentation changes. Example: `docs/architecture-overview` |
| `chore/*` | Maintenance, refactors, tooling. Example: `chore/update-package-json` |

**Naming convention:** use kebab-case (lowercase, hyphens). Keep branch names descriptive but concise.

---

## Commit Messages

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification. Format:

```
<type>(<scope>): <description>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style (formatting, no functional change)
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples:**
```
feat(engine): add reaction mass balance controller
fix(agent): prevent double-firing of synthia:action event
docs(readme): update setup instructions
```

**Rule:** Use the imperative mood ("add", "fix", "update", not "added", "fixed", "updated"). Keep the subject line under 72 characters.

---

## Pull Request Checklist

Before submitting a PR, verify:

- [ ] **Tests pass** — run `npm test` and ensure all tests pass
- [ ] **TypeScript passes** — run `npm run typecheck` and fix all errors
- [ ] **Lint passes** — run `npm run lint` and fix all warnings/errors
- [ ] **Build succeeds** — run `npm run build` and confirm no errors
- [ ] **Docs updated** — if the change affects external behavior, update the README or relevant docs
- [ ] **One concern per PR** — keep the scope focused
- [ ] **No secrets** — do not commit API keys, `.env` files, or personal config
- [ ] **No artifacts** — do not commit `node_modules/`, `dist/`, or debug logs

---

## Testing

### Unit Tests

Unit tests live alongside the source in `__tests__/` directories. They cover physics controllers, balance systems, action parsing, and more.

```bash
npm test
```

To run a single test file:

```bash
npx jest src/world/engine/__tests__/reactionMassController.test.ts
```

### Integration Test (Proxy)

The `verify-proxy` script tests the serverless inference proxies against a deployed instance. This requires the environment variables to be configured and a deployed endpoint. It is not part of the default test suite.

```bash
npm run verify-proxy
```

### Manual Testing

For UI or physics changes, start the dev server and test in the browser:

```bash
npm run dev
```

---

## Issues and Bug Reports

Please use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md) when filing a bug.

Good bug reports include:
- **What happened** — the observed behavior
- **What was expected** — the intended behavior
- **Steps to reproduce** — how to trigger the bug
- **Environment** — browser, OS, Node version, AI provider in use
- **Relevant logs** — console output or error messages

---

## Code Style

The project uses **TypeScript 6.0** with strict mode. Follow the existing conventions:

- **TypeScript strict** — no `any` unless absolutely necessary
- **Single responsibility** — one component/hook/utility/type per file
- **Function size** — keep functions under 40 lines, extract helpers as needed
- **Naming** — verbs for functions (e.g., `fetchUser`), predicates for booleans (e.g., `isLoading`), plurals for arrays (e.g., `users`)
- **Constants** — extract magic numbers/strings into named constants
- **No em-dashes** — use hyphens or restructure the sentence
- **File naming** — kebab-case for source files (e.g., `client-dataset-exporter.ts`)

---

## Documentation

Documentation changes are welcome. The docs live in:

- `README.md` — project overview, quick start, architecture summary
- `docs/` — detailed guides (setup, architecture, debugging)

When updating docs:
- Keep the voice consistent: technical but accessible
- Link to relevant source files
- Use code blocks with language tags
- Avoid emojis and em-dashes in technical documentation

---

## Questions?

If you have questions about contributing, open an issue with the `question` label, or reach out on the project's Discord channel (see the README).

Thank you for contributing to SYNTHIA!
