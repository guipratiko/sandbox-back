import { Response, NextFunction } from 'express';
import multer from 'multer';
import Instance from '../models/Instance'; // Ainda no MongoDB
import { AuthRequest } from '../middleware/auth';
import { sendMessage as sendMessageAdapter } from '../utils/sendMessageAdapter';
import { uploadFileToService, detectMediaType } from '../utils/mediaService';
import { convertAudioToOgg } from '../utils/audioToOgg';
import { createValidationError, createNotFoundError, handleControllerError } from '../utils/errorHelpers';
import { ContactService } from '../services/contactService';
import { MessageService } from '../services/messageService';
import { extractMessageId } from '../utils/webhookAPIHelpers';
import { AIAgentService } from '../services/aiAgentService';
import { pauseAgentForContact } from '../services/aiAgentProcessor';
import { extractPhoneFromJid } from '../utils/numberNormalizer';
import { ensureHttps } from '../utils/helpers';

/** Tipos MIME aceitos no upload de mídia (imagem, vídeo, áudio). */
const ALLOWED_UPLOAD_MIMES = [
  'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
  'video/mp4', 'video/quicktime',
  'audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/wav', 'audio/webm',
  'audio/x-m4a', 'audio/m4a', 'audio/aac',
];

/**
 * Obter mensagens de um contato (com paginação)
 */
export const getMessages = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { contactId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const useCache = req.query.cache !== 'false'; // Cache habilitado por padrão

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    // Verificar se o contato pertence ao usuário
    const contact = await ContactService.getContactById(contactId, userId);
    if (!contact) {
      return next(createNotFoundError('Contato'));
    }

    // Buscar mensagens com paginação e cache
    const result = await MessageService.getMessages({
      contactId,
      userId,
      page,
      limit,
      useCache,
    });

    // Marcar mensagens como lidas
    await MessageService.markAsRead(contactId, userId);

    // Resetar contador de não lidas
    await ContactService.resetUnreadCount(contactId, userId);

    res.status(200).json({
      status: 'success',
      count: result.messages.length,
      page: result.page,
      limit: result.limit,
      hasMore: result.hasMore,
      messages: result.messages.map((msg) => ({
        id: msg.id,
        messageId: msg.messageId,
        fromMe: msg.fromMe,
        messageType: msg.messageType,
        content: msg.content,
        mediaUrl: ensureHttps(msg.mediaUrl) ?? null,
        timestamp: msg.timestamp.toISOString(),
        read: msg.read,
      })),
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao obter mensagens'));
  }
};

// Configuração do multer para upload de arquivos
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_UPLOAD_MIMES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de arquivo não permitido. Use imagens, vídeos ou áudios.'));
    }
  },
});

/**
 * Middleware para upload de arquivo
 */
export const uploadMedia = upload.single('file');

/**
 * Enviar mídia (imagem, vídeo, áudio ou documento) — Evolution ou API Oficial.
 */
