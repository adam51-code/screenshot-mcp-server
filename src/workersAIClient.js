import {
  LLMClient,
} from "@browserbasehq/stagehand";
import zodToJsonSchema from "zod-to-json-schema";

const modelId = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

// Basic implementation of Stagehand's LLMClient for Workers AI.
// This uses the @cf/meta/llama-3.3-70b-instruct-fp8-fast model.
export class WorkersAIClient extends LLMClient {
  constructor(binding, options) {
    super(modelId);
    this.type = "workers-ai";
    this.binding = binding;
    this.options = options;
  }

  async createChatCompletion({ options }) {
    const schema = options.response_model?.schema;
    this.options?.logger?.({ category: "workersai", message: "thinking..." });

    const { response } = await this.binding.run(
      this.modelName,
      {
        messages: options.messages,
        // Workers AI accepts tool definitions in the chat-completions options.
        tools: options.tools,
        response_format: schema
          ? {
              type: "json_schema",
              json_schema: zodToJsonSchema(schema),
            }
          : undefined,
        temperature: 0,
      },
      this.options,
    );

    this.options?.logger?.({ category: "workersai", message: "completed thinking!" });

    return { data: response };
  }
}
