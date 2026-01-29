import { describe, it } from "mocha"
import "should"
import sinon from "sinon"
import { MicrosoftFoundryHandler } from "../core/api/providers/microsoft-foundry"
import { ModelInfo } from "../shared/api"

async function drainStream(stream: AsyncIterable<unknown>) {
	for await (const _ of stream) {
		// drain
	}
}

function createEmptyStream() {
	return (async function* () {
		return
	})()
}

describe("MicrosoftFoundryHandler reasoning effort", () => {
	it("includes reasoning_effort for reasoning deployments", async () => {
		const createStub = sinon.stub().resolves(createEmptyStream())
		const client = {
			chat: {
				completions: {
					create: createStub,
				},
			},
		} as any

		const modelInfo: ModelInfo = {
			maxTokens: 100000,
			contextWindow: 200000,
			supportsImages: true,
			supportsPromptCache: false,
			supportsReasoning: true,
			inputPrice: 0,
			outputPrice: 0,
		}

		const handler = new MicrosoftFoundryHandler({
			microsoftFoundryEndpoint: "https://example.com",
			microsoftFoundryApiKey: "test-key",
			microsoftFoundryDeploymentId: "o1",
			microsoftFoundryModelInfo: modelInfo,
			reasoningEffort: "low",
		})

		sinon.stub(handler as any, "ensureClient").returns(client)

		await drainStream(handler.createMessage("sys", []))

		createStub.calledOnce.should.equal(true)
		const params = createStub.firstCall.args[0]
		params.reasoning_effort.should.equal("low")
	})

	it("omits reasoning_effort for non-reasoning deployments", async () => {
		const createStub = sinon.stub().resolves(createEmptyStream())
		const client = {
			chat: {
				completions: {
					create: createStub,
				},
			},
		} as any

		const modelInfo: ModelInfo = {
			maxTokens: 8192,
			contextWindow: 128000,
			supportsImages: true,
			supportsPromptCache: false,
			supportsReasoning: false,
			inputPrice: 0,
			outputPrice: 0,
		}

		const handler = new MicrosoftFoundryHandler({
			microsoftFoundryEndpoint: "https://example.com",
			microsoftFoundryApiKey: "test-key",
			microsoftFoundryDeploymentId: "gpt-4o",
			microsoftFoundryModelInfo: modelInfo,
			reasoningEffort: "high",
		})

		sinon.stub(handler as any, "ensureClient").returns(client)

		await drainStream(handler.createMessage("sys", []))

		createStub.calledOnce.should.equal(true)
		const params = createStub.firstCall.args[0]
		params.should.not.have.property("reasoning_effort")
	})
})