export const sendMedia = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { contactId } = req.params;
    const { caption } = req.body;
    const file = req.file;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    if (!file) {
      return next(createValidationError('Arquivo é obrigatório'));
    }

    // Buscar contato e verificar se pertence ao usuário
    const contact = await ContactService.getContactById(contactId, userId);
    if (!contact) {
      return next(createNotFoundError('Contato'));
    }

    // Buscar instância do MongoDB (ainda está lá)
    const instance = await Instance.findById(contact.instanceId);
    if (!instance) {
      return next(createNotFoundError('Instância'));
    }

    // Detectar tipo de mídia
    const { mediatype, messageType } = detectMediaType(file.mimetype);

    // Fazer upload para MidiaService
    const fileName = file.originalname || `media-${Date.now()}.${file.mimetype.split('/')[1]}`;
    const uploadResult = await uploadFileToService(
      file.buffer,
      fileName,
      file.mimetype
    );

    if (!uploadResult) {
      return next(createValidationError('Erro ao fazer upload do arquivo'));
    }

    const payload: { number: string; caption?: string; image?: string; video?: string; audio?: string; document?: string; fileName?: string } = {
      number: contact.remoteJid,
      caption: caption || '',
    };
    if (mediatype === 'image') payload.image = uploadResult.fullUrl;
    else if (mediatype === 'video') payload.video = uploadResult.fullUrl;
    else if (mediatype === 'audio') payload.audio = uploadResult.fullUrl;
    else { payload.document = uploadResult.fullUrl; payload.fileName = fileName; }
    const evolutionResponse = await sendMessageAdapter(instance, payload);
    const sentMessageId = extractMessageId(evolutionResponse);

    // Criar registro da mensagem no PostgreSQL
    const now = new Date();
    const message = await MessageService.createMessage({
      userId: userId,
      instanceId: contact.instanceId, // String do ObjectId
      contactId: contact.id,
      remoteJid: contact.remoteJid,
      messageId: sentMessageId,
      fromMe: true,
      messageType,
      content: '[Mídia]',
      mediaUrl: uploadResult.fullUrl,
      timestamp: now,
      read: true,
    });

    // Pausar agente para este contato quando usuário envia mensagem (bloqueio configurável)
    try {
      const agent = await AIAgentService.getActiveByInstance(contact.instanceId);
      if (agent?.blockWhenUserReplies && userId) {
        const contactPhone = extractPhoneFromJid(contact.remoteJid);
        if (contactPhone) {
          await pauseAgentForContact(userId, contact.instanceId, contactPhone, {
            blockWhenUserReplies: agent.blockWhenUserReplies,
            blockDuration: agent.blockDuration,
            blockDurationUnit: agent.blockDurationUnit ?? 'permanent',
          });
        }
      }
    } catch (blockError) {
      console.warn('⚠️ Erro ao pausar agente ao enviar mídia:', blockError);
    }

    res.status(200).json({
      status: 'success',
      message: 'Mídia enviada com sucesso',
      data: {
        id: message.id,
        messageId: message.messageId,
        fromMe: message.fromMe,
        messageType: message.messageType,
        content: message.content,
        mediaUrl: ensureHttps(message.mediaUrl) ?? null,
        timestamp: message.timestamp.toISOString(),
      },
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao enviar mídia'));
  }
};

/**
 * Enviar áudio (Evolution ou API Oficial). Áudio é convertido para OGG antes do envio quando necessário.
 */
