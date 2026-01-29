import { DefaultAzureCredential, getBearerTokenProvider } from "@azure/identity"
import { azureOpenAiDefaultApiVersion, ModelInfo } from "@shared/api"
import OpenAI, { AzureOpenAI } from "openai"
import type { ChatCompletionReasoningEffort, ChatCompletionTool } from "openai/resources/chat/completions"
import { ClineStorageMessage } from "@/shared/messages/content"
import { fetch } from "@/shared/net"
import { Logger } from "@/shared/services/Logger"
import { ApiHandler, ApiHandlerModel, CommonApiHandlerOptions } from "../index"
import { withRetry } from "../retry"
import { convertToOpenAiMessages } from "../transform/openai-format"
import { ApiStream } from "../transform/stream"
import { getOpenAIToolParams, ToolCallProcessor } from "../transform/tool-call-processor"

// Cloud environment types
export type MicrosoftFoundryCloudEnvironment = "commercial" | "government" | "stack"

// Handler options interface
export interface MicrosoftFoundryHandlerOptions extends CommonApiHandlerOptions {
	microsoftFoundryEndpoint?: string
	microsoftFoundryApiKey?: string
	microsoftFoundryDeploymentId?: string
	microsoftFoundryCloudEnvironment?: MicrosoftFoundryCloudEnvironment
	microsoftFoundryUseIdentity?: boolean
	microsoftFoundryCustomScope?: string
	microsoftFoundryApiVersion?: string
	microsoftFoundryModelInfo?: ModelInfo
	reasoningEffort?: string
}

/**
 * Static fallback model capabilities for known Azure OpenAI models.
 * Used when deployment discovery doesn't return complete model info.
 */
