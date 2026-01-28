import { DefaultAzureCredential } from "@azure/identity"
import { type MicrosoftFoundryDeploymentsRequest, MicrosoftFoundryDeploymentsResponse } from "@shared/proto/cline/models"
import { fetch } from "@/shared/net"
import { Logger } from "@/shared/services/Logger"
import type { Controller } from ".."

/**
 * Extract Azure resource information from an endpoint URL.
 * Supports both OpenAI and Cognitive Services endpoints.
 *
 * @example
 * "https://my-resource.openai.azure.com" -> "my-resource"
 * "https://my-resource.cognitiveservices.azure.com" -> "my-resource"
 */
function extractResourceNameFromEndpoint(endpoint: string): string | null {
	try {
		const url = new URL(endpoint)
		const hostname = url.hostname.toLowerCase()

		// Try standard patterns first
		const match = hostname.match(/^([^.]+)\.(openai|cognitiveservices)\.(azure\.com|azure\.us)$/i)
		if (match) {
			return match[1]
		}

		// Fallback: take the first subdomain segment
		// This likely handles Stack environments or custom DNS
		const parts = hostname.split(".")
		if (parts.length > 0) {
			return parts[0]
		}

		return null
	} catch {
		return null
	}
}

/**
 * Fetches deployed models from Microsoft Foundry using Azure Resource Manager API.
 * This utilizes @azure/identity and direct HTTP calls to avoid Azure CLI command injection risks.
 *
 * @param _controller The controller instance
 * @param request The request containing the Azure OpenAI endpoint URL and optional ARM endpoint
 * @returns List of deployments or an error
 */
export async function getMicrosoftFoundryDeployments(
	_controller: Controller,
	request: MicrosoftFoundryDeploymentsRequest,
): Promise<MicrosoftFoundryDeploymentsResponse> {
	const endpoint = request.endpoint

	if (!endpoint) {
		return MicrosoftFoundryDeploymentsResponse.create({
			deployments: [],
			error: "No endpoint URL provided",
		})
	}

	// Extract and validate resource name
	const resourceName = extractResourceNameFromEndpoint(endpoint)
	if (!resourceName) {
		return MicrosoftFoundryDeploymentsResponse.create({
			deployments: [],
			error: "Could not extract resource name from endpoint URL.",
		})
	}

	// STRICT VALIDATION: Ensure resource name is alphanumeric (+ hyphens) to prevent injection
	// even though we are using parametrized queries or strictly typed APIs where possible,
	// Resource Graph queries still build strings.
	if (!/^[a-z0-9-]+$/i.test(resourceName)) {
		return MicrosoftFoundryDeploymentsResponse.create({
			deployments: [],
			error: "Invalid resource name format. Resource names must be alphanumeric and can contain hyphens.",
		})
	}

	try {
		Logger.info(`Looking up Azure resource: ${resourceName}`)

		// Determine environment and management endpoints based on configuration
		const isGov = endpoint.toLowerCase().includes(".azure.us")
		let managementEndpoint = "https://management.azure.com"
		let audienceScope = "https://management.azure.com/.default"

		if (request.armEndpoint) {
			// User provided ARM endpoint (e.g. for Azure Stack Hub or Stack Edge)
			managementEndpoint = request.armEndpoint.replace(/\/$/, "")
			// For Stack, the audience usually matches your ARM endpoint + .default
			// Note: Some Stack setups might require a different, custom audience.
			audienceScope = `${managementEndpoint}/.default`
		} else if (isGov) {
			managementEndpoint = "https://management.usgovcloudapi.net"
			audienceScope = "https://management.usgovcloudapi.net/.default"
		}

		// Authenticate
		const credential = new DefaultAzureCredential()
		const token = await credential.getToken(audienceScope)

		if (!token) {
			throw new Error("Failed to acquire access token for Azure Management API.")
		}

		// Step 1: Find the resource ID using Azure Resource Graph
		// likely efficient and works across subscriptions
		const query = `Resources | where name =~ '${resourceName}' and type =~ 'microsoft.cognitiveservices/accounts' | project id, resourceGroup, subscriptionId`

		const argUrl = `${managementEndpoint}/providers/Microsoft.ResourceGraph/resources?api-version=2021-03-01`
		Logger.info(`Querying Azure Resource Graph at ${argUrl}`)

		const argResponse = await fetch(argUrl, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token.token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				subscriptions: [], // Query all available subscriptions
				query: query,
				options: {
					resultFormat: "objectArray",
				},
			}),
		})

		if (!argResponse.ok) {
			const errorText = await argResponse.text()
			throw new Error(`Resource Graph query failed: ${argResponse.status} ${argResponse.statusText} - ${errorText}`)
		}

		const argData = await argResponse.json()
		const resources = argData.data as Array<{ id: string }>

		if (!resources || resources.length === 0) {
			return MicrosoftFoundryDeploymentsResponse.create({
				deployments: [],
				error: `Could not find Azure OpenAI resource '${resourceName}' in your visible subscriptions. Ensure you are logged in to the correct tenant.`,
			})
		}

		// Use the first match
		const resourceId = resources[0].id
		Logger.info(`Found resource ID: ${resourceId}`)

		// Step 2: List deployments for this resource
		const deploymentsUrl = `${managementEndpoint}${resourceId}/deployments?api-version=2023-05-01`
		Logger.info(`Listing deployments from ${deploymentsUrl}`)

		const deploymentsResponse = await fetch(deploymentsUrl, {
			method: "GET",
			headers: {
				Authorization: `Bearer ${token.token}`,
			},
		})

		if (!deploymentsResponse.ok) {
			const errorText = await deploymentsResponse.text()
			throw new Error(
				`Failed to list deployments: ${deploymentsResponse.status} ${deploymentsResponse.statusText} - ${errorText}`,
			)
		}

		const deploymentsData = await deploymentsResponse.json()
		const deployments = deploymentsData.value as Array<{
			name: string
			properties?: {
				model?: {
					name?: string
					version?: string
				}
			}
		}>

		if (!deployments || deployments.length === 0) {
			return MicrosoftFoundryDeploymentsResponse.create({
				deployments: [],
				error: "No deployments found for this resource.",
			})
		}

		// Map to proto format
		const result = deployments.map((d) => ({
			id: d.name,
			model: d.properties?.model?.name ?? d.name,
			modelVersion: d.properties?.model?.version ?? "",
		}))

		Logger.info(`Found ${result.length} deployments: ${result.map((d) => d.id).join(", ")}`)

		return MicrosoftFoundryDeploymentsResponse.create({
			deployments: result,
		})
	} catch (error: unknown) {
		const errorMessage = error instanceof Error ? error.message : String(error)
		Logger.error("Failed to fetch Microsoft Foundry deployments:", errorMessage)

		if (errorMessage.includes("CredentialUnavailableError") || errorMessage.includes("Could not retrieve token")) {
			return MicrosoftFoundryDeploymentsResponse.create({
				deployments: [],
				error: "Authentication failed. Please check your Azure CLI login status ('az login') or environment variables.",
			})
		}

		return MicrosoftFoundryDeploymentsResponse.create({
			deployments: [],
			error: `Reference error: ${errorMessage}`,
		})
	}
}
