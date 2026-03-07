import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import mongoose from 'mongoose';
import {
  GroupMessageService,
  GroupMessageType,
  GroupMessageTargetType,
} from '../services/groupMessageService';
import Instance from '../models/Instance';
import { sendMessage as sendMessageAdapter } from '../utils/sendMessageAdapter';
import {
  createValidationError,
  createNotFoundError,
  handleControllerError,
} from '../utils/errorHelpers';
import { uploadFileToService } from '../utils/mediaService';
import multer from 'multer';

/**
 * Helper: validar e obter instância a partir de instanceId + userId
 */
async function getInstanceForUser(
  instanceId: string,
  userId?: string
): Promise<{ instanceName: string; integration?: string; phone_number_id?: string | null }> {
  if (!userId) {
    throw createValidationError('Usuário não autenticado');
  }

  let userObjectId: mongoose.Types.ObjectId;
  let instanceObjectId: mongoose.Types.ObjectId;

  try {
    userObjectId = new mongoose.Types.ObjectId(userId);
    instanceObjectId = new mongoose.Types.ObjectId(instanceId);
  } catch {
    throw createValidationError('ID de instância inválido');
  }

  const instance = await Instance.findOne({
    _id: instanceObjectId,
    userId: userObjectId,
  }).lean();

  if (!instance) {
    throw createNotFoundError('Instância');
  }

  return instance as any;
}

/**
 * Listar templates de mensagens de grupos
 * GET /api/groups/message-templates?instanceId=xxx
 */
export const getGroupMessageTemplates = async (
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

    if (!instanceId || typeof instanceId !== 'string') {
      return next(createValidationError('ID da instância é obrigatório'));
    }

    const templates = await GroupMessageService.getTemplatesByInstance(
      userId,
      instanceId
    );

    res.status(200).json({
      status: 'success',
      data: templates,
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao buscar templates de mensagens de grupos'));
  }
};

/**
 * Criar template de mensagem de grupo
 * POST /api/groups/message-templates
 */
export const createGroupMessageTemplate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { instanceId, name, description, messageType, contentJson } = req.body;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    if (!instanceId) {
      return next(createValidationError('ID da instância é obrigatório'));
    }

    if (!name || String(name).trim().length === 0) {
      return next(createValidationError('Nome do template é obrigatório'));
    }

    const allowedTypes: GroupMessageType[] = [
      'text',
      'media',
      'poll',
      'contact',
      'location',
      'audio',
    ];

    if (!messageType || !allowedTypes.includes(messageType)) {
      return next(
        createValidationError(
          'Tipo de mensagem inválido. Use: text, media, poll, contact, location ou audio'
        )
      );
    }

    if (!contentJson) {
      return next(createValidationError('Conteúdo do template é obrigatório'));
    }

    const template = await GroupMessageService.createTemplate({
      userId,
      instanceId,
      name: String(name).trim(),
      description: description || null,
      messageType,
      contentJson,
    });

    res.status(201).json({
      status: 'success',
      message: 'Template criado com sucesso',
      data: template,
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao criar template de mensagem de grupo'));
  }
};

/**
 * Atualizar template de mensagem de grupo
 * PUT /api/groups/message-templates/:id
 */
export const updateGroupMessageTemplate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const { name, description, contentJson } = req.body;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    if (!id) {
      return next(createValidationError('ID do template é obrigatório'));
    }

    const updates: any = {};

    if (name !== undefined) {
      if (String(name).trim().length === 0) {
        return next(createValidationError('Nome do template não pode ser vazio'));
      }
      updates.name = String(name).trim();
    }

    if (description !== undefined) {
      updates.description = description;
    }

    if (contentJson !== undefined) {
      updates.contentJson = contentJson;
    }

    const template = await GroupMessageService.updateTemplate(id, userId, updates);

    res.status(200).json({
      status: 'success',
      message: 'Template atualizado com sucesso',
      data: template,
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Template não encontrado') {
      return next(createNotFoundError('Template'));
    }
    return next(handleControllerError(error, 'Erro ao atualizar template de mensagem de grupo'));
  }
};

/**
 * Deletar template de mensagem de grupo
 * DELETE /api/groups/message-templates/:id
 */
