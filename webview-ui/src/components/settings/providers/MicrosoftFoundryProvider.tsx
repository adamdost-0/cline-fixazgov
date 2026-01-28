import { azureOpenAiDefaultApiVersion, ModelInfo } from "@shared/api"
import { Mode } from "@shared/storage/types"
import { VSCodeButton, VSCodeDropdown, VSCodeOption, VSCodeRadio, VSCodeRadioGroup } from "@vscode/webview-ui-toolkit/react"
import { useCallback, useState } from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { ModelsServiceClient } from "@/services/grpc-client"
import { getAsVar, VSC_DESCRIPTION_FOREGROUND } from "@/utils/vscStyles"
import { DebouncedTextField } from "../common/DebouncedTextField"
import { ModelInfoView } from "../common/ModelInfoView"
import { DropdownContainer } from "../common/ModelSelector"
import { getModeSpecificFields, normalizeApiConfiguration } from "../utils/providerUtils"
import { useApiConfigurationHandlers } from "../utils/useApiConfigurationHandlers"

// Cloud environment options
type CloudEnvironment = "commercial" | "government" | "stack"

interface Deployment {
	id: string
	model: string
}

// Z-index constants for proper dropdown layering
const DROPDOWN_Z_INDEX = 1000

interface MicrosoftFoundryProviderProps {
	showModelOptions: boolean
	isPopup?: boolean
	currentMode: Mode
}

/**
 * Static fallback model capabilities for known Azure OpenAI models.
 */
const MODEL_CAPABILITIES: Record<string, Partial<ModelInfo>> = {
	// GPT-5 family
	"gpt-5": {
		maxTokens: 32768,
		contextWindow: 256000,
		supportsImages: true,
		supportsPromptCache: true,
	},
	"gpt-5-mini": {
		maxTokens: 32768,
		contextWindow: 256000,
		supportsImages: true,
		supportsPromptCache: true,
	},
	"gpt-5.2": {
		maxTokens: 32768,
		contextWindow: 256000,
		supportsImages: true,
		supportsPromptCache: true,
	},
	"gpt-5.2-chat": {
		maxTokens: 32768,
		contextWindow: 256000,
		supportsImages: true,
		supportsPromptCache: true,
	},
	// GPT-4o family
	"gpt-4o": {
		maxTokens: 16384,
		contextWindow: 128000,
		supportsImages: true,
		supportsPromptCache: false,
	},
	"gpt-4o-mini": {
		maxTokens: 16384,
		contextWindow: 128000,
		supportsImages: true,
		supportsPromptCache: false,
	},
	// GPT-4.1 family
	"gpt-4.1": {
		maxTokens: 32768,
		contextWindow: 1047576,
		supportsImages: true,
		supportsPromptCache: false,
	},
	"gpt-4.1-mini": {
		maxTokens: 32768,
		contextWindow: 1047576,
		supportsImages: true,
		supportsPromptCache: false,
	},
	"gpt-4.1-nano": {
		maxTokens: 32768,
		contextWindow: 1047576,
		supportsImages: true,
		supportsPromptCache: false,
	},
	// GPT-4 family
	"gpt-4": {
		maxTokens: 8192,
		contextWindow: 128000,
		supportsImages: false,
		supportsPromptCache: false,
	},
	"gpt-4-turbo": {
		maxTokens: 4096,
		contextWindow: 128000,
		supportsImages: true,
		supportsPromptCache: false,
	},
	// o1/o3/o4 reasoning families
	"o1-pro": {
		maxTokens: 100000,
		contextWindow: 200000,
		supportsImages: true,
		supportsPromptCache: false,
		supportsReasoning: true,
	},
	o1: {
		maxTokens: 100000,
		contextWindow: 200000,
		supportsImages: true,
		supportsPromptCache: false,
		supportsReasoning: true,
	},
	"o1-mini": {
		maxTokens: 65536,
		contextWindow: 128000,
		supportsImages: false,
		supportsPromptCache: false,
		supportsReasoning: true,
	},
	"o1-preview": {
		maxTokens: 32768,
		contextWindow: 128000,
		supportsImages: false,
		supportsPromptCache: false,
		supportsReasoning: true,
	},
	o3: {
		maxTokens: 100000,
		contextWindow: 200000,
		supportsImages: true,
		supportsPromptCache: false,
		supportsReasoning: true,
	},
	"o3-mini": {
		maxTokens: 65536,
		contextWindow: 200000,
		supportsImages: false,
		supportsPromptCache: false,
		supportsReasoning: true,
	},
	"o4-mini": {
		maxTokens: 65536,
		contextWindow: 200000,
		supportsImages: true,
		supportsPromptCache: false,
		supportsReasoning: true,
	},
	// GPT-3.5 family
	"gpt-35-turbo": {
		maxTokens: 4096,
		contextWindow: 16385,
		supportsImages: false,
		supportsPromptCache: false,
	},
	// Claude models (via Azure AI Foundry)
	"claude-sonnet-4-5": {
		maxTokens: 8192,
		contextWindow: 200000,
		supportsImages: true,
		supportsPromptCache: true,
		supportsReasoning: true,
	},
	"claude-opus-4": {
		maxTokens: 8192,
		contextWindow: 200000,
		supportsImages: true,
		supportsPromptCache: true,
		supportsReasoning: true,
	},
	"claude-haiku-4": {
		maxTokens: 8192,
		contextWindow: 200000,
		supportsImages: true,
		supportsPromptCache: true,
	},
	// Phi models
	"Phi-4": {
		maxTokens: 16384,
		contextWindow: 128000,
		supportsImages: false,
		supportsPromptCache: false,
	},
	"Phi-4-mini": {
		maxTokens: 16384,
		contextWindow: 128000,
		supportsImages: false,
		supportsPromptCache: false,
	},
	"Phi-4-multimodal": {
		maxTokens: 16384,
		contextWindow: 128000,
		supportsImages: true,
		supportsPromptCache: false,
	},
	// Llama models
	"Llama-3.3-70B": {
		maxTokens: 8192,
		contextWindow: 128000,
		supportsImages: false,
		supportsPromptCache: false,
	},
	"Llama-4": {
		maxTokens: 8192,
		contextWindow: 128000,
		supportsImages: false,
		supportsPromptCache: false,
	},
	// DeepSeek models
	"DeepSeek-V3": {
		maxTokens: 8192,
		contextWindow: 128000,
		supportsImages: false,
		supportsPromptCache: false,
	},
	// Mistral models
	"mistral-medium": {
		maxTokens: 8192,
		contextWindow: 128000,
		supportsImages: false,
		supportsPromptCache: false,
	},
	// Grok models
	grok: {
		maxTokens: 8192,
		contextWindow: 128000,
		supportsImages: false,
		supportsPromptCache: false,
	},
	"grok-3": {
		maxTokens: 8192,
		contextWindow: 128000,
		supportsImages: false,
		supportsPromptCache: false,
	},
	"grok-4": {
		maxTokens: 8192,
		contextWindow: 128000,
		supportsImages: false,
		supportsPromptCache: false,
	},
}

