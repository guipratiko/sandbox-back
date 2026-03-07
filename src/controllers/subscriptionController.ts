import { Response, NextFunction } from 'express';
import axios from 'axios';
import mongoose from 'mongoose';
import { AuthRequest } from '../middleware/auth';
import {
  createValidationError,
  createNotFoundError,
  handleControllerError,
} from '../utils/errorHelpers';
import {
  validateAppleSubscription,
  validateGoogleSubscription,
  getActiveSubscription,
} from '../services/subscriptionService';
import DeviceToken from '../models/DeviceToken';
import User from '../models/User';
import Subscription from '../models/Subscription';

/**
 * Validar assinatura da Apple
 * POST /api/subscriptions/validate
 */
export const validateSubscription = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { receiptData, productId, transactionId, source } = req.body;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    if (!productId) {
      return next(createValidationError('productId é obrigatório'));
    }

    // Detectar fonte da assinatura (apple, google, ou auto-detect)
    const subscriptionSource = source || detectSubscriptionSource(receiptData, transactionId);

    // Validar Google Play
    if (subscriptionSource === 'google') {
      if (!receiptData || !transactionId) {
        return next(createValidationError('receiptData (purchaseToken) e transactionId (orderId) são obrigatórios para Google Play'));
      }

      const subscription = await validateGoogleSubscription({
        purchaseToken: receiptData,
        productId,
        userId,
        orderId: transactionId,
      });

      const user = await User.findById(userId).select('premiumPlan email name');

      res.status(200).json({
        status: 'success',
        message: 'Assinatura Google Play validada com sucesso',
        subscription: {
          id: subscription._id,
          productId: subscription.productId,
          status: subscription.status,
          expiresAt: subscription.expiresAt,
          purchasedAt: subscription.purchasedAt,
        },
        user: user ? {
          id: user._id,
          premiumPlan: user.premiumPlan || 'free',
        } : undefined,
      });
      return;
    }

    // Validar Apple (código existente)
    // Se não tiver receiptData mas tiver transactionId, validar pela transação
    if (!receiptData && transactionId) {
      return validateByTransactionId(req, res, next, userId, transactionId, productId);
    }

    if (!receiptData) {
      return next(createValidationError('receiptData ou transactionId é obrigatório'));
    }

    const subscription = await validateAppleSubscription({
      receiptData,
      productId,
      userId,
    });

    // Buscar usuário atualizado para retornar o status premium
    const user = await User.findById(userId).select('premiumPlan email name');

    res.status(200).json({
      status: 'success',
      message: 'Assinatura validada com sucesso',
      subscription: {
        id: subscription._id,
        productId: subscription.productId,
        status: subscription.status,
        expiresAt: subscription.expiresAt,
        purchasedAt: subscription.purchasedAt,
      },
      user: user ? {
        id: user._id,
        premiumPlan: user.premiumPlan || 'free',
      } : undefined,
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao validar assinatura'));
  }
};

/**
 * Detectar fonte da assinatura automaticamente
 */
function detectSubscriptionSource(receiptData?: string, transactionId?: string): 'apple' | 'google' {
  // Se não tiver dados, assume Apple (compatibilidade com código existente)
  if (!receiptData && !transactionId) {
    return 'apple';
  }

  // Google Play purchase tokens geralmente começam com caracteres alfanuméricos
  // e são diferentes de receipts base64 da Apple
  // Uma heurística simples: se transactionId existe e receiptData não parece base64 de receipt da Apple
  if (transactionId && receiptData) {
    // Purchase tokens do Google são geralmente mais curtos e não começam com padrão específico
    // Receipts da Apple em base64 são muito longos
    // Por enquanto, se tiver transactionId explícito, assume Google (Android envia orderId)
    // Mas melhor deixar o cliente especificar 'source'
    return 'apple'; // Default para compatibilidade
  }

  return 'apple';
}

/**
 * Validar assinatura apenas pela transactionId (quando receipt não está disponível)
 */
