/**
 * Service para processar mensagens do Agente de IA
 * - Buffer de mensagens por contato
 * - Transcrição de áudios
 * - Processamento com LLM
 * - Detecção de interesse
 * - Armazenamento de memória no Redis
 */

import axios from 'axios';
import { redisClient } from '../config/databases';
import { OPENAI_CONFIG, TRANSCRIPTION_CONFIG, SERVER_CONFIG, GOOGLE_CONFIG } from '../config/constants';
import { callOpenAI } from './openaiService';
import { callOpenAIWithTools, type ToolDefinition } from './openaiAgentTools';
import { sendMessage } from '../utils/evolutionAPI';
import Instance from '../models/Instance';
import { requestEvolutionAPI } from '../utils/evolutionAPI';
import { normalizePhone } from '../utils/numberNormalizer';
import { ContactService } from './contactService';
import * as aiAgentMediaService from './aiAgentMediaService';
import * as aiAgentLocationService from './aiAgentLocationService';

interface BufferedMessage {
  contactPhone: string;
  instanceId: string;
  userId: string;
  messages: Array<{
    messageId: string;
    content: string;
    messageType: string;
    timestamp: Date;
    base64?: string; // Para áudios
    transcription?: string; // Transcrição do áudio (quando recebida via callback)
  }>;
  timer?: NodeJS.Timeout;
}

// Buffer de mensagens por contato (aguarda tempo configurável antes de processar)
const messageBuffers = new Map<string, BufferedMessage>();

export interface ContactMemory {
  history: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
  }>;
  structuredData: {
    name?: string;
    phone: string;
    interest?: string;
    detectedInterest?: boolean;
    lastInteraction?: string;
  };
}

/**
 * Obter chave Redis para memória do contato
 */
function getMemoryKey(userId: string, instanceId: string, contactPhone: string): string {
  return `ai_agent:memory:${userId}:${instanceId}:${contactPhone}`;
}

/**
 * Obter chave Redis para bloqueio do agente (quando usuário conversa com o contato)
 */
function getBlockKey(userId: string, instanceId: string, contactPhone: string): string {
  return `ai_agent:block:${userId}:${instanceId}:${contactPhone}`;
}

/** Config do bloqueio ao responder (evita depender do modelo completo do agente) */
export interface AgentBlockConfig {
  blockWhenUserReplies: boolean;
  blockDuration?: number | null;
  blockDurationUnit?: 'minutes' | 'hours' | 'days' | 'permanent' | null;
}

/**
 * Cancelar processamento agendado e limpar buffer para um contato (quando o usuário envia mensagem).
 */
export function cancelScheduledProcessing(
  userId: string,
  instanceId: string,
  contactPhone: string
): void {
  const bufferKey = `${userId}:${instanceId}:${contactPhone}`;
  const buffer = messageBuffers.get(bufferKey);

  if (buffer?.timer) {
    clearTimeout(buffer.timer);
    buffer.timer = undefined;
  }
  messageBuffers.delete(bufferKey);
  console.log(`🛑 Agente pausado para contato ${contactPhone}: buffer e timer cancelados`);
}

/**
 * Calcular TTL em segundos a partir de duration + unit (para bloqueio temporário).
 */
function getBlockTtlSeconds(duration: number, unit: 'minutes' | 'hours' | 'days'): number {
  switch (unit) {
    case 'minutes':
      return duration * 60;
    case 'hours':
      return duration * 60 * 60;
    case 'days':
      return duration * 24 * 60 * 60;
    default:
      return duration * 60;
  }
}

/**
 * Pausar o agente para um contato quando o usuário envia mensagem.
 * Cancela qualquer resposta agendada e grava no Redis o período de bloqueio.
 */
