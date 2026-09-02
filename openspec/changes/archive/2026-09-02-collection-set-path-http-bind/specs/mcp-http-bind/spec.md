## ADDED Requirements

### Requirement: HTTP MCP listen address is configurable

The system SHALL bind HTTP MCP to `127.0.0.1` by default. The operator MUST be
able to set the listen address via CLI `--host <addr>` and, when `--host` is
omitted, via environment variable `QMD_HOST`. CLI `--host` SHALL win over
`QMD_HOST`. Binding to `0.0.0.0` (or any non-loopback address) SHALL NOT become
the default.

#### Scenario: Default remains loopback

- **WHEN** the operator runs `qmd mcp --http` with no `--host` and no `QMD_HOST`
- **THEN** the server listens on `127.0.0.1`

#### Scenario: CLI host overrides env

- **WHEN** `QMD_HOST=0.0.0.0` is set and the operator passes `--host 127.0.0.1`
- **THEN** the server listens on `127.0.0.1`

#### Scenario: Env used when flag omitted

- **WHEN** `QMD_HOST=0.0.0.0` is set and `--host` is omitted
- **THEN** the server listens on `0.0.0.0`

#### Scenario: Daemon forwards host

- **WHEN** the operator runs `qmd mcp --http --daemon --host 0.0.0.0`
- **THEN** the spawned child listens on `0.0.0.0`, not silently on loopback

### Requirement: Warn when HTTP MCP is not loopback

The system SHALL print a warning to stderr when the HTTP listen address is not
loopback (`127.0.0.1`, `::1`, or `localhost`), stating that HTTP MCP has no
authentication. The server SHALL still start. This change MUST NOT implement
token or bearer auth.

#### Scenario: Non-loopback prints auth warning

- **WHEN** HTTP MCP starts with `--host 0.0.0.0`
- **THEN** stderr contains a warning that there is no HTTP auth

#### Scenario: Loopback does not require that warning

- **WHEN** HTTP MCP starts on `127.0.0.1`
- **THEN** the process does not print that no-auth LAN warning
