# TTS Open Toolkit CLI Usage

Use this reference for exact command, target, configuration, OAuth DevAPI, update, and troubleshooting behavior.

## Install and diagnose

```bash
npm install -g @tts-open-toolkit/cli
tts_open_toolkit version
tts_open_toolkit doctor
```

`doctor` prints the resolved user config, optional project config, update cache, platform, Node version, and default skill directory.

## Capability inventory

The current CLI supports these command groups:

- `skill`: install, update, list, and inspect bundled or custom coding-agent skills.
- `auth`: log in with TTSPC OAuth, manage multiple profiles, inspect status, and make diagnostic OAuth requests.
- `devapi`: list and call the 13 fixed OAuth Toolkit methods.
- `app`: list developer apps through the existing Developer Center route.
- `sandbox`: list sandbox shops, products, and orders; create orders; transition order status; and call advanced non-delete sandbox operations.
- `setup`: install managed Codex or Claude Code hooks.
- `history`: record and query local prompt/skill usage.
- `telemetry`: inspect or change the telemetry preference.
- `completion`: generate Bash, Zsh, or Fish Tab-completion scripts from the CLI command model.
- `update`, `doctor`, and `version`: maintain and diagnose the CLI.

Use `--json` for machine-readable output where the command supports it. Use `tts_open_toolkit --help` for the installed version's capability map, then `tts_open_toolkit <command> --help` for exact contextual syntax. A command group without a required verb also prints its contextual help; for example, `tts_open_toolkit auth` is equivalent to `tts_open_toolkit auth --help`. `update` is the exception because its no-argument form checks for an update. Invalid command errors include the rejected token and the canonical help invocation.

Manage the telemetry preference with `tts_open_toolkit telemetry status`, `tts_open_toolkit telemetry enable`, or `tts_open_toolkit telemetry disable`.

## Install and inspect skills

```bash
# Current project: .codex/skills
tts_open_toolkit skill add --scope project

# User Codex, Claude Code, Trae, or Trae CN
tts_open_toolkit skill add --agent codex
tts_open_toolkit skill add --agent cc
tts_open_toolkit skill add --agent trae
tts_open_toolkit skill add --agent trae-cn

# One bundled skill or a custom directory
tts_open_toolkit skill add tts-open-toolkit --scope project
tts_open_toolkit skill add --target /path/to/skills

# Inspect and update toolkit-managed installs; unrelated skills in the target are omitted
tts_open_toolkit skill list --scope project --json
tts_open_toolkit skill state --scope project --json
tts_open_toolkit skill add --scope project --update
```

Use only one target selector: `--scope`, `--agent`/`--to`, or `--target`. `--scope user` and `--agent codex` both resolve to `~/.codex/skills`.

## Configuration and cache

Effective configuration precedence is explicit `--config`, environment override, project config, user config, then built-in defaults.

- macOS user config: `~/Library/Application Support/tts-open-toolkit/config.json`
- Linux user config: `${XDG_CONFIG_HOME:-~/.config}/tts-open-toolkit/config.json`
- Windows user config: `%APPDATA%\tts-open-toolkit\config.json`
- Project override: `<project>/.tts_open_toolkit/config.json`

`TTS_OPEN_TOOLKIT_CONFIG` selects an explicit configuration file when `--config` is absent. Project discovery is bypassed in that mode.

On first startup, the CLI best-effort creates `telemetry.anonymousInstallationId` in the OS-specific user config. This UUID v4 is reused across runs and upgrades, is not derived from hardware or account data, and cannot be overridden by project or explicit config. Identity config failures do not block the requested command, and creating the ID does not send a telemetry network request.

Update-check state is separate from configuration:

- macOS cache: `~/Library/Caches/tts-open-toolkit/state.json`
- Linux cache: `${XDG_CACHE_HOME:-~/.cache}/tts-open-toolkit/state.json`
- Windows cache: `%LOCALAPPDATA%\tts-open-toolkit\state.json`

`TTS_OPEN_TOOLKIT_STATE_PATH` explicitly overrides the state-file path. Empty or invalid OS base-directory variables fall back to platform defaults.

## Update the CLI

```bash
tts_open_toolkit update channel
tts_open_toolkit update channel beta
tts_open_toolkit update channel rc
tts_open_toolkit update channel stable
tts_open_toolkit update --check
tts_open_toolkit update --yes
tts_open_toolkit update --yes --registry https://registry.npmjs.org
```

The user-level channel defaults to `beta` and cannot be overridden by project configuration. Beta selects the highest version from `beta`, `rc`, and `latest`; RC selects from `rc` and `latest`; Stable selects only `latest`. `--check` does not install. `--yes` is required before the CLI invokes the global npm install, which pins the selected version.

## Enable shell completion

```bash
# Bash
source <(tts_open_toolkit completion bash)

# Zsh
source <(tts_open_toolkit completion zsh)

# Fish
tts_open_toolkit completion fish | source
```