export const deleteGroupMessageTemplate = async (
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

    if (!id) {
      return next(createValidationError('ID do template é obrigatório'));
    }

    await GroupMessageService.deleteTemplate(id, userId);

    res.status(200).json({
      status: 'success',
      message: 'Template deletado com sucesso',
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao deletar template de mensagem de grupo'));
  }
};

/**
 * Enviar mensagem de grupo imediatamente
 * POST /api/groups/messages/send
 *
 * Body esperado:
 * - instanceId: string
 * - messageType: GroupMessageType
 * - contentJson: any (dependendo do tipo)
 * - targetType: 'all' | 'specific'
 * - groupIds?: string[] (obrigatório se targetType = 'specific')
 * - templateId?: string (opcional, para rastrear template usado)
 */
export const sendGroupMessageNow = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const {
      instanceId,
      messageType,
      contentJson,
      targetType,
      groupIds,
      templateId,
    } = req.body as {
      instanceId: string;
      messageType: GroupMessageType;
      contentJson: any;
      targetType: GroupMessageTargetType;
      groupIds?: string[];
      templateId?: string;
    };

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    if (!instanceId) {
      return next(createValidationError('ID da instância é obrigatório'));
    }

    const allowedTypes: GroupMessageType[] = [
      'text',
      'media',
      'poll',
      'contact',
      'location',
      'audio',
    ];

    if (!messageType || !allowedTypes.includes(messageType)) {
      return next(
        createValidationError(
          'Tipo de mensagem inválido. Use: text, media, poll, contact, location ou audio'
        )
      );
    }

    if (!contentJson) {
      return next(createValidationError('Conteúdo da mensagem é obrigatório'));
    }

    if (!targetType || !['all', 'specific'].includes(targetType)) {
      return next(
        createValidationError('Tipo de destino inválido. Use: all ou specific')
      );
    }

    if (targetType === 'specific') {
      if (!groupIds || !Array.isArray(groupIds) || groupIds.length === 0) {
        return next(
          createValidationError(
            'Informe ao menos um grupo para enviar a mensagem'
          )
        );
      }
    }

    const instance = await getInstanceForUser(instanceId, userId);

    // Determinar grupos de destino
    let targetGroupIds: string[] = [];

    if (targetType === 'all') {
      // Quando o destino é "todos", o frontend deve enviar a lista de grupos já carregada.
      // Por segurança, ainda validamos que veio algo.
      if (!groupIds || !Array.isArray(groupIds) || groupIds.length === 0) {
        return next(
          createValidationError(
            'Lista de grupos é obrigatória quando targetType = all'
          )
        );
      }
      targetGroupIds = groupIds;
    } else {
      targetGroupIds = groupIds || [];
    }

    // Enviar para cada grupo (em série, com try/catch individual)
    const results: Array<{
      groupId: string;
      success: boolean;
      error?: string;
    }> = [];

    console.log(`📤 Iniciando envio de mensagens para ${targetGroupIds.length} grupo(s)`);
    console.log(`📋 Tipo: ${messageType}, Instância: ${instance.instanceName}`);

    for (const groupId of targetGroupIds) {
      try {
        console.log(`📨 Enviando mensagem para grupo: ${groupId}`);
        await sendGroupMessageByType(instance, groupId, messageType, contentJson);
        console.log(`✅ Mensagem enviada com sucesso para grupo: ${groupId}`);
        results.push({ groupId, success: true });
      } catch (error: any) {
        const errorMessage = error?.message || String(error);
        console.error(`❌ Erro ao enviar mensagem para grupo ${groupId}:`, errorMessage);
        results.push({ groupId, success: false, error: errorMessage });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    console.log(`📊 Resultado do envio: ${successCount} sucesso(s), ${failCount} falha(s)`);

    res.status(200).json({
      status: 'success',
      message: 'Envio de mensagens iniciado',
      data: {
        templateId: templateId || null,
        results,
      },
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao enviar mensagem para grupos'));
  }
};

/**
 * Agendar mensagem de grupo
 * POST /api/groups/messages/schedule
 */
export const scheduleGroupMessage = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const {
      instanceId,
      messageType,
      contentJson,
      targetType,
      groupIds,
      templateId,
      scheduledAt,
    } = req.body as {
      instanceId: string;
      messageType: GroupMessageType;
      contentJson: any;
      targetType: GroupMessageTargetType;
      groupIds?: string[];
      templateId?: string;
      scheduledAt: string;
    };

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    if (!instanceId) {
      return next(createValidationError('ID da instância é obrigatório'));
    }

    const allowedTypes: GroupMessageType[] = [
      'text',
      'media',
      'poll',
      'contact',
      'location',
      'audio',
    ];

    if (!messageType || !allowedTypes.includes(messageType)) {
      return next(
        createValidationError(
          'Tipo de mensagem inválido. Use: text, media, poll, contact, location ou audio'
        )
      );
    }

    if (!contentJson) {
      return next(createValidationError('Conteúdo da mensagem é obrigatório'));
    }

    if (!targetType || !['all', 'specific'].includes(targetType)) {
      return next(
        createValidationError('Tipo de destino inválido. Use: all ou specific')
      );
    }
    if (!groupIds || !Array.isArray(groupIds) || groupIds.length === 0) {
      return next(
        createValidationError(
          'Informe ao menos um grupo para agendar a mensagem'
        )
      );
    }

    if (!scheduledAt) {
      return next(
        createValidationError('Data/hora de agendamento é obrigatória')
      );
    }

    const scheduledDate = new Date(scheduledAt);
    if (Number.isNaN(scheduledDate.getTime())) {
      return next(
        createValidationError('Data/hora de agendamento inválida')
      );
    }

    const record = await GroupMessageService.scheduleMessage({
      userId,
      instanceId,
      templateId: templateId || null,
      messageType,
      contentJson,
      targetType,
      groupIds,
      scheduledAt: scheduledDate,
    });

    res.status(201).json({
      status: 'success',
      message: 'Mensagem agendada com sucesso',
      data: record,
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao agendar mensagem para grupos'));
  }
};

/**
 * Listar mensagens de grupos agendadas
 * GET /api/groups/messages/scheduled?instanceId=xxx
 */
export const getScheduledGroupMessages = async (
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

    if (!instanceId || typeof instanceId !== 'string') {
      return next(createValidationError('ID da instância é obrigatório'));
    }

    const records = await GroupMessageService.getScheduledMessages(
      userId,
      instanceId
    );

    res.status(200).json({
      status: 'success',
      data: records,
    });
  } catch (error: unknown) {
    return next(
      handleControllerError(error, 'Erro ao buscar mensagens de grupos agendadas')
    );
  }
};

/**
 * Cancelar mensagem de grupo agendada
 * POST /api/groups/messages/scheduled/:id/cancel
 */
export const cancelScheduledGroupMessage = async (
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

    if (!id) {
      return next(
        createValidationError('ID da mensagem agendada é obrigatório')
      );
    }

    await GroupMessageService.cancelScheduledMessage(id, userId);

    res.status(200).json({
      status: 'success',
      message: 'Mensagem agendada cancelada com sucesso',
    });
  } catch (error: unknown) {
    return next(
      handleControllerError(error, 'Erro ao cancelar mensagem de grupo agendada')
    );
  }
};

/**
 * Configuração do multer para upload de arquivos
 */
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB
  },
});

