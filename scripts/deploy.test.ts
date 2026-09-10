import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const REPOSITORY_ROOT = join(import.meta.dirname, "..");
const DEPLOY_SCRIPT = join(REPOSITORY_ROOT, "scripts", "deploy.sh");
const temporaryDirectories: string[] = [];

type DeployResult = {
  exitCode: number;
  log: string[];
  output: string;
};

function createDoubles(directory: string): string {
  const binDirectory = join(directory, "bin");
  const sshPath = join(binDirectory, "ssh");
  const rsyncPath = join(binDirectory, "rsync");

  mkdirSync(binDirectory);
  writeFileSync(
    sshPath,
    `#!/usr/bin/env bash
set -eu
command="$*"
printf '%s\\n' "$command" >> "$DEPLOY_TEST_LOG"
case "$command" in
  *"GHCR_OWNER="*) printf '%s\\n' 'clientela' ;;
  *"cat '/opt/clientela/.predeploy-snapshot-path'"*) printf '%s\\n' '/tmp/predeploy.sql.gz' ;;
  *"^DOMAIN="*) printf '%s\\n' 'https://landing.test' ;;
  *"^CRM_DOMAIN="*) printf '%s\\n' 'https://crm.test' ;;
esac
case "$DEPLOY_TEST_FAILURE:$command" in
  snapshot:*pg_dump*) exit 1 ;;
  migration:*"docker compose run --rm migrate"*) exit 1 ;;
esac
`,
  );
  writeFileSync(
    rsyncPath,
    `#!/usr/bin/env bash
printf 'rsync %s\\n' "$*" >> "$DEPLOY_TEST_LOG"
`,
  );
  chmodSync(sshPath, 0o755);
  chmodSync(rsyncPath, 0o755);

  return binDirectory;
}

function runDeploy(failure = ""): DeployResult {
  const directory = mkdtempSync(join(tmpdir(), "clientela-deploy-test-"));
  temporaryDirectories.push(directory);
  const binDirectory = createDoubles(directory);
  const logPath = join(directory, "commands.log");
  const result = spawnSync("bash", [DEPLOY_SCRIPT], {
    cwd: REPOSITORY_ROOT,
    env: {
      ...process.env,
      DEPLOY_HOST: "deploy@test",
      DEPLOY_PATH: "/opt/clientela",
      DEPLOY_TEST_FAILURE: failure,
      DEPLOY_TEST_LOG: logPath,
      GHCR_TOKEN: "test-token",
      IMAGE_TAG: "sha-test",
      PATH: `${binDirectory}:${process.env.PATH ?? ""}`,
    },
    encoding: "utf8",
  });

  return {
    exitCode: result.status ?? 1,
    log: readFileSync(logPath, "utf8").trim().split("\n").filter(Boolean),
    output: `${result.stdout}\n${result.stderr}`,
  };
}

function commandIndex(log: string[], fragment: string): number {
  const index = log.findIndex((command) => command.includes(fragment));
  expect(index).toBeGreaterThanOrEqual(0);
  return index;
}

function lastCommandIndex(log: string[], fragment: string): number {
  const index = log.findLastIndex((command) => command.includes(fragment));
  expect(index).toBeGreaterThanOrEqual(0);
  return index;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("scripts/deploy.sh", () => {
  it("para e confirma writers antes do snapshot, então migra, sobe, faz smoke e grava a tag", () => {
    const result = runDeploy();

    expect(result.exitCode).toBe(0);
    expect(
      commandIndex(result.log, "docker compose stop api web"),
    ).toBeLessThan(
      commandIndex(result.log, "docker compose ps --status running --services"),
    );
    expect(
      commandIndex(result.log, "docker compose ps --status running --services"),
    ).toBeLessThan(commandIndex(result.log, "pg_dump"));
    expect(commandIndex(result.log, "pg_dump")).toBeLessThan(
      commandIndex(result.log, "docker compose run --rm migrate"),
    );
    expect(
      commandIndex(result.log, "docker compose run --rm migrate"),
    ).toBeLessThan(
      commandIndex(result.log, "IMAGE_TAG='sha-test' docker compose up -d"),
    );
    expect(commandIndex(result.log, "curl -fsS")).toBeLessThan(
      commandIndex(result.log, "cat > '/opt/clientela/.image-tag'"),
    );
  });

  it("religa os containers anteriores quando o snapshot falha antes da migração", () => {
    const result = runDeploy("snapshot");

    expect(result.exitCode).toBe(1);
    expect(
      commandIndex(result.log, "docker compose stop api web"),
    ).toBeLessThan(commandIndex(result.log, "pg_dump"));
    expect(commandIndex(result.log, "pg_dump")).toBeLessThan(
      commandIndex(result.log, "docker compose start api web"),
    );
    expect(
      result.log.some((command) =>
        command.includes("docker compose run --rm migrate"),
      ),
    ).toBe(false);
  });

  it("mantém writers parados quando a migração falha", () => {
    const result = runDeploy("migration");

    expect(result.exitCode).toBe(1);
    expect(
      commandIndex(result.log, "docker compose run --rm migrate"),
    ).toBeLessThan(lastCommandIndex(result.log, "docker compose stop api web"));
    expect(
      result.log.some((command) =>
        command.includes("docker compose start api web"),
      ),
    ).toBe(false);
    expect(result.output).toContain("api/web permanecem parados");
  });

  it("expõe a ordem e os dois caminhos fail-closed no dry-run sem acesso remoto", () => {
    const result = spawnSync("bash", [DEPLOY_SCRIPT, "--dry-run"], {
      cwd: REPOSITORY_ROOT,
      encoding: "utf8",
    });
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).toBe(0);
    expect(output).toContain("parar api e web");
    expect(output).toContain("confirmar que api/web não estão em execução");
    expect(output).toContain("Falha aqui religa os containers antigos");
    expect(output).toContain("mantém api/web parados");
  });
});
