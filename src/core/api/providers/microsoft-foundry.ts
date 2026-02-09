/**
 * Microsoft Foundry Provider Handler
 *
 * Supports two authentication modes:
 * 1. Entra ID (SSO) — uses @azure/identity DefaultAzureCredential + getBearerTokenProvider
 * 2. API Key (BYOK) — uses endpoint + API key + deployment name
 *
 * Endpoint classification uses regex to detect Azure Commercial vs Azure Government
 * and selects the correct Cognitive Services token audience scope.
 *
 * References:
 * - https://learn.microsoft.com/en-us/azure/ai-foundry/foundry-models/concepts/endpoints
 * - https://learn.microsoft.com/en-us/azure/ai-foundry/foundry-models/how-to/configure-entra-id
 * - https://learn.microsoft.com/en-us/azure/ai-foundry/openai/azure-government
 */
import { AzureAuthorityHosts, DefaultAzureCredential, getBearerTokenProvider } from "@azure/identity"
import {
	type AzureCloudEnvironment,
	classifyAzureEndpoint,
	getAzureCognitiveScope,
	type MicrosoftFoundryAuthMode,
	microsoftFoundryDefaultApiVersion,
	microsoftFoundryModelInfoSaneDefaults,
	type ModelInfo,
} from "@shared/api"
import { AzureOpenAI } from "openai"
import type OpenAI from "openai"
import type { ChatCompletionReasoningEffort, ChatCompletionTool } from "openai/resources/chat/completions"
import { buildExternalBasicHeaders } from "@/services/EnvUtils"
import { ClineStorageMessage } from "@/shared/messages/content"
import { Logger } from "@/shared/services/Logger"
import { fetch } from "@/shared/net"
import { normalizeOpenaiReasoningEffort } from "@shared/storage/types"
import { ApiHandler, CommonApiHandlerOptions } from "../index"
import { withRetry } from "../retry"
import { convertToOpenAiMessages } from "../transform/openai-format"
import { ApiStream } from "../transform/stream"
import { getOpenAIToolParams, ToolCallProcessor } from "../transform/tool-call-processor"

export interface MicrosoftFoundryHandlerOptions extends CommonApiHandlerOptions {
	/** Azure AI Foundry endpoint URL (e.g. https://<resource>.openai.azure.com) */
	microsoftFoundryEndpoint?: string
	/** API key for BYOK authentication mode */
	microsoftFoundryApiKey?: string
	/** Model deployment name in the Foundry resource (required for API calls) */
	microsoftFoundryDeploymentName?: string
	/** Authentication mode: "entra-id" (SSO) or "api-key" (BYOK) */
	microsoftFoundryAuthMode?: MicrosoftFoundryAuthMode
	/** Azure OpenAI API version override */
	microsoftFoundryApiVersion?: string
	/** Model ID (plan/act mode resolved) */
	apiModelId?: string
	/** Reasoning effort for compatible models */
	reasoningEffort?: string
	/** Custom model info for context window / max output tokens overrides */
	microsoftFoundryModelInfo?: ModelInfo
	/** Thinking budget tokens (stored for validation; not passed to API directly) */
	thinkingBudgetTokens?: number
}

export class MicrosoftFoundryHandler implements ApiHandler {
	private options: MicrosoftFoundryHandlerOptions
	private client: AzureOpenAI | undefined

	constructor(options: MicrosoftFoundryHandlerOptions) {
		this.options = options
	}

	/**
	 * Detect the Azure cloud environment from the configured endpoint.
	 * Used for logging and diagnostics; auth scope selection is handled by getAzureCognitiveScope.
	 */
	private getCloudEnvironment(): AzureCloudEnvironment | undefined {
		return classifyAzureEndpoint(this.options.microsoftFoundryEndpoint)
	}