export async function pauseAgentForContact(
  userId: string,
  instanceId: string,
  contactPhone: string,
  config: AgentBlockConfig
): Promise<void> {
  if (!config.blockWhenUserReplies) {
    return;
  }

  cancelScheduledProcessing(userId, instanceId, contactPhone);

  const key = getBlockKey(userId, instanceId, contactPhone);
  const unit = config.blockDurationUnit || 'permanent';
  const duration = config.blockDuration;

  if (unit === 'permanent') {
    // Bloqueio permanente: TTL longo (10 anos)
    await redisClient.setex(key, 10 * 365 * 24 * 60 * 60, 'permanent');
    console.log(`🔒 Bloqueio permanente do agente para contato ${contactPhone}`);
    return;
  }

  const num = duration != null && duration > 0 ? duration : 30;
  const ttl = getBlockTtlSeconds(num, unit);
  await redisClient.setex(key, ttl, '1');
  console.log(`🔒 Agente bloqueado para contato ${contactPhone} por ${num} ${unit}`);
}

/**
 * Verificar se o agente está bloqueado para este contato (usuário respondeu recentemente ou bloqueio permanente).
 */
export async function isAgentPausedForContact(
  userId: string,
  instanceId: string,
  contactPhone: string
): Promise<boolean> {
  const key = getBlockKey(userId, instanceId, contactPhone);
  const value = await redisClient.get(key);
  return value !== null && value !== undefined;
}

/**
 * Obter memória do contato do Redis
 */
export async function getContactMemory(
  userId: string,
  instanceId: string,
  contactPhone: string
): Promise<ContactMemory> {
  const key = getMemoryKey(userId, instanceId, contactPhone);
  const data = await redisClient.get(key);

  if (!data) {
    return {
      history: [],
      structuredData: {
        phone: contactPhone,
      },
    };
  }

  try {
    return JSON.parse(data);
  } catch {
    return {
      history: [],
      structuredData: {
        phone: contactPhone,
      },
    };
  }
}

/**
 * Salvar memória do contato no Redis
 */
export async function saveContactMemory(
  userId: string,
  instanceId: string,
  contactPhone: string,
  memory: ContactMemory
): Promise<void> {
  const key = getMemoryKey(userId, instanceId, contactPhone);
  // Armazenar por 90 dias
  await redisClient.setex(key, 90 * 24 * 60 * 60, JSON.stringify(memory));
}

/**
 * Adicionar mensagem ao buffer
 */
export function addMessageToBuffer(
  contactPhone: string,
  instanceId: string,
  userId: string,
  messageId: string,
  content: string,
  messageType: string,
  base64?: string
): void {
  const bufferKey = `${userId}:${instanceId}:${contactPhone}`;
  const existingBuffer = messageBuffers.get(bufferKey);

  const message = {
    messageId,
    content,
    messageType,
    timestamp: new Date(),
    base64,
    transcription: undefined as string | undefined, // Será preenchido quando a transcrição chegar
  };

  if (existingBuffer) {
    // Adicionar mensagem ao buffer existente
    existingBuffer.messages.push(message);

    // Limpar timer anterior
    if (existingBuffer.timer) {
      clearTimeout(existingBuffer.timer);
    }
  } else {
    // Criar novo buffer
    messageBuffers.set(bufferKey, {
      contactPhone,
      instanceId,
      userId,
      messages: [message],
    });
  }
}

/**
 * Atualizar mensagem no buffer com transcrição
 */