const FOUNDRY_MODEL_CAPABILITIES: Record<string, Partial<ModelInfo>> = {
	// GPT-5 family
	"gpt-5": {
		maxTokens: 32768,
		contextWindow: 256000,
		supportsImages: true,
		supportsPromptCache: true,
		inputPrice: 5.0,
		outputPrice: 20.0,
	},
	"gpt-5-mini": {
		maxTokens: 32768,
		contextWindow: 256000,
		supportsImages: true,
		supportsPromptCache: true,
		inputPrice: 1.0,
		outputPrice: 4.0,
	},
	"gpt-5.2": {
		maxTokens: 32768,
		contextWindow: 256000,
		supportsImages: true,
		supportsPromptCache: true,
		inputPrice: 5.0,
		outputPrice: 20.0,
	},
	"gpt-5.2-chat": {
		maxTokens: 32768,
		contextWindow: 256000,
		supportsImages: true,
		supportsPromptCache: true,
		inputPrice: 5.0,
		outputPrice: 20.0,
	},
	// GPT-4o family
	"gpt-4o": {
		maxTokens: 16384,
		contextWindow: 128000,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 2.5,
		outputPrice: 10.0,
	},
	"gpt-4o-mini": {
		maxTokens: 16384,
		contextWindow: 128000,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 0.15,
		outputPrice: 0.6,
	},
	// GPT-4 family
	"gpt-4": {
		maxTokens: 8192,
		contextWindow: 128000,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 30.0,
		outputPrice: 60.0,
	},
	"gpt-4-turbo": {
		maxTokens: 4096,
		contextWindow: 128000,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 10.0,
		outputPrice: 30.0,
	},
	// o1 reasoning family
	o1: {
		maxTokens: 100000,
		contextWindow: 200000,
		supportsImages: true,
		supportsPromptCache: false,
		supportsReasoning: true,
		inputPrice: 15.0,
		outputPrice: 60.0,
	},
	"o1-mini": {
		maxTokens: 65536,
		contextWindow: 128000,
		supportsImages: false,
		supportsPromptCache: false,
		supportsReasoning: true,
		inputPrice: 3.0,
		outputPrice: 12.0,
	},
	"o1-preview": {
		maxTokens: 32768,
		contextWindow: 128000,
		supportsImages: false,
		supportsPromptCache: false,
		supportsReasoning: true,
		inputPrice: 15.0,
		outputPrice: 60.0,
	},
	// o3 reasoning family
	o3: {
		maxTokens: 100000,
		contextWindow: 200000,
		supportsImages: true,
		supportsPromptCache: false,
		supportsReasoning: true,
		inputPrice: 10.0,
		outputPrice: 40.0,
	},
	"o3-mini": {
		maxTokens: 65536,
		contextWindow: 200000,
		supportsImages: false,
		supportsPromptCache: false,
		supportsReasoning: true,
		inputPrice: 1.1,
		outputPrice: 4.4,
	},
	// GPT-4.1 family
	"gpt-4.1": {
		maxTokens: 32768,
		contextWindow: 1047576,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 2.0,
		outputPrice: 8.0,
	},
	"gpt-4.1-mini": {
		maxTokens: 32768,
		contextWindow: 1047576,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 0.4,
		outputPrice: 1.6,
	},
	"gpt-4.1-nano": {
		maxTokens: 32768,
		contextWindow: 1047576,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 0.1,
		outputPrice: 0.4,
	},
	// o1-pro
	"o1-pro": {
		maxTokens: 100000,
		contextWindow: 200000,
		supportsImages: true,
		supportsPromptCache: false,
		supportsReasoning: true,
		inputPrice: 150.0,
		outputPrice: 600.0,
	},
	// o4-mini reasoning family
	"o4-mini": {
		maxTokens: 65536,
		contextWindow: 200000,
		supportsImages: true,
		supportsPromptCache: false,
		supportsReasoning: true,
		inputPrice: 1.1,
		outputPrice: 4.4,
	},
	// GPT-3.5 family
	"gpt-35-turbo": {
		maxTokens: 4096,
		contextWindow: 16385,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.5,
		outputPrice: 1.5,
	},
	// Claude models (via Azure AI Foundry)
	"claude-sonnet-4-5": {
		maxTokens: 8192,
		contextWindow: 200000,
		supportsImages: true,
		supportsPromptCache: true,
		supportsReasoning: true,
		inputPrice: 3.0,
		outputPrice: 15.0,
	},
	"claude-opus-4": {
		maxTokens: 8192,
		contextWindow: 200000,
		supportsImages: true,
		supportsPromptCache: true,
		supportsReasoning: true,
		inputPrice: 15.0,
		outputPrice: 75.0,
	},
	"claude-haiku-4": {
		maxTokens: 8192,
		contextWindow: 200000,
		supportsImages: true,
		supportsPromptCache: true,
		inputPrice: 0.8,
		outputPrice: 4.0,
	},
	// Phi models
	"Phi-4": {
		maxTokens: 16384,
		contextWindow: 128000,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.0,
		outputPrice: 0.0,
	},
	"Phi-4-mini": {
		maxTokens: 16384,
		contextWindow: 128000,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.0,
		outputPrice: 0.0,
	},
	"Phi-4-multimodal": {
		maxTokens: 16384,
		contextWindow: 128000,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 0.0,
		outputPrice: 0.0,
	},
	// Llama models
	"Llama-3.3-70B": {
		maxTokens: 8192,
		contextWindow: 128000,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.0,
		outputPrice: 0.0,
	},
	"Llama-4": {
		maxTokens: 8192,
		contextWindow: 128000,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.0,
		outputPrice: 0.0,
	},
	// DeepSeek models
	"DeepSeek-V3": {
		maxTokens: 8192,
		contextWindow: 128000,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.0,
		outputPrice: 0.0,
	},
	// Mistral models
	"mistral-medium": {
		maxTokens: 8192,
		contextWindow: 128000,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.0,
		outputPrice: 0.0,
	},
	// Grok models
	grok: {
		maxTokens: 8192,
		contextWindow: 128000,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.0,
		outputPrice: 0.0,
	},
	"grok-3": {
		maxTokens: 8192,
		contextWindow: 128000,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.0,
		outputPrice: 0.0,
	},
	"grok-4": {
		maxTokens: 8192,
		contextWindow: 128000,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.0,
		outputPrice: 0.0,
	},
}

/**
 * Default model info used when model is unknown
 */
const DEFAULT_MODEL_INFO: ModelInfo = {
	maxTokens: 4096,
	contextWindow: 128000,
	supportsImages: false,
	supportsPromptCache: false,
	inputPrice: 0,
	outputPrice: 0,
}

/**
 * Get model capabilities from the static fallback map
 */
function getModelCapabilities(modelName: string): ModelInfo {
	// Try exact match first
	if (FOUNDRY_MODEL_CAPABILITIES[modelName]) {
		return { ...DEFAULT_MODEL_INFO, ...FOUNDRY_MODEL_CAPABILITIES[modelName] }
	}

	// Try prefix match (e.g., "gpt-4o-2024-08-06" matches "gpt-4o")
	for (const [prefix, capabilities] of Object.entries(FOUNDRY_MODEL_CAPABILITIES)) {
		if (modelName.startsWith(prefix)) {
			return { ...DEFAULT_MODEL_INFO, ...capabilities }
		}
	}

	return DEFAULT_MODEL_INFO
}

