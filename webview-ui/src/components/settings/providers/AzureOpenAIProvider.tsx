import { TooltipContent, TooltipTrigger } from "@radix-ui/react-tooltip"
import { azureOpenAiDefaultApiVersion, openAiModelInfoSaneDefaults } from "@shared/api"
import { OpenAiModelsRequest } from "@shared/proto/cline/models"
import { Mode } from "@shared/storage/types"
import { VSCodeButton, VSCodeCheckbox } from "@vscode/webview-ui-toolkit/react"
import { useCallback, useEffect, useRef, useState } from "react"
import { Tooltip } from "@/components/ui/tooltip"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { ModelsServiceClient } from "@/services/grpc-client"
import { getAsVar, VSC_DESCRIPTION_FOREGROUND } from "@/utils/vscStyles"
import { ApiKeyField } from "../common/ApiKeyField"
import { BaseUrlField } from "../common/BaseUrlField"
import { DebouncedTextField } from "../common/DebouncedTextField"
import { ModelInfoView } from "../common/ModelInfoView"
import { getModeSpecificFields, normalizeApiConfiguration } from "../utils/providerUtils"
import { useApiConfigurationHandlers } from "../utils/useApiConfigurationHandlers"

/**
 * Props for the AzureOpenAIProvider component
 */
interface AzureOpenAIProviderProps {
	showModelOptions: boolean
	isPopup?: boolean
	currentMode: Mode
}

/**
 * The Azure OpenAI provider configuration component
 * Supports both Azure OpenAI and Azure AI Foundry endpoints
 */
