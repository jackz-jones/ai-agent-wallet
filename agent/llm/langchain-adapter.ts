/**
 * agent/llm/langchain-adapter.ts
 *
 * LangChain LLM 适配器
 *
 * 根据 LLM_PROVIDER 配置返回对应的 LangChain Chat Model 实例。
 * 用于 agent-kit.ts 中与 Coinbase AgentKit 集成。
 *
 * 支持的 LangChain Chat Model：
 * - ChatOpenAI (openai)
 * - ChatOllama (ollama)
 * - ChatAnthropic (anthropic)
 * - ChatGoogleGenerativeAI (gemini)
 */

import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { LLMConfig } from "./types";
import { loadLLMConfig, printLLMConfig } from "./config";

/**
 * 根据配置创建 LangChain Chat Model 实例
 *
 * @param config - LLM 配置（可选，不传则从环境变量加载）
 * @returns LangChain BaseChatModel 实例
 */
export async function createLangChainLLM(
  config?: LLMConfig
): Promise<BaseChatModel> {
  const resolvedConfig = config || loadLLMConfig();

  // 打印配置信息
  printLLMConfig(resolvedConfig);

  switch (resolvedConfig.provider) {
    case "openai":
      return createChatOpenAI(resolvedConfig);

    case "ollama":
      return createChatOllama(resolvedConfig);

    case "anthropic":
      return createChatAnthropic(resolvedConfig);

    case "gemini":
      return createChatGemini(resolvedConfig);

    default:
      throw new Error(
        `[LangChain Adapter] 不支持的提供商: "${resolvedConfig.provider}"。\n` +
          `支持的提供商: openai, ollama, anthropic, gemini`
      );
  }
}

/**
 * 创建 ChatOpenAI 实例
 */
async function createChatOpenAI(config: LLMConfig): Promise<BaseChatModel> {
  const { ChatOpenAI } = await import("@langchain/openai");

  if (!config.apiKey) {
    throw new Error(
      "[LangChain/OpenAI] 缺少 API Key。请配置 LLM_API_KEY 或 OPENAI_API_KEY。"
    );
  }

  return new ChatOpenAI({
    model: config.model,
    temperature: config.temperature ?? 0,
    openAIApiKey: config.apiKey,
    configuration: config.baseUrl ? { baseURL: config.baseUrl } : undefined,
  });
}

/**
 * 创建 ChatOllama 实例
 */
async function createChatOllama(config: LLMConfig): Promise<BaseChatModel> {
  const { ChatOllama } = await import("@langchain/ollama");

  return new ChatOllama({
    model: config.model,
    baseUrl: config.baseUrl || "http://localhost:11434",
    temperature: config.temperature ?? 0,
  });
}

/**
 * 创建 ChatAnthropic 实例
 */
async function createChatAnthropic(config: LLMConfig): Promise<BaseChatModel> {
  const { ChatAnthropic } = await import("@langchain/anthropic");

  if (!config.apiKey) {
    throw new Error(
      "[LangChain/Anthropic] 缺少 API Key。请配置 LLM_API_KEY 或 ANTHROPIC_API_KEY。"
    );
  }

  return new ChatAnthropic({
    model: config.model,
    temperature: config.temperature ?? 0,
    anthropicApiKey: config.apiKey,
    anthropicApiUrl: config.baseUrl,
  });
}

/**
 * 创建 ChatGoogleGenerativeAI 实例
 */
async function createChatGemini(config: LLMConfig): Promise<BaseChatModel> {
  const { ChatGoogleGenerativeAI } = await import("@langchain/google-genai");

  if (!config.apiKey) {
    throw new Error(
      "[LangChain/Gemini] 缺少 API Key。请配置 LLM_API_KEY 或 GOOGLE_API_KEY。"
    );
  }

  return new ChatGoogleGenerativeAI({
    model: config.model,
    temperature: config.temperature ?? 0,
    apiKey: config.apiKey,
  });
}