export const sendAudio = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { contactId } = req.params;
    const file = req.file;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    if (!file) {
      return next(createValidationError('Arquivo de áudio é obrigatório'));
    }

    // Verificar se é áudio
    if (!file.mimetype.startsWith('audio/')) {
      return next(createValidationError('Arquivo deve ser um áudio'));
    }

    // Buscar contato e verificar se pertence ao usuário
    const contact = await ContactService.getContactById(contactId, userId);
    if (!contact) {
      return next(createNotFoundError('Contato'));
    }

    // Buscar instância do MongoDB (ainda está lá)
    const instance = await Instance.findById(contact.instanceId);
    if (!instance) {
      return next(createNotFoundError('Instância'));
    }

    // Converter para OGG (OPUS) antes do envio — WhatsApp/Meta aceita audio/ogg
    const { buffer: audioBuffer, mime: audioMime } = await convertAudioToOgg(file.buffer, file.mimetype);
    const fileName = file.originalname
      ? file.originalname.replace(/\.[^.]+$/, '.ogg')
      : `audio-${Date.now()}.ogg`;

    const uploadResult = await uploadFileToService(
      audioBuffer,
      fileName,
      audioMime
    );

    if (!uploadResult) {
      return next(createValidationError('Erro ao fazer upload do áudio'));
    }

    const evolutionResponse = await sendMessageAdapter(instance, {
      number: contact.remoteJid,
      audio: uploadResult.fullUrl,
    });
    const sentMessageId = extractMessageId(evolutionResponse);

    // Criar registro da mensagem no PostgreSQL
    const now = new Date();
    const message = await MessageService.createMessage({
      userId: userId,
      instanceId: contact.instanceId, // String do ObjectId
      contactId: contact.id,
      remoteJid: contact.remoteJid,
      messageId: sentMessageId,
      fromMe: true,
      messageType: 'audioMessage',
      content: '[Mídia]',
      mediaUrl: uploadResult.fullUrl,
      timestamp: now,
      read: true,
    });

    // Pausar agente para este contato quando usuário envia mensagem (bloqueio configurável)
    try {
      const agent = await AIAgentService.getActiveByInstance(contact.instanceId);
      if (agent?.blockWhenUserReplies && userId) {
        const contactPhone = extractPhoneFromJid(contact.remoteJid);
        if (contactPhone) {
          await pauseAgentForContact(userId, contact.instanceId, contactPhone, {
            blockWhenUserReplies: agent.blockWhenUserReplies,
            blockDuration: agent.blockDuration,
            blockDurationUnit: agent.blockDurationUnit ?? 'permanent',
          });
        }
      }
    } catch (blockError) {
      console.warn('⚠️ Erro ao pausar agente ao enviar áudio:', blockError);
    }

    res.status(200).json({
      status: 'success',
      message: 'Áudio enviado com sucesso',
      data: {
        id: message.id,
        messageId: message.messageId,
        fromMe: message.fromMe,
        messageType: message.messageType,
        content: message.content,
        mediaUrl: ensureHttps(message.mediaUrl) ?? null,
        timestamp: message.timestamp.toISOString(),
      },
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao enviar áudio'));
  }
};

/**
 * Enviar mensagem via Evolution API
 */
export const sendMessage = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { contactId } = req.params;
    const { text } = req.body;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    if (!text || text.trim().length === 0) {
      return next(createValidationError('Texto da mensagem é obrigatório'));
    }

    // Buscar contato e verificar se pertence ao usuário
    const contact = await ContactService.getContactById(contactId, userId);
    if (!contact) {
      return next(createNotFoundError('Contato'));
    }

    // Buscar instância do MongoDB (ainda está lá)
    const instance = await Instance.findById(contact.instanceId);
    if (!instance) {
      return next(createNotFoundError('Instância'));
    }

    const evolutionResponse = await sendMessageAdapter(instance, {
      number: contact.remoteJid,
      text: text.trim(),
    });
    const sentMessageId = extractMessageId(evolutionResponse);

    // Criar registro da mensagem no PostgreSQL
    const now = new Date();
    const message = await MessageService.createMessage({
      userId: userId,
      instanceId: contact.instanceId, // String do ObjectId
      contactId: contact.id,
      remoteJid: contact.remoteJid,
      messageId: sentMessageId,
      fromMe: true,
      messageType: 'conversation',
      content: text.trim(),
      timestamp: now,
      read: true,
    });

    // Pausar agente para este contato quando usuário envia mensagem (bloqueio configurável)
    try {
      const agent = await AIAgentService.getActiveByInstance(contact.instanceId);
      if (agent?.blockWhenUserReplies && userId) {
        const contactPhone = extractPhoneFromJid(contact.remoteJid);
        if (contactPhone) {
          await pauseAgentForContact(userId, contact.instanceId, contactPhone, {
            blockWhenUserReplies: agent.blockWhenUserReplies,
            blockDuration: agent.blockDuration,
            blockDurationUnit: agent.blockDurationUnit ?? 'permanent',
          });
        }
      }
    } catch (blockError) {
      console.warn('⚠️ Erro ao pausar agente ao enviar mensagem:', blockError);
    }

    res.status(200).json({
      status: 'success',
      message: 'Mensagem enviada com sucesso',
      data: {
        id: message.id,
        messageId: message.messageId,
        fromMe: message.fromMe,
        content: message.content,
        timestamp: message.timestamp.toISOString(),
      },
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao enviar mensagem'));
  }
};
