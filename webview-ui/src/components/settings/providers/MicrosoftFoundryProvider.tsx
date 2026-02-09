/**
 * Microsoft Foundry Provider Configuration UI
 *
 * Supports two authentication modes with conditional field visibility:
 * - Entra ID (SSO): Endpoint only (API key hidden)
 * - API Key (BYOK): Endpoint + API Key (SSO info hidden)
 *
 * Endpoint is validated via regex to classify Azure Commercial vs Government.
 * Cloud environment badge is shown when endpoint is valid.
 *
 * References:
 * - https://learn.microsoft.com/en-us/azure/ai-foundry/foundry-models/concepts/endpoints
 * - https://learn.microsoft.com/en-us/azure/ai-foundry/foundry-models/how-to/configure-entra-id
 * - https://learn.microsoft.com/en-us/azure/ai-foundry/openai/azure-government
 */
import {
	classifyAzureEndpoint,
	microsoftFoundryDefaultApiVersion,
	microsoftFoundryModelInfoSaneDefaults,
	type MicrosoftFoundryAuthMode,
} from "@shared/api"
import { Mode } from "@shared/storage/types"
import { VSCodeRadio, VSCodeRadioGroup } from "@vscode/webview-ui-toolkit/react"
import { useMemo } from "react"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { getAsVar, VSC_DESCRIPTION_FOREGROUND } from "@/utils/vscStyles"
import { DebouncedTextField } from "../common/DebouncedTextField"
import { ModelInfoView } from "../common/ModelInfoView"
import { RemotelyConfiguredInputWrapper } from "../common/RemotelyConfiguredInputWrapper"
import ReasoningEffortSelector from "../ReasoningEffortSelector"
import { normalizeApiConfiguration } from "../utils/providerUtils"
import { useApiConfigurationHandlers } from "../utils/useApiConfigurationHandlers"

interface MicrosoftFoundryProviderProps {
	showModelOptions: boolean
	isPopup?: boolean
	currentMode: Mode
}

