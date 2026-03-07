/**
 * Serviço de criação de checkout Asaas para compra de créditos do Scraping Flow.
 * Usa banco clerky, coleção img, para imagem do item.
 */

import mongoose from 'mongoose';

const ASAAS_API_URL = process.env.ASAAS_API_URL || 'https://api-sandbox.asaas.com/v3';
const ASAAS_ACCESS_TOKEN = process.env.ASAAS_ACCESS_TOKEN || '';
const CALLBACK_BASE = process.env.SCRAPING_CHECKOUT_CALLBACK_BASE_URL || 'https://app.onlyflow.com.br';
const IMAGE_ID = process.env.SCRAPING_CHECKOUT_IMAGE_ID || '';
const IMAGE_FIELD = process.env.SCRAPING_CHECKOUT_IMAGE_FIELD || 'base64';

const PACKAGE_25_VALUE = Number(process.env.SCRAPING_PACKAGE_25_VALUE) || 25;
const PACKAGE_25_CREDITS = Number(process.env.SCRAPING_PACKAGE_25_CREDITS) || 250;
const PACKAGE_50_VALUE = Number(process.env.SCRAPING_PACKAGE_50_VALUE) || 50;
const PACKAGE_50_CREDITS = Number(process.env.SCRAPING_PACKAGE_50_CREDITS) || 500;

export type PackageKey = '25' | '50';

export interface CreateCheckoutResult {
  link: string;
  id: string;
}

/** Busca imagem em base64 na coleção img do banco clerky. */
export async function getCheckoutImageBase64(): Promise<string | null> {
  if (!IMAGE_ID || !mongoose.connection.db) return null;
  const id = new mongoose.Types.ObjectId(IMAGE_ID);
  const doc = await mongoose.connection.db.collection('img').findOne({ _id: id });
  if (!doc || typeof doc[IMAGE_FIELD] !== 'string') return null;
  const raw = (doc[IMAGE_FIELD] as string).trim();
  return raw || null;
}

/**
 * Cria sessão de checkout no Asaas e retorna o link.
 * @param userId - Id do usuário no MongoDB (quem está comprando); enviado como externalReference para o webhook identificar o usuário ao receber CHECKOUT_PAID.
 */
export async function createCheckout(userId: string, packageKey: PackageKey): Promise<CreateCheckoutResult> {
  const value = packageKey === '25' ? PACKAGE_25_VALUE : PACKAGE_50_VALUE;
  const credits = packageKey === '25' ? PACKAGE_25_CREDITS : PACKAGE_50_CREDITS;
  const name = `${credits} Créditos`;

  let imageBase64: string | null = null;
  try {
    imageBase64 = await getCheckoutImageBase64();
  } catch (e) {
    console.warn('[AsaasCheckout] Erro ao buscar imagem:', e);
  }

  const successUrl = `${CALLBACK_BASE}/scraping`;
  const cancelUrl = `${CALLBACK_BASE}/scraping`;

  const body = {
    billingTypes: ['CREDIT_CARD'],
    chargeTypes: ['DETACHED'],
    callback: {
      successUrl,
      cancelUrl,
    },
    minutesToExpire: 10,
    items: [
      {
        ...(imageBase64 && { imageBase64 }),
        name,
        quantity: 1,
        value,
        externalReference: userId, // id do usuário no MongoDB para o webhook creditar o saldo correto
      },
    ],
  };

  const res = await fetch(`${ASAAS_API_URL.replace(/\/$/, '')}/checkouts`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'User-Agent': 'OnlyFlow-Backend/1.0',
      access_token: ASAAS_ACCESS_TOKEN,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    let message = `Asaas checkout failed: ${res.status}`;
    try {
      const json = JSON.parse(text);
      if (json.errors && Array.isArray(json.errors)) {
        message = json.errors.map((e: { description?: string }) => e.description).filter(Boolean).join('; ') || message;
      }
    } catch {
      if (text) message = text.slice(0, 200);
    }
    throw new Error(message);
  }

  const data = (await res.json()) as { link?: string; id?: string };
  if (!data.link) throw new Error('Resposta Asaas sem link');
  return {
    link: data.link,
    id: data.id || '',
  };
}

/** Mapeia valor em reais (do item do checkout) para quantidade de créditos. */
export function valueToCredits(value: number): number {
  if (value === PACKAGE_25_VALUE) return PACKAGE_25_CREDITS;
  if (value === PACKAGE_50_VALUE) return PACKAGE_50_CREDITS;
  return 0;
}