Add the matching line to `.bashrc`, `.zshrc`, or `~/.config/fish/config.fish`. Completion covers canonical commands, subcommands, options, and declared values such as `--scope project|user`. Generating or querying completion does not read or modify toolkit configuration.

## Log in and manage OAuth profiles

```bash
tts_open_toolkit auth login
tts_open_toolkit auth status --json

# Keep the current account and add another one
tts_open_toolkit auth login --add --profile second-account
tts_open_toolkit auth list --json
tts_open_toolkit auth switch second-account --json

# Remove one profile or all profiles
tts_open_toolkit auth logout --profile second-account --json
tts_open_toolkit auth logout --all --json
```

Login uses the public CLI identity `client_id=open_toolkit_cli` and scope `open_toolkit:developer`. The browser starts at the ROW Partner Center authorize page and may redirect to the account's US or EU site before returning to the localhost callback.

Browser opening does not depend on the parent shell. The CLI uses `open` on macOS and `xdg-open` on Linux. On Windows it Base64-encodes the complete URL as data and invokes a UTF-16LE PowerShell `-EncodedCommand` that calls `Start-Process`; every path uses `shell: false`, and the raw OAuth query never reaches CMD or the PowerShell parser. If automatic browser opening is unavailable, run `tts_open_toolkit auth login --no-open` and open the complete printed `authorize:` URL manually while the CLI waits for the callback.

OAuth profile metadata is stored under `~/.tts_open_toolkit/config.json`. Access and refresh tokens are not written there: macOS uses Keychain and Windows uses CurrentUser DPAPI. `auth list`, `auth status`, and `auth doctor` expose only non-secret metadata. An expired access token is refreshed automatically when the protected refresh session is valid; a missing or invalid auth record requires a new `auth login`.

## Call OAuth Toolkit APIs

`devapi list` returns the 13 fixed methods currently published in the TTSPC OAuth allowlist. `devapi call` accepts a method name, declared query pairs, and a JSON body where the method supports one. It does not accept a caller-provided HTTP path. The `devapi` namespace distinguishes these developer-tool APIs from future direct OpenAPI calls.

| Method name | Existing route | Input |
|---|---|---|
| `account-basic-info` | GET `/api/v1/account/basic_info` | None |
| `account-certification-info` | GET `/api/v1/account/certification_info` | None |
| `developer-app-list` | GET `/api/v1/app/list` | Query `key_words` |
| `developer-app-detail` | GET `/api/v1/app/detail` | Required query `app_key` |
| `developer-app-exists` | GET `/api/v1/app/exist` | None |
| `document-api-meta` | GET `/api/v1/document/api_meta` | Required query `src_document_id`; optional `document_id`, `workspace_id` |
| `authorization-open-api-list` | GET `/api/v1/open/authorization/open_api/list` | Required query `pkg_id`; optional `app_key` |
| `sandbox-shop-list` | GET `/api/v1/sandbox/shop/list` | None |
| `sandbox-account-list` | GET `/api/v2/sandbox/account/basic_list` | Optional region, seller, and activation filters |
| `partner-service-list` | POST `/api/v1/partner/service/get_service_list_v2` | Body `query_condition`, `locale` |
| `partner-profile` | GET `/api/v1/partner/profile/partner_info` | Optional query `include_full_sign` |
| `partner-service-detail` | GET `/api/v1/partner/service/get_service_detail_v2` | Required query `service_id`; optional `locale` |
| `open-app-list` | POST `/api/v1/open/app/list` | Pagination and app filters; defaults to page 1, size 20 |

```bash
tts_open_toolkit auth login
tts_open_toolkit devapi list --json
tts_open_toolkit devapi call partner-profile --json
tts_open_toolkit devapi call developer-app-detail --query app_key=<app_key> --json
tts_open_toolkit devapi call partner-service-detail --query service_id=<service_id> --query locale=en-US --json
```

The method boundary recursively removes secret-bearing response fields, including `secret`, `app_secret`, client/access/refresh tokens, secret/private keys, PKCE verifiers, and passwords. This also applies to the safe raw response representation, business-error payloads, and existing OAuth compatibility commands. Public `app_key`, pagination fields, token type, and expiry metadata remain available.

## Typed BSO sandbox workflow

Use the typed sandbox commands for the order workflow captured from Partner Center:

```bash
tts_open_toolkit sandbox shop list --region-code 840 --json
tts_open_toolkit sandbox product list --shop-id <shop_id> --json
tts_open_toolkit sandbox order create \
  --shop-id <shop_id> \
  --item <product_id>:<sku_id>:1 \
  --order-count 1 \
  --logistics-service-id <logistics_service_id> \
  --payment-method 0 \
  --json
tts_open_toolkit sandbox order list --shop-id <shop_id> --page 1 --page-size 10 --json
tts_open_toolkit sandbox order transition <order_id> --shop-id <shop_id> --json
```

