/**
 * agent/llm/fallback.ts
 *
 * Function Calling 降级方案
 *
 * 当 LLM 模型不支持原生 Function Calling 时（如部分 Ollama 本地模型），
 * 通过 prompt engineering 模拟工具调用行为：
 * 1. 将工具定义注入 system prompt
 * 2. 指导 LLM 以特定 JSON 格式输出工具调用
 * 3. 解析 LLM 输出中的工具调用意图
 */

import type { ChatMessage, ToolDefinition, ToolCall } from "./types";

/**
 * Function Calling 降级处理器
 */
export class FunctionCallingFallback {
  /**
   * 将工具定义注入消息中（修改 system prompt）
   *
   * @param messages - 原始消息列表
   * @param tools - 工具定义列表
   * @returns 增强后的消息列表
   */
  injectToolsIntoMessages(
    messages: ChatMessage[],
    tools: ToolDefinition[]
  ): ChatMessage[] {
    const toolsPrompt = this.buildToolsPrompt(tools);
    const enhancedMessages = [...messages];

    // 查找 system message 并追加工具说明
    const systemIndex = enhancedMessages.findIndex(
      (m) => m.role === "system"
    );

    if (systemIndex >= 0) {
      enhancedMessages[systemIndex] = {
        ...enhancedMessages[systemIndex],
        content: enhancedMessages[systemIndex].content + "\n\n" + toolsPrompt,
      };
    } else {
      // 如果没有 system message，创建一个
      enhancedMessages.unshift({
        role: "system",
        content: toolsPrompt,
      });
    }

    return enhancedMessages;
  }

  /**
   * 从 LLM 输出中解析工具调用
   *
   * @param content - LLM 输出的文本内容
   * @returns 解析出的工具调用列表，如果没有则返回 null
   */
  parseToolCalls(content: string): ToolCall[] | null {
    // 尝试多种格式解析

    // 格式 1: ```json ... ``` 代码块
    const jsonBlockMatch = content.match(
      /```(?:json)?\s*\n?([\s\S]*?)\n?```/
    );
    if (jsonBlockMatch) {
      const parsed = this.tryParseToolCallJson(jsonBlockMatch[1].trim());
      if (parsed) return parsed;
    }

    // 格式 2: <tool_call> ... </tool_call> 标签
    const toolCallTagMatch = content.match(
      /<tool_call>([\s\S]*?)<\/tool_call>/
    );
    if (toolCallTagMatch) {
      const parsed = this.tryParseToolCallJson(toolCallTagMatch[1].trim());
      if (parsed) return parsed;
    }

    // 格式 3: 直接的 JSON 对象（以 { 开头）
    const jsonMatch = content.match(/\{[\s\S]*"name"\s*:\s*"[^"]+"/);
    if (jsonMatch) {
      // 尝试提取完整的 JSON
      const fullJson = this.extractCompleteJson(content, jsonMatch.index!);
      if (fullJson) {
        const parsed = this.tryParseToolCallJson(fullJson);
        if (parsed) return parsed;
      }
    }

    return null;
  }

  /**
   * 构建工具说明 prompt
   */
  private buildToolsPrompt(tools: ToolDefinition[]): string {
    const toolDescriptions = tools
      .map((tool) => {
        const params = Object.entries(tool.parameters.properties || {})
          .map(
            ([name, prop]) =>
              `    - ${name} (${prop.type}): ${prop.description}${
                tool.parameters.required?.includes(name) ? " [必需]" : " [可选]"
              }`
          )
          .join("\n");

        return `- **${tool.name}**: ${tool.description}\n  参数:\n${params || "    (无参数)"}`;
      })
      .join("\n\n");

    return `## 可用工具

你可以调用以下工具来完成任务。当你需要调用工具时，请严格按照以下 JSON 格式输出（不要添加其他文字）：

\`\`\`json
{
  "name": "工具名称",
  "arguments": {
    "参数名": "参数值"
  }
}
\`\`\`

### 工具列表

${toolDescriptions}

### 重要规则
1. 如果需要调用工具，只输出 JSON 格式的工具调用，不要添加其他解释文字
2. 如果不需要调用工具，正常回复用户即可
3. 每次只调用一个工具`;
  }

  /**
   * 尝试解析工具调用 JSON
   */
  private tryParseToolCallJson(jsonStr: string): ToolCall[] | null {
    try {
      const parsed = JSON.parse(jsonStr);

      // 单个工具调用
      if (parsed.name && typeof parsed.name === "string") {
        return [
          {
            id: `call_fallback_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            name: parsed.name,
            arguments: parsed.arguments || parsed.params || {},
          },
        ];
      }

      // 工具调用数组
      if (Array.isArray(parsed)) {
        return parsed
          .filter((item: any) => item.name && typeof item.name === "string")
          .map((item: any) => ({
            id: `call_fallback_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            name: item.name,
            arguments: item.arguments || item.params || {},
          }));
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * 从文本中提取完整的 JSON 对象
   */
  private extractCompleteJson(text: string, startIndex: number): string | null {
    let depth = 0;
    let inString = false;
    let escape = false;

    for (let i = startIndex; i < text.length; i++) {
      const char = text[i];

      if (escape) {
        escape = false;
        continue;
      }

      if (char === "\\") {
        escape = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (inString) continue;

      if (char === "{") depth++;
      if (char === "}") {
        depth--;
        if (depth === 0) {
          return text.substring(startIndex, i + 1);
        }
      }
    }

    return null;
  }
}