/**
 * Microsoft Foundry API Handler
 *
 * Provides access to Azure OpenAI models through Microsoft Foundry.
 * Supports Azure Commercial, Azure Government, and Azure Stack clouds.
 */
export class MicrosoftFoundryHandler implements ApiHandler {
	private options: MicrosoftFoundryHandlerOptions
	private client: AzureOpenAI | undefined

	constructor(options: MicrosoftFoundryHandlerOptions) {
		this.options = options
	}

	/**
	 * Get the appropriate Azure AD audience scope based on the endpoint URL
	 * and cloud environment configuration.
	 */
	private getAudienceScope(): string {
		const endpoint = this.options.microsoftFoundryEndpoint?.toLowerCase() ?? ""
		const cloudEnv = this.options.microsoftFoundryCloudEnvironment ?? "commercial"

		// For Stack environments, use custom scope if provided
		if (cloudEnv === "stack" && this.options.microsoftFoundryCustomScope) {
			return this.options.microsoftFoundryCustomScope
		}

		// Auto-detect from endpoint URL
		if (endpoint.includes("azure.us")) {
			return "https://cognitiveservices.azure.us/.default"
		}

		if (endpoint.includes("azure.com")) {
			return "https://cognitiveservices.azure.com/.default"
		}

		// Fallback based on cloud environment selection
		switch (cloudEnv) {
			case "government":
				return "https://cognitiveservices.azure.us/.default"
			case "stack":
				// Stack without custom scope - this is a configuration error
				if (!this.options.microsoftFoundryCustomScope) {
					throw new Error(
						"Azure Stack environment requires a custom audience scope. Please configure 'Custom Scope' in the provider settings.",
					)
				}
				return this.options.microsoftFoundryCustomScope
			case "commercial":
			default:
				return "https://cognitiveservices.azure.com/.default"
		}
	}

	/**
	 * Get the API version to use for requests.
	 * Uses user override if provided, otherwise falls back to default.
	 */
	private getApiVersion(): string {
		return this.options.microsoftFoundryApiVersion || azureOpenAiDefaultApiVersion
	}

	/**
	 * Initialize or return the existing Azure OpenAI client.
	 */
	private ensureClient(): AzureOpenAI {
		if (!this.client) {
			// Validate required configuration
			if (!this.options.microsoftFoundryEndpoint) {
				throw new Error("Microsoft Foundry endpoint is required. Please configure the endpoint URL.")
			}

			if (!this.options.microsoftFoundryApiKey && !this.options.microsoftFoundryUseIdentity) {
				throw new Error(
					"Microsoft Foundry requires either an API key or Azure Identity authentication. Please configure one of these options.",
				)
			}

			try {
				const endpoint = this.options.microsoftFoundryEndpoint

				if (this.options.microsoftFoundryUseIdentity) {
					// Use Azure Identity (DefaultAzureCredential picks up Azure CLI context)
					this.client = new AzureOpenAI({
						endpoint,
						azureADTokenProvider: getBearerTokenProvider(new DefaultAzureCredential(), this.getAudienceScope()),
						apiVersion: this.getApiVersion(),
						fetch,
					})
				} else {
					// Use API key authentication
					this.client = new AzureOpenAI({
						endpoint,
						apiKey: this.options.microsoftFoundryApiKey,
						apiVersion: this.getApiVersion(),
						fetch,
					})
				}
			} catch (error: unknown) {
				// Provide tailored error messages
				const errorMessage = this.getDetailedErrorMessage(error)
				throw new Error(errorMessage)
			}
		}
		return this.client
	}

	/**
	 * Translate errors into actionable, provider-specific messages.
	 */
	private getDetailedErrorMessage(error: unknown): string {
		const message = error instanceof Error ? error.message : String(error)
		const err = error as any // tailored access to properties
		const statusCode = err?.status || err?.statusCode

		// Authentication errors
		if (statusCode === 401 || message.includes("401") || message.includes("Unauthorized")) {
			if (this.options.microsoftFoundryUseIdentity) {
				return "Azure CLI session expired or not authenticated. Run `az login` to re-authenticate, then try again."
			}
			return "Invalid API key. Please verify your Microsoft Foundry API key is correct."
		}

		// Authorization errors
		if (statusCode === 403 || message.includes("403") || message.includes("Forbidden")) {
			return "Insufficient permissions. Ensure your account has the 'Cognitive Services User' role assigned for this resource."
		}

		// Not found errors
		if (statusCode === 404 || message.includes("404") || message.includes("Not Found")) {
			if (message.includes("deployment") || message.includes("Deployment") || message.includes("DeploymentNotFound")) {
				return (
					`Deployment '${this.options.microsoftFoundryDeploymentId}' not found. ` +
					"Verify that:\n" +
					"1. The deployment exists in your Azure AI Foundry project\n" +
					"2. The deployment name is spelled correctly\n" +
					"3. The model has been deployed (not just available in the catalog)"
				)
			}
			return "Resource not found. Verify the endpoint URL is correct."
		}

		// Rate limiting
		if (statusCode === 429 || message.includes("429") || message.includes("Too Many Requests")) {
			return "Rate limit exceeded. Please wait a moment and try again, or request a quota increase for your Azure OpenAI resource."
		}

		// Network errors
		if (message.includes("ENOTFOUND") || message.includes("ECONNREFUSED") || message.includes("network")) {
			return "Unable to reach Microsoft Foundry endpoint. Check your network connectivity and verify the endpoint URL is correct."
		}

		// Default error
		return `Microsoft Foundry error: ${message}`
	}