/**
 * Middleware para upload de arquivo
 */
export const uploadGroupMedia = upload.single('file');

/**
 * Upload de arquivo para MidiaService
 * POST /api/groups/upload
 */
export const uploadGroupFile = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const file = req.file;
    
    if (!file) {
      return next(createValidationError('Arquivo é obrigatório'));
    }

    const fileName = file.originalname || `file-${Date.now()}`;
    const uploadResult = await uploadFileToService(
      file.buffer,
      fileName,
      file.mimetype
    );

    if (!uploadResult) {
      return next(createValidationError('Erro ao fazer upload do arquivo'));
    }

    res.status(200).json({
      status: 'success',
      url: uploadResult.url,
      fullUrl: uploadResult.fullUrl,
      fileName,
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao fazer upload de arquivo'));
  }
};

/**
 * Função auxiliar interna: enviar mensagem para um grupo,
 * mapeando os diferentes tipos para a Evolution API.
 */
async function sendGroupMessageByType(
  instance: { instanceName: string; integration?: string; phone_number_id?: string | null },
  groupId: string,
  messageType: GroupMessageType,
  contentJson: any
): Promise<void> {
  console.log(`🔍 sendGroupMessageByType - Tipo: ${messageType}, Grupo: ${groupId}`);
  console.log(`📦 ContentJson:`, JSON.stringify(contentJson, null, 2));

  switch (messageType) {
    case 'text': {
      const text = contentJson?.text;
      if (!text || String(text).trim().length === 0) {
        throw new Error('Texto da mensagem é obrigatório');
      }
      const delaySeconds = contentJson?.delay;
      const delayMs = delaySeconds ? delaySeconds * 1000 : undefined;
      await sendMessageAdapter(instance, {
        number: groupId,
        text: String(text),
        ...(delayMs && { delay: delayMs }),
      });
      break;
    }
    case 'media': {
      const mediaUrl = contentJson?.media;
      const mediaType = contentJson?.mediatype || 'image';
      const mimeType = contentJson?.mimetype;
      const caption = contentJson?.caption;
      const fileName = contentJson?.fileName;

      if (!mediaUrl) {
        throw new Error('URL da mídia é obrigatória');
      }

      const delaySeconds = contentJson?.delay;
      const delayMs = delaySeconds ? delaySeconds * 1000 : undefined;

      if (mediaType === 'image') {
        await sendMessageAdapter(instance, {
          number: groupId,
          image: mediaUrl,
          caption: caption || undefined,
          ...(delayMs && { delay: delayMs }),
        });
      } else if (mediaType === 'video') {
        await sendMessageAdapter(instance, {
          number: groupId,
          video: mediaUrl,
          caption: caption || undefined,
          ...(delayMs && { delay: delayMs }),
        });
      } else if (mediaType === 'audio') {
        await sendMessageAdapter(instance, {
          number: groupId,
          audio: mediaUrl,
          ...(delayMs && { delay: delayMs }),
        });
      } else {
        await sendMessageAdapter(instance, {
          number: groupId,
          document: mediaUrl,
          fileName: fileName || 'arquivo',
          ...(delayMs && { delay: delayMs }),
        });
      }
      void mimeType;
      break;
    }
    case 'poll': {
      if (instance.integration === 'WHATSAPP-CLOUD') {
        throw new Error('Enquete não suportada para API Oficial');
      }
      const name = contentJson?.name;
      const values: string[] = contentJson?.values || [];
      const selectableCount = contentJson?.selectableCount ?? 1;

      if (!name || String(name).trim().length === 0) {
        throw new Error('Texto principal da enquete é obrigatório');
      }

      if (!Array.isArray(values) || values.length < 2) {
        throw new Error('A enquete deve ter pelo menos duas opções');
      }

      const { requestEvolutionAPI } = await import('../utils/evolutionAPI');
      await requestEvolutionAPI(
        'POST',
        `/message/sendPoll/${encodeURIComponent(instance.instanceName)}`,
        {
          number: groupId,
          name: String(name),
          selectableCount,
          values,
        }
      );
      break;
    }
    case 'contact': {
      if (instance.integration === 'WHATSAPP-CLOUD') {
        throw new Error('Envio de contato não suportado para API Oficial');
      }
      const contacts = contentJson?.contact;
      if (!Array.isArray(contacts) || contacts.length === 0) {
        throw new Error('Pelo menos um contato é obrigatório');
      }

      const { requestEvolutionAPI } = await import('../utils/evolutionAPI');
      await requestEvolutionAPI(
        'POST',
        `/message/sendContact/${encodeURIComponent(instance.instanceName)}`,
        {
          number: groupId,
          contact: contacts,
        }
      );
      break;
    }
    case 'location': {
      if (instance.integration === 'WHATSAPP-CLOUD') {
        throw new Error('Envio de localização não suportado para API Oficial');
      }
      const name = contentJson?.name;
      const address = contentJson?.address;
      const latitude = contentJson?.latitude;
      const longitude = contentJson?.longitude;

      if (
        latitude === undefined ||
        longitude === undefined ||
        latitude === null ||
        longitude === null
      ) {
        throw new Error('Latitude e longitude são obrigatórias');
      }

      const { requestEvolutionAPI } = await import('../utils/evolutionAPI');
      await requestEvolutionAPI(
        'POST',
        `/message/sendLocation/${encodeURIComponent(instance.instanceName)}`,
        {
          number: groupId,
          name: name || '',
          address: address || '',
          latitude,
          longitude,
        }
      );
      break;
    }
    case 'audio': {
      const audioUrl = contentJson?.audio;
      if (!audioUrl) {
        throw new Error('URL do áudio é obrigatória');
      }

      const delaySeconds = contentJson?.delay;
      const delayMs = delaySeconds ? delaySeconds * 1000 : undefined;

      await sendMessageAdapter(instance, {
        number: groupId,
        audio: audioUrl,
        ...(delayMs && { delay: delayMs }),
      });
      break;
    }
    default:
      throw new Error(`Tipo de mensagem não suportado: ${messageType}`);
  }
}

