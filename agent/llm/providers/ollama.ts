/**
 * agent/llm/providers/ollama.ts
 *
 * Ollama 提供商适配器
 *
 * 通过 Ollama 的 OpenAI 兼容 API 调用本地模型。
 * 支持自定义端点地址和模型名称配置。
 * 当模型不支持原生 Function Calling 时，自动切换到降级方案。
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
import { FunctionCallingFallback } from "../fallback";

export class OllamaProvider implements LLMProvider {
  readonly name = "ollama";
  readonly model: string;
  readonly endpoint: string;

  private client: OpenAI;
  private fallback: FunctionCallingFallback;
  private supportsNativeTools: boolean | null = null;

  constructor(config: LLMConfig) {
    this.model = config.model;
    this.endpoint = config.baseUrl || "http://localhost:11434/v1";

    // Ollama 提供 OpenAI 兼容 API，使用 OpenAI SDK 连接
    this.client = new OpenAI({
      apiKey: "ollama", // Ollama 不需要真实 API Key
      baseURL: this.endpoint,
    });

    this.fallback = new FunctionCallingFallback();
  }

  /**
   * 验证配置 - 检测 Ollama 服务是否可达
   */
  async validate(): Promise<void> {
    try {
      // 尝试列出模型来验证连接
      const baseUrl = this.endpoint.replace("/v1", "");
      const response = await fetch(`${baseUrl}/api/tags`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error: any) {
      throw new Error(
        `[Ollama] 无法连接到 Ollama 服务 (${this.endpoint})。\n` +
          `请确保 Ollama 已启动：ollama serve\n` +
          `错误详情: ${error.message}`
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
    // 如果有工具且尚未确定是否支持原生 tools
    if (tools && tools.length > 0 && this.supportsNativeTools === null) {
      return await this.tryNativeToolsFirst(messages, tools);
    }

    // 如果确定不支持原生 tools，使用降级方案
    if (tools && tools.length > 0 && this.supportsNativeTools === false) {
      return await this.fallbackToolCall(messages, tools);
    }

    // 支持原生 tools 或无工具调用
    return await this.nativeCall(messages, tools);
  }

  /**
   * 尝试使用原生 Function Calling，失败则降级
   */
  private async tryNativeToolsFirst(
    messages: ChatMessage[],
    tools: ToolDefinition[]
  ): Promise<LLMResponse> {
    try {
      const result = await this.nativeCall(messages, tools);
      this.supportsNativeTools = true;
      return result;
    } catch (error: any) {
      // 如果是因为不支持 tools 参数导致的错误，切换到降级方案
      if (
        error.message?.includes("tools") ||
        error.message?.includes("not supported") ||
        error.status === 400
      ) {
        console.warn(
          `[Ollama] 模型 ${this.model} 不支持原生 Function Calling，已切换到降级方案。`
        );
        this.supportsNativeTools = false;
        return await this.fallbackToolCall(messages, tools);
      }
      throw error;
    }
  }

  /**
   * 原生 OpenAI 兼容调用
   */
  private async nativeCall(
    messages: ChatMessage[],
    tools?: ToolDefinition[]
  ): Promise<LLMResponse> {
    const openaiMessages = this.convertMessages(messages);

    const params: any = {
      model: this.model,
      messages: openaiMessages,
    };

    if (tools && tools.length > 0) {
      params.tools = tools.map((tool) => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      }));
      params.tool_choice = "auto";
    }

    const response = await this.client.chat.completions.create(params);
    const message = response.choices[0].message;

    return {
      content: message.content,
      toolCalls: message.tool_calls
        ? this.convertToolCalls(message.tool_calls)
        : null,
    };
  }

  /**
   * 降级方案：通过 prompt 模拟 Function Calling
   */
  private async fallbackToolCall(
    messages: ChatMessage[],
    tools: ToolDefinition[]
  ): Promise<LLMResponse> {
    // 将工具定义注入 system prompt
    const enhancedMessages = this.fallback.injectToolsIntoMessages(
      messages,
      tools
    );
    const openaiMessages = this.convertMessages(enhancedMessages);

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: openaiMessages,
    });

    const content = response.choices[0].message.content || "";

    // 尝试从输出中解析工具调用
    const toolCalls = this.fallback.parseToolCalls(content);

    if (toolCalls) {
      return { content: null, toolCalls };
    }

    return { content, toolCalls: null };
  }

  /**
   * 将统一消息格式转换为 OpenAI 消息格式
   */
  private convertMessages(messages: ChatMessage[]): any[] {
    return messages.map((msg) => {
      if (msg.role === "tool") {
        return {
          role: "tool",
          content: msg.content,
          tool_call_id: msg.toolCallId || "",
        };
      }
      return {
        role: msg.role,
        content: msg.content,
      };
    });
  }

  /**
   * 将 OpenAI 兼容的工具调用响应转换为统一格式
   */
  private convertToolCalls(toolCalls: any[]): ToolCall[] {
    return toolCalls.map((call: any) => ({
      id: call.id || `call_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      name: call.function.name,
      arguments: JSON.parse(call.function.arguments),
    }));
  }
}