	/**
	 * Lazily initializes the AzureOpenAI client based on the configured auth mode.
	 *
	 * Entra ID mode: Uses DefaultAzureCredential with a bearer token provider scoped
	 * to the correct Cognitive Services audience for the detected cloud environment.
	 *
	 * API Key mode: Uses the provided API key directly.
	 *
	 * Both modes validate the endpoint URL and API version before creating the client.
	 */
	private ensureClient(): AzureOpenAI {
		if (!this.client) {
			const endpoint = this.options.microsoftFoundryEndpoint
			if (!endpoint) {
				throw new Error(
					"Microsoft Foundry endpoint URL is required. " +
						'Provide the endpoint in the format "https://<resource>.openai.azure.com" or ' +
						'"https://<resource>.openai.azure.us" for Azure Government.',
				)
			}

			const cloud = this.getCloudEnvironment()
			if (!cloud) {
				throw new Error(
					"The endpoint URL does not match a known Azure environment. " +
						"Expected patterns: *.openai.azure.com (Commercial), " +
						"*.openai.azure.us or *.usgovcloudapi.net (Government).",
				)
			}

			const apiVersion = this.options.microsoftFoundryApiVersion || microsoftFoundryDefaultApiVersion
			const authMode = this.options.microsoftFoundryAuthMode ?? "entra-id"
			const externalHeaders = buildExternalBasicHeaders()

			Logger.info(
				`Microsoft Foundry: Initializing client [cloud=${cloud}, auth=${authMode}, apiVersion=${apiVersion}]`,
			)

			try {
				if (authMode === "entra-id") {
					// SSO via DefaultAzureCredential — supports Azure CLI, Managed Identity,
					// Visual Studio, environment variables, etc.
					const scope = getAzureCognitiveScope(endpoint)!
					const authorityHost =
						cloud === "government" ? AzureAuthorityHosts.AzureGovernment : AzureAuthorityHosts.AzurePublicCloud
					this.client = new AzureOpenAI({
						endpoint,
						azureADTokenProvider: getBearerTokenProvider(new DefaultAzureCredential({ authorityHost }), scope),
						apiVersion,
						defaultHeaders: externalHeaders,
						fetch,
					})
				} else {
					// BYOK — API key authentication
					if (!this.options.microsoftFoundryApiKey) {
						throw new Error(
							"API key is required when using API Key authentication mode. " +
								"Provide the key from your Azure AI Foundry resource, or switch to Entra ID (SSO) authentication.",
						)
					}
					this.client = new AzureOpenAI({
						endpoint,
						apiKey: this.options.microsoftFoundryApiKey,
						apiVersion,
						defaultHeaders: externalHeaders,
						fetch,
					})
				}
			} catch (error: any) {
				throw new Error(`Failed to create Microsoft Foundry client: ${error.message}`)
			}
		}
		return this.client
	}

	@withRetry()
	async *createMessage(
		systemPrompt: string,
		messages: ClineStorageMessage[],
		tools?: ChatCompletionTool[],
	): ApiStream {
		const client = this.ensureClient()
		const deploymentName = this.options.microsoftFoundryDeploymentName || ""

		if (!deploymentName) {
			throw new Error(
				"Model deployment name is required. " +
					"Provide the deployment name from your Azure AI Foundry resource.",
			)
		}

		const openAiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
			{ role: "system", content: systemPrompt },
			...convertToOpenAiMessages(messages),
		]

		// Reasoning effort — pass through if user has configured it (no auto-detection;
		// deployment names are user-defined and don't reliably indicate the model).
		// The API ignores reasoning_effort for non-reasoning models.
		let reasoningEffort: ChatCompletionReasoningEffort | undefined
		if (this.options.reasoningEffort) {
			const requestedEffort = normalizeOpenaiReasoningEffort(this.options.reasoningEffort)
			reasoningEffort = requestedEffort === "none" ? undefined : (requestedEffort as ChatCompletionReasoningEffort)
		}

		let maxTokens: number | undefined
		if (this.options.microsoftFoundryModelInfo?.maxTokens && this.options.microsoftFoundryModelInfo.maxTokens > 0) {
			maxTokens = Number(this.options.microsoftFoundryModelInfo.maxTokens)
		}

		const stream = await client.chat.completions.create({
			model: deploymentName,
			messages: openAiMessages,
			temperature: reasoningEffort ? undefined : 0,
			max_completion_tokens: maxTokens,
			reasoning_effort: reasoningEffort,
			stream: true,
			stream_options: { include_usage: true },
			...getOpenAIToolParams(tools),
		})

		const toolCallProcessor = new ToolCallProcessor()

		for await (const chunk of stream) {
			try {
				const delta = chunk.choices?.[0]?.delta
				if (delta?.content) {
					yield {
						type: "text" as const,
						text: delta.content,
					}
				}

				if (delta && "reasoning_content" in delta && delta.reasoning_content) {
					yield {
						type: "reasoning" as const,
						reasoning: (delta.reasoning_content as string | undefined) || "",
					}
				}

				// Process tool calls
				if (delta?.tool_calls) {
					yield* toolCallProcessor.processToolCallDeltas(delta.tool_calls)
				}

				if (chunk.usage) {
					yield {
						type: "usage" as const,
						inputTokens: chunk.usage.prompt_tokens ?? 0,
						outputTokens: chunk.usage.completion_tokens ?? 0,
						cacheReadTokens: chunk.usage.prompt_tokens_details?.cached_tokens || 0,
						// @ts-expect-error-next-line
						cacheWriteTokens: chunk.usage.prompt_cache_miss_tokens || 0,
					}
				}
			} catch (error) {
				yield {
					type: "text" as const,
					text: `[ERROR] Failed to process stream chunk: ${error instanceof Error ? error.message : String(error)}`,
				}
			}
		}
	}

	getModel() {
		const deploymentName = this.options.microsoftFoundryDeploymentName || ""
		return {
			id: deploymentName,
			info: this.options.microsoftFoundryModelInfo || microsoftFoundryModelInfoSaneDefaults,
		}
	}
}
