/**
 * Middleware de proxy para rotas públicas de privacidade do Instagram (público - Meta chama diretamente)
 */

import { Request, Response, NextFunction } from 'express';
import axios, { AxiosError } from 'axios';

const INSTAGRAM_SERVICE_URL = process.env.INSTAGRAM_SERVICE_URL || 'http://localhost:4335';

/**
 * Proxy para redirecionar requisições de privacidade para o microserviço Insta-Clerky
 * Essas rotas são públicas e não requerem autenticação
 */
export const instagramPrivacyProxy = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Extrair o path após /instagram/privacy
    // req.path já não inclui o prefixo /api (removido pelo Express ao processar o router)
    const privacyPath = req.path.replace('/instagram/privacy', '');
    const targetUrl = `${INSTAGRAM_SERVICE_URL}/api/instagram/privacy${privacyPath}`;
    
    console.log(`📡 [Proxy Instagram Privacy] ${req.method} ${req.path} -> ${targetUrl}`);
    
    // Preparar headers (sem autenticação - webhook é público)
    const contentType = req.headers['content-type'] || 'application/json';
    const headers: Record<string, string> = {};

    // Fazer requisição para o microserviço
    const config: {
      method: string;
      url: string;
      headers: Record<string, string>;
      timeout: number;
      params?: Record<string, unknown>;
      data?: unknown;
    } = {
      method: req.method,
      url: targetUrl,
      headers,
      timeout: 30000,
    };

    // Adicionar query params
    if (Object.keys(req.query).length > 0) {
      config.params = req.query;
    }

    // Adicionar body se existir
    if (req.body && Object.keys(req.body).length > 0) {
      // Se for form-data (application/x-www-form-urlencoded), enviar como URLSearchParams
      if (contentType.includes('application/x-www-form-urlencoded')) {
        const formData = new URLSearchParams();
        Object.keys(req.body).forEach((key) => {
          formData.append(key, String(req.body[key]));
        });
        config.data = formData.toString();
        config.headers['Content-Type'] = 'application/x-www-form-urlencoded';
      } else {
        // Para JSON ou outros tipos
      config.data = req.body;
        config.headers['Content-Type'] = contentType;
      }
    } else {
      config.headers['Content-Type'] = contentType;
    }

    const response = await axios(config);

    // Retornar resposta do microserviço
    res.status(response.status).json(response.data);
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      console.error('❌ [Proxy Instagram Privacy] Erro:', axiosError.message);
      
      if (axiosError.response) {
        // Retornar erro do microserviço
        res.status(axiosError.response.status).json(axiosError.response.data);
      } else if (axiosError.request) {
        // Timeout ou serviço indisponível
        console.error('❌ [Proxy Instagram Privacy] Serviço Insta-Clerky não respondeu');
        res.status(503).json({
          status: 'error',
          message: 'Serviço de Instagram temporariamente indisponível',
        });
      } else {
        res.status(500).json({
          status: 'error',
          message: 'Erro ao processar requisição',
        });
      }
    } else {
      console.error('❌ [Proxy Instagram Privacy] Erro desconhecido:', error);
      res.status(500).json({
        status: 'error',
        message: 'Erro ao processar requisição',
      });
    }
  }
};
