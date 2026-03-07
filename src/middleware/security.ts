/**
 * Middlewares de segurança para proteção contra ataques
 */

import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

/**
 * Configuração do Helmet para headers de segurança
 */
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Ajustar conforme necessário para React
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:", "http:"],
      connectSrc: ["'self'", "https://back.onlyflow.com.br", "https://app.onlyflow.com.br", "wss:", "ws:"],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'", "https:", "http:"],
      frameSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false, // Necessário para integrações com APIs externas
  crossOriginResourcePolicy: { policy: 'cross-origin' },
});

/**
 * Rate Limiter geral para todas as rotas da API
 * DESABILITADO - Sem limite de requisições
 */
export const generalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: Infinity, // Ilimitado
  message: {
    status: 'error',
    message: 'Muitas requisições deste IP. Tente novamente em 15 minutos.',
  },
  standardHeaders: true, // Retorna rate limit info nos headers `RateLimit-*`
  legacyHeaders: false, // Desabilita headers `X-RateLimit-*`
  validate: false, // Desabilitar validação automática (evita erro com trust proxy)
  keyGenerator: (req: Request) => {
    // Usar o IP real do cliente (já processado pelo Express com trust proxy)
    return req.ip || req.socket.remoteAddress || 'unknown';
  },
  skip: () => true, // Sempre pular rate limit (ilimitado)
});

/**
 * Rate Limiter mais restritivo para autenticação
 * DESABILITADO - Sem limite de requisições
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: Infinity, // Ilimitado
  message: {
    status: 'error',
    message: 'Muitas tentativas de login. Tente novamente em 15 minutos.',
  },
  skipSuccessfulRequests: true, // Não contar requisições bem-sucedidas
  standardHeaders: true,
  legacyHeaders: false,
  validate: false, // Desabilitar validação automática (evita erro com trust proxy)
  keyGenerator: (req: Request) => {
    // Usar o IP real do cliente (já processado pelo Express com trust proxy)
    return req.ip || req.socket.remoteAddress || 'unknown';
  },
  skip: () => true, // Sempre pular rate limit (ilimitado)
});

/**
 * Rate Limiter para criação de recursos (instâncias, workflows, etc.)
 * DESABILITADO - Sem limite de requisições
 */
export const createResourceRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: Infinity, // Ilimitado
  message: {
    status: 'error',
    message: 'Limite de criação de recursos excedido. Tente novamente em 1 hora.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: false, // Desabilitar validação automática (evita erro com trust proxy)
  keyGenerator: (req: Request) => {
    // Usar o IP real do cliente (já processado pelo Express com trust proxy)
    return req.ip || req.socket.remoteAddress || 'unknown';
  },
  skip: () => true, // Sempre pular rate limit (ilimitado)
});

/**
 * Headers de segurança customizados adicionais
 */
export const customSecurityHeaders = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
};

/**
 * Middleware para detectar User-Agents suspeitos (bots, crawlers)
 */
export const detectSuspiciousAgents = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const userAgent = req.headers['user-agent']?.toLowerCase() || '';
  const suspiciousPatterns = [
    'bot',
    'crawler',
    'spider',
    'scraper',
    'curl',
    'wget',
    'python-requests',
    'postman',
  ];

  // Para webhooks, permitir qualquer user-agent
  if (req.path.startsWith('/webhook') || req.path.startsWith('/api/v1/webhook')) {
    return next();
  }

  // Logar mas não bloquear (pode ser ajustado para bloquear)
  if (suspiciousPatterns.some((pattern) => userAgent.includes(pattern))) {
    console.log(`⚠️ [Security] User-Agent suspeito detectado: ${userAgent} - IP: ${req.ip}`);
    // Opcional: bloquear completamente
    // return res.status(403).json({ status: 'error', message: 'Acesso negado' });
  }

  next();
};
