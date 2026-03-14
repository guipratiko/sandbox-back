/**
 * Controller para gerenciar Agentes de IA
 */

import multer from 'multer';
import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { AIAgentService } from '../services/aiAgentService';
import { getLeads as getLeadsFromProcessor, ContactMemory } from '../services/aiAgentProcessor';
import {
  addDocumentsToAgent,
  deleteDocumentsByAgentId,
  getDocumentCountByAgentId,
} from '../services/agentVectorStore';
import * as aiAgentMediaService from '../services/aiAgentMediaService';
import * as aiAgentLocationService from '../services/aiAgentLocationService';
import { uploadFileToService, detectMediaType } from '../utils/mediaService';
import {
  createValidationError,
  createNotFoundError,
  handleControllerError,
} from '../utils/errorHelpers';
import type { AIAgent } from '../services/aiAgentService';

const multerStorage = multer.memoryStorage();
export const uploadAgentMedia = multer({
  storage: multerStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/quicktime', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'audio/mpeg', 'audio/mp3'];
    if (allowed.includes(file.mimetype) || file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/') || file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de arquivo não permitido'));
    }
  },
}).single('file');

function mapAgentToResponse(agent: AIAgent) {
  return {
    id: agent.id,
    userId: agent.userId,
    instanceId: agent.instanceId,
    name: agent.name,
    prompt: agent.prompt,
    waitTime: agent.waitTime,
    isActive: agent.isActive,
    transcribeAudio: agent.transcribeAudio,
    agentType: agent.agentType,
    assistedConfig: agent.assistedConfig,
    blockWhenUserReplies: agent.blockWhenUserReplies ?? false,
    blockDuration: agent.blockDuration ?? null,
    blockDurationUnit: agent.blockDurationUnit ?? null,
    createdAt: agent.createdAt.toISOString(),
    updatedAt: agent.updatedAt.toISOString(),
  };
}

/**
 * Criar novo agente de IA
 * POST /api/ai-agent
 */
export const createAIAgent = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { instanceId, name, prompt, waitTime, isActive, transcribeAudio, agentType, assistedConfig, blockWhenUserReplies, blockDuration, blockDurationUnit } = req.body;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    if (!instanceId) {
      return next(createValidationError('ID da instância é obrigatório'));
    }

    if (!name || name.trim().length === 0) {
      return next(createValidationError('Nome do agente é obrigatório'));
    }

    const effectiveAgentType = agentType || 'manual';
    if (effectiveAgentType === 'manual' && (!prompt || prompt.trim().length === 0)) {
      return next(createValidationError('Prompt do agente é obrigatório'));
    }

    if (prompt && prompt.length > 100000) {
      return next(createValidationError('Prompt não pode exceder 100.000 caracteres'));
    }

    if (waitTime !== undefined && (waitTime < 1 || !Number.isInteger(waitTime))) {
      return next(createValidationError('Tempo de espera deve ser um número inteiro positivo'));
    }

    const agent = await AIAgentService.create({
      userId,
      instanceId,
      name: name.trim(),
      prompt: prompt || '',
      waitTime,
      isActive,
      transcribeAudio,
      agentType,
      assistedConfig,
      blockWhenUserReplies,
      blockDuration,
      blockDurationUnit,
    });

    res.status(201).json({
      status: 'success',
      message: 'Agente de IA criado com sucesso',
      agent: mapAgentToResponse(agent),
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao criar agente de IA'));
  }
};

/**
 * Obter todos os agentes do usuário
 * GET /api/ai-agent
 */
export const getAIAgents = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    const agents = await AIAgentService.getByUserId(userId);

    res.status(200).json({
      status: 'success',
      agents: agents.map((agent) => mapAgentToResponse(agent)),
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao obter agentes de IA'));
  }
};

/**
 * Obter agente por ID
 * GET /api/ai-agent/:id
 */
export const getAIAgent = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    const agent = await AIAgentService.getById(id, userId);

    if (!agent) {
      return next(createNotFoundError('Agente de IA'));
    }

    res.status(200).json({
      status: 'success',
      agent: mapAgentToResponse(agent),
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao obter agente de IA'));
  }
};

/**
 * Atualizar agente
 * PUT /api/ai-agent/:id
 */
