import FormData from 'form-data';
import axios from 'axios';
import { MEDIA_SERVICE_CONFIG } from '../config/constants';
import { ensureHttps } from './helpers';

const META_GRAPH_VERSION = 'v21.0';

/** Mapeia tipo da Meta (webhook) para messageType interno (audioMessage, etc.) */
function metaTypeToMessageType(metaType: string): string {
  const map: Record<string, string> = {
    audio: 'audioMessage',
    image: 'imageMessage',
    video: 'videoMessage',
    document: 'documentMessage',
    sticker: 'stickerMessage',
  };
  return map[metaType] || metaType;
}

/**
 * Mapeia messageType para extensão de arquivo
 */
const getFileExtension = (messageType: string): string => {
  const extensionMap: Record<string, string> = {
    imageMessage: 'jpg',
    audioMessage: 'ogg', // WhatsApp usa OGG para áudio
    videoMessage: 'mp4',
    documentMessage: 'pdf',
    stickerMessage: 'webp',
  };

  return extensionMap[messageType] || 'bin';
};

/**
 * Gera nome único para o arquivo
 */
const generateFileName = (messageId: string, messageType: string): string => {
  const extension = getFileExtension(messageType);
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${messageId}-${timestamp}-${random}.${extension}`;
};

/**
 * Converte base64 em Buffer
 */
const base64ToBuffer = (base64: string): Buffer => {
  // Remove data URL prefix se existir (ex: "data:image/jpeg;base64,")
  const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;
  return Buffer.from(base64Data, 'base64');
};

/**
 * Faz upload de arquivo base64 para o MidiaService
 */
export const uploadMediaToService = async (
  base64: string,
  messageId: string,
  messageType: string
): Promise<{ url: string; fullUrl: string } | null> => {
  try {
    // Converter base64 para Buffer
    const fileBuffer = base64ToBuffer(base64);
    
    // Gerar nome do arquivo
    const fileName = generateFileName(messageId, messageType);

    // Criar FormData
    const formData = new FormData();
    formData.append('file', fileBuffer, {
      filename: fileName,
      contentType: getContentType(messageType),
    });

    // Fazer upload
    const response = await axios.post(
      `${MEDIA_SERVICE_CONFIG.URL}/upload`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          Authorization: `Bearer ${MEDIA_SERVICE_CONFIG.TOKEN}`,
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      }
    );

    if (response.data.success) {
      const fullUrl = ensureHttps(response.data.fullUrl) ?? response.data.fullUrl;
      return {
        url: response.data.url,
        fullUrl,
      };
    }

    return null;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('❌ Erro ao fazer upload para MidiaService:', errorMessage);
    if (error && typeof error === 'object' && 'response' in error) {
      const axiosError = error as { response?: { status?: number; data?: any } };
      if (axiosError.response) {
        console.error('Status:', axiosError.response.status);
        console.error('Data:', axiosError.response.data);
      }
    }
    return null;
  }
};

/**
 * Retorna o Content-Type baseado no tipo de mensagem
 */
const getContentType = (messageType: string): string => {
  const contentTypeMap: Record<string, string> = {
    imageMessage: 'image/jpeg',
    audioMessage: 'audio/ogg',
    videoMessage: 'video/mp4',
    documentMessage: 'application/pdf',
    stickerMessage: 'image/webp',
  };

  return contentTypeMap[messageType] || 'application/octet-stream';
};

/**
 * Faz upload de arquivo (Buffer) para o MidiaService
 */
export const uploadFileToService = async (
  fileBuffer: Buffer,
  fileName: string,
  contentType: string
): Promise<{ url: string; fullUrl: string } | null> => {
  try {
    // Criar FormData
    const formData = new FormData();
    formData.append('file', fileBuffer, {
      filename: fileName,
      contentType,
    });

    // Fazer upload
    const response = await axios.post(
      `${MEDIA_SERVICE_CONFIG.URL}/upload`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          Authorization: `Bearer ${MEDIA_SERVICE_CONFIG.TOKEN}`,
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      }
    );

    if (response.data.success) {
      const fullUrl = ensureHttps(response.data.fullUrl) ?? response.data.fullUrl;
      return {
        url: response.data.url,
        fullUrl,
      };
    }

    return null;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('❌ Erro ao fazer upload de arquivo para MidiaService:', errorMessage);
    if (error && typeof error === 'object' && 'response' in error) {
      const axiosError = error as { response?: { status?: number; data?: any } };
      if (axiosError.response) {
        console.error('Status:', axiosError.response.status);
        console.error('Data:', axiosError.response.data);
      }
    }
    return null;
  }
};

/**
 * Detecta o tipo de mídia baseado no mimetype
 */
export const detectMediaType = (mimetype: string): { mediatype: string; messageType: string } => {
  if (mimetype.startsWith('image/')) {
    return { mediatype: 'image', messageType: 'imageMessage' };
  }
  if (mimetype.startsWith('video/')) {
    return { mediatype: 'video', messageType: 'videoMessage' };
  }
  if (mimetype.startsWith('audio/')) {
    return { mediatype: 'audio', messageType: 'audioMessage' };
  }
  return { mediatype: 'document', messageType: 'documentMessage' };
};

/**
 * Busca mídia na Meta (Graph API) e faz upload no MidiaService.
 * Usado para mensagens recebidas via API Oficial (webhook) que trazem apenas media_id.
 */
export async function fetchMetaMediaAndUploadToMidiaService(
  mediaId: string,
  metaType: string,
  messageId: string,
  accessToken: string
): Promise<string | null> {
  try {
    const infoRes = await axios.get<{ url?: string }>(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/${mediaId}`,
      { params: { access_token: accessToken }, timeout: 15000 }
    );
    const downloadUrl = infoRes.data?.url;
    if (!downloadUrl) {
      console.warn('[Meta Media] Resposta sem url para media_id:', mediaId);
      return null;
    }
    const fileRes = await axios.get<ArrayBuffer>(downloadUrl, {
      responseType: 'arraybuffer',
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 30000,
      maxContentLength: 50 * 1024 * 1024,
    });
    const buffer = Buffer.from(fileRes.data);
    const messageType = metaTypeToMessageType(metaType);
    const contentType = getContentType(messageType);
    const ext = getFileExtension(messageType);
    const fileName = `${messageId}-${Date.now()}.${ext}`;
    const result = await uploadFileToService(buffer, fileName, contentType);
    return result?.fullUrl ?? null;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('[Meta Media] Erro ao buscar/enviar mídia:', mediaId, msg);
    return null;
  }
}

