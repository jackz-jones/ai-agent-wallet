/**
 * agent/llm/index.ts
 *
 * LLM 模块入口 - 工厂函数
 *
 * 提供统一的 createLLMProvider 工厂函数，
 * 根据配置创建对应的 LLM 提供商实例。
 */

import type { LLMConfig, LLMProvider } from "./types";
import { OpenAIProvider } from "./providers/openai";
import { OllamaProvider } from "./providers/ollama";
import { AnthropicProvider } from "./providers/anthropic";
import { GeminiProvider } from "./providers/gemini";
import { loadLLMConfig, printLLMConfig } from "./config";

// 导出所有类型
export type {
  LLMProvider,
  LLMConfig,
  LLMResponse,
  ChatMessage,
  ToolDefinition,
  ToolCall,
  ToolParameters,
  ToolParameterProperty,
  LLMProviderType,
  MessageRole,
} from "./types";

export { DEFAULT_MODELS, DEFAULT_ENDPOINTS } from "./types";
export { loadLLMConfig, printLLMConfig } from "./config";

/**
 * 创建 LLM 提供商实例
 *
 * @param config - LLM 配置（可选，不传则从环境变量加载）
 * @returns LLM 提供商实例
 */
export function createLLMProvider(config?: LLMConfig): LLMProvider {
  const resolvedConfig = config || loadLLMConfig();

  switch (resolvedConfig.provider) {
    case "openai":
      return new OpenAIProvider(resolvedConfig);

    case "ollama":
      return new OllamaProvider(resolvedConfig);

    case "anthropic":
      return new AnthropicProvider(resolvedConfig);

    case "gemini":
      return new GeminiProvider(resolvedConfig);

    default:
      throw new Error(
        `[LLM] 不支持的提供商: "${resolvedConfig.provider}"。\n` +
          `支持的提供商: openai, ollama, anthropic, gemini`
      );
  }
}

/**
 * 创建并验证 LLM 提供商
 *
 * 在启动时调用，会验证配置并打印信息。
 * 如果配置无效，会抛出错误并退出。
 *
 * @param config - LLM 配置（可选）
 * @returns 已验证的 LLM 提供商实例
 */
export async function initLLMProvider(config?: LLMConfig): Promise<LLMProvider> {
  const resolvedConfig = config || loadLLMConfig();

  // 打印配置信息
  printLLMConfig(resolvedConfig);

  // 创建提供商
  const provider = createLLMProvider(resolvedConfig);

  // 验证配置
  try {
    await provider.validate();
  } catch (error: any) {
    console.error(`\n❌ LLM 配置验证失败: ${error.message}\n`);
    throw error;
  }

  console.log(`✅ LLM 提供商 [${provider.name}] 初始化成功\n`);
  return provider;
}
