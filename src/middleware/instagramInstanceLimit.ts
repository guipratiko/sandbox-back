/**
 * Middleware que verifica o limite de instâncias Instagram do plano do usuário
 * antes de permitir criar uma nova. Deve ser usado após protect e requirePremium.
 */

import { Response, NextFunction } from 'express';
import axios from 'axios';
import { AuthRequest } from './auth';
import User from '../models/User';
import { getPlanLimits } from '../config/constants';
import { createForbiddenError } from '../utils/errorHelpers';

const INSTAGRAM_SERVICE_URL = process.env.INSTAGRAM_SERVICE_URL || 'http://localhost:4335';

export const checkInstagramInstanceLimit = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  // Apenas para POST (criar instância); path no router /instagram é /instances
  if (req.method !== 'POST' || req.path !== '/instances') {
    return next();
  }

  try {
    const userId = req.user?.id;
    if (!userId) {
      return next();
    }

    const user = await User.findById(userId).select('premiumPlan');
    if (!user) {
      return next();
    }

    const limits = getPlanLimits(user.premiumPlan || 'free');
    if (limits.maxInstagram === 0) {
      res.status(403).json({
        status: 'error',
        message: 'Seu plano não inclui conexões Instagram. Faça upgrade para o Advance ou PRO.',
      });
      return;
    }

    // Obter quantidade atual de instâncias Instagram (chamada ao microserviço)
    const authHeader = req.headers.authorization;
    const listUrl = `${INSTAGRAM_SERVICE_URL}/api/instagram/instances`;
    const listRes = await axios.get(listUrl, {
      headers: authHeader ? { Authorization: authHeader } : {},
      timeout: 10000,
      validateStatus: () => true,
    });

    const currentCount = Array.isArray(listRes.data?.data) ? listRes.data.data.length : 0;
    if (currentCount >= limits.maxInstagram) {
      res.status(403).json({
        status: 'error',
        message: `Limite do seu plano atingido (${limits.maxInstagram} conexão(ões) Instagram). Faça upgrade para adicionar mais.`,
      });
      return;
    }

    next();
  } catch (err) {
    console.error('[checkInstagramInstanceLimit] Erro ao verificar limite:', err);
    next();
  }
};
