/**
 * Middleware de proxy para redirecionar requisições de Instagram para o microserviço Insta-Clerky
 */

import { Request, Response, NextFunction } from 'express';
import { proxyRequest, ProxyConfig } from '../utils/proxyHelpers';

const INSTAGRAM_SERVICE_URL = process.env.INSTAGRAM_SERVICE_URL || 'http://localhost:4335';

const proxyConfig: ProxyConfig = {
  serviceUrl: INSTAGRAM_SERVICE_URL,
  pathPrefix: '/instagram',
  serviceName: 'Instagram',
  errorMessage: 'Serviço de Instagram temporariamente indisponível',
};

/**
 * Proxy para redirecionar requisições de /api/instagram/* para o microserviço
 */
export const instagramProxy = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  await proxyRequest(req, res, proxyConfig);
};
