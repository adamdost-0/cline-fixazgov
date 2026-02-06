# Product Requirements Document: Microsoft Foundry Provider for Cline

**Status:** Draft  
**Branch:** `features/foundry-provider`  
**Author:** Generated from implementation spike  
**Date:** 2026-02-06  

---

## 1. Executive Summary

Add **Microsoft Foundry** as a new top-level API provider in Cline, enabling users to connect to Azure AI Foundry (formerly Azure OpenAI) deployments through two authentication paths:

1. **Entra ID (SSO)** — zero-friction first-party experience using `DefaultAzureCredential` from `@azure/identity` (supports Azure CLI, Managed Identity, Visual Studio, environment variables).
2. **API Key (BYOK)** — bring-your-own-key with endpoint + API key + deployment name.

The provider uses **regex-based endpoint classification** to detect **Azure Commercial** vs **Azure Government** clouds and automatically selects the correct Cognitive Services token audience scope.

### References (Microsoft Learn)
| Topic | URL |
|---|---|
| Foundry Endpoints | https://learn.microsoft.com/en-us/azure/ai-foundry/foundry-models/concepts/endpoints |
| Entra ID Auth (keyless) | https://learn.microsoft.com/en-us/azure/ai-foundry/foundry-models/how-to/configure-entra-id |
| Azure Government OpenAI | https://learn.microsoft.com/en-us/azure/ai-foundry/openai/azure-government |
| Foundry SDK Overview | https://learn.microsoft.com/en-us/azure/ai-foundry/how-to/develop/sdk-overview |
| Migration: Inference → OpenAI SDK | https://learn.microsoft.com/en-us/azure/ai-foundry/how-to/model-inference-to-openai-migration |
| DefaultAzureCredential (JS) | https://learn.microsoft.com/en-us/javascript/api/@azure/identity/defaultazurecredential |

---

## 2. Goals

| # | Goal |
|---|------|
| G1 | Provide a first-party Azure AI Foundry experience in Cline with minimal user friction |
| G2 | Support both Azure Commercial (`*.openai.azure.com`) and Azure Government (`*.openai.azure.us`, `*.usgovcloudapi.net`) |
| G3 | Enable SSO via Entra ID with auto-detection of cloud environment for correct token scope |
| G4 | Enable BYOK for users who prefer API key authentication |
| G5 | Follow existing Cline provider patterns for maintainability and non-breaking integration |
| G6 | Meet Node.js secure software development standards for credential handling |

## 3. Non-Goals

- Model catalog / auto-discovery of deployments (deferred to v2)
- Streaming cost tracking / per-model pricing (deployments are user-managed)
- Azure AI Inference endpoint (`*.services.ai.azure.com/models`) — only OpenAI-compatible endpoint is supported in v1
- Custom managed identity configuration (DefaultAzureCredential covers this automatically)
- Azure private link / VNet configuration

---

## 4. Architecture

### 4.1 Provider Registration

| File | Change |
|------|--------|
| `src/shared/api.ts` | Add `"microsoft-foundry"` to `ApiProvider` union; export regex patterns, cloud classification functions, model defaults, and auth types |
| `src/shared/providers/providers.json` | Add `{ "value": "microsoft-foundry", "label": "Microsoft Foundry" }` |
| `src/shared/storage/state-keys.ts` | Add config fields: `microsoftFoundryEndpoint`, `microsoftFoundryAuthMode`, `microsoftFoundryApiVersion`, `microsoftFoundryApiKey` (secret), plan/act mode `microsoftFoundryDeploymentName` |
| `src/core/api/index.ts` | Import `MicrosoftFoundryHandler`, add `case "microsoft-foundry"` to handler factory |
| `src/core/api/providers/microsoft-foundry.ts` | New handler implementing `ApiHandler` interface |
| `webview-ui/src/components/settings/providers/MicrosoftFoundryProvider.tsx` | New UI component with auth mode toggle |
| `webview-ui/src/components/settings/ApiOptions.tsx` | Import and render `MicrosoftFoundryProvider` |
| `webview-ui/src/utils/validate.ts` | Add validation case for `microsoft-foundry` |
| `webview-ui/src/components/settings/utils/providerUtils.ts` | Add normalization and mode-specific field mappings |

### 4.2 Endpoint Classification (Regex)

```
Commercial: /\.(openai\.azure\.com|services\.ai\.azure\.com|cognitiveservices\.azure\.com)(\/|$)/i
Government: /\.(openai\.azure\.us|services\.ai\.azure\.us|cognitiveservices\.azure\.us|usgovcloudapi\.net)(\/|$)/i
```

**Decision table:**