export async function updateMessageInBuffer(
  userId: string,
  instanceId: string,
  contactPhone: string,
  messageId: string,
  transcription: string
): Promise<void> {
  const bufferKey = `${userId}:${instanceId}:${contactPhone}`;
  const buffer = messageBuffers.get(bufferKey);

  if (!buffer) {
    console.warn(`⚠️ Buffer não encontrado para atualizar transcrição: ${bufferKey}`);
    console.warn(`📋 Buffers ativos: ${Array.from(messageBuffers.keys()).join(', ')}`);
    
    // Se o buffer não existe, pode ter sido processado. Vamos salvar a transcrição na memória do Redis
    // para que possa ser usada na próxima interação
    try {
      const memory = await getContactMemory(userId, instanceId, contactPhone);
      // Adicionar transcrição como mensagem do usuário na memória
      memory.history.push({
        role: 'user',
        content: transcription,
        timestamp: new Date().toISOString(),
      });
      await saveContactMemory(userId, instanceId, contactPhone, memory);
      console.log(`✅ Transcrição salva diretamente na memória do contato (buffer já processado)`);
    } catch (error) {
      console.error(`❌ Erro ao salvar transcrição na memória:`, error);
    }
    return;
  }

  // Se não tiver messageId, tentar encontrar a mensagem de áudio mais recente sem transcrição
  let message;
  if (messageId) {
    message = buffer.messages.find((msg) => msg.messageId === messageId);
  } else {
    // Encontrar a última mensagem de áudio sem transcrição
    message = buffer.messages
      .filter((msg) => msg.messageType === 'audioMessage' && !msg.transcription)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];
    if (message) {
      console.log(`🔍 Mensagem encontrada sem messageId, usando a mais recente: ${message.messageId}`);
    }
  }

  if (message) {
    message.transcription = transcription;
    message.content = transcription; // Usar transcrição como conteúdo
    console.log(`✅ Transcrição atualizada no buffer para mensagem ${message.messageId || messageId}`);
  } else {
    console.warn(`⚠️ Mensagem ${messageId || 'SEM_ID'} não encontrada no buffer para atualizar transcrição`);
    console.warn(`📋 Mensagens no buffer: ${buffer.messages.map(m => `${m.messageId} (${m.messageType})`).join(', ')}`);
  }
}

/**
 * Processar transcrição de áudio
 */
