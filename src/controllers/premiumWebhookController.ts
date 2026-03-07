/**
 * Controller para receber webhook de compra premium da APPMAX
 */

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import User from '../models/User';
import Subscription from '../models/Subscription';
import { PREMIUM_WEBHOOK_CONFIG, EMAIL_CONFIG } from '../config/constants';
import { cleanCPF, isValidCPF } from '../utils/cpfValidator';
import { normalizePhone } from '../utils/numberNormalizer';
import { normalizeName } from '../utils/formatters';
import { sendActivationEmail } from '../services/emailService';
import {
  createValidationError,
  createUnauthorizedError,
  handleControllerError,
} from '../utils/errorHelpers';

interface PremiumWebhookBody {
  // Formato novo (preferencial)
  user_email?: string;
  user_name?: string;
  user_phone?: string;
  user_cpf?: string;
  transaction_id?: string;
  id?: string; // ID do cliente no Asaas (cus_xxx)
  // Formato antigo (compatibilidade)
  email?: string;
  name?: string;
  Telefone?: string;
  cpf?: string;
  'transaction id'?: string;
  // Plano: start | advance | pro (envie no payload para diferenciar; se omitido, usa 'pro')
  plan?: string;
  premium_plan?: string;
  product_id?: string; // ex.: "plan_start", "plan_advance", "plan_pro"
  // Campos comuns
  status: 'ACTIVE' | 'INACTIVE';
  amount?: number | string;
  webhook_secret?: string;
  WEBHOOK_SECRET?: string;
  evento: 'subscription';
}

/** Normaliza o valor do plano vindo do webhook para 'start' | 'advance' | 'pro'. Se inválido ou ausente, retorna 'pro'. */
function resolvePremiumPlan(body: PremiumWebhookBody): 'start' | 'advance' | 'pro' {
  const raw = (body.plan || body.premium_plan || body.product_id || '').toString().trim().toLowerCase();
  if (raw === 'start' || raw === 'plan_start' || raw === 'starter') return 'start';
  if (raw === 'advance' || raw === 'plan_advance' || raw === 'advanced' || raw === 'advancado') return 'advance';
  if (raw === 'pro' || raw === 'plan_pro' || raw === 'professional') return 'pro';
  return 'pro';
}

/**
 * Calcular data de expiração da assinatura
 * Trial de 7 dias, depois renova mensalmente no mesmo dia do mês
 */
function calculateExpiresAt(purchasedAt: Date): Date {
  // Adicionar 1 mês à data de compra (primeira renovação será no mesmo dia do mês seguinte)
  const expiresAt = new Date(purchasedAt);
  expiresAt.setMonth(expiresAt.getMonth() + 1);
  return expiresAt;
}

/**
 * Verificar se está dentro do período de trial (7 dias)
 */
function isWithinTrialPeriod(purchasedAt: Date, currentDate: Date = new Date()): boolean {
  const trialEndDate = new Date(purchasedAt);
  trialEndDate.setDate(trialEndDate.getDate() + 7);
  return currentDate < trialEndDate;
}

/**
 * Receber webhook de assinatura premium
 * POST /api/webhook/premium-purchase
 * 
 * Aceita:
 * - evento: 'subscription'
 * - status: 'ACTIVE' (assinatura criada) ou 'INACTIVE' (assinatura cancelada)
 */
