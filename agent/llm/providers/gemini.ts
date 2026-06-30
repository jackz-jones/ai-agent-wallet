/**
 * agent/llm/providers/gemini.ts
 *
 * Google Gemini 提供商适配器
 *
 * 使用 Google Generative AI SDK 调用 Gemini 模型，
 * 支持原生 Function Calling 能力。
 */

import {
  GoogleGenerativeAI,
  type GenerativeModel,
  type Content,
  type Part,
  type Tool,
  type FunctionDeclaration,
  type FunctionDeclarationSchemaProperty,
  SchemaType,
} from "@google/generative-ai";
import type {
  LLMProvider,
  LLMConfig,
  ChatMessage,
  ToolDefinition,
  LLMResponse,
  ToolCall,
  ToolParameterProperty,
} from "../types";

export class GeminiProvider implements LLMProvider {
  readonly name = "gemini";
  readonly model: string;
  readonly endpoint: string;

  private genAI: GoogleGenerativeAI;
  private generativeModel: GenerativeModel;

  constructor(config: LLMConfig) {
    this.model = config.model;
    this.endpoint =
      config.baseUrl || "https://generativelanguage.googleapis.com";

    this.genAI = new GoogleGenerativeAI(config.apiKey || "");
    this.generativeModel = this.genAI.getGenerativeModel({
      model: this.model,
    });
  }

  /**
   * 验证配置
   */
  async validate(): Promise<void> {
    if (!this.genAI.apiKey) {
      throw new Error(
        "[Gemini] 缺少 API Key。请在 .env 中配置 LLM_API_KEY 或 GOOGLE_API_KEY。"
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
    // 分离 system message
    const { systemInstruction, contents } = this.convertMessages(messages);

    // 构建模型实例（带工具配置）
    const modelConfig: any = { model: this.model };

    if (systemInstruction) {
      modelConfig.systemInstruction = systemInstruction;
    }

    if (tools && tools.length > 0) {
      modelConfig.tools = this.convertTools(tools);
    }

    const model = this.genAI.getGenerativeModel(modelConfig);

    // 调用 Gemini API
    const result = await model.generateContent({
      contents,
    });

    const response = result.response;

    // 解析响应
    return this.parseResponse(response);
  }

  /**
   * 将统一消息格式转换为 Gemini Content 格式
   */
  private convertMessages(messages: ChatMessage[]): {
    systemInstruction: string | undefined;
    contents: Content[];
  } {
    let systemInstruction: string | undefined;
    const contents: Content[] = [];

    for (const msg of messages) {
      if (msg.role === "system") {
        systemInstruction = msg.content;
        continue;
      }

      if (msg.role === "user") {
        contents.push({
          role: "user",
          parts: [{ text: msg.content }],
        });
      } else if (msg.role === "assistant") {
        contents.push({
          role: "model",
          parts: [{ text: msg.content }],
        });
      } else if (msg.role === "tool") {
        // Gemini 的 function response 格式
        contents.push({
          role: "function",
          parts: [
            {
              functionResponse: {
                name: msg.toolName || "unknown",
                response: { result: msg.content },
              },
            },
          ],
        });
      }
    }

    return { systemInstruction, contents };
  }

  /**
   * 将统一工具格式转换为 Gemini tools 格式
   */
  private convertTools(tools: ToolDefinition[]): Tool[] {
    const functionDeclarations: FunctionDeclaration[] = tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: {
        type: SchemaType.OBJECT,
        properties: this.convertProperties(tool.parameters.properties),
        required: tool.parameters.required,
      },
    }));

    return [{ functionDeclarations }];
  }

  /**
   * 转换参数属性为 Gemini 格式
   */
  private convertProperties(
    properties: Record<string, ToolParameterProperty>
  ): Record<string, FunctionDeclarationSchemaProperty> {
    const result: Record<string, FunctionDeclarationSchemaProperty> = {};

    for (const [key, prop] of Object.entries(properties)) {
      result[key] = {
        type: this.mapSchemaType(prop.type),
        description: prop.description,
      };
      if (prop.enum) {
        (result[key] as any).enum = prop.enum;
      }
    }

    return result;
  }

  /**
   * 映射 JSON Schema 类型到 Gemini SchemaType
   */
  private mapSchemaType(type: string): SchemaType {
    switch (type) {
      case "string":
        return SchemaType.STRING;
      case "number":
        return SchemaType.NUMBER;
      case "integer":
        return SchemaType.INTEGER;
      case "boolean":
        return SchemaType.BOOLEAN;
      case "array":
        return SchemaType.ARRAY;
      case "object":
        return SchemaType.OBJECT;
      default:
        return SchemaType.STRING;
    }
  }

  /**
   * 解析 Gemini 响应为统一格式
   */
  private parseResponse(response: any): LLMResponse {
    const candidate = response.candidates?.[0];
    if (!candidate) {
      return { content: null, toolCalls: null };
    }

    let textContent: string | null = null;
    const toolCalls: ToolCall[] = [];

    const parts = candidate.content?.parts || [];

    for (const part of parts) {
      if (part.text) {
        textContent = part.text;
      } else if (part.functionCall) {
        toolCalls.push({
          id: `call_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          name: part.functionCall.name,
          arguments: part.functionCall.args || {},
        });
      }
    }

    return {
      content: textContent,
      toolCalls: toolCalls.length > 0 ? toolCalls : null,
    };
  }
}
