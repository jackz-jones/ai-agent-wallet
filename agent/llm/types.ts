/**
 * agent/llm/types.ts
 *
 * LLM 提供商抽象层 - 统一类型定义
 *
 * 定义了所有 LLM 提供商必须实现的统一接口，
 * 以及工具定义、消息、工具调用等标准格式。
 */

// ============ 配置类型 ============

/** 支持的 LLM 提供商 */
export type LLMProviderType = "openai" | "ollama" | "anthropic" | "gemini";

/** LLM 配置 */
export interface LLMConfig {
  /** 提供商类型 */
  provider: LLMProviderType;
  /** 模型名称（如 gpt-4o, llama3, claude-sonnet-4-20250514, gemini-2.0-flash） */
  model: string;
  /** 自定义 API 端点（可选，用于代理或自定义部署） */
  baseUrl?: string;
  /** API Key */
  apiKey?: string;
  /** 温度参数（0-1，控制输出随机性） */
  temperature?: number;
}

// ============ 消息类型 ============

/** 消息角色 */
export type MessageRole = "system" | "user" | "assistant" | "tool";

/** 聊天消息 */
export interface ChatMessage {
  role: MessageRole;
  content: string;
  /** 工具调用 ID（当 role 为 tool 时使用） */
  toolCallId?: string;
  /** 工具调用名称（当 role 为 tool 时使用） */
  toolName?: string;
}

// ============ 工具定义类型 ============

/** 工具参数属性 */
export interface ToolParameterProperty {
  type: string;
  description: string;
  enum?: string[];
}

/** 工具参数定义 */
export interface ToolParameters {
  type: "object";
  properties: Record<string, ToolParameterProperty>;
  required?: string[];
}

/** 统一的工具定义格式 */
export interface ToolDefinition {
  /** 工具名称 */
  name: string;
  /** 工具描述 */
  description: string;
  /** 工具参数 */
  parameters: ToolParameters;
}

// ============ 工具调用结果类型 ============

/** 统一的工具调用格式 */
export interface ToolCall {
  /** 工具调用 ID（用于关联请求和响应） */
  id: string;
  /** 工具名称 */
  name: string;
  /** 工具参数（已解析的 JSON 对象） */
  arguments: Record<string, any>;
}

// ============ LLM 响应类型 ============

/** LLM 响应 */
export interface LLMResponse {
  /** 文本内容（如果有） */
  content: string | null;
  /** 工具调用列表（如果 LLM 决定调用工具） */
  toolCalls: ToolCall[] | null;
}

// ============ LLM 提供商接口 ============

/** LLM 提供商统一接口 */
export interface LLMProvider {
  /** 提供商名称 */
  readonly name: string;
  /** 当前使用的模型 */
  readonly model: string;
  /** API 端点（用于展示） */
  readonly endpoint: string;

  /**
   * 发送聊天补全请求
   *
   * @param messages - 消息列表
   * @param tools - 可用工具列表（可选）
   * @returns LLM 响应（包含文本或工具调用）
   */
  chatCompletion(
    messages: ChatMessage[],
    tools?: ToolDefinition[]
  ): Promise<LLMResponse>;

  /**
   * 验证提供商配置是否有效
   * 在启动时调用，配置无效时抛出错误
   */
  validate(): Promise<void>;
}

// ============ 各提供商默认模型 ============

/** 各提供商的默认模型 */
export const DEFAULT_MODELS: Record<LLMProviderType, string> = {
  openai: "gpt-4o",
  ollama: "llama3",
  anthropic: "claude-sonnet-4-20250514",
  gemini: "gemini-2.0-flash",
};

/** 各提供商的默认端点 */
export const DEFAULT_ENDPOINTS: Record<LLMProviderType, string> = {
  openai: "https://api.openai.com/v1",
  ollama: "http://localhost:11434/v1",
  anthropic: "https://api.anthropic.com",
  gemini: "https://generativelanguage.googleapis.com",
};
