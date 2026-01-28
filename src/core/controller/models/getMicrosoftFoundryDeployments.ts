import { type MicrosoftFoundryDeploymentsRequest, MicrosoftFoundryDeploymentsResponse } from "@shared/proto/cline/models"
import { execSync } from "child_process"
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

		// Match patterns like: resource-name.openai.azure.com or resource-name.cognitiveservices.azure.com
		const match = hostname.match(/^([^.]+)\.(openai|cognitiveservices)\.(azure\.com|azure\.us)$/i)
		if (match) {
			return match[1]
		}

		return null
	} catch {
		return null
	}
}

/**
 * Fetches deployed models from Microsoft Foundry using Azure CLI.
 * This uses the Azure Resource Manager API via `az cognitiveservices account deployment list`.
 *
 * @param _controller The controller instance
 * @param request The request containing the Azure OpenAI endpoint URL
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

	// Extract resource name from endpoint
	const resourceName = extractResourceNameFromEndpoint(endpoint)
	if (!resourceName) {
		return MicrosoftFoundryDeploymentsResponse.create({
			deployments: [],
			error: "Could not extract resource name from endpoint URL. Expected format: https://<resource-name>.openai.azure.com or https://<resource-name>.cognitiveservices.azure.com",
		})
	}

	try {
		// First, find the resource to get its resource group
		Logger.info(`Looking up Azure resource: ${resourceName}`)

		const resourceListCmd = `az resource list --name "${resourceName}" --query "[0].{resourceGroup:resourceGroup,name:name}" -o json`
		const resourceListOutput = execSync(resourceListCmd, {
			encoding: "utf-8",
			timeout: 30000,
			windowsHide: true,
		})

		const resourceInfo = JSON.parse(resourceListOutput)
		if (!resourceInfo || !resourceInfo.resourceGroup) {
			return MicrosoftFoundryDeploymentsResponse.create({
				deployments: [],
				error: `Could not find Azure resource '${resourceName}'. Make sure you are signed in to the correct Azure subscription with 'az login'.`,
			})
		}

		const resourceGroup = resourceInfo.resourceGroup

		// Now list deployments for this resource
		Logger.info(`Listing deployments for ${resourceName} in resource group ${resourceGroup}`)

		const deploymentsCmd = `az cognitiveservices account deployment list --name "${resourceName}" --resource-group "${resourceGroup}" -o json`
		const deploymentsOutput = execSync(deploymentsCmd, {
			encoding: "utf-8",
			timeout: 30000,
			windowsHide: true,
		})

		const deployments = JSON.parse(deploymentsOutput) as Array<{
			name: string
			properties?: {
				model?: {
					name?: string
					version?: string
				}
			}
		}>

		if (!Array.isArray(deployments) || deployments.length === 0) {
			return MicrosoftFoundryDeploymentsResponse.create({
				deployments: [],
				error: "No deployments found for this resource. Deploy a model in Azure AI Foundry first.",
			})
		}

		// Map to our proto format
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

		// Provide helpful error messages
		if (errorMessage.includes("az: command not found") || errorMessage.includes("'az' is not recognized")) {
			return MicrosoftFoundryDeploymentsResponse.create({
				deployments: [],
				error: "Azure CLI (az) is not installed or not in PATH. Please install Azure CLI: https://docs.microsoft.com/cli/azure/install-azure-cli",
			})
		}

		if (errorMessage.includes("Please run 'az login'") || errorMessage.includes("AADSTS")) {
			return MicrosoftFoundryDeploymentsResponse.create({
				deployments: [],
				error: "Not signed in to Azure CLI. Please run 'az login' in a terminal first.",
			})
		}

		if (errorMessage.includes("does not have authorization") || errorMessage.includes("AuthorizationFailed")) {
			return MicrosoftFoundryDeploymentsResponse.create({
				deployments: [],
				error: "Insufficient permissions. Ensure you have 'Cognitive Services User' or 'Contributor' role on the resource.",
			})
		}

		return MicrosoftFoundryDeploymentsResponse.create({
			deployments: [],
			error: `Failed to list deployments: ${errorMessage}`,
		})
	}
}