	/**
	 * Create a streaming message response.
	 */
	@withRetry()
	async *createMessage(systemPrompt: string, messages: ClineStorageMessage[], tools?: ChatCompletionTool[]): ApiStream {
		const client = this.ensureClient()
		const deploymentId = this.options.microsoftFoundryDeploymentId

		if (!deploymentId) {
			throw new Error("No deployment selected. Please select a deployment from the Microsoft Foundry provider settings.")
		}

		const deploymentLower = deploymentId.toLowerCase()
		const modelInfo = this.options.microsoftFoundryModelInfo ?? getModelCapabilities(deploymentId)

		// Determine if this is a reasoning model (o1/o3/o4 family)
		const isReasoningModel =
			modelInfo.supportsReasoning ||
			(["o1", "o3", "o4"].some((prefix) => deploymentLower.includes(prefix)) && !deploymentLower.includes("chat"))

		// Models that don't support custom temperature (only default value of 1)
		// GPT-5.x models have this restriction
		const noTemperatureSupport =
			deploymentLower.includes("gpt-5") ||
			deploymentLower.includes("gpt5") ||
			// Add other models that don't support temperature as discovered
			isReasoningModel

		// Build messages array
		let openAiMessages: OpenAI.Chat.ChatCompletionMessageParam[]
		const temperature: number | undefined = noTemperatureSupport ? undefined : 0.7
		let reasoningEffort: ChatCompletionReasoningEffort | undefined
		if (isReasoningModel) {
			// Reasoning models use 'developer' role for system prompt
			openAiMessages = [{ role: "developer", content: systemPrompt }, ...convertToOpenAiMessages(messages)]
			reasoningEffort = (this.options.reasoningEffort as ChatCompletionReasoningEffort) || "medium"
		} else {
			openAiMessages = [{ role: "system", content: systemPrompt }, ...convertToOpenAiMessages(messages)]
		}

		try {
			const stream = await client.chat.completions.create({
				model: deploymentId, // In Azure OpenAI, model = deployment name
				messages: openAiMessages,
				temperature,
				...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
				stream: true,
				stream_options: { include_usage: true },
				...getOpenAIToolParams(tools),
			})

			const toolCallProcessor = new ToolCallProcessor()

			for await (const chunk of stream) {
				const delta = chunk.choices?.[0]?.delta

				// Yield text content
				if (delta?.content) {
					yield {
						type: "text",
						text: delta.content,
					}
				}

				// Yield reasoning content (for o1/o3 models)
				if (delta && "reasoning_content" in delta && delta.reasoning_content) {
					yield {
						type: "reasoning",
						reasoning: (delta.reasoning_content as string | undefined) || "",
					}
				}

				// Yield tool calls
				if (delta?.tool_calls) {
					yield* toolCallProcessor.processToolCallDeltas(delta.tool_calls)
				}

				// Yield usage information
				if (chunk.usage) {
					yield {
						type: "usage",
						inputTokens: chunk.usage.prompt_tokens || 0,
						outputTokens: chunk.usage.completion_tokens || 0,
						cacheReadTokens: chunk.usage.prompt_tokens_details?.cached_tokens || 0,
						cacheWriteTokens: 0,
					}
				}
			}
		} catch (error: any) {
			Logger.error("Microsoft Foundry API error:", error)
			throw new Error(this.getDetailedErrorMessage(error))
		}
	}

	/**
	 * Get the current model configuration.
	 */
	getModel(): ApiHandlerModel {
		const deploymentId = this.options.microsoftFoundryDeploymentId ?? ""

		// Use provided model info or fallback to static capabilities
		const modelInfo = this.options.microsoftFoundryModelInfo ?? getModelCapabilities(deploymentId)

		return {
			id: deploymentId,
			info: modelInfo,
		}
	}
}
