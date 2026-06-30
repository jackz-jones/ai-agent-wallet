/**
 * agent/llm/config.ts
 *
 * LLM 配置加载模块
 *
 * 从环境变量中读取 LLM 配置，支持以下变量：
 * - LLM_PROVIDER: 提供商名称 (openai / ollama / anthropic / gemini)
 * - LLM_MODEL: 模型名称
 * - LLM_BASE_URL: 自定义 API 端点
 * - LLM_API_KEY: API Key（也支持各提供商专用的 Key 变量）
 */

import type { LLMConfig, LLMProviderType } from "./types";
import { DEFAULT_MODELS } from "./types";

/** 支持的提供商列表 */
const VALID_PROVIDERS: LLMProviderType[] = [
  "openai",
  "ollama",
  "anthropic",
  "gemini",
];

/**
 * 从环境变量加载 LLM 配置
 */
export function loadLLMConfig(): LLMConfig {
  // 读取提供商（默认 openai）
  const providerStr = process.env.LLM_PROVIDER || "openai";
  const provider = providerStr.toLowerCase() as LLMProviderType;

  // 校验提供商是否合法
  if (!VALID_PROVIDERS.includes(provider)) {
    throw new Error(
      `[LLM Config] 不支持的提供商: "${providerStr}"。\n` +
        `支持的提供商: ${VALID_PROVIDERS.join(", ")}`
    );
  }

  // 读取模型名称（默认使用各提供商的默认模型）
  const model = process.env.LLM_MODEL || DEFAULT_MODELS[provider];

  // 读取 API 端点
  const baseUrl = process.env.LLM_BASE_URL || undefined;

  // 读取 API Key（优先使用 LLM_API_KEY，其次使用各提供商专用变量）
  const apiKey = resolveApiKey(provider);

  return {
    provider,
    model,
    baseUrl,
    apiKey,
  };
}

/**
 * 解析 API Key
 */
function resolveApiKey(provider: LLMProviderType): string | undefined {
  if (provider === "ollama") {
    return "ollama"; // Ollama 不需要 API Key
  }
  return process.env.LLM_API_KEY;
}

/**
 * 打印当前 LLM 配置信息
 */
export function printLLMConfig(config: LLMConfig): void {
  const { DEFAULT_ENDPOINTS } = require("./types");
  const endpoint = config.baseUrl || DEFAULT_ENDPOINTS[config.provider];
  const hasKey = config.apiKey ? "✅ 已配置" : "❌ 未配置";

  console.log(`
┌─────────────────────────────────────┐
│  🧠 LLM 配置信息                     │
├─────────────────────────────────────┤
│  提供商:  ${config.provider.padEnd(26)}│
│  模型:    ${config.model.padEnd(26)}│
│  端点:    ${endpoint.substring(0, 26).padEnd(26)}│
│  API Key: ${hasKey.padEnd(26)}│
└─────────────────────────────────────┘`);
}