| CLI command | Partner Center API combination |
|---|---|
| `sandbox shop list` | GET `/api/v2/sandbox/account/basic_list` |
| `sandbox product list` | GET `/api/v{version}/open/bso/sandbox/products` |
| `sandbox order create` | POST `/api/v{version}/open/bso/sandbox/orders` |
| `sandbox order list` | POST `/api/v{version}/open/bso/sandbox/orders/search` |
| `sandbox order transition` | Search result pages for the current order → POST `/api/v{version}/open/bso/sandbox/orders/status` → poll search until the status changes |

Typed BSO commands use API version `3` internally and reject `--version`; callers do not select the backend protocol. Repeat `--item PRODUCT_ID:SKU_ID:QUANTITY` for multiple SKUs. `--order-count` controls how many orders the sandbox creates; it is intentionally separate from each SKU quantity.

JSON output uses stable top-level fields such as `products`, `created`, `failed`, `orders`, `before_status`, `after_status`, and `transitioned`. `orders[].order_status`, `before_status`, and `after_status` contain canonical order-state names rather than backend numeric codes; for example, `105` becomes `ON_HOLD` and `111` becomes `AWAITING_SHIPMENT`. Unknown backend status codes fail closed before a transition mutation is sent. Order creation exits non-zero when any requested result fails or is missing. Order transition exits non-zero when the status API reports a nested business failure, the order cannot be found, the real elapsed timeout is reached, or polling confirms that its status did not change.

These routes still depend on the Partner Center OAuth allowlist in the selected environment. When PPE rejects an otherwise valid request, preserve the safe authorization error and request ID for backend allowlist diagnosis; never copy browser cookies or HAR authorization headers into the CLI.

## Compatibility API and raw sandbox commands

Use the fixed `devapi` methods for normal automation. The following shortcuts remain available for existing workflows:

```bash
tts_open_toolkit auth basic-info --json
tts_open_toolkit app list --page-no 1 --page-size 20 --json
tts_open_toolkit sandbox list --region-code 840 --json
tts_open_toolkit sandbox endpoints --json
tts_open_toolkit sandbox call account-basic-list --query region_code=840 --json
```

`auth basic-info` calls the existing Partner Center `partner_info` route. `app list` calls `/api/v1/open/app/list`. `sandbox list` calls `/api/v2/sandbox/account/basic_list`. `sandbox endpoints` reports the broader non-delete catalog; `sandbox call <endpoint-name>` supports declared GET query pairs, POST JSON bodies, and `--version` for versioned BSO paths.

`sandbox list` remains a compatibility alias for `sandbox shop list`. Prefer the typed product and order commands over raw `sandbox call` when they cover the workflow.

The sandbox catalog intentionally excludes `/api/v2/sandbox/account/delete`. Do not construct a raw request to recreate deletion. Some catalog operations may still require Web Session or may not be present in the OAuth allowlist; report the returned authorization error instead of inventing another route.

`auth request [METHOD] PATH_OR_URL` is a diagnostic escape hatch for a known existing TTSPC route. Prefer `devapi call` whenever a fixed method exists, and never use `auth request` to bypass gateway or TCC authorization.

## Hooks and history

```bash
tts_open_toolkit setup codex --dry-run
tts_open_toolkit setup codex
tts_open_toolkit setup cc --dry-run
tts_open_toolkit setup cc
tts_open_toolkit history skills --json
tts_open_toolkit history prompts --skill tts-openapi-faq-index --json
```

Setup preserves existing host hooks, backs up changed settings, and keeps managed hooks idempotent. Prompt and skill-usage history stays under the project `.tts_open_toolkit/history/` directory unless configured otherwise.

## Output and automation

- Prefer `--json` when another program or agent will consume output.
- Do not parse human-readable text when the command has JSON output.
- API JSON output contains HTTP status and sanitized business data; it must not contain OAuth tokens or App Secrets.
- Non-zero command exits indicate validation, authentication, transport, or business failures. Preserve the safe error message and request/log ID for diagnosis.
- Never include raw Partner Center cookies, OAuth callbacks, authorization codes, PKCE verifiers, or protected-store contents in logs or reports.

## Troubleshooting

- Run `doctor` first to confirm the executable, platform, config layers, cache, and skill target.
- Use `skill state --json` to distinguish `current`, `outdated`, `modified`, and `unknown` toolkit-managed installs. Skills without TTS Open Toolkit install metadata are intentionally omitted.
- Use `auth doctor --json`, `auth status --json`, and `auth list --json` to distinguish missing profile metadata from missing protected credentials.
- If the authorize page is missing `response_type`, `redirect_uri`, `state`, `code_challenge`, or `scope`, stop and use `auth login --no-open`; do not approve an incomplete URL.
- If an API reports a missing auth record, run `auth login` again; do not copy tokens between accounts or sites.
- Use `devapi list --json` before calling a method so the installed CLI defines the accepted inputs.
- Use the typed `sandbox product` and `sandbox order` commands for the BSO order workflow. Use `sandbox endpoints --json` only before an advanced raw sandbox call and confirm the operation is non-destructive.
- Use `--force` only for an intentional overwrite and `--yes` only for an intentional package update.
- Set `OPEN_TOOLKIT_SKIP_UPDATE_CHECK=1` in deterministic CI or offline smoke tests.