export const MicrosoftFoundryProvider = ({
	showModelOptions,
	isPopup,
	currentMode,
}: MicrosoftFoundryProviderProps) => {
	const { apiConfiguration, remoteConfigSettings } = useExtensionState()
	const { handleFieldChange, handleModeFieldChange } = useApiConfigurationHandlers()

	const authMode: MicrosoftFoundryAuthMode = apiConfiguration?.microsoftFoundryAuthMode ?? "entra-id"
	const endpoint = apiConfiguration?.microsoftFoundryEndpoint ?? ""

	// Classify cloud environment from endpoint URL
	const cloudEnvironment = useMemo(() => classifyAzureEndpoint(endpoint), [endpoint])

	const { selectedModelInfo, selectedModelId } = normalizeApiConfiguration(apiConfiguration, currentMode)

	return (
		<div className="flex flex-col gap-1">
			{/* Auth Mode Toggle */}
			<VSCodeRadioGroup
				onChange={(e) => {
					const value = (e.target as HTMLInputElement)?.value as MicrosoftFoundryAuthMode
					handleFieldChange("microsoftFoundryAuthMode", value)
				}}
				value={authMode}>
				<label slot="label" style={{ fontWeight: 500 }}>
					Authentication Method
				</label>
				<VSCodeRadio value="entra-id">Entra ID (SSO)</VSCodeRadio>
				<VSCodeRadio value="api-key">API Key (BYOK)</VSCodeRadio>
			</VSCodeRadioGroup>

			{/* Auth mode description */}
			<p
				style={{
					fontSize: "12px",
					color: getAsVar(VSC_DESCRIPTION_FOREGROUND),
					margin: "4px 0 8px 0",
				}}>
				{authMode === "entra-id" ? (
					<>
						Uses Azure CLI, Managed Identity, or environment credentials via{" "}
						<code>DefaultAzureCredential</code>. No API key required.{" "}
						<a
							href="https://learn.microsoft.com/en-us/azure/ai-foundry/foundry-models/how-to/configure-entra-id"
							style={{ color: "var(--vscode-textLink-foreground)" }}>
							Learn more
						</a>
					</>
				) : (
					<>
						Use your Azure AI Foundry resource API key.{" "}
						<a
							href="https://learn.microsoft.com/en-us/azure/ai-foundry/foundry-models/concepts/endpoints"
							style={{ color: "var(--vscode-textLink-foreground)" }}>
							Learn more
						</a>
					</>
				)}
			</p>

			{/* Endpoint URL — wrapped for remote config lock */}
			<RemotelyConfiguredInputWrapper hidden={remoteConfigSettings?.microsoftFoundryEndpoint === undefined}>
				<DebouncedTextField
					className="w-full"
					disabled={!!remoteConfigSettings?.microsoftFoundryEndpoint}
					initialValue={endpoint}
					onChange={(value) => handleFieldChange("microsoftFoundryEndpoint", value)}
					placeholder="https://<resource>.openai.azure.com">
					<div className="flex items-center gap-2">
						<span className="font-medium">Endpoint URL</span>
						{cloudEnvironment && (
							<span
								style={{
									fontSize: "11px",
									padding: "1px 6px",
									borderRadius: "3px",
									backgroundColor:
										cloudEnvironment === "government"
											? "var(--vscode-charts-purple)"
											: "var(--vscode-charts-blue)",
									color: "white",
									fontWeight: 600,
								}}>
								{cloudEnvironment === "government" ? "Azure Government" : "Azure Commercial"}
							</span>
						)}
					</div>
				</DebouncedTextField>
			</RemotelyConfiguredInputWrapper>

			{/* Deployment Name — mode-aware (plan/act) */}
			<DebouncedTextField
				className="w-full"
				initialValue={selectedModelId}
				onChange={(value) =>
					handleModeFieldChange(
						{ plan: "planModeMicrosoftFoundryDeploymentName", act: "actModeMicrosoftFoundryDeploymentName" },
						value,
						currentMode,
					)
				}
				placeholder="e.g. my-gpt4o-deployment">
				<span className="font-medium">Deployment Name</span>
			</DebouncedTextField>
			<p
				style={{
					fontSize: "12px",
					color: getAsVar(VSC_DESCRIPTION_FOREGROUND),
					margin: "2px 0 4px 0",
				}}>
				Enter your Azure deployment name (found in Azure AI Foundry portal under Deployments). This may differ
				from the model name.
			</p>

			{/* Endpoint validation hint */}
			{endpoint && !cloudEnvironment && (
				<p
					style={{
						fontSize: "12px",
						color: "var(--vscode-errorForeground)",
						margin: "2px 0 4px 0",
					}}>
					The endpoint URL does not match a known Azure environment. Expected patterns: *.openai.azure.com
					(Commercial), *.openai.azure.us or *.usgovcloudapi.net (Government).
				</p>
			)}

			{/* API Key — only shown in BYOK mode */}
			{authMode === "api-key" && (
				<DebouncedTextField
					className="w-full"
					initialValue={apiConfiguration?.microsoftFoundryApiKey ?? ""}
					onChange={(value) => handleFieldChange("microsoftFoundryApiKey", value)}
					placeholder="Enter API key..."
					type="password">
					<span className="font-medium">API Key</span>
				</DebouncedTextField>
			)}

			{/* API Version override — wrapped for remote config lock */}
			<RemotelyConfiguredInputWrapper hidden={remoteConfigSettings?.microsoftFoundryApiVersion === undefined}>
				<DebouncedTextField
					className="w-full"
					disabled={!!remoteConfigSettings?.microsoftFoundryApiVersion}
					initialValue={apiConfiguration?.microsoftFoundryApiVersion ?? ""}
					onChange={(value) => handleFieldChange("microsoftFoundryApiVersion", value)}
					placeholder={`Default: ${microsoftFoundryDefaultApiVersion}`}>
					<span className="font-medium">API Version (optional)</span>
				</DebouncedTextField>
			</RemotelyConfiguredInputWrapper>

			{/* Reasoning effort — user opts in; no auto-detection since deployment names are arbitrary */}
			{showModelOptions && <ReasoningEffortSelector currentMode={currentMode} />}

			{/* Context window and max output tokens */}
			{showModelOptions && (() => {
				const microsoftFoundryModelInfo = currentMode === "plan"
					? apiConfiguration?.planModeMicrosoftFoundryModelInfo
					: apiConfiguration?.actModeMicrosoftFoundryModelInfo
				return (
					<div style={{ display: "flex", gap: 10, marginTop: "5px" }}>
						<DebouncedTextField
							initialValue={
								microsoftFoundryModelInfo?.contextWindow
									? microsoftFoundryModelInfo.contextWindow.toString()
									: (microsoftFoundryModelInfoSaneDefaults.contextWindow?.toString() ?? "")
							}
							onChange={(value) => {
								const modelInfo = microsoftFoundryModelInfo ? microsoftFoundryModelInfo : { ...microsoftFoundryModelInfoSaneDefaults }
								modelInfo.contextWindow = Number(value)
								handleModeFieldChange(
									{ plan: "planModeMicrosoftFoundryModelInfo", act: "actModeMicrosoftFoundryModelInfo" },
									modelInfo,
									currentMode,
								)
							}}
							style={{ flex: 1 }}>
							<span style={{ fontWeight: 500 }}>Context Window Size</span>
						</DebouncedTextField>

						<DebouncedTextField
							initialValue={
								microsoftFoundryModelInfo?.maxTokens
									? microsoftFoundryModelInfo.maxTokens.toString()
									: (microsoftFoundryModelInfoSaneDefaults.maxTokens?.toString() ?? "")
							}
							onChange={(value) => {
								const modelInfo = microsoftFoundryModelInfo ? microsoftFoundryModelInfo : { ...microsoftFoundryModelInfoSaneDefaults }
								modelInfo.maxTokens = Number(value)
								handleModeFieldChange(
									{ plan: "planModeMicrosoftFoundryModelInfo", act: "actModeMicrosoftFoundryModelInfo" },
									modelInfo,
									currentMode,
								)
							}}
							style={{ flex: 1 }}>
							<span style={{ fontWeight: 500 }}>Max Output Tokens</span>
						</DebouncedTextField>
					</div>
				)
			})()}

			{/* Model info */}
			{showModelOptions && (
				<ModelInfoView
					isPopup={isPopup}
					modelInfo={selectedModelInfo || microsoftFoundryModelInfoSaneDefaults}
					selectedModelId={selectedModelId}
				/>
			)}
		</div>
	)
}
