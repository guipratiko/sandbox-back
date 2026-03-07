/**
 * Funções utilitárias compartilhadas para proxies de microserviços
 * Elimina duplicação de código entre dispatchProxy, groupProxy, instagramProxy, etc.
 */

import { Request, Response } from 'express';
import axios, { AxiosError } from 'axios';
import FormData from 'form-data';

export interface ProxyConfig {
  serviceUrl: string;
  pathPrefix: string;
  serviceName: string;
  errorMessage?: string;
  /** Timeout em ms; padrão 30000. Use valor maior para operações em lote (ex: leave-bulk). */
  timeout?: number;
}

export interface FileUploadInfo {
  fieldName: string;
  file: {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
  };
}

/**
 * Request com arquivo do multer
 * Usa interseção de tipos para adicionar propriedade file sem conflitar com tipos nativos
 */
export type RequestWithFile = Request & {
  file?: {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
  };
}

/**
 * Fazer requisição proxy para um microserviço
 */
export async function proxyRequest(
  req: Request,
  res: Response,
  config: ProxyConfig,
  fileUpload?: FileUploadInfo
): Promise<void> {
  try {
    // Construir URL do microserviço
    let path = req.path;
    if (!path.startsWith(config.pathPrefix)) {
      path = `${config.pathPrefix}${path}`;
    }
    const targetUrl = `${config.serviceUrl}/api${path}`;
    
    // Preparar headers
    const headers: Record<string, string> = {};
    if (req.headers.authorization) {
      headers.Authorization = req.headers.authorization;
    }

    // Configuração da requisição (arraybuffer para preservar UTF-8 em CSV/binários)
    const axiosConfig: {
      method: string;
      url: string;
      headers: Record<string, string>;
      timeout: number;
      responseType?: 'arraybuffer' | 'json';
      params?: Record<string, unknown>;
      data?: unknown;
      maxContentLength?: number;
      maxBodyLength?: number;
    } = {
      method: req.method,
      url: targetUrl,
      headers,
      timeout: config.timeout ?? 30000,
      responseType: 'arraybuffer',
    };

    // Adicionar query params
    if (Object.keys(req.query).length > 0) {
      axiosConfig.params = req.query;
    }

    // Se houver arquivo para upload, criar FormData
    if (fileUpload) {
      const formData = new FormData();
      formData.append(fileUpload.fieldName, fileUpload.file.buffer, {
        filename: fileUpload.file.originalname,
        contentType: fileUpload.file.mimetype,
      });
      
      // Adicionar outros campos do body
      if (req.body) {
        Object.keys(req.body).forEach((key) => {
          if (key !== fileUpload.fieldName) {
            formData.append(key, req.body[key]);
          }
        });
      }

      axiosConfig.data = formData;
      axiosConfig.headers = {
        ...formData.getHeaders(),
        ...headers,
      };
      axiosConfig.maxContentLength = Infinity;
      axiosConfig.maxBodyLength = Infinity;
    } else {
      // Para requisições normais (JSON)
      axiosConfig.headers['Content-Type'] = req.headers['content-type'] || 'application/json';
      
      // Adicionar body se existir
      if (req.body && Object.keys(req.body).length > 0) {
        axiosConfig.data = req.body;
      }
    }

    const response = await axios(axiosConfig);
    const data = response.data as Buffer;
    const contentType = (response.headers['content-type'] as string) || '';

    // Respostas não-JSON (ex.: CSV): repassar bytes brutos para preservar UTF-8/BOM
    if (
      contentType.includes('text/csv') ||
      contentType.includes('application/octet-stream') ||
      (contentType.startsWith('text/') && !contentType.includes('json'))
    ) {
      res.status(response.status);
      if (response.headers['content-type']) res.setHeader('Content-Type', response.headers['content-type']);
      if (response.headers['content-disposition']) res.setHeader('Content-Disposition', response.headers['content-disposition']);
      res.send(data);
      return;
    }

    // Resposta JSON: buffer foi recebido como arraybuffer, parsear em UTF-8
    res.status(response.status).json(JSON.parse(data.toString('utf8')));
  } catch (error: unknown) {
    handleProxyError(error, res, config);
  }
}

/**
 * Tratar erros de proxy de forma consistente
 */
export function handleProxyError(
  error: unknown,
  res: Response,
  config: ProxyConfig
): void {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError;
    
    console.error(`❌ [Proxy ${config.serviceName}] Erro:`, axiosError.code, axiosError.message);
    
    // Se o microserviço não estiver rodando
    if (axiosError.code === 'ECONNREFUSED') {
      console.error(`❌ [Proxy ${config.serviceName}] Microserviço não está rodando em ${config.serviceUrl}`);
      res.status(503).json({
        status: 'error',
        message: config.errorMessage || `Serviço ${config.serviceName} temporariamente indisponível`,
      });
      return;
    }

    // Retornar erro do microserviço
    if (axiosError.response) {
      console.error(`❌ [Proxy ${config.serviceName}] Erro do microserviço:`, axiosError.response.status, axiosError.response.data);
      res.status(axiosError.response.status).json(axiosError.response.data);
      return;
    }
  }

  console.error(`❌ [Proxy ${config.serviceName}] Erro genérico:`, error);
  res.status(500).json({
    status: 'error',
    message: 'Erro ao processar requisição',
  });
}
