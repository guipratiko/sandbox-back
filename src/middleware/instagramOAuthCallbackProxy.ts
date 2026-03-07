/**
 * Middleware de proxy para redirecionar requisições de callback OAuth do Instagram
 * para o microserviço Insta-Clerky (rota pública, sem autenticação)
 */

import { Request, Response, NextFunction } from 'express';
import axios, { AxiosError } from 'axios';

const INSTAGRAM_SERVICE_URL = process.env.INSTAGRAM_SERVICE_URL || 'http://localhost:4335';

/**
 * Proxy para redirecionar requisições de callback OAuth do Instagram para o microserviço
 * Esta é uma rota pública (sem autenticação) para receber callbacks do Instagram
 */
export const instagramOAuthCallbackProxy = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Construir URL do microserviço
    const path = '/instagram/instances/oauth/callback';
    const targetUrl = `${INSTAGRAM_SERVICE_URL}/api${path}`;
    
    console.log(`📡 [Proxy Instagram OAuth Callback] Redirecionando para: ${targetUrl}`);
    console.log(`📡 [Proxy Instagram OAuth Callback] Query params:`, req.query);
    
    // Preparar headers (sem autenticação, pois é callback público)
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
      headers: {
        ...headers,
        'Content-Type': req.headers['content-type'] || 'application/json',
      },
      timeout: 30000,
    };

    // Adicionar query params (importante para OAuth callbacks)
    if (Object.keys(req.query).length > 0) {
      config.params = req.query;
    }

    // Adicionar body se existir
    if (req.body && Object.keys(req.body).length > 0) {
      config.data = req.body;
    }

    console.log(`📡 [Proxy Instagram OAuth Callback] Enviando requisição:`, {
      method: config.method,
      url: config.url,
      params: config.params,
    });

    // Não seguir redirects automaticamente - vamos tratar manualmente
    const response = await axios({
      ...config,
      maxRedirects: 0,
      validateStatus: (status) => status >= 200 && status < 400, // Aceitar redirects como sucesso
    });

    // Se for um redirect (301, 302, 303, 307, 308), repassar o redirect para o cliente
    if (response.status >= 300 && response.status < 400 && response.headers.location) {
      console.log(`📡 [Proxy Instagram OAuth Callback] Redirect detectado: ${response.headers.location}`);
      res.redirect(response.status, response.headers.location);
      return;
    }

    // Se for uma resposta JSON normal, retornar JSON
    if (response.headers['content-type']?.includes('application/json')) {
      res.status(response.status).json(response.data);
      return;
    }

    // Para outros tipos de resposta, retornar como está
    res.status(response.status);
    if (response.headers['content-type']) {
      res.setHeader('Content-Type', response.headers['content-type']);
    }
    res.send(response.data);
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      
      console.error(`❌ [Proxy Instagram OAuth Callback] Erro:`, axiosError.code, axiosError.message);
      
      // Se o microserviço não estiver rodando
      if (axiosError.code === 'ECONNREFUSED') {
        console.error(`❌ [Proxy Instagram OAuth Callback] Microserviço não está rodando em ${INSTAGRAM_SERVICE_URL}`);
        res.status(503).json({
          status: 'error',
          message: 'Serviço de Instagram temporariamente indisponível',
        });
        return;
      }

      // Retornar erro do microserviço
      if (axiosError.response) {
        console.error(`❌ [Proxy Instagram OAuth Callback] Erro do microserviço:`, axiosError.response.status, axiosError.response.data);
        res.status(axiosError.response.status).json(axiosError.response.data);
        return;
      }
    }

    console.error(`❌ [Proxy Instagram OAuth Callback] Erro genérico:`, error);
    res.status(500).json({
      status: 'error',
      message: 'Erro ao processar callback OAuth',
    });
  }
};