export const receivePremiumWebhook = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const body = req.body as PremiumWebhookBody;

    // Normalizar campos (aceitar tanto formato novo quanto antigo)
    const email = body.user_email || body.email;
    const name = body.user_name || body.name;
    const phone = body.user_phone || body.Telefone;
    const cpf = body.user_cpf || body.cpf;
    const transactionId = body.transaction_id || body['transaction id'];
    const asaasCustomerId = body.id;
    const webhookSecret = body.webhook_secret || body.WEBHOOK_SECRET;
    const amount = body.amount ? (typeof body.amount === 'string' ? parseFloat(body.amount) : body.amount) : undefined;

    // Validar WEBHOOK_SECRET
    if (!webhookSecret || webhookSecret !== PREMIUM_WEBHOOK_CONFIG.SECRET) {
      return next(createUnauthorizedError('WEBHOOK_SECRET inválido'));
    }

    // Validar campos obrigatórios
    if (!email || !name || !cpf || !body.status || !body.evento || !transactionId) {
      return next(createValidationError('Campos obrigatórios faltando: email/user_email, name/user_name, cpf/user_cpf, status, evento, transaction_id/transaction id'));
    }

    // Validar evento
    if (body.evento !== 'subscription') {
      res.status(200).json({
        status: 'success',
        message: `Webhook recebido, mas evento não é "subscription" (recebido: ${body.evento}). Ignorando.`,
      });
      return;
    }

    // Validar status
    if (body.status !== 'ACTIVE' && body.status !== 'INACTIVE') {
      res.status(200).json({
        status: 'success',
        message: `Webhook recebido, mas status não é "ACTIVE" ou "INACTIVE" (recebido: ${body.status}). Ignorando.`,
      });
      return;
    }

    const premiumPlan = resolvePremiumPlan(body);

    // Limpar e validar CPF
    const cleanCpf = cleanCPF(cpf);
    if (!isValidCPF(cleanCpf)) {
      return next(createValidationError('CPF inválido'));
    }

    // Normalizar dados
    const normalizedName = normalizeName(name);
    const normalizedPhone = phone ? normalizePhone(phone, '55') : undefined;
    const normalizedEmail = email.toLowerCase().trim();

    // Validar formato de email
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      return next(createValidationError('Email inválido'));
    }

    const currentDate = new Date();

    // Buscar usuário por CPF
    let user = await User.findOne({ cpf: cleanCpf });

    // Buscar assinatura existente pelo transactionId
    let subscription = await Subscription.findOne({
      transactionId,
      source: 'asaas',
    });

    if (body.status === 'ACTIVE') {
      // ========== ASSINATURA CRIADA (ACTIVE) ==========
      const purchasedAt = currentDate; // Usar data atual
      const expiresAt = calculateExpiresAt(purchasedAt);

      // Criar ou atualizar assinatura - salvar todos os dados do payload
      const subscriptionData = {
        source: 'asaas' as const,
        productId: 'premium-monthly', // Plano único mensal
        transactionId,
        originalTransactionId: transactionId,
        status: 'active' as const,
        expiresAt,
        purchasedAt,
        email: normalizedEmail,
        name: normalizedName,
        cpf: cleanCpf,
        phone: normalizedPhone,
        amount: amount,
        asaasCustomerId: asaasCustomerId,
        webhookPayload: body, // Salvar payload completo
      };

      // Criar usuário se não existir (pré-cadastro)
      if (!user) {
        // Gerar token de ativação (UUID)
        const activationToken = uuidv4();
        const activationTokenExpires = new Date();
        activationTokenExpires.setDate(activationTokenExpires.getDate() + 7); // 7 dias

        // Gerar senha temporária (será alterada na ativação)
        const tempPassword = uuidv4().replace(/-/g, '').substring(0, 12); // Senha temporária aleatória
        const hashedPassword = await bcrypt.hash(tempPassword, 12);

        // Criar usuário
        user = await User.create({
          name: normalizedName,
          email: normalizedEmail,
          password: hashedPassword,
          cpf: cleanCpf,
          phone: normalizedPhone,
          premiumPlan,
          activationToken,
          activationTokenExpires,
        });

        console.log(`✅ Pré-cadastro criado para ${user.email} (CPF: ${cleanCpf}, plano: ${premiumPlan})`);

        // Enviar email de ativação
        try {
          await sendActivationEmail(normalizedEmail, normalizedName, activationToken);
        } catch (emailError) {
          console.error('❌ Erro ao enviar email de ativação:', emailError);
          // Não falhar o webhook se o email falhar, apenas logar
        }
      } else {
        // Usuário já existe: atualizar plano e telefone se fornecido
        user.premiumPlan = premiumPlan;
        if (normalizedPhone) {
          user.phone = normalizedPhone;
        }
        await user.save();
        console.log(`✅ Usuário ${user.email} atualizado para Premium (${premiumPlan})${normalizedPhone ? ` (telefone atualizado)` : ''}`);
      }

      // Criar ou atualizar assinatura
      if (subscription) {
        // Atualizar assinatura existente
        Object.assign(subscription, subscriptionData);
        subscription.userId = user._id; // Garantir que está vinculado ao usuário correto
        subscription.cancelledAt = undefined; // Remover cancelamento se existir
        await subscription.save();
        console.log(`✅ Assinatura ${transactionId} atualizada para ACTIVE`);
      } else {
        // Criar nova assinatura
        subscription = await Subscription.create({
          ...subscriptionData,
          userId: user._id,
        });
        console.log(`✅ Nova assinatura ${transactionId} criada para usuário ${user.email}`);
      }

      res.status(200).json({
        status: 'success',
        message: 'Assinatura ativada com sucesso',
        subscription: {
          id: subscription._id,
          transactionId: subscription.transactionId,
          status: subscription.status,
          expiresAt: subscription.expiresAt,
        },
        user: user ? {
          id: user._id,
          email: user.email,
          name: user.name,
          premiumPlan: user.premiumPlan,
        } : null,
      });
      return;
    }

    // ========== ASSINATURA CANCELADA (INACTIVE) ==========
    if (body.status === 'INACTIVE') {
      if (!subscription) {
        // Assinatura não encontrada - pode ser que ainda não foi criada
        res.status(200).json({
          status: 'success',
          message: `Assinatura com transactionId ${transactionId} não encontrada. Ignorando cancelamento.`,
        });
        return;
      }

      // Buscar usuário pela assinatura se não foi encontrado por CPF
      if (!user && subscription.userId) {
        user = await User.findById(subscription.userId);
      }

      const purchasedAt = subscription.purchasedAt;
      const isInTrial = isWithinTrialPeriod(purchasedAt, currentDate);

      // Atualizar assinatura para cancelada - salvar payload do cancelamento
      subscription.status = 'cancelled';
      subscription.cancelledAt = currentDate;
      subscription.webhookPayload = body; // Atualizar com payload do cancelamento
      if (asaasCustomerId) {
        subscription.asaasCustomerId = asaasCustomerId;
      }
      if (amount !== undefined) {
        subscription.amount = amount;
      }
      await subscription.save();

      if (isInTrial) {
        // Cancelado dentro do trial (7 dias): remover premium imediatamente
        if (user) {
          user.premiumPlan = 'free';
          await user.save();
          console.log(`✅ Usuário ${user.email} cancelado dentro do trial. Premium removido imediatamente.`);
        }
      } else {
        // Cancelado após cobrança: manter premium até expiresAt
        // O usuário já foi cobrado, então mantém premium até o fim da mensalidade paga
        console.log(`✅ Assinatura ${transactionId} cancelada, mas usuário mantém premium até ${subscription.expiresAt.toISOString()}`);
      }

      res.status(200).json({
        status: 'success',
        message: isInTrial
          ? 'Assinatura cancelada dentro do trial. Premium removido imediatamente.'
          : `Assinatura cancelada. Usuário mantém premium até ${subscription.expiresAt.toISOString()}`,
        subscription: {
          id: subscription._id,
          transactionId: subscription.transactionId,
          status: subscription.status,
          cancelledAt: subscription.cancelledAt,
          expiresAt: subscription.expiresAt,
        },
        user: user ? {
          id: user._id,
          email: user.email,
          name: user.name,
          premiumPlan: user.premiumPlan,
        } : null,
      });
      return;
    }

    // Se chegou aqui, algo está errado (mas já validamos acima)
    res.status(200).json({
      status: 'success',
      message: 'Webhook recebido, mas status não reconhecido. Ignorando.',
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao processar webhook de assinatura premium'));
  }
};


