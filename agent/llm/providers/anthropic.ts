/**
 * agent/llm/providers/anthropic.ts
 *
 * Anthropic Claude 提供商适配器
 *
 * 使用 Anthropic SDK 调用 Claude 模型，支持原生 Tool Use 能力。
 * Claude 的 Tool Use 格式与 OpenAI 不同，本适配器负责格式转换。
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
  LLMProvider,
  LLMConfig,
  ChatMessage,
  ToolDefinition,
  LLMResponse,
  ToolCall,
} from "../types";

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  readonly model: string;
  readonly endpoint: string;

  private client: Anthropic;

  constructor(config: LLMConfig) {
    this.model = config.model;
    this.endpoint = config.baseUrl || "https://api.anthropic.com";

    this.client = new Anthropic({
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
        "[Anthropic] 缺少 API Key。请在 .env 中配置 LLM_API_KEY 或 ANTHROPIC_API_KEY。"
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
    // Claude 的 system message 需要单独传递
    const { systemMessage, chatMessages } = this.separateSystemMessage(messages);

    // 构建请求参数
    const params: Anthropic.MessageCreateParams = {
      model: this.model,
      max_tokens: 4096,
      messages: this.convertMessages(chatMessages),
    };

    // 添加 system message
    if (systemMessage) {
      params.system = systemMessage;
    }

    // 如果有工具定义，转换为 Claude 格式
    if (tools && tools.length > 0) {
      params.tools = this.convertTools(tools);
    }

    // 调用 Claude API
    const response = await this.client.messages.create(params);

    // 解析响应
    return this.parseResponse(response);
  }

  /**
   * 分离 system message（Claude 需要单独传递）
   */
  private separateSystemMessage(messages: ChatMessage[]): {
    systemMessage: string | undefined;
    chatMessages: ChatMessage[];
  } {
    const systemMsg = messages.find((m) => m.role === "system");
    const chatMessages = messages.filter((m) => m.role !== "system");

    return {
      systemMessage: systemMsg?.content,
      chatMessages,
    };
  }

  /**
   * 将统一消息格式转换为 Claude 消息格式
   */
  private convertMessages(
    messages: ChatMessage[]
  ): Anthropic.MessageParam[] {
    return messages.map((msg) => {
      if (msg.role === "tool") {
        return {
          role: "user" as const,
          content: [
            {
              type: "tool_result" as const,
              tool_use_id: msg.toolCallId || "",
              content: msg.content,
            },
          ],
        };
      }

      return {
        role: (msg.role === "user" ? "user" : "assistant") as "user" | "assistant",
        content: msg.content,
      };
    });
  }

  /**
   * 将统一工具格式转换为 Claude tools 格式
   */
  private convertTools(tools: ToolDefinition[]): Anthropic.Tool[] {
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: "object" as const,
        properties: tool.parameters.properties,
        required: tool.parameters.required,
      },
    }));
  }

  /**
   * 解析 Claude 响应为统一格式
   */
  private parseResponse(response: Anthropic.Message): LLMResponse {
    let textContent: string | null = null;
    const toolCalls: ToolCall[] = [];

    for (const block of response.content) {
      if (block.type === "text") {
        textContent = block.text;
      } else if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: block.input as Record<string, any>,
        });
      }
    }

    return {
      content: textContent,
      toolCalls: toolCalls.length > 0 ? toolCalls : null,
    };
  }
}