| Endpoint Pattern | Cloud | Token Scope |
|---|---|---|
| `*.openai.azure.com` | Commercial | `https://cognitiveservices.azure.com/.default` |
| `*.services.ai.azure.com` | Commercial | `https://cognitiveservices.azure.com/.default` |
| `*.openai.azure.us` | Government | `https://cognitiveservices.azure.us/.default` |
| `*.usgovcloudapi.net` | Government | `https://cognitiveservices.azure.us/.default` |
| Other | Error | — |

**Source:** `az cloud show` for AzureUSGovernment confirms `openai.azure.us` service endpoint and `*.usgovcloudapi.net` suffixes.

### 4.3 Authentication Flows

#### Entra ID (SSO) — First-Party Experience
```
User enters endpoint → regex classifies cloud → DefaultAzureCredential + getBearerTokenProvider(scope) → AzureOpenAI client
```

- Uses `@azure/identity` `DefaultAzureCredential` which chains: environment, managed identity, Azure CLI, Visual Studio, etc.
- Token scope auto-selected based on cloud classification
- No API key field shown in UI

#### API Key (BYOK)
```
User enters endpoint + API key + deployment → AzureOpenAI client with apiKey
```

- API key stored in VS Code SecretStorage (via state-keys `SECRETS_KEYS`)
- API key field only shown when BYOK mode is selected

### 4.4 UX State Rules

| Auth Mode | Endpoint | API Key Field | Deployment Name | API Version |
|---|---|---|---|---|
| Entra ID | Visible | **Hidden** | Visible | Visible (optional) |
| API Key | Visible | **Visible** | Visible | Visible (optional) |

Cloud environment badge (Commercial/Government) appears next to the endpoint field when a valid endpoint is detected. An inline error appears if the endpoint doesn't match any known pattern.

---

## 5. Acceptance Criteria

### AC-1: Provider appears in dropdown
- [ ] "Microsoft Foundry" appears in the provider selection dropdown
- [ ] Selecting it renders the `MicrosoftFoundryProvider` component
- [ ] No regressions to other providers

### AC-2: Auth mode toggle
- [ ] Radio group with "Entra ID (SSO)" and "API Key (BYOK)" options
- [ ] Default is "Entra ID (SSO)"
- [ ] API key field is hidden when Entra ID is selected
- [ ] API key field is visible when API Key is selected
- [ ] Switching modes preserves endpoint and deployment name

### AC-3: Endpoint validation
- [ ] Endpoint field accepts valid Azure endpoint URLs
- [ ] Cloud environment badge shows "Azure Commercial" for `*.openai.azure.com`
- [ ] Cloud environment badge shows "Azure Government" for `*.openai.azure.us`
- [ ] Inline error displays for unrecognized endpoint patterns
- [ ] Empty endpoint blocked by submit validation

### AC-4: Entra ID authentication
- [ ] `DefaultAzureCredential` is used with `getBearerTokenProvider`
- [ ] Token scope is `https://cognitiveservices.azure.com/.default` for Commercial
- [ ] Token scope is `https://cognitiveservices.azure.us/.default` for Government
- [ ] Client initializes as `AzureOpenAI` with `azureADTokenProvider`
- [ ] Error message directs user to `az login` or service principal setup on auth failure

### AC-5: API Key authentication
- [ ] API key stored in VS Code SecretStorage
- [ ] Client initializes as `AzureOpenAI` with `apiKey`
- [ ] Validation requires both endpoint and API key when BYOK is selected
- [ ] Error message on missing API key directs to "switch to Entra ID or provide key"

### AC-6: Deployment name
- [ ] Deployment name field is visible in both auth modes
- [ ] Mode-specific (plan/act) deployment names are supported
- [ ] Deployment name passed as `model` parameter to OpenAI API

### AC-7: API version
- [ ] Optional API version field with default `2024-10-21`
- [ ] Placeholder shows default version
- [ ] Override value is passed to `AzureOpenAI` client

### AC-8: Streaming chat completions
- [ ] Handler streams `text`, `reasoning`, `usage`, and `tool_call` chunks
- [ ] Tool calls processed via `ToolCallProcessor.processToolCallDeltas`
- [ ] Usage tokens reported from stream `include_usage` option
- [ ] Reasoning models (o1, o3, o4, gpt-5) support `reasoning_effort` parameter

### AC-9: Security
- [ ] API key is in `SECRETS_KEYS` array (SecretStorage, never global state)
- [ ] API key field uses `type="password"`
- [ ] No credentials are logged (Logger calls only log cloud, auth mode, API version)
- [ ] Endpoint URL regex validation prevents injection of non-Azure URLs
- [ ] External headers from `buildExternalBasicHeaders()` are included

### AC-10: Error handling
- [ ] Missing endpoint → clear error message with expected format
- [ ] Unrecognized endpoint → error with Commercial/Government examples
- [ ] Missing API key in BYOK → error suggesting Entra ID or provide key
- [ ] Missing deployment name → error directing to Azure portal
- [ ] Client creation failure → wrapped error with original message

