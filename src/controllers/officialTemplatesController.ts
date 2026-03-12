/**
 * Proxy de templates oficiais (Meta message_templates) por instância.
 * Chama OficialAPI-Clerky com waba_id e opcionalmente access_token da instância.
 */

import { Response, NextFunction } from 'express';
import axios from 'axios';
import Instance from '../models/Instance';
import { AuthRequest } from '../middleware/auth';
import { validateAndConvertUserId } from '../utils/helpers';
import { OFFICIAL_API_CLERKY_URL, OFFICIAL_API_CLERKY_API_KEY } from '../config/constants';
import { createNotFoundError, createValidationError, handleControllerError } from '../utils/errorHelpers';

const BASE = (OFFICIAL_API_CLERKY_URL || '').replace(/\/$/, '');

async function callOficialTemplates<T>(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  data?: object,
  params?: Record<string, string>
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (OFFICIAL_API_CLERKY_API_KEY) headers['x-api-key'] = OFFICIAL_API_CLERKY_API_KEY;
  const res = await axios.request<{ status: string; data?: T; message?: string }>({
    method,
    url: `${BASE}${path}`,
    headers,
    data: method !== 'GET' && method !== 'DELETE' ? data : undefined,
    params: params ?? undefined,
    timeout: 30000,
  });
  if (res.data?.status === 'error') {
    throw new Error(res.data.message || 'Erro na API Oficial');
  }
  return (res.data as { data?: T })?.data as T;
}

async function getInstanceAndWaba(req: AuthRequest): Promise<{ waba_id: string; access_token?: string }> {
  const userId = req.user?.id;
  const userObjectId = validateAndConvertUserId(userId);
  const { id } = req.params;
  const instance = await Instance.findOne({ _id: id, userId: userObjectId });
  if (!instance) throw createNotFoundError('Instância');
  if (instance.integration !== 'WHATSAPP-CLOUD') {
    throw createValidationError('Apenas instâncias da API Oficial');
  }
  const waba_id = (instance as any).waba_id;
  if (!waba_id) throw createValidationError('Instância sem waba_id');
  const access_token = (instance as any).meta_access_token || undefined;
  return { waba_id, access_token };
}

/** GET /instances/:id/official-templates */
export const listOfficialTemplates = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { waba_id, access_token } = await getInstanceAndWaba(req);
    const params: Record<string, string> = { waba_id };
    if (access_token) params.access_token = access_token;
    const data = await callOficialTemplates<unknown[]>('GET', '/api/templates', undefined, params);
    res.status(200).json({ status: 'success', data: data ?? [] });
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response?.data?.message) {
      return next(createValidationError(error.response.data.message));
    }
    return next(handleControllerError(error, 'Erro ao listar templates'));
  }
};

/** POST /instances/:id/official-templates */
export const createOfficialTemplate = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { waba_id, access_token } = await getInstanceAndWaba(req);
    const body = { ...req.body, waba_id } as Record<string, unknown>;
    if (access_token) body.access_token = access_token;
    const data = await callOficialTemplates<{ id: string; templateStatus?: string }>('POST', '/api/templates', body);
    res.status(200).json({ status: 'success', data: data ?? {} });
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response?.data?.message) {
      return next(createValidationError(error.response.data.message));
    }
    return next(handleControllerError(error, 'Erro ao criar template'));
  }
};

/** GET /instances/:id/official-templates/:templateId */
export const getOfficialTemplate = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { access_token } = await getInstanceAndWaba(req);
    const { templateId } = req.params;
    const params: Record<string, string> = {};
    if (access_token) params.access_token = access_token;
    const data = await callOficialTemplates<unknown>('GET', `/api/templates/${templateId}`, undefined, Object.keys(params).length ? params : undefined);
    res.status(200).json({ status: 'success', data: data ?? {} });
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response?.data?.message) {
      return next(createValidationError(error.response.data.message));
    }
    return next(handleControllerError(error, 'Erro ao buscar template'));
  }
};

/** POST /instances/:id/official-templates/:templateId — editar */
export const updateOfficialTemplate = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { access_token } = await getInstanceAndWaba(req);
    const { templateId } = req.params;
    const body = { ...req.body } as Record<string, unknown>;
    if (access_token) body.access_token = access_token;
    await callOficialTemplates('POST', `/api/templates/${templateId}`, body);
    res.status(200).json({ status: 'success', message: 'Template atualizado' });
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response?.data?.message) {
      return next(createValidationError(error.response.data.message));
    }
    return next(handleControllerError(error, 'Erro ao atualizar template'));
  }
};

/** DELETE /instances/:id/official-templates?name=xxx — envia token da instância (dono da WABA) para o Clerky. */
export const deleteOfficialTemplate = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { waba_id, access_token } = await getInstanceAndWaba(req);
    const name = (req.query.name as string)?.trim();
    if (!name) return next(createValidationError('Parâmetro name é obrigatório'));
    const params: Record<string, string> = { waba_id, name };
    if (access_token) params.access_token = access_token;
    await callOficialTemplates('DELETE', '/api/templates', undefined, params);
    res.status(200).json({ status: 'success', message: 'Template excluído' });
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response?.data?.message) {
      return next(createValidationError(error.response.data.message));
    }
    return next(handleControllerError(error, 'Erro ao excluir template'));
  }
};
