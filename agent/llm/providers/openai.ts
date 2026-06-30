/**
 * agent/llm/providers/openai.ts
 *
 * OpenAI 提供商适配器
 *
 * 使用 OpenAI SDK 调用 GPT 系列模型，支持原生 Function Calling。
 * 这是默认的提供商，保持与现有代码的向后兼容。
 */

import OpenAI from "openai";
import type {
  LLMProvider,
  LLMConfig,
  ChatMessage,
  ToolDefinition,
  LLMResponse,
  ToolCall,
} from "../types";

export class OpenAIProvider implements LLMProvider {
  readonly name = "openai";
  readonly model: string;
  readonly endpoint: string;

  private client: OpenAI;

  constructor(config: LLMConfig) {
    this.model = config.model;
    this.endpoint = config.baseUrl || "https://api.openai.com/v1";

    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });
  }

  /**
   * 验证配置
   */
  async validate(): Promise<void> {
    if (!this.client.apiKey) {
      throw new Error(
        "[OpenAI] 缺少 API Key。请在 .env 中配置 LLM_API_KEY 或 OPENAI_API_KEY。"
      );
    }
  }

  /**
   * 发送聊天补全请求
   */
  async chatCompletion(
    messages: ChatMessage[],
    tools?: ToolDefinition[]
  ): Promise<LLMResponse> {
    // 转换消息格式
    const openaiMessages = this.convertMessages(messages);

    // 构建请求参数
    const params: OpenAI.ChatCompletionCreateParams = {
      model: this.model,
      messages: openaiMessages,
    };

    // 如果有工具定义，转换为 OpenAI 格式
    if (tools && tools.length > 0) {
      params.tools = this.convertTools(tools);
      params.tool_choice = "auto";
    }

    // 调用 OpenAI API
    const response = await this.client.chat.completions.create(params);
    const message = response.choices[0].message;

    // 转换响应为统一格式
    return {
      content: message.content,
      toolCalls: message.tool_calls
        ? this.convertToolCalls(message.tool_calls)
        : null,
    };
  }

  /**
   * 将统一消息格式转换为 OpenAI 消息格式
   */
  private convertMessages(
    messages: ChatMessage[]
  ): OpenAI.ChatCompletionMessageParam[] {
    return messages.map((msg) => {
      if (msg.role === "tool") {
        return {
          role: "tool" as const,
          content: msg.content,
          tool_call_id: msg.toolCallId || "",
        };
      }
      return {
        role: msg.role as "system" | "user" | "assistant",
        content: msg.content,
      };
    });
  }

  /**
   * 将统一工具格式转换为 OpenAI tools 格式
   */
  private convertTools(
    tools: ToolDefinition[]
  ): OpenAI.ChatCompletionTool[] {
    return tools.map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters as unknown as Record<string, unknown>,
      },
    }));
  }

  /**
   * 将 OpenAI 工具调用响应转换为统一格式
   */
  private convertToolCalls(
    toolCalls: OpenAI.ChatCompletionMessageToolCall[]
  ): ToolCall[] {
    return toolCalls.map((call) => ({
      id: call.id,
      name: call.function.name,
      arguments: JSON.parse(call.function.arguments),
    }));
  }
}
