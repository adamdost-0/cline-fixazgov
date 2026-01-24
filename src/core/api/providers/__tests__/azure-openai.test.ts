import { describe, it } from "mocha"
import "should"
import { AzureOpenAiHandler } from "../azure-openai"

describe("AzureOpenAiHandler - Custom Audience URL", () => {
	describe("getAzureAudienceScope", () => {
		it("should use custom audience URL when provided", () => {
			const handler = new AzureOpenAiHandler({
				openAiBaseUrl: "https://test.azurestack.local",
				azureCustomAudienceUrl: "https://cognitiveservices.azurestack.local",
				openAiApiKey: "test-key",
			})

			// Access private method for testing
			const scope = (handler as any).getAzureAudienceScope("https://test.azurestack.local")
			scope.should.equal("https://cognitiveservices.azurestack.local/.default")
		})

		it("should append /.default to custom audience URL if not present", () => {
			const handler = new AzureOpenAiHandler({
				openAiBaseUrl: "https://test.azurestack.local",
				azureCustomAudienceUrl: "https://cognitiveservices.azurestack.local/.default",
				openAiApiKey: "test-key",
			})

			const scope = (handler as any).getAzureAudienceScope("https://test.azurestack.local")
			scope.should.equal("https://cognitiveservices.azurestack.local/.default")
		})

		it("should detect Azure AI Foundry endpoints when no custom URL", () => {
			const handler = new AzureOpenAiHandler({
				openAiBaseUrl: "https://test.services.ai.azure.com",
				openAiApiKey: "test-key",
			})

			const scope = (handler as any).getAzureAudienceScope("https://test.services.ai.azure.com")
			scope.should.equal("https://ai.azure.com/.default")
		})

		it("should detect Azure OpenAI commercial cloud endpoints when no custom URL", () => {
			const handler = new AzureOpenAiHandler({
				openAiBaseUrl: "https://test.openai.azure.com",
				openAiApiKey: "test-key",
			})

			const scope = (handler as any).getAzureAudienceScope("https://test.openai.azure.com")
			scope.should.equal("https://cognitiveservices.azure.com/.default")
		})

		it("should detect Azure Government endpoints when no custom URL", () => {
			const handler = new AzureOpenAiHandler({
				openAiBaseUrl: "https://test.openai.azure.us",
				openAiApiKey: "test-key",
			})

			const scope = (handler as any).getAzureAudienceScope("https://test.openai.azure.us")
			scope.should.equal("https://cognitiveservices.azure.us/.default")
		})

		it("should detect Azure China endpoints when no custom URL", () => {
			const handler = new AzureOpenAiHandler({
				openAiBaseUrl: "https://test.openai.azure.cn",
				openAiApiKey: "test-key",
			})

			const scope = (handler as any).getAzureAudienceScope("https://test.openai.azure.cn")
			scope.should.equal("https://cognitiveservices.azure.cn/.default")
		})

		it("should prioritize custom audience URL over auto-detection", () => {
			const handler = new AzureOpenAiHandler({
				openAiBaseUrl: "https://test.openai.azure.com",
				azureCustomAudienceUrl: "https://custom.audience.url",
				openAiApiKey: "test-key",
			})

			// Even though the endpoint is azure.com, custom URL should be used
			const scope = (handler as any).getAzureAudienceScope("https://test.openai.azure.com")
			scope.should.equal("https://custom.audience.url/.default")
		})
	})
})
