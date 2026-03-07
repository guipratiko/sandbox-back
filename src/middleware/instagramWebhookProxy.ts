/**
 * Middleware de proxy para webhooks do Instagram (público - Meta chama diretamente)
 */

import { Request, Response, NextFunction } from 'express';
import axios, { AxiosError } from 'axios';

const INSTAGRAM_SERVICE_URL = process.env.INSTAGRAM_SERVICE_URL || 'http://localhost:4335';

/**
 * Proxy para redirecionar webhooks de /webhook/instagram para o microserviço
 */
export const instagramWebhookProxy = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // URL do webhook no microserviço
    const targetUrl = `${INSTAGRAM_SERVICE_URL}/webhook/instagram`;
    
    // Preparar headers (sem autenticação - webhook é público)
    const headers: Record<string, string> = {
      'Content-Type': req.headers['content-type'] || 'application/json',
    };

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

    // Adicionar query params (para verificação GET)
    if (Object.keys(req.query).length > 0) {
      config.params = req.query;
    }

    // Adicionar body se existir (para eventos POST)
    if (req.body && Object.keys(req.body).length > 0) {
      config.data = req.body;
    }

    const response = await axios(config);

    // Para verificação (GET), retornar texto puro (hub.challenge)
    if (req.method === 'GET' && typeof response.data === 'string') {
      res.status(response.status).send(response.data);
      return;
    }

    // Para eventos (POST), retornar JSON ou texto
    if (typeof response.data === 'string') {
      res.status(response.status).send(response.data);
    } else {
      res.status(response.status).json(response.data);
    }
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      
      console.error(`❌ [Proxy Webhook Instagram] Erro:`, axiosError.code, axiosError.message);
      
      // Se o microserviço não estiver rodando
      if (axiosError.code === 'ECONNREFUSED') {
        console.error(`❌ [Proxy Webhook Instagram] Microserviço não está rodando em ${INSTAGRAM_SERVICE_URL}`);
        res.status(503).send('Service Unavailable');
        return;
      }

      // Retornar erro do microserviço
      if (axiosError.response) {
        console.error(`❌ [Proxy Webhook Instagram] Erro do microserviço:`, axiosError.response.status, axiosError.response.data);
        const status = axiosError.response.status;
        const data = axiosError.response.data;
        
        // Para verificação GET, retornar texto
        if (req.method === 'GET' && typeof data === 'string') {
          res.status(status).send(data);
        } else {
          res.status(status).json(data);
        }
        return;
      }
    }

    console.error(`❌ [Proxy Webhook Instagram] Erro genérico:`, error);
    res.status(500).send('Internal Server Error');
  }
};
