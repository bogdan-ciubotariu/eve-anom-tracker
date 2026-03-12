# Git & Commit Conventions

This document outlines how the AI agent (Antigravity) should interact with Git in this repository.

## 📝 Commit Message Format
We follow the **Conventional Commits** specification. Commit messages must be prefixed with a type:

- `feat:`: A new feature for the user (e.g., `feat: add heartbeat chart`).
- `fix:`: A bug fix (e.g., `fix: window resizing on high-DPI`).
- `docs:`: Documentation only changes (e.g., `docs: update README`).
- `style:`: Changes that do not affect the meaning of the code (white-space, formatting, missing semi-colons, etc).
- `refactor:`: A code change that neither fixes a bug nor adds a feature.
- `perf:`: A code change that improves performance.
- `chore:`: Updating build tasks, package manager configs, etc.

## 🛠 Working with Commits
1. **Analyze Changes**: Always run `git status` and `git diff` to understand what has actually been modified.
2. **Selective Staging**: Use `git add [file]` for specific files. Avoid `git add .` unless all changes are unified under the same logical commit.
3. **No Auto-Commits**: Agents must **never** commit automatically after making a code change. A commit should only be performed when the user explicitly asks for it (e.g., "commit changes").
4. **Push Policy**: Agents must **never** auto-push. Pushing is a manual action reserved for the user or when explicitly requested by name.
5. **Atomic Commits**: Keep commits focused. If multiple unrelated changes exist, split them into separate commits.

## 🚀 Execution Pattern
When a user asks to "commit", the agent should:
1. `git status` to see the scope.
2. `git add <files>`.
3. `git commit -m "<type>: <description>"`.
