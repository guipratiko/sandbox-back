/**
 * OpenAI chat com function calling para o agente de IA (mídia e localização).
 */

import axios from 'axios';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

export type ToolDefinition = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, { type: string; description?: string }>;
      required?: string[];
    };
  };
};

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
  name?: string;
}

/**
 * Chama OpenAI com tools; executa tool_calls e repete até obter resposta final (máx. 5 rodadas).
 */
export async function callOpenAIWithTools(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userMessage: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  tools: ToolDefinition[],
  executeTool: (name: string, args: Record<string, unknown>) => Promise<string>
): Promise<string> {
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.map((m) => ({ role: m.role, content: m.content } as ChatMessage)),
    { role: 'user', content: userMessage },
  ];

  const maxRounds = 5;
  for (let round = 0; round < maxRounds; round++) {
    const body: any = {
      model,
      messages,
      temperature: 0.7,
      max_tokens: 1000,
    };
    if (tools.length > 0 && round === 0) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }

    const response = await axios.post(OPENAI_URL, body, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 60000,
    });

    const choice = response.data?.choices?.[0];
    const msg = choice?.message;
    if (!msg) {
      throw new Error('Resposta da OpenAI sem mensagem');
    }

    const content = msg.content;
    const toolCalls = msg.tool_calls;

    if (toolCalls && Array.isArray(toolCalls) && toolCalls.length > 0) {
      messages.push({
        role: 'assistant',
        content: content || '',
        tool_calls: toolCalls.map((tc: any) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.function?.name, arguments: tc.function?.arguments || '{}' },
        })),
      });
      for (const tc of toolCalls) {
        const name = tc.function?.name;
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function?.arguments || '{}');
        } catch {
          args = {};
        }
        let result: string;
        try {
          result = await executeTool(name, args);
        } catch (err) {
          result = `Erro: ${err instanceof Error ? err.message : String(err)}`;
        }
        messages.push({
          role: 'tool',
          content: result,
          tool_call_id: tc.id,
        });
      }
      continue;
    }

    return (content && String(content).trim()) || '';
  }

  return '';
}