async function validateByTransactionId(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
  userId: string,
  transactionId: string,
  productId: string
): Promise<void> {
  try {
    // Verificar se já existe uma assinatura com essa transação
    let subscription = await Subscription.findOne({
      transactionId: transactionId,
      source: 'apple',
    });

    if (subscription) {
      // Se já existe, atualizar o usuário baseado no status
      const user = await User.findById(userId);
      if (user && subscription.status === 'active') {
        user.premiumPlan = 'pro';
        await user.save();
      }

      res.status(200).json({
        status: 'success',
        message: 'Assinatura encontrada pela transação',
        subscription: {
          id: subscription._id,
          productId: subscription.productId,
          status: subscription.status,
          expiresAt: subscription.expiresAt,
          purchasedAt: subscription.purchasedAt,
        },
        user: {
          id: user?._id,
          premiumPlan: user?.premiumPlan ?? 'free',
        },
      });
      return;
    }

    // Se não existe, criar uma assinatura temporária (será validada quando o receipt estiver disponível)
    const purchaseDate = new Date();
    const expiresDate = new Date(purchaseDate.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 dias

    subscription = await Subscription.create({
      userId: userId as any,
      source: 'apple',
      productId: productId,
      transactionId: transactionId,
      status: 'active', // Temporariamente ativo até validação completa
      expiresAt: expiresDate,
      purchasedAt: purchaseDate,
      environment: 'Sandbox', // Assumir sandbox por padrão
    });

    // Atualizar usuário para premium
    const user = await User.findById(userId);
    if (user) {
      user.premiumPlan = 'pro';
      await user.save();
    }

    res.status(200).json({
      status: 'success',
      message: 'Assinatura registrada temporariamente. Validação completa será feita quando o receipt estiver disponível.',
      subscription: {
        id: subscription._id,
        productId: subscription.productId,
        status: subscription.status,
        expiresAt: subscription.expiresAt,
        purchasedAt: subscription.purchasedAt,
      },
      user: {
        id: user?._id,
        premiumPlan: user?.premiumPlan ?? 'free',
      },
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao validar assinatura pela transação'));
  }
}

/**
 * Obter assinatura ativa do usuário
 * GET /api/subscriptions/active
 */
export const getActiveSubscriptionEndpoint = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    // Converter userId string para ObjectId
    const userObjectId = new mongoose.Types.ObjectId(userId);

    // Buscar assinatura mais recente que ainda não expirou (pode ser active ou cancelled)
    // Isso permite mostrar assinaturas canceladas que ainda estão no período pago
    const subscription = await Subscription.findOne({
      userId: userObjectId,
      expiresAt: { $gt: new Date() },
      status: { $in: ['active', 'cancelled'] },
    }).sort({ createdAt: -1 });

    if (!subscription) {
      res.status(200).json({
        status: 'success',
        subscription: null,
      });
      return;
    }

    res.status(200).json({
      status: 'success',
      subscription: {
        id: subscription._id,
        productId: subscription.productId,
        status: subscription.status,
        expiresAt: subscription.expiresAt,
        purchasedAt: subscription.purchasedAt,
        cancelledAt: subscription.cancelledAt,
        source: subscription.source,
        transactionId: subscription.transactionId,
      },
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao obter assinatura'));
  }
};

/**
 * Registrar device token para push notifications
 * POST /api/subscriptions/device-token
 */
export const registerDeviceToken = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { deviceToken, deviceId, platform, isProduction, appVersion } = req.body;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    if (!deviceToken) {
      return next(createValidationError('deviceToken é obrigatório'));
    }

    // Buscar ou criar device token
    let device = await DeviceToken.findOne({ deviceToken });

    if (device) {
      // Atualizar se já existe
      device.userId = userId as any;
      device.deviceId = deviceId || device.deviceId;
      device.platform = platform || device.platform || 'ios';
      device.isProduction = isProduction !== undefined ? isProduction : device.isProduction ?? true;
      device.isActive = true;
      device.appVersion = appVersion || device.appVersion;
      await device.save();
    } else {
      // Criar novo
      device = await DeviceToken.create({
        userId: userId as any,
        deviceToken,
        deviceId,
        platform: platform || 'ios',
        isProduction: isProduction !== undefined ? isProduction : true,
        isActive: true,
        appVersion,
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Device token registrado com sucesso',
      device: {
        id: device._id,
        deviceToken: device.deviceToken,
        platform: device.platform,
      },
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao registrar device token'));
  }
};

/**
 * Remover device token
 * DELETE /api/subscriptions/device-token/:token
 */
export const removeDeviceToken = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { token } = req.params;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    const device = await DeviceToken.findOne({
      deviceToken: token,
      userId: userId as any,
    });

    if (!device) {
      return next(createNotFoundError('Device token'));
    }

    device.isActive = false;
    await device.save();

    res.status(200).json({
      status: 'success',
      message: 'Device token removido com sucesso',
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao remover device token'));
  }
};

/**
 * Cancelar assinatura premium
 * DELETE /api/subscriptions/cancel
 */
export const cancelSubscription = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    // Buscar assinatura ativa do usuário
    const subscription = await Subscription.findOne({
      userId: userId as any,
      source: 'asaas',
      status: { $in: ['active', 'cancelled'] },
    }).sort({ createdAt: -1 });

    if (!subscription) {
      return next(createNotFoundError('Assinatura não encontrada'));
    }

    // Se já está cancelada, retornar sucesso
    if (subscription.status === 'cancelled') {
      res.status(200).json({
        status: 'success',
        message: 'Assinatura já está cancelada',
        subscription: {
          id: subscription._id,
          status: subscription.status,
          expiresAt: subscription.expiresAt,
        },
      });
      return;
    }

    const transactionId = subscription.transactionId;
    const asaasAccessToken = process.env.ASAAS_ACCESS_TOKEN;
    const asaasApiUrl = process.env.ASAAS_API_URL || 'https://api-sandbox.asaas.com/v3';

    if (!asaasAccessToken) {
      return next(createValidationError('Token do Asaas não configurado'));
    }

    // Chamar API do Asaas para cancelar assinatura
    try {
      await axios.delete(`${asaasApiUrl}/subscriptions/${transactionId}`, {
        headers: {
          'accept': 'application/json',
          'access_token': asaasAccessToken,
        },
      });

      // Atualizar assinatura no banco
      subscription.status = 'cancelled';
      subscription.cancelledAt = new Date();
      await subscription.save();

      // Verificar se está no período de trial (7 dias)
      const purchasedAt = subscription.purchasedAt;
      const trialEndDate = new Date(purchasedAt);
      trialEndDate.setDate(trialEndDate.getDate() + 7);
      const isInTrial = new Date() < trialEndDate;

      // Se cancelado dentro do trial, remover premium imediatamente
      if (isInTrial) {
        const user = await User.findById(userId);
        if (user) {
          user.premiumPlan = 'free';
          await user.save();
        }
      }
      // Se cancelado após cobrança, manter premium até expiresAt (já está no banco)

      res.status(200).json({
        status: 'success',
        message: isInTrial
          ? 'Assinatura cancelada. Premium removido imediatamente.'
          : `Assinatura cancelada. Você manterá o premium até ${subscription.expiresAt.toISOString()}`,
        subscription: {
          id: subscription._id,
          status: subscription.status,
          cancelledAt: subscription.cancelledAt,
          expiresAt: subscription.expiresAt,
        },
      });
    } catch (axiosError: any) {
      const errorStatus = axiosError.response?.status;
      const errorData = axiosError.response?.data;
      const errorMessage = errorData?.message || errorData?.errors?.[0]?.description || axiosError.message || 'Erro ao cancelar assinatura no Asaas';

      // Log detalhado do erro
      console.error('Erro ao cancelar assinatura no Asaas:', {
        status: errorStatus,
        message: errorMessage,
        transactionId,
        errorData: errorData,
      });

      // Se o erro for 400, 401, 404 ou 422, a assinatura pode não existir mais no Asaas ou já estar cancelada
      // Nesses casos, cancelamos localmente para manter consistência
      if ([400, 401, 404, 422].includes(errorStatus)) {
        // Verificar se a mensagem indica que a assinatura já está cancelada ou não existe
        const isAlreadyCancelled = errorMessage.toLowerCase().includes('cancel') || 
                                   errorMessage.toLowerCase().includes('não encontrad') ||
                                   errorMessage.toLowerCase().includes('not found') ||
                                   errorMessage.toLowerCase().includes('invalid');

        if (isAlreadyCancelled || errorStatus === 404) {
          subscription.status = 'cancelled';
          subscription.cancelledAt = new Date();
          await subscription.save();

          res.status(200).json({
            status: 'success',
            message: 'Assinatura cancelada localmente (não encontrada ou já cancelada no Asaas)',
            subscription: {
              id: subscription._id,
              status: subscription.status,
              cancelledAt: subscription.cancelledAt,
              expiresAt: subscription.expiresAt,
            },
          });
          return;
        }

        // Se for erro 401 (não autorizado), pode ser token inválido
        if (errorStatus === 401) {
          return next(createValidationError('Token do Asaas inválido. Entre em contato com o suporte.'));
        }
      }

      // Outros erros da API do Asaas
      return next(createValidationError(`Erro ao cancelar assinatura: ${errorMessage} (Status: ${errorStatus || 'N/A'})`));
    }
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao cancelar assinatura'));
  }
};
