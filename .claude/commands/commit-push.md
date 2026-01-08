---
description: Commit changes with conventional commits format and push to remote
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git add:*), Bash(git commit:*), Bash(git push:*), Bash(git log:*), Bash(git branch:*)
---

## Context

- Current branch: !`git branch --show-current`
- Git status: !`git status`
- Current git diff (staged and unstaged changes): !`git diff HEAD`
- Recent commits for style reference: !`git log --oneline -5`

## Your task

1. **Review all changes** (staged and unstaged) and determine appropriate conventional commit message
2. **Stage all changes** if there are unstaged changes
3. **Create a commit** using conventional commit format:
   - Types: feat, fix, refactor, docs, test, chore, perf, style, build, ci
   - Format: `type(scope): description` or `type: description`
4. **Push to remote** on the current branch

Follow conventional commit guidelines:

- Use imperative mood ("add" not "added")
- Keep subject line under 72 characters
- Reference issues if applicable