---

## 6. Files Changed

| File | Type | Description |
|------|------|-------------|
| [src/shared/api.ts](src/shared/api.ts) | Modified | Added `"microsoft-foundry"` to `ApiProvider`; exported regex patterns, classification functions, auth types, model defaults |
| [src/shared/providers/providers.json](src/shared/providers/providers.json) | Modified | Added provider dropdown entry |
| [src/shared/storage/state-keys.ts](src/shared/storage/state-keys.ts) | Modified | Added config fields and secret key |
| [src/core/api/index.ts](src/core/api/index.ts) | Modified | Imported handler, added switch case |
| [src/core/api/providers/microsoft-foundry.ts](src/core/api/providers/microsoft-foundry.ts) | **New** | Backend handler with dual auth |
| [webview-ui/src/components/settings/providers/MicrosoftFoundryProvider.tsx](webview-ui/src/components/settings/providers/MicrosoftFoundryProvider.tsx) | **New** | UI component with auth mode toggle |
| [webview-ui/src/components/settings/ApiOptions.tsx](webview-ui/src/components/settings/ApiOptions.tsx) | Modified | Imported and rendered new provider |
| [webview-ui/src/utils/validate.ts](webview-ui/src/utils/validate.ts) | Modified | Added validation case |
| [webview-ui/src/components/settings/utils/providerUtils.ts](webview-ui/src/components/settings/utils/providerUtils.ts) | Modified | Added normalization, model list, and mode fields |

---

## 7. Gaps & Open Questions

| # | Gap | Impact | Recommended Resolution |
|---|-----|--------|----------------------|
| 1 | **Proto files not updated** — generated `src/shared/proto/cline/models.ts` has some Foundry references but `proto/cline/models.proto` source does not include the `MICROSOFT_FOUNDRY` enum value or deployments RPC | Proto conversion layer (`api-configuration-conversion.ts`) cannot map the new provider | Run `npm run protos` after adding enum to `.proto` source; update conversion mappings |
| 2 | **No deployment auto-discovery** — v1 requires manual deployment name entry | Users must know their deployment name | v2: add `getMicrosoftFoundryDeployments` RPC using Azure Resource Manager API |
| 3 | **No model-specific pricing** — `microsoftFoundryModelInfoSaneDefaults` uses generic defaults | Cost tracking will show $0 | v2: fetch model info from deployment metadata |
| 4 | **Azure AI Inference endpoint** (`*.services.ai.azure.com/models`) not supported | Users using only the inference endpoint cannot use this provider | v2: add inference endpoint support with routing |
| 5 | **No explicit sovereign cloud selection** — relies solely on endpoint regex | Edge case: custom domains or private endpoints may not match | Consider adding manual cloud override dropdown |
| 6 | **`@azure/identity` dependency** — already in `package.json` (used by OpenAI Compatible provider) | No new dependency needed | Verify version compatibility |
| 7 | **No test coverage** — handler and endpoint classification need unit tests | Risk of regressions | Add tests for `classifyAzureEndpoint`, `getAzureCognitiveScope`, and handler client creation |

---

## 8. Testing Plan

| Test | Type | Description |
|------|------|-------------|
| `classifyAzureEndpoint` unit tests | Unit | Verify Commercial/Government/unknown classification for all endpoint patterns |
| `getAzureCognitiveScope` unit tests | Unit | Verify correct scope for each cloud |
| `isValidFoundryEndpoint` unit tests | Unit | Verify validation against known and unknown patterns |
| Handler client creation | Unit | Verify Entra ID and BYOK paths create correct `AzureOpenAI` instances |
| Validation logic | Unit | Verify `validateApiConfiguration` for `microsoft-foundry` cases |
| UI auth mode toggle | Component | Verify field visibility based on auth mode selection |
| UI endpoint badge | Component | Verify cloud environment badge rendering |
| E2E: Entra ID flow | Integration | With `az login`, verify streaming completion from Azure Government endpoint |
| E2E: BYOK flow | Integration | With API key, verify streaming completion from Azure Commercial endpoint |

---

## 9. Security Checklist

- [x] API key stored in VS Code SecretStorage (`SECRETS_KEYS` array)
- [x] API key field uses `type="password"` in UI
- [x] No credentials logged — Logger only records cloud, auth mode, API version
- [x] Endpoint validated via regex before client creation
- [x] `buildExternalBasicHeaders()` used for external header injection
- [x] `DefaultAzureCredential` follows Azure Identity best practices
- [x] Token scope selected per cloud environment (no hardcoded commercial default for Gov)
- [x] BYOK API key never stored in global state (only SecretStorage)