export const updateAIAgent = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const { name, instanceId, prompt, waitTime, isActive, transcribeAudio, agentType, assistedConfig, blockWhenUserReplies, blockDuration, blockDurationUnit } = req.body;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    if (prompt !== undefined && prompt.length > 100000) {
      return next(createValidationError('Prompt não pode exceder 100.000 caracteres'));
    }

    if (waitTime !== undefined && (waitTime < 1 || !Number.isInteger(waitTime))) {
      return next(createValidationError('Tempo de espera deve ser um número inteiro positivo'));
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name.trim();
    if (instanceId !== undefined) updateData.instanceId = instanceId === '' ? null : instanceId;
    if (prompt !== undefined) updateData.prompt = prompt;
    if (waitTime !== undefined) updateData.waitTime = waitTime;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (transcribeAudio !== undefined) updateData.transcribeAudio = transcribeAudio;
    if (agentType !== undefined) updateData.agentType = agentType;
    if (assistedConfig !== undefined) updateData.assistedConfig = assistedConfig;
    if (blockWhenUserReplies !== undefined) updateData.blockWhenUserReplies = blockWhenUserReplies;
    if (blockDuration !== undefined) updateData.blockDuration = blockDuration;
    if (blockDurationUnit !== undefined) updateData.blockDurationUnit = blockDurationUnit;

    const agent = await AIAgentService.update(id, userId, updateData);

    if (!agent) {
      return next(createNotFoundError('Agente de IA'));
    }

    res.status(200).json({
      status: 'success',
      message: 'Agente de IA atualizado com sucesso',
      agent: mapAgentToResponse(agent),
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao atualizar agente de IA'));
  }
};

/**
 * Deletar agente
 * DELETE /api/ai-agent/:id
 */
export const deleteAIAgent = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    const agent = await AIAgentService.getById(id, userId);
    if (!agent) {
      return next(createNotFoundError('Agente de IA'));
    }

    try {
      await deleteDocumentsByAgentId(id);
    } catch (vecErr) {
      console.error('[deleteAIAgent] Erro ao limpar base de conhecimento no Supabase:', vecErr);
      return next(handleControllerError(vecErr, 'Erro ao limpar base de conhecimento do agente'));
    }

    const deleted = await AIAgentService.delete(id, userId);
    if (!deleted) {
      return next(createNotFoundError('Agente de IA'));
    }

    res.status(200).json({
      status: 'success',
      message: 'Agente de IA deletado com sucesso',
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao deletar agente de IA'));
  }
};

/**
 * Obter leads (contatos com memória)
 * GET /api/ai-agent/leads
 */
export const getLeads = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { instanceId } = req.query;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    const leads = await getLeadsFromProcessor(userId, instanceId as string | undefined);

    res.status(200).json({
      status: 'success',
      leads: leads.map((lead: ContactMemory) => ({
        phone: lead.structuredData.phone,
        name: lead.structuredData.name,
        interest: lead.structuredData.interest,
        detectedInterest: lead.structuredData.detectedInterest,
        lastInteraction: lead.structuredData.lastInteraction,
        history: lead.history,
      })),
      count: leads.length,
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao obter leads'));
  }
};

/**
 * Adicionar conteúdo à base vetorizada do agente
 * POST /api/ai-agent/:id/knowledge
 */
export const addKnowledge = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const { content } = req.body;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }
    if (!content || typeof content !== 'string') {
      return next(createValidationError('Conteúdo é obrigatório'));
    }

    const agent = await AIAgentService.getById(id, userId);
    if (!agent) {
      return next(createNotFoundError('Agente de IA'));
    }

    const { count } = await addDocumentsToAgent(id, content);

    res.status(200).json({
      status: 'success',
      message: 'Conteúdo adicionado à base de conhecimento',
      count,
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('[addKnowledge]', err?.name, err?.message, err?.stack);
    return next(handleControllerError(error, 'Erro ao adicionar à base de conhecimento'));
  }
};

/**
 * Contar documentos na base vetorizada do agente
 * GET /api/ai-agent/:id/knowledge/count
 */
export const getKnowledgeCount = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    const agent = await AIAgentService.getById(id, userId);
    if (!agent) {
      return next(createNotFoundError('Agente de IA'));
    }

    const count = await getDocumentCountByAgentId(id);

    res.status(200).json({
      status: 'success',
      count,
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao obter contagem da base'));
  }
};

/**
 * Callback de transcrição de áudio
 * POST /api/ai-agent/transcription-callback
 * 
 * URL para receber transcrições: https://back.clerky.com.br/api/ai-agent/transcription-callback
 * 
 * Payload esperado:
 * {
 *   "userId": "string",
 *   "contactPhone": "string",
 *   "instanceId": "string",
 *   "messageId": "string",
 *   "transcription": "string"
 * }
 */
export const transcriptionCallback = async (
  req: any,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    console.log('📥 Callback de transcrição recebido:', JSON.stringify(req.body, null, 2));
    
    const { userId, contactPhone, instanceId, messageId, transcription } = req.body;

    if (!transcription) {
      console.warn('⚠️ Callback sem transcrição:', req.body);
      res.status(400).json({
        status: 'error',
        message: 'Transcrição não fornecida',
      });
      return;
    }

    if (!userId || !contactPhone || !instanceId) {
      console.warn('⚠️ Callback sem dados obrigatórios:', { userId, contactPhone, instanceId });
      res.status(400).json({
        status: 'error',
        message: 'Dados obrigatórios faltando (userId, contactPhone, instanceId)',
      });
      return;
    }

    console.log(`📝 Transcrição recebida para mensagem ${messageId || 'SEM_ID'}: ${transcription.substring(0, 50)}...`);
    console.log(`📋 Dados: userId=${userId}, instanceId=${instanceId}, contactPhone=${contactPhone}`);

    // Atualizar mensagem no buffer com a transcrição
    // A transcrição será processada quando o buffer for processado após o tempo de espera
    const { updateMessageInBuffer } = await import('../services/aiAgentProcessor');
    await updateMessageInBuffer(
      userId,
      instanceId,
      contactPhone,
      messageId || '', // Se não tiver messageId, tentar encontrar por timestamp
      transcription
    );

    res.status(200).json({
      status: 'success',
      message: 'Transcrição recebida e processada',
    });
  } catch (error: unknown) {
    console.error('❌ Erro ao processar callback de transcrição:', error);
    // Retornar 200 mesmo em caso de erro para evitar retentativas
    res.status(200).json({
      status: 'error',
      message: 'Erro ao processar transcrição, mas recebida',
    });
  }
};