export const AzureOpenAIProvider = ({ showModelOptions, isPopup, currentMode }: AzureOpenAIProviderProps) => {
	const { apiConfiguration, remoteConfigSettings } = useExtensionState()
	const { handleFieldChange, handleModeFieldChange } = useApiConfigurationHandlers()

	const [modelConfigurationSelected, setModelConfigurationSelected] = useState(false)

	// Get the normalized configuration
	const { selectedModelId, selectedModelInfo } = normalizeApiConfiguration(apiConfiguration, currentMode)

	// Get mode-specific fields
	const { openAiModelInfo } = getModeSpecificFields(apiConfiguration, currentMode)

	// Debounced function to refresh OpenAI models (prevents excessive API calls while typing)
	const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)

	useEffect(() => {
		return () => {
			if (debounceTimerRef.current) {
				clearTimeout(debounceTimerRef.current)
			}
		}
	}, [])

	const debouncedRefreshOpenAiModels = useCallback((baseUrl?: string, apiKey?: string) => {
		if (debounceTimerRef.current) {
			clearTimeout(debounceTimerRef.current)
		}

		if (baseUrl && apiKey) {
			debounceTimerRef.current = setTimeout(() => {
				ModelsServiceClient.refreshOpenAiModels(
					OpenAiModelsRequest.create({
						baseUrl,
						apiKey,
					}),
				).catch((error) => {
					console.error("Failed to refresh Azure OpenAI models:", error)
				})
			}, 500)
		}
	}, [])

	// Detect endpoint type based on baseUrl
	const detectEndpointType = (baseUrl?: string): string => {
		if (!baseUrl) return "Unknown"
		const url = baseUrl.toLowerCase()
		if (url.includes(".services.ai.azure.com") || url.includes(".ai.azure.com")) {
			return "Azure AI Foundry"
		}
		if (url.includes(".openai.azure.com") || url.includes("azure.com")) {
			return "Azure OpenAI"
		}
		return "Unknown"
	}

	const endpointType = detectEndpointType(apiConfiguration?.openAiBaseUrl)

	return (
		<div>
			{/* Endpoint Type Indicator */}
			{apiConfiguration?.openAiBaseUrl && (
				<div
					style={{
						marginBottom: 10,
						padding: "8px 12px",
						backgroundColor: "var(--vscode-textBlockQuote-background)",
						borderLeft: "3px solid var(--vscode-textLink-foreground)",
						borderRadius: "4px",
					}}>
					<span style={{ fontWeight: 500, color: "var(--vscode-textLink-foreground)" }}>
						Detected Endpoint: {endpointType}
					</span>
				</div>
			)}

			<Tooltip>
				<TooltipTrigger>
					<div className="mb-2.5">
						<div className="flex items-center gap-2 mb-1">
							<span style={{ fontWeight: 500 }}>Azure Endpoint URL</span>
							{remoteConfigSettings?.openAiBaseUrl !== undefined && (
								<i className="codicon codicon-lock text-description text-sm" />
							)}
						</div>
						<DebouncedTextField
							disabled={remoteConfigSettings?.openAiBaseUrl !== undefined}
							initialValue={apiConfiguration?.openAiBaseUrl || ""}
							onChange={(value) => {
								handleFieldChange("openAiBaseUrl", value)
								debouncedRefreshOpenAiModels(value, apiConfiguration?.openAiApiKey)
							}}
							placeholder={"https://<resource>.openai.azure.com or https://<resource>.services.ai.azure.com"}
							style={{ width: "100%", marginBottom: 10 }}
							type="text"
						/>
						<div
							style={{
								fontSize: "12px",
								color: getAsVar(VSC_DESCRIPTION_FOREGROUND),
								marginTop: "4px",
							}}>
							Supports both Azure OpenAI (*.openai.azure.com) and Azure AI Foundry (*.services.ai.azure.com)
							endpoints
						</div>
					</div>
				</TooltipTrigger>
				<TooltipContent hidden={remoteConfigSettings?.openAiBaseUrl === undefined}>
					This setting is managed by your organization's remote configuration
				</TooltipContent>
			</Tooltip>

			{remoteConfigSettings?.azureApiVersion !== undefined ? (
				<Tooltip>
					<TooltipTrigger>
						<BaseUrlField
							disabled={true}
							initialValue={apiConfiguration?.azureApiVersion}
							label="Azure API Version"
							onChange={(value) => handleFieldChange("azureApiVersion", value)}
							placeholder={`Default: ${azureOpenAiDefaultApiVersion}`}
							showLockIcon={true}
						/>
					</TooltipTrigger>
					<TooltipContent>This setting is managed by your organization's remote configuration</TooltipContent>
				</Tooltip>
			) : (
				<BaseUrlField
					initialValue={apiConfiguration?.azureApiVersion}
					label="Azure API Version"
					onChange={(value) => handleFieldChange("azureApiVersion", value)}
					placeholder={`Default: ${azureOpenAiDefaultApiVersion}`}
				/>
			)}

			{/* Authentication Section */}
			<div style={{ marginBottom: 15 }}>
				<VSCodeCheckbox
					checked={apiConfiguration?.azureIdentity || false}
					onChange={(e: any) => {
						const isChecked = e.target.checked === true
						return handleFieldChange("azureIdentity", isChecked)
					}}>
					Use Azure Identity (Managed Identity / Service Principal)
				</VSCodeCheckbox>
				<div
					style={{
						fontSize: "12px",
						color: getAsVar(VSC_DESCRIPTION_FOREGROUND),
						marginTop: "4px",
						marginLeft: "24px",
					}}>
					Automatically uses DefaultAzureCredential for authentication
				</div>
			</div>

			{/* Show API Key field only if not using Azure Identity */}
			{!apiConfiguration?.azureIdentity && (
				<ApiKeyField
					initialValue={apiConfiguration?.openAiApiKey || ""}
					onChange={(value) => {
						handleFieldChange("openAiApiKey", value)
						debouncedRefreshOpenAiModels(apiConfiguration?.openAiBaseUrl, value)
					}}
					providerName="Azure OpenAI"
				/>
			)}

			<DebouncedTextField
				initialValue={selectedModelId || ""}
				onChange={(value) =>
					handleModeFieldChange({ plan: "planModeOpenAiModelId", act: "actModeOpenAiModelId" }, value, currentMode)
				}
				placeholder={"Enter deployment name or model ID..."}
				style={{ width: "100%", marginBottom: 10 }}>
				<span style={{ fontWeight: 500 }}>Model ID / Deployment Name</span>
			</DebouncedTextField>

			{/* Auto-discover button */}
			<div style={{ marginBottom: 15 }}>
				<VSCodeButton
					disabled={!apiConfiguration?.openAiBaseUrl || (!apiConfiguration?.openAiApiKey && !apiConfiguration?.azureIdentity)}
					onClick={() => {
						if (apiConfiguration?.openAiBaseUrl && (apiConfiguration?.openAiApiKey || apiConfiguration?.azureIdentity)) {
							ModelsServiceClient.refreshOpenAiModels(
								OpenAiModelsRequest.create({
									baseUrl: apiConfiguration.openAiBaseUrl,
									apiKey: apiConfiguration.openAiApiKey || "",
								}),
							).catch((error) => {
								console.error("Failed to discover Azure OpenAI models:", error)
							})
						}
					}}>
					<i className="codicon codicon-refresh" style={{ marginRight: "4px" }} />
					Auto-Discover Models
				</VSCodeButton>
				<div
					style={{
						fontSize: "12px",
						color: getAsVar(VSC_DESCRIPTION_FOREGROUND),
						marginTop: "4px",
					}}>
					Fetch available models from your Azure endpoint (defaults to GPT-4o if unavailable)
				</div>
			</div>

			{/* OpenAI Compatible Custom Headers */}
			{(() => {
				const headerEntries = Object.entries(apiConfiguration?.openAiHeaders ?? {})

				return (
					<div style={{ marginBottom: 10 }}>
						<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
							<Tooltip>
								<TooltipTrigger>
									<div className="flex items-center gap-2">
										<span style={{ fontWeight: 500 }}>Custom Headers (Optional)</span>
										{remoteConfigSettings?.openAiHeaders !== undefined && (
											<i className="codicon codicon-lock text-description text-sm" />
										)}
									</div>
								</TooltipTrigger>
								<TooltipContent hidden={remoteConfigSettings?.openAiHeaders === undefined}>
									This setting is managed by your organization's remote configuration
								</TooltipContent>
							</Tooltip>
							<VSCodeButton
								disabled={remoteConfigSettings?.openAiHeaders !== undefined}
								onClick={() => {
									const currentHeaders = { ...(apiConfiguration?.openAiHeaders || {}) }
									const headerCount = Object.keys(currentHeaders).length
									const newKey = `header${headerCount + 1}`
									currentHeaders[newKey] = ""
									handleFieldChange("openAiHeaders", currentHeaders)
								}}>
								Add Header
							</VSCodeButton>
						</div>

						<div>
							{headerEntries.map(([key, value], index) => (
								<div key={index} style={{ display: "flex", gap: 5, marginTop: 5 }}>
									<DebouncedTextField
										disabled={remoteConfigSettings?.openAiHeaders !== undefined}
										initialValue={key}
										onChange={(newValue) => {
											const currentHeaders = apiConfiguration?.openAiHeaders ?? {}
											if (newValue && newValue !== key) {
												const { [key]: _, ...rest } = currentHeaders
												handleFieldChange("openAiHeaders", {
													...rest,
													[newValue]: value,
												})
											}
										}}
										placeholder="Header name"
										style={{ width: "40%" }}
									/>
									<DebouncedTextField
										disabled={remoteConfigSettings?.openAiHeaders !== undefined}
										initialValue={value}
										onChange={(newValue) => {
											handleFieldChange("openAiHeaders", {
												...(apiConfiguration?.openAiHeaders ?? {}),
												[key]: newValue,
											})
										}}
										placeholder="Header value"
										style={{ width: "40%" }}
									/>
									<VSCodeButton
										appearance="secondary"
										disabled={remoteConfigSettings?.openAiHeaders !== undefined}
										onClick={() => {
											const { [key]: _, ...rest } = apiConfiguration?.openAiHeaders ?? {}
											handleFieldChange("openAiHeaders", rest)
										}}>
										Remove
									</VSCodeButton>
								</div>
							))}
						</div>
					</div>
				)
			})()}

			<div
				onClick={() => setModelConfigurationSelected((val) => !val)}
				style={{
					color: getAsVar(VSC_DESCRIPTION_FOREGROUND),
					display: "flex",
					margin: "10px 0",
					cursor: "pointer",
					alignItems: "center",
				}}>
				<span
					className={`codicon ${modelConfigurationSelected ? "codicon-chevron-down" : "codicon-chevron-right"}`}
					style={{
						marginRight: "4px",
					}}></span>
				<span
					style={{
						fontWeight: 700,
						textTransform: "uppercase",
					}}>
					Model Configuration
				</span>
			</div>

			{modelConfigurationSelected && (
				<>
					<VSCodeCheckbox
						checked={!!openAiModelInfo?.supportsImages}
						onChange={(e: any) => {
							const isChecked = e.target.checked === true
							const modelInfo = openAiModelInfo ? openAiModelInfo : { ...openAiModelInfoSaneDefaults }
							modelInfo.supportsImages = isChecked
							handleModeFieldChange(
								{ plan: "planModeOpenAiModelInfo", act: "actModeOpenAiModelInfo" },
								modelInfo,
								currentMode,
							)
						}}>
						Supports Images
					</VSCodeCheckbox>

					<VSCodeCheckbox
						checked={!!openAiModelInfo?.isR1FormatRequired}
						onChange={(e: any) => {
							const isChecked = e.target.checked === true
							let modelInfo = openAiModelInfo ? openAiModelInfo : { ...openAiModelInfoSaneDefaults }
							modelInfo = { ...modelInfo, isR1FormatRequired: isChecked }

							handleModeFieldChange(
								{ plan: "planModeOpenAiModelInfo", act: "actModeOpenAiModelInfo" },
								modelInfo,
								currentMode,
							)
						}}>
						Enable R1 messages format
					</VSCodeCheckbox>

					<div style={{ display: "flex", gap: 10, marginTop: "5px" }}>
						<DebouncedTextField
							initialValue={
								openAiModelInfo?.contextWindow
									? openAiModelInfo.contextWindow.toString()
									: (openAiModelInfoSaneDefaults.contextWindow?.toString() ?? "")
							}
							onChange={(value) => {
								const modelInfo = openAiModelInfo ? openAiModelInfo : { ...openAiModelInfoSaneDefaults }
								modelInfo.contextWindow = Number(value)
								handleModeFieldChange(
									{ plan: "planModeOpenAiModelInfo", act: "actModeOpenAiModelInfo" },
									modelInfo,
									currentMode,
								)
							}}
							placeholder="e.g. 128000"
							style={{ width: "100%" }}>
							<span style={{ fontWeight: 500 }}>Context Window</span>
						</DebouncedTextField>

						<DebouncedTextField
							initialValue={
								openAiModelInfo?.maxTokens
									? openAiModelInfo.maxTokens.toString()
									: (openAiModelInfoSaneDefaults.maxTokens?.toString() ?? "")
							}
							onChange={(value) => {
								const modelInfo = openAiModelInfo ? openAiModelInfo : { ...openAiModelInfoSaneDefaults }
								modelInfo.maxTokens = Number(value)
								handleModeFieldChange(
									{ plan: "planModeOpenAiModelInfo", act: "actModeOpenAiModelInfo" },
									modelInfo,
									currentMode,
								)
							}}
							placeholder="e.g. 8192"
							style={{ width: "100%" }}>
							<span style={{ fontWeight: 500 }}>Max Output Tokens</span>
						</DebouncedTextField>
					</div>

					<ModelInfoView
						currentMode={currentMode}
						modelInfo={openAiModelInfo}
						onModelInfoChange={(newModelInfo) => {
							handleModeFieldChange(
								{ plan: "planModeOpenAiModelInfo", act: "actModeOpenAiModelInfo" },
								newModelInfo,
								currentMode,
							)
						}}
						showModelOptions={showModelOptions}
					/>
				</>
			)}
		</div>
	)
}