export async function transcribeAudio(
  base64: string,
  userId: string,
  contactPhone: string,
  instanceId: string,
  messageId: string
): Promise<void> {
  try {
    console.log(`🎤 Enviando áudio para transcrição: ${messageId}`);
    console.log(`📡 URL: ${TRANSCRIPTION_CONFIG.WEBHOOK_URL}`);
    console.log(`📞 Callback: ${TRANSCRIPTION_CONFIG.CALLBACK_URL}`);
    console.log(`📋 Payload: userId=${userId}, instanceId=${instanceId}, contactPhone=${contactPhone}, messageId=${messageId}`);

    const payload = {
      base64,
      userId,
      contactPhone,
      instanceId,
      messageId,
      callbackUrl: TRANSCRIPTION_CONFIG.CALLBACK_URL,
    };

    console.log(`📦 Payload completo (base64 length: ${base64.length}):`, {
      ...payload,
      base64: `[${base64.length} caracteres]`,
    });

    // Enviar para webhook de transcrição
    const response = await axios.post(
      TRANSCRIPTION_CONFIG.WEBHOOK_URL,
      payload,
      {
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    console.log(`✅ Áudio enviado para transcrição com sucesso: ${messageId}`);
    console.log(`📝 Resposta do serviço:`, response.data);
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      console.error(`❌ Erro ao enviar áudio para transcrição:`, error.message);
      console.error(`📡 Status:`, error.response?.status);
      console.error(`📄 Resposta:`, error.response?.data);
      console.error(`📋 Request config:`, {
        url: error.config?.url,
        method: error.config?.method,
        data: error.config?.data ? JSON.parse(error.config.data) : null,
      });
    } else {
      console.error(`❌ Erro desconhecido ao transcrever áudio:`, error);
    }
    // Não lançar erro - a transcrição pode ser feita depois ou via callback
  }
}

const MEDIA_USE_KEY_PREFIX = 'ai_agent_media_use:';
const LOCATION_USE_KEY_PREFIX = 'ai_agent_location_use:';

/** Monta o texto de instrução das tools de mídia/localização para o system prompt. */
async function buildAgentToolsPromptSection(agentId: string): Promise<string> {
  const [mediaList, locationList] = await Promise.all([
    aiAgentMediaService.listByAgentId(agentId),
    aiAgentLocationService.listByAgentId(agentId),
  ]);
  if (mediaList.length === 0 && locationList.length === 0) return '';
  const lines: string[] = [
    '',
    '---',
    '# FERRAMENTAS DE MÍDIA E LOCALIZAÇÃO',
    'Você pode enviar mídia (imagem, vídeo ou arquivo) ou localização usando as funções abaixo. Use o ID indicado. Respeite o limite de usos por contato.',
  ];
  if (mediaList.length > 0) {
    lines.push('', 'Mídias disponíveis (use o ID no parâmetro media_id):');
    mediaList.forEach((m) => {
      lines.push(`- ID: ${m.id} | tipo: ${m.mediaType}${m.caption ? ` | legenda: ${m.caption}` : ''} | máx. ${m.maxUsesPerContact} uso(s) por contato`);
    });
  }
  if (locationList.length > 0) {
    lines.push('', 'Localizações disponíveis (use o ID no parâmetro location_id):');
    locationList.forEach((l) => {
      lines.push(`- ID: ${l.id} | ${l.name || 'Sem nome'} | ${l.address || ''} | máx. ${l.maxUsesPerContact} uso(s) por contato`);
    });
  }
  lines.push('');
  return lines.join('\n');
}

/** Definições das tools para a OpenAI. */
function getAgentToolsDefinitions(
  hasMedia: boolean,
  hasLocations: boolean
): ToolDefinition[] {
  const tools: ToolDefinition[] = [];
  if (hasMedia) {
    tools.push(
      {
        type: 'function',
        function: {
          name: 'send_agent_image',
          description: 'Envia uma imagem ao contato. Use o media_id da lista de mídias disponíveis. Legenda opcional.',
          parameters: {
            type: 'object',
            properties: {
              media_id: { type: 'string', description: 'ID da mídia (ex: CbWa3)' },
              caption: { type: 'string', description: 'Legenda opcional' },
            },
            required: ['media_id'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'send_agent_video',
          description: 'Envia um vídeo ao contato. Use o media_id da lista de mídias disponíveis. Legenda opcional.',
          parameters: {
            type: 'object',
            properties: {
              media_id: { type: 'string', description: 'ID da mídia' },
              caption: { type: 'string', description: 'Legenda opcional' },
            },
            required: ['media_id'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'send_agent_file',
          description: 'Envia um arquivo (documento) ao contato. Use o media_id da lista de mídias disponíveis.',
          parameters: {
            type: 'object',
            properties: { media_id: { type: 'string', description: 'ID da mídia' } },
            required: ['media_id'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'send_agent_audio',
          description: 'Envia um áudio (ex: MP3) ao contato. Use o media_id da lista de mídias disponíveis.',
          parameters: {
            type: 'object',
            properties: {
              media_id: { type: 'string', description: 'ID da mídia' },
              caption: { type: 'string', description: 'Legenda opcional' },
            },
            required: ['media_id'],
          },
        },
      }
    );
  }
  if (hasLocations) {
    tools.push({
      type: 'function',
      function: {
        name: 'send_agent_location',
        description: 'Envia uma localização ao contato. Use o location_id da lista de localizações disponíveis.',
        parameters: {
          type: 'object',
          properties: { location_id: { type: 'string', description: 'ID da localização' } },
          required: ['location_id'],
        },
      },
    });
  }
  return tools;
}

/** Executa uma tool do agente (mídia ou localização). */
async function executeAgentTool(
  agentId: string,
  instanceId: string,
  contactPhone: string,
  userId: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<string> {
  const instance = await Instance.findById(instanceId);
  if (!instance) return 'Erro: instância não encontrada';
  const normalizedPhone = normalizePhone(contactPhone, '55');
  if (!normalizedPhone) return 'Erro: número inválido';
  const numberJid = `${normalizedPhone}@s.whatsapp.net`;

  if (toolName === 'send_agent_location') {
    const locationId = String(args.location_id || '').trim();
    if (!locationId) return 'Erro: location_id obrigatório';
    const location = await aiAgentLocationService.getByIdAndAgentId(locationId, agentId);
    if (!location) return `Erro: localização ${locationId} não encontrada`;
    const key = `${LOCATION_USE_KEY_PREFIX}${agentId}:${locationId}:${contactPhone}`;
    const used = parseInt((await redisClient.get(key)) || '0', 10);
    if (used >= location.maxUsesPerContact) return `Limite de usos (${location.maxUsesPerContact}) já atingido para esta localização.`;
    await redisClient.incr(key);
    await requestEvolutionAPI('POST', `/message/sendLocation/${encodeURIComponent(instance.instanceName)}`, {
      number: numberJid,
      name: location.name || '',
      address: location.address || '',
      latitude: location.latitude,
      longitude: location.longitude,
    });
    return 'Localização enviada com sucesso.';
  }

  if (['send_agent_image', 'send_agent_video', 'send_agent_file', 'send_agent_audio'].includes(toolName)) {
    const mediaId = String(args.media_id || '').trim();
    if (!mediaId) return 'Erro: media_id obrigatório';
    const media = await aiAgentMediaService.getByIdAndAgentId(mediaId, agentId);
    if (!media) return `Erro: mídia ${mediaId} não encontrada`;
    const expectedType = toolName === 'send_agent_image' ? 'image' : toolName === 'send_agent_video' ? 'video' : toolName === 'send_agent_audio' ? 'audio' : 'file';
    if (media.mediaType !== expectedType) return `Erro: a mídia ${mediaId} é do tipo ${media.mediaType}, não ${expectedType}.`;
    const key = `${MEDIA_USE_KEY_PREFIX}${agentId}:${mediaId}:${contactPhone}`;
    const used = parseInt((await redisClient.get(key)) || '0', 10);
    if (used >= media.maxUsesPerContact) return `Limite de usos (${media.maxUsesPerContact}) já atingido para esta mídia.`;
    await redisClient.incr(key);
    const caption = args.caption != null ? String(args.caption) : media.caption;
    const basePayload = { number: numberJid, media: media.url };
    if (media.mediaType === 'image') {
      await requestEvolutionAPI('POST', `/message/sendMedia/${encodeURIComponent(instance.instanceName)}`, {
        ...basePayload,
        mediatype: 'image',
        mimetype: 'image/jpeg',
        caption: caption || '',
        fileName: `image-${media.id}.jpg`,
      });
    } else if (media.mediaType === 'video') {
      await requestEvolutionAPI('POST', `/message/sendMedia/${encodeURIComponent(instance.instanceName)}`, {
        ...basePayload,
        mediatype: 'video',
        mimetype: 'video/mp4',
        caption: caption || '',
        fileName: `video-${media.id}.mp4`,
      });
    } else if (media.mediaType === 'audio') {
      await requestEvolutionAPI('POST', `/message/sendWhatsAppAudio/${encodeURIComponent(instance.instanceName)}`, {
        number: numberJid,
        audio: media.url,
      });
    } else {
      await requestEvolutionAPI('POST', `/message/sendMedia/${encodeURIComponent(instance.instanceName)}`, {
        ...basePayload,
        mediatype: 'document',
        mimetype: 'application/octet-stream',
        fileName: `arquivo-${media.id}`,
      });
    }
    return 'Mídia enviada com sucesso.';
  }

  return `Função desconhecida: ${toolName}`;
}

/**
 * Processar mensagens do buffer com o agente de IA
 */
export async function processBufferedMessages(
  agentId: string,
  agentPrompt: string,
  waitTime: number,
  contactPhone: string,
  instanceId: string,
  userId: string
): Promise<void> {
  const bufferKey = `${userId}:${instanceId}:${contactPhone}`;
  const buffer = messageBuffers.get(bufferKey);

  if (!buffer || buffer.messages.length === 0) {
    return;
  }

  // Remover do buffer
  messageBuffers.delete(bufferKey);

  console.log(`🤖 Processando ${buffer.messages.length} mensagem(ns) do contato ${contactPhone}`);

  try {
    // Obter memória do contato
    let memory = await getContactMemory(userId, instanceId, contactPhone);

    // Buscar nome do contato no banco de dados (sempre atualizar para garantir que está sincronizado)
    try {
      // Normalizar telefone para buscar no banco
      const normalizedPhone = normalizePhone(contactPhone, '55');
      if (normalizedPhone) {
        // Construir remoteJid para buscar contato
        const remoteJid = `${normalizedPhone}@s.whatsapp.net`;
        const contact = await ContactService.getContactByRemoteJid(
          userId,
          instanceId,
          remoteJid
        );
        
        if (contact && contact.name) {
          memory.structuredData.name = contact.name;
          console.log(`📝 Nome do contato atualizado do banco: ${contact.name}`);
        }
      }
    } catch (error) {
      console.warn(`⚠️ Erro ao buscar nome do contato:`, error);
      // Continuar mesmo se não conseguir buscar o nome
    }

    // Processar cada mensagem (transcrever áudios se necessário)
    const processedMessages: string[] = [];

    for (const msg of buffer.messages) {
      let finalContent = msg.content;

      if (msg.messageType === 'audioMessage') {
        // Se já tiver transcrição (recebida via callback), usar ela
        if (msg.transcription) {
          finalContent = msg.transcription;
          console.log(`✅ Usando transcrição recebida para mensagem ${msg.messageId}`);
        } else {
          // Se não tiver transcrição ainda, usar placeholder
          // A transcrição deve chegar via callback antes do processamento
          finalContent = '[Aguardando transcrição do áudio...]';
          console.log(`⏳ Aguardando transcrição para mensagem ${msg.messageId}`);
          
          // Se tiver base64, tentar transcrever novamente (caso o envio inicial tenha falhado)
          if (msg.base64) {
            try {
              await transcribeAudio(
                msg.base64,
                userId,
                contactPhone,
                instanceId,
                msg.messageId
              );
            } catch (error) {
              console.error(`❌ Erro ao reenviar áudio para transcrição ${msg.messageId}:`, error);
            }
          }
        }
      }

      processedMessages.push(finalContent);
      memory.history.push({
        role: 'user',
        content: finalContent,
        timestamp: msg.timestamp.toISOString(),
      });
    }

    // Combinar mensagens processadas
    const combinedMessage = processedMessages.join('\n\n');

    // Base vetorizada: buscar contexto por agente e injetar no prompt
    let finalPrompt = agentPrompt;
    try {
      const { getVectorContextForPrompt } = await import('./agentVectorStore');
      const vectorContext = await getVectorContextForPrompt(agentId, combinedMessage);
      if (vectorContext) {
        finalPrompt = `${agentPrompt}\n\n---\n\n${vectorContext}`;
      }
    } catch (vecErr) {
      console.warn('[processBufferedMessages] Base vetorizada:', vecErr);
    }

    // Tools de mídia e localização: append ao prompt e definir tools
    const toolsSection = await buildAgentToolsPromptSection(agentId);
    if (toolsSection) finalPrompt += toolsSection;
    const [mediaList, locationList] = await Promise.all([
      aiAgentMediaService.listByAgentId(agentId),
      aiAgentLocationService.listByAgentId(agentId),
    ]);
    const hasMedia = mediaList.length > 0;
    const hasLocations = locationList.length > 0;
    const tools = getAgentToolsDefinitions(hasMedia, hasLocations);

    // Preparar histórico para OpenAI (formato ConversationMessage)
    const conversationHistory = memory.history
      .slice(-20) // Últimas 20 mensagens
      .map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
        timestamp: msg.timestamp,
      }));

    let aiResponse: string;
    if (tools.length > 0) {
      aiResponse = await callOpenAIWithTools(
        OPENAI_CONFIG.API_KEY,
        'gpt-4-turbo-preview',
        finalPrompt,
        combinedMessage,
        conversationHistory,
        tools,
        async (name, args) =>
          executeAgentTool(agentId, instanceId, contactPhone, userId, name, args)
      );
      if (!aiResponse) aiResponse = '[Resposta gerada com uso de ferramentas.]';
    } else {
      aiResponse = await callOpenAI(
        OPENAI_CONFIG.API_KEY,
        'gpt-4-turbo-preview',
        finalPrompt,
        combinedMessage,
        conversationHistory
      );
    }

    console.log(`✅ Resposta da IA gerada: ${aiResponse.substring(0, 50)}...`);

    // Adicionar resposta à memória
    memory.history.push({
      role: 'assistant',
      content: aiResponse,
      timestamp: new Date().toISOString(),
    });

    // Detectar interesse usando LLM
    const interestDetected = await detectInterest(combinedMessage, aiResponse);

    if (interestDetected) {
      console.log(`🎯 Interesse detectado para contato ${contactPhone}`);
      memory.structuredData.detectedInterest = true;
      memory.structuredData.interest = 'Interesse detectado via análise de mensagem';

      // Mover contato da coluna 1 para coluna 2
      await moveContactToColumn2(instanceId, contactPhone, userId);
    }

    // Atualizar dados estruturados
    memory.structuredData.lastInteraction = new Date().toISOString();

    // Salvar memória atualizada
    await saveContactMemory(userId, instanceId, contactPhone, memory);

    // Enviar resposta via WhatsApp
    const instance = await Instance.findById(instanceId);
    if (!instance) {
      throw new Error('Instância não encontrada');
    }

    const normalizedPhone = normalizePhone(contactPhone, '55');
    if (!normalizedPhone) {
      throw new Error('Número de telefone inválido');
    }

    const rawSegments = aiResponse
      .trim()
      .split(/\n\s*\n|(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const maxSends = 4;
    let segments: string[];
    if (rawSegments.length <= maxSends) {
      segments = rawSegments;
    } else {
      const perGroup = Math.ceil(rawSegments.length / maxSends);
      segments = [];
      for (let g = 0; g < maxSends; g++) {
        const start = g * perGroup;
        const end = g === maxSends - 1 ? rawSegments.length : Math.min((g + 1) * perGroup, rawSegments.length);
        if (start < end) {
          segments.push(rawSegments.slice(start, end).join(' ').trim());
        }
      }
    }

    const delayBetweenMessages = 1200;
    const numberJid = `${normalizedPhone}@s.whatsapp.net`;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const wordCount = segment.split(/\s+/).filter(Boolean).length;
      const typingDelay = wordCount * 200;

      await sendMessage(instance.instanceName, {
        number: numberJid,
        text: segment,
        delay: typingDelay,
      });

      if (i < segments.length - 1) {
        await new Promise((r) => setTimeout(r, delayBetweenMessages));
      }
    }

    console.log(`✅ Resposta enviada para ${contactPhone} (${segments.length} mensagem(ns))`);
  } catch (error) {
    console.error(`❌ Erro ao processar mensagens do agente:`, error);
    throw error;
  }
}

/**
 * Detectar interesse usando LLM
 */
async function detectInterest(userMessage: string, aiResponse: string): Promise<boolean> {
  try {
    const prompt = `Analise a seguinte conversa e determine se o usuário demonstrou interesse em comprar, contratar ou avançar no processo comercial.

Mensagem do usuário: "${userMessage}"
Resposta do assistente: "${aiResponse}"

Responda APENAS com "SIM" se houver interesse claro (pedido de preço, demonstração de intenção de compra, solicitação de próximos passos, etc.) ou "NÃO" caso contrário.`;

    const response = await callOpenAI(
      OPENAI_CONFIG.API_KEY,
      'gpt-3.5-turbo',
      prompt,
      userMessage
    );

    const result = response.trim().toUpperCase();
    return result.includes('SIM');
  } catch (error) {
    console.error(`❌ Erro ao detectar interesse:`, error);
    return false;
  }
}

/**
 * Mover contato da coluna 1 para coluna 2
 */
async function moveContactToColumn2(
  instanceId: string,
  contactPhone: string,
  userId: string
): Promise<void> {
  try {
    // Buscar instância para obter token
    const instance = await Instance.findById(instanceId);
    if (!instance || !instance.token) {
      console.error(`⚠️ Instância não encontrada ou sem token: ${instanceId}`);
      return;
    }

    // Buscar colunas do usuário para encontrar coluna 2
    const { CRMColumnService } = await import('./crmColumnService');
    const columns = await CRMColumnService.getColumnsByUserId(userId);
    const column2 = columns.find((col) => col.orderIndex === 1); // Coluna 2 (índice 1)

    if (!column2) {
      console.error(`⚠️ Coluna 2 não encontrada para usuário ${userId}`);
      return;
    }

    // Usar API externa para mover contato
    const normalizedPhone = normalizePhone(contactPhone, '55');
    if (!normalizedPhone) {
      console.error(`⚠️ Número de telefone inválido: ${contactPhone}`);
      return;
    }

    // Determinar URL base do backend (usa GOOGLE_CONFIG.API_URL que já está configurada corretamente)
    const backendUrl = process.env.API_URL || 
                      process.env.BACKEND_URL || 
                      GOOGLE_CONFIG.API_URL ||
                      (SERVER_CONFIG.NODE_ENV === 'development' 
                        ? 'http://localhost:4331' 
                        : 'https://back.onlyflow.com.br');

    await axios.post(
      `${backendUrl}/api/v1/webhook/move-contact`,
      {
        phone: normalizedPhone,
        columnId: column2.id,
      },
      {
        headers: {
          Authorization: `Bearer ${instance.token}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    console.log(`✅ Contato ${contactPhone} movido para coluna 2`);
  } catch (error) {
    console.error(`❌ Erro ao mover contato:`, error);
    // Não falhar o processamento se não conseguir mover
  }
}

/**
 * Agendar processamento após tempo de espera
 */
export function scheduleMessageProcessing(
  agentId: string,
  agentPrompt: string,
  waitTime: number,
  contactPhone: string,
  instanceId: string,
  userId: string
): void {
  const bufferKey = `${userId}:${instanceId}:${contactPhone}`;
  const buffer = messageBuffers.get(bufferKey);

  if (!buffer) {
    return;
  }

  const waitSeconds = Math.max(1, Math.floor(Number(waitTime)) || 13);
  const waitMs = waitSeconds * 1000;

  // Limpar timer anterior se existir
  if (buffer.timer) {
    clearTimeout(buffer.timer);
  }

  // Agendar processamento após waitTime segundos
  buffer.timer = setTimeout(async () => {
    try {
      await processBufferedMessages(agentId, agentPrompt, waitSeconds, contactPhone, instanceId, userId);
    } catch (error) {
      console.error(`❌ Erro ao processar mensagens agendadas:`, error);
    }
  }, waitMs);

  console.log(`⏳ Processamento agendado para ${waitSeconds} segundos (contato: ${contactPhone}, mensagens no buffer: ${buffer.messages.length})`);
}

/**
 * Obter leads (contatos com memória)
 */
export async function getLeads(userId: string, instanceId?: string): Promise<ContactMemory[]> {
  const pattern = instanceId
    ? `ai_agent:memory:${userId}:${instanceId}:*`
    : `ai_agent:memory:${userId}:*`;

  const keys = await redisClient.keys(pattern);
  const leads: ContactMemory[] = [];

  for (const key of keys) {
    const data = await redisClient.get(key);
    if (data) {
      try {
        const memory: ContactMemory = JSON.parse(data);
        
        // Se não tiver nome na memória, buscar do banco de dados
        if (!memory.structuredData.name && memory.structuredData.phone) {
          try {
            const normalizedPhone = normalizePhone(memory.structuredData.phone, '55');
            if (normalizedPhone) {
              const remoteJid = `${normalizedPhone}@s.whatsapp.net`;
              
              // Extrair instanceId da chave Redis (formato: ai_agent:memory:userId:instanceId:phone)
              let contactInstanceId = instanceId;
              if (!contactInstanceId && key.includes(':')) {
                const parts = key.split(':');
                // ai_agent:memory:userId:instanceId:phone
                if (parts.length >= 5) {
                  contactInstanceId = parts[3];
                }
              }
              
              if (contactInstanceId) {
                const contact = await ContactService.getContactByRemoteJid(
                  userId,
                  contactInstanceId,
                  remoteJid
                );
                
                if (contact && contact.name) {
                  memory.structuredData.name = contact.name;
                  // Atualizar na memória também
                  await saveContactMemory(userId, contactInstanceId, memory.structuredData.phone, memory);
                }
              }
            }
          } catch (error) {
            console.warn(`⚠️ Erro ao buscar nome do contato ${memory.structuredData.phone}:`, error);
            // Continuar mesmo se não conseguir buscar o nome
          }
        }
        
        leads.push(memory);
      } catch {
        // Ignorar chaves inválidas
      }
    }
  }

  return leads.sort((a, b) => {
    const dateA = a.structuredData.lastInteraction || '';
    const dateB = b.structuredData.lastInteraction || '';
    return dateB.localeCompare(dateA);
  });
}

