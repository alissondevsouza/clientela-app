#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

shared_skills=(
  drizzle-orm
  drizzle-postgres
  drizzle-safe-migrations
  elysia
  react
  shadcn-ui
  tailwindcss
  typescript-advanced
  vitest
  zod
)

for skill_name in "${shared_skills[@]}"; do
  skill_path=".agents/skills/$skill_name"
  expected_target="../../.claude/skills/$skill_name"

  test -L "$skill_path"
  test "$(readlink "$skill_path")" = "$expected_target"
  test -f "$skill_path/SKILL.md"
done

required_files=(
  AGENTS.md
  .codex/config.toml
  .codex/hooks.json
  .codex/hooks/git-human-only.py
  .codex/rules/git-human-only.rules
  .agents/skills/clientela-fix/SKILL.md
  .agents/skills/clientela-spec-driven/SKILL.md
  .codex/agents/clientela_fixer.toml
  .codex/agents/clientela_implement_verifier.toml
  .codex/agents/clientela_implementer.toml
  .codex/agents/clientela_spec_verifier.toml
)

for required_file in "${required_files[@]}"; do
  test -f "$required_file"
done

python3 -m json.tool .codex/hooks.json >/dev/null

policy_output="$(codex execpolicy check --rules .codex/rules/git-human-only.rules -- git commit -m test)"
grep -q '"decision":"forbidden"' <<< "$policy_output"

denied_commands=(
  "git commit -m test"
  "git -C . push origin main"
  "sudo git reset --hard HEAD"
  "gh pr create --title test"
)

for denied_command in "${denied_commands[@]}"; do
  deny_output="$(printf '{"tool_input":{"command":"%s"}}' "$denied_command" | python3 .codex/hooks/git-human-only.py)"
  grep -q '"permissionDecision": "deny"' <<< "$deny_output"
done

allowed_commands=(
  "git status --short"
  "git diff --stat"
  "git switch -c feature/test"
)

for allowed_command in "${allowed_commands[@]}"; do
  allow_output="$(printf '{"tool_input":{"command":"%s"}}' "$allowed_command" | python3 .codex/hooks/git-human-only.py)"
  test -z "$allow_output"
done

printf 'Harness Codex válido: regras compartilhadas, skills, agentes e guardrails verificados.\n'
