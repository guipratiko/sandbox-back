/**
 * Proxy para o microserviço Scraping-Flow (Google Places, créditos, export CSV)
 */

import { Request, Response, NextFunction } from 'express';
import { proxyRequest, ProxyConfig } from '../utils/proxyHelpers';

const SCRAPING_FLOW_SERVICE_URL = process.env.SCRAPING_FLOW_SERVICE_URL || 'http://localhost:4336';

export const scrapingFlowProxy = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  await proxyRequest(req, res, {
    serviceUrl: SCRAPING_FLOW_SERVICE_URL,
    pathPrefix: '/scraping-flow',
    serviceName: 'Scraping-Flow',
    errorMessage: 'Serviço de scraping temporariamente indisponível',
    timeout: 120000, // buscas podem demorar
  });
};