const DEFAULT_MODEL_INFO: ModelInfo = {
	maxTokens: 4096,
	contextWindow: 128000,
	supportsImages: false,
	supportsPromptCache: false,
}

/**
 * Get model capabilities from the static fallback map
 */
function getModelCapabilities(modelName: string): ModelInfo {
	// Try exact match first
	if (MODEL_CAPABILITIES[modelName]) {
		return { ...DEFAULT_MODEL_INFO, ...MODEL_CAPABILITIES[modelName] }
	}

	// Try prefix match (e.g., "gpt-4o-2024-08-06" matches "gpt-4o")
	for (const [prefix, capabilities] of Object.entries(MODEL_CAPABILITIES)) {
		if (modelName.startsWith(prefix)) {
			return { ...DEFAULT_MODEL_INFO, ...capabilities }
		}
	}

	return DEFAULT_MODEL_INFO
}

export const MicrosoftFoundryProvider = ({ showModelOptions, isPopup, currentMode }: MicrosoftFoundryProviderProps) => {
	const { apiConfiguration, remoteConfigSettings } = useExtensionState()
	const { handleFieldChange, handleModeFieldChange, handleModeFieldsChange } = useApiConfigurationHandlers()

	// Local state
	const [deployments, setDeployments] = useState<Deployment[]>([])
	const [isDiscovering, setIsDiscovering] = useState(false)
	const [discoveryError, setDiscoveryError] = useState<string | null>(null)
	const [showAdvanced, setShowAdvanced] = useState(false)

	// Get current configuration values
	const cloudEnvironment = (apiConfiguration?.microsoftFoundryCloudEnvironment as CloudEnvironment) ?? "commercial"
	const useIdentity = apiConfiguration?.microsoftFoundryUseIdentity ?? true
	const endpoint = apiConfiguration?.microsoftFoundryEndpoint ?? ""

	// Get mode-specific fields
	const { selectedModelId, selectedModelInfo } = normalizeApiConfiguration(apiConfiguration, currentMode)
	const modeFields = getModeSpecificFields(apiConfiguration, currentMode)

	// Get the deployment ID for the current mode
	const deploymentId =
		currentMode === "plan"
			? apiConfiguration?.planModeMicrosoftFoundryDeploymentId
			: apiConfiguration?.actModeMicrosoftFoundryDeploymentId

	/**
	 * Discover deployments from the Azure OpenAI endpoint using the extension host.
	 * This uses Azure CLI to list actual deployments (not the model catalog).
	 */
	const discoverDeployments = useCallback(async () => {
		if (!endpoint) {
			setDiscoveryError("Please enter an endpoint URL first")
			return
		}

		setIsDiscovering(true)
		setDiscoveryError(null)

		try {
			// Call the extension host to discover deployments via Azure CLI
			const response = await ModelsServiceClient.getMicrosoftFoundryDeployments({
				endpoint: endpoint.replace(/\/$/, ""),
			})

			if (response.error) {
				throw new Error(response.error)
			}

			const discoveredDeployments: Deployment[] = (response.deployments ?? []).map((d) => ({
				id: d.id ?? "",
				model: d.model ?? d.id ?? "",
			}))

			setDeployments(discoveredDeployments)

			if (discoveredDeployments.length === 0) {
				setDiscoveryError("No deployments found. Deploy a model in Azure AI Foundry first, then click Refresh.")
			}
		} catch (error: unknown) {
			console.error("Deployment discovery failed:", error)
			const message = error instanceof Error ? error.message : "Failed to discover deployments"
			setDiscoveryError(message)
		} finally {
			setIsDiscovering(false)
		}
	}, [endpoint])

	/**
	 * Handle deployment selection
	 */
	const handleDeploymentChange = useCallback(
		(deploymentId: string) => {
			const deployment = deployments.find((d) => d.id === deploymentId)
			const modelInfo = deployment ? getModelCapabilities(deployment.model) : DEFAULT_MODEL_INFO

			handleModeFieldsChange(
				{
					deploymentId: {
						plan: "planModeMicrosoftFoundryDeploymentId",
						act: "actModeMicrosoftFoundryDeploymentId",
					},
					modelInfo: {
						plan: "planModeMicrosoftFoundryModelInfo",
						act: "actModeMicrosoftFoundryModelInfo",
					},
				},
				{
					deploymentId,
					modelInfo,
				},
				currentMode,
			)
		},
		[deployments, handleModeFieldsChange, currentMode],
	)

	// Get model info for display
	const currentModelInfo =
		currentMode === "plan"
			? apiConfiguration?.planModeMicrosoftFoundryModelInfo
			: apiConfiguration?.actModeMicrosoftFoundryModelInfo

	return (
		<div className="flex flex-col gap-3">
			{/* Cloud Environment Selection */}
			<div>
				<span className="font-medium">Cloud Environment</span>
				<VSCodeRadioGroup
					className="mt-1"
					onChange={(e) => {
						const value = (e.target as HTMLInputElement)?.value as CloudEnvironment
						handleFieldChange("microsoftFoundryCloudEnvironment", value)
					}}
					value={cloudEnvironment}>
					<VSCodeRadio value="commercial">Azure Commercial</VSCodeRadio>
					<VSCodeRadio value="government">Azure Government</VSCodeRadio>
					<VSCodeRadio value="stack">Azure Stack</VSCodeRadio>
				</VSCodeRadioGroup>
			</div>

			{/* Endpoint URL */}
			<Tooltip>
				<TooltipTrigger className="w-full">
					<div className="flex items-center gap-2 mb-1">
						<span className="font-medium">Endpoint URL</span>
						{remoteConfigSettings?.microsoftFoundryEndpoint !== undefined && (
							<i className="codicon codicon-lock text-description text-sm" />
						)}
					</div>
					<DebouncedTextField
						className="w-full"
						disabled={remoteConfigSettings?.microsoftFoundryEndpoint !== undefined}
						initialValue={endpoint}
						onChange={(value) => handleFieldChange("microsoftFoundryEndpoint", value)}
						placeholder={
							cloudEnvironment === "government"
								? "https://your-resource.openai.azure.us"
								: "https://your-resource.openai.azure.com"
						}
						type="text"
					/>
				</TooltipTrigger>
				<TooltipContent hidden={remoteConfigSettings?.microsoftFoundryEndpoint === undefined}>
					This setting is managed by your organization's remote configuration
				</TooltipContent>
			</Tooltip>

			{/* Authentication Method */}
			<div>
				<span className="font-medium">Authentication</span>
				<VSCodeRadioGroup
					className="mt-1"
					onChange={(e) => {
						const useIdentity = (e.target as HTMLInputElement)?.value === "identity"
						handleFieldChange("microsoftFoundryUseIdentity", useIdentity)
					}}
					value={useIdentity ? "identity" : "apikey"}>
					<VSCodeRadio value="identity">Azure Identity (Azure CLI)</VSCodeRadio>
					<VSCodeRadio value="apikey">API Key</VSCodeRadio>
				</VSCodeRadioGroup>

				{useIdentity ? (
					<p className="mt-2 text-sm text-description">
						Uses your Azure CLI session for authentication. Run <code>az login</code> to authenticate.
					</p>
				) : (
					<DebouncedTextField
						className="w-full mt-2"
						initialValue={apiConfiguration?.microsoftFoundryApiKey ?? ""}
						onChange={(value) => handleFieldChange("microsoftFoundryApiKey", value)}
						placeholder="Enter API Key..."
						type="password">
						<span className="font-medium">API Key</span>
					</DebouncedTextField>
				)}
			</div>

			{/* Custom Scope for Azure Stack */}
			{cloudEnvironment === "stack" && (
				<DebouncedTextField
					className="w-full"
					initialValue={apiConfiguration?.microsoftFoundryCustomScope ?? ""}
					onChange={(value) => handleFieldChange("microsoftFoundryCustomScope", value)}
					placeholder="https://cognitiveservices.your-stack/.default">
					<span className="font-medium">Custom Audience Scope</span>
				</DebouncedTextField>
			)}

			{/* Deployment Selection */}
			{showModelOptions && (
				<>
					<div>
						<div className="flex items-center justify-between mb-1">
							<span className="font-medium">Deployment</span>
							{cloudEnvironment !== "stack" && (
								<VSCodeButton
									appearance="secondary"
									disabled={isDiscovering || !endpoint}
									onClick={discoverDeployments}>
									{isDiscovering ? "Discovering..." : "Refresh Deployments"}
								</VSCodeButton>
							)}
						</div>

						{discoveryError && (
							<p className="mb-2 text-sm" style={{ color: "var(--vscode-errorForeground)" }}>
								{discoveryError}
							</p>
						)}

						{cloudEnvironment === "stack" || deployments.length === 0 ? (
							// Manual deployment ID input for Stack or when no deployments discovered
							<>
								<DebouncedTextField
									className="w-full"
									initialValue={deploymentId ?? ""}
									onChange={(value) =>
										handleModeFieldChange(
											{
												plan: "planModeMicrosoftFoundryDeploymentId",
												act: "actModeMicrosoftFoundryDeploymentId",
											},
											value,
											currentMode,
										)
									}
									placeholder="e.g., gpt-4o, my-gpt4-deployment">
									{cloudEnvironment === "stack" ? (
										<span className="text-xs text-description">
											For Azure Stack, enter your deployment name manually
										</span>
									) : (
										<span className="text-xs text-description">
											Enter the deployment name from your Azure AI Foundry project
										</span>
									)}
								</DebouncedTextField>
							</>
						) : (
							// Dropdown for discovered deployments
							<DropdownContainer className="dropdown-container" zIndex={DROPDOWN_Z_INDEX}>
								<VSCodeDropdown
									className="w-full"
									onChange={(e: any) => handleDeploymentChange(e.target.value)}
									value={deploymentId ?? ""}>
									<VSCodeOption value="">Select a deployment...</VSCodeOption>
									{deployments.map((deployment) => (
										<VSCodeOption key={deployment.id} value={deployment.id}>
											{deployment.id} ({deployment.model})
										</VSCodeOption>
									))}
								</VSCodeDropdown>
							</DropdownContainer>
						)}
					</div>

					{/* Advanced Settings */}
					<div
						onClick={() => setShowAdvanced((val) => !val)}
						style={{
							color: getAsVar(VSC_DESCRIPTION_FOREGROUND),
							display: "flex",
							cursor: "pointer",
							alignItems: "center",
						}}>
						<span
							className={`codicon ${showAdvanced ? "codicon-chevron-down" : "codicon-chevron-right"}`}
							style={{ marginRight: "4px" }}></span>
						<span style={{ fontWeight: 700, textTransform: "uppercase" }}>Advanced Settings</span>
					</div>

					{showAdvanced && (
						<div className="flex flex-col gap-2 ml-4">
							<DebouncedTextField
								className="w-full"
								initialValue={apiConfiguration?.microsoftFoundryApiVersion ?? ""}
								onChange={(value) => handleFieldChange("microsoftFoundryApiVersion", value)}
								placeholder={`Default: ${azureOpenAiDefaultApiVersion}`}>
								<span className="font-medium">API Version Override</span>
							</DebouncedTextField>
						</div>
					)}

					{/* Model Info Display */}
					{deploymentId && (
						<ModelInfoView
							isPopup={isPopup}
							modelInfo={currentModelInfo ?? DEFAULT_MODEL_INFO}
							selectedModelId={deploymentId}
						/>
					)}
				</>
			)}
		</div>
	)
}
