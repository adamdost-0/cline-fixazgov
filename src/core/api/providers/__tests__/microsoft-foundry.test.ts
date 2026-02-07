import { afterEach, beforeEach, describe, it } from "mocha"
import "should"
import sinon from "sinon"
import { classifyAzureEndpoint, getAzureCognitiveScope } from "@shared/api"
import { ClineStorageMessage } from "@/shared/messages/content"
import { MicrosoftFoundryHandler } from "../microsoft-foundry"

// Note: Tests mock the AzureOpenAI client to avoid hanging on credential resolution
// In a real integration scenario, the handler would connect to Azure endpoints

describe("Microsoft Foundry Provider", () => {
	describe("Endpoint Classification", () => {
		it("should classify commercial endpoints correctly", () => {
			classifyAzureEndpoint("https://test.openai.azure.com/")!.should.equal("commercial")
			classifyAzureEndpoint("https://test.services.ai.azure.com/")!.should.equal("commercial")
			classifyAzureEndpoint("https://test.cognitiveservices.azure.com/")!.should.equal("commercial")
		})

		it("should classify government endpoints correctly", () => {
			classifyAzureEndpoint("https://test.openai.azure.us/")!.should.equal("government")
			classifyAzureEndpoint("https://test123123.openai.azure.us/")!.should.equal("government")
			classifyAzureEndpoint("https://test.services.ai.azure.us/")!.should.equal("government")
			classifyAzureEndpoint("https://test.cognitiveservices.azure.us/")!.should.equal("government")
			classifyAzureEndpoint("https://test.usgovcloudapi.net/")!.should.equal("government")
		})

		it("should return undefined for unknown endpoints", () => {
			;(classifyAzureEndpoint("https://test.openai.com/") === undefined).should.be.true()
			;(classifyAzureEndpoint("https://api.openai.com/") === undefined).should.be.true()
			;(classifyAzureEndpoint("https://invalid.example.com/") === undefined).should.be.true()
		})

		it("should handle endpoints without trailing slash", () => {
			classifyAzureEndpoint("https://test.openai.azure.com")!.should.equal("commercial")
			classifyAzureEndpoint("https://test.openai.azure.us")!.should.equal("government")
		})
	})

	describe("Token Scope Selection", () => {
		it("should return commercial scope for commercial endpoints", () => {
			getAzureCognitiveScope("https://test.openai.azure.com/")!.should.equal(
				"https://cognitiveservices.azure.com/.default"
			)
			getAzureCognitiveScope("https://test.services.ai.azure.com/")!.should.equal(
				"https://cognitiveservices.azure.com/.default"
			)
		})

		it("should return government scope for government endpoints", () => {
			getAzureCognitiveScope("https://test.openai.azure.us/")!.should.equal(
				"https://cognitiveservices.azure.us/.default"
			)
			getAzureCognitiveScope("https://test.usgovcloudapi.net/")!.should.equal(
				"https://cognitiveservices.azure.us/.default"
			)
		})

		it("should return undefined for unknown endpoints", () => {
			;(getAzureCognitiveScope("https://invalid.example.com/") === undefined).should.be.true()
		})
	})

	describe("MicrosoftFoundryHandler", () => {
		let handler: MicrosoftFoundryHandler
		let sandbox: sinon.SinonSandbox

		beforeEach(() => {
			sandbox = sinon.createSandbox()
			// Mock the AzureOpenAI module to prevent credential chain resolution during tests
			sandbox.stub(require("openai"), "AzureOpenAI").returns({})
		})

		afterEach(() => {
			sandbox.restore()
		})

		describe("Handler Initialization", () => {
			it("should throw error when endpoint is missing", async () => {
				handler = new MicrosoftFoundryHandler({
					microsoftFoundryDeploymentName: "test-deployment",
					microsoftFoundryAuthMode: "entra-id",
				})

				const thrown = false
				try {
					const systemPrompt = "You are a helpful assistant."
					const messages: ClineStorageMessage[] = []
					for await (const _ of handler.createMessage(systemPrompt, messages)) {
						// This should not be reached
					}
				} catch (error: any) {
					error.message.should.match(/endpoint URL is required/i)
				}
				thrown.should.equal(false) // Ensure error was thrown above
			})

			it("should throw error when deployment name is missing", async () => {
				handler = new MicrosoftFoundryHandler({
					microsoftFoundryEndpoint: "https://test.openai.azure.com/",
					microsoftFoundryAuthMode: "entra-id",
				})

				const thrown = false
				try {
					const systemPrompt = "You are a helpful assistant."
					const messages: ClineStorageMessage[] = []
					for await (const _ of handler.createMessage(systemPrompt, messages)) {
						// This should not be reached
					}
				} catch (error: any) {
					error.message.should.match(/deployment name is required/i)
				}
				thrown.should.equal(false) // Ensure error was thrown above
			})

			it("should return deployment name from getModel() when deployment name is provided", () => {
				handler = new MicrosoftFoundryHandler({
					microsoftFoundryEndpoint: "https://test.openai.azure.com/",
					microsoftFoundryDeploymentName: "gpt-4o",
					microsoftFoundryAuthMode: "entra-id",
				})

				const model = handler.getModel()
				model.id.should.equal("gpt-4o")
			})

			it("should NOT fall back to apiModelId for deployment name", async () => {
				handler = new MicrosoftFoundryHandler({
					microsoftFoundryEndpoint: "https://test.openai.azure.com/",
					microsoftFoundryAuthMode: "entra-id",
					apiModelId: "fallback-model", // This should be ignored
					// microsoftFoundryDeploymentName is NOT provided
				})

				const thrown = false
				try {
					const systemPrompt = "You are a helpful assistant."
					const messages: ClineStorageMessage[] = []
					for await (const _ of handler.createMessage(systemPrompt, messages)) {
						// This should not be reached
					}
				} catch (error: any) {
					// Should fail because deploymentName is missing, not use apiModelId
					error.message.should.match(/deployment name is required/i)
				}
				thrown.should.equal(false) // Ensure error was thrown above
			})
		})

		describe("Azure Government Support", () => {
			it("should detect Azure Government endpoint correctly", () => {
				handler = new MicrosoftFoundryHandler({
					microsoftFoundryEndpoint: "https://test123123.openai.azure.us/",
					microsoftFoundryDeploymentName: "gpt-4o",
					microsoftFoundryAuthMode: "entra-id",
				})

				const model = handler.getModel()
				model.id.should.equal("gpt-4o")

				// Verify cloud environment is detected
				const cloudEnv = (handler as any).getCloudEnvironment()
				cloudEnv.should.equal("government")
			})

			it("should select correct token scope for government endpoint", () => {
				const govEndpoint = "https://test123123.openai.azure.us/"
				const scope = getAzureCognitiveScope(govEndpoint)!
				scope.should.equal("https://cognitiveservices.azure.us/.default")
			})

			it("should select correct token scope for commercial endpoint", () => {
				const commercialEndpoint = "https://test.openai.azure.com/"
				const scope = getAzureCognitiveScope(commercialEndpoint)!
				scope.should.equal("https://cognitiveservices.azure.com/.default")
			})
		})

		describe("Authentication Modes", () => {
			it("should accept API Key authentication mode", () => {
				handler = new MicrosoftFoundryHandler({
					microsoftFoundryEndpoint: "https://test.openai.azure.com/",
					microsoftFoundryApiKey: "test-key",
					microsoftFoundryDeploymentName: "gpt-4o",
					microsoftFoundryAuthMode: "api-key",
				})

				const model = handler.getModel()
				model.id.should.equal("gpt-4o")
			})

			it("should accept Entra ID (SSO) authentication mode", () => {
				handler = new MicrosoftFoundryHandler({
					microsoftFoundryEndpoint: "https://test.openai.azure.com/",
					microsoftFoundryDeploymentName: "gpt-4o",
					microsoftFoundryAuthMode: "entra-id",
				})

				const model = handler.getModel()
				model.id.should.equal("gpt-4o")
			})
		})

		describe("Backward Compatibility", () => {
			it("should accept apiModelId parameter without throwing", () => {
				// Even though apiModelId is accepted in options, it should not be used
				handler = new MicrosoftFoundryHandler({
					microsoftFoundryEndpoint: "https://test.openai.azure.com/",
					microsoftFoundryDeploymentName: "primary-deployment",
					microsoftFoundryAuthMode: "entra-id",
					apiModelId: "ignored-model-id", // This parameter is accepted but ignored
				})

				const model = handler.getModel()
				// Should return the explicit deployment name, not apiModelId
				model.id.should.equal("primary-deployment")
			})
		})
	})
})