/** GET /api/ai-agent/:id/media */
export const listAgentMedia = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    if (!userId) return next(createValidationError('Usuário não autenticado'));
    const agent = await AIAgentService.getById(id, userId);
    if (!agent) return next(createNotFoundError('Agente de IA'));
    const list = await aiAgentMediaService.listByAgentId(id);
    res.status(200).json({ status: 'success', media: list });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao listar mídias'));
  }
};

/** POST /api/ai-agent/:id/media (multipart: file, caption?, maxUsesPerContact?) */
export const addAgentMedia = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const file = (req as any).file;
    if (!userId) return next(createValidationError('Usuário não autenticado'));
    if (!file) return next(createValidationError('Arquivo é obrigatório'));
    const agent = await AIAgentService.getById(id, userId);
    if (!agent) return next(createNotFoundError('Agente de IA'));
    const { mediatype, messageType } = detectMediaType(file.mimetype);
    const mediaType = (mediatype === 'document' ? 'file' : mediatype) as 'image' | 'video' | 'file' | 'audio';
    const uploadResult = await uploadFileToService(file.buffer, file.originalname || 'file', file.mimetype);
    if (!uploadResult) return next(createValidationError('Erro ao fazer upload do arquivo'));
    const caption = (req.body?.caption as string)?.trim() || null;
    const maxUsesPerContact = req.body?.maxUsesPerContact != null ? parseInt(String(req.body.maxUsesPerContact), 10) : 1;
    const media = await aiAgentMediaService.create({
      agentId: id,
      mediaType,
      url: uploadResult.fullUrl,
      caption,
      maxUsesPerContact: isNaN(maxUsesPerContact) ? 1 : Math.max(1, maxUsesPerContact),
    });
    res.status(201).json({ status: 'success', media });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao adicionar mídia'));
  }
};

/** DELETE /api/ai-agent/:id/media/:mediaId */
export const deleteAgentMedia = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { id, mediaId } = req.params;
    if (!userId) return next(createValidationError('Usuário não autenticado'));
    const agent = await AIAgentService.getById(id, userId);
    if (!agent) return next(createNotFoundError('Agente de IA'));
    const deleted = await aiAgentMediaService.deleteByIdAndAgentId(mediaId, id);
    if (!deleted) return next(createNotFoundError('Mídia'));
    res.status(200).json({ status: 'success', message: 'Mídia removida' });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao remover mídia'));
  }
};

/** GET /api/ai-agent/:id/locations */
export const listAgentLocations = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    if (!userId) return next(createValidationError('Usuário não autenticado'));
    const agent = await AIAgentService.getById(id, userId);
    if (!agent) return next(createNotFoundError('Agente de IA'));
    const list = await aiAgentLocationService.listByAgentId(id);
    res.status(200).json({ status: 'success', locations: list });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao listar localizações'));
  }
};

/** POST /api/ai-agent/:id/locations */
export const addAgentLocation = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const { name, address, latitude, longitude, maxUsesPerContact } = req.body || {};
    if (!userId) return next(createValidationError('Usuário não autenticado'));
    const agent = await AIAgentService.getById(id, userId);
    if (!agent) return next(createNotFoundError('Agente de IA'));
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return next(createValidationError('latitude e longitude são obrigatórios e numéricos'));
    }
    const location = await aiAgentLocationService.create({
      agentId: id,
      name: name != null ? String(name).trim() || null : null,
      address: address != null ? String(address).trim() || null : null,
      latitude: lat,
      longitude: lng,
      maxUsesPerContact: maxUsesPerContact != null ? Math.max(1, parseInt(String(maxUsesPerContact), 10)) : 1,
    });
    res.status(201).json({ status: 'success', location });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao adicionar localização'));
  }
};

/** DELETE /api/ai-agent/:id/locations/:locationId */
export const deleteAgentLocation = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { id, locationId } = req.params;
    if (!userId) return next(createValidationError('Usuário não autenticado'));
    const agent = await AIAgentService.getById(id, userId);
    if (!agent) return next(createNotFoundError('Agente de IA'));
    const deleted = await aiAgentLocationService.deleteByIdAndAgentId(locationId, id);
    if (!deleted) return next(createNotFoundError('Localização'));
    res.status(200).json({ status: 'success', message: 'Localização removida' });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao remover localização'));
  }
};

