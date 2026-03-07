/**
 * Validadores para sanitização e validação de inputs
 */

import { body, param, query, ValidationChain } from 'express-validator';
import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { createValidationError } from '../utils/errorHelpers';

/**
 * Middleware para verificar resultados da validação
 */
export const validate = (req: Request, res: Response, next: NextFunction): void => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map((err) => err.msg).join(', ');
    return next(createValidationError(errorMessages));
  }
  next();
};

/**
 * Validadores para autenticação
 */
export const validateLogin = [
  body('email')
    .trim()
    .isEmail()
    .withMessage('Email inválido')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('Senha é obrigatória')
    .isLength({ min: 6 })
    .withMessage('Senha deve ter no mínimo 6 caracteres'),
  validate,
];

export const validateRegister = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Nome é obrigatório')
    .isLength({ min: 3, max: 100 })
    .withMessage('Nome deve ter entre 3 e 100 caracteres')
    .matches(/^[a-zA-ZÀ-ÿ\s]+$/)
    .withMessage('Nome deve conter apenas letras e espaços')
    .escape(),
  body('email')
    .trim()
    .isEmail()
    .withMessage('Email inválido')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('Senha é obrigatória')
    .isLength({ min: 6 })
    .withMessage('Senha deve ter no mínimo 6 caracteres')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Senha deve conter pelo menos uma letra maiúscula, uma minúscula e um número'),
  body('cpf')
    .optional()
    .trim()
    .matches(/^\d{11}$/)
    .withMessage('CPF deve conter 11 dígitos'),
  validate,
];

/**
 * Validadores para instâncias
 */
export const validateCreateInstance = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Nome da instância é obrigatório')
    .isLength({ min: 3, max: 50 })
    .withMessage('Nome da instância deve ter entre 3 e 50 caracteres')
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Nome da instância deve conter apenas letras, números, hífens e underscores')
    .escape(),
  body('rejectCall')
    .optional()
    .isBoolean()
    .withMessage('rejectCall deve ser um booleano'),
  body('groupsIgnore')
    .optional()
    .isBoolean()
    .withMessage('groupsIgnore deve ser um booleano'),
  body('alwaysOnline')
    .optional()
    .isBoolean()
    .withMessage('alwaysOnline deve ser um booleano'),
  body('readMessages')
    .optional()
    .isBoolean()
    .withMessage('readMessages deve ser um booleano'),
  body('readStatus')
    .optional()
    .isBoolean()
    .withMessage('readStatus deve ser um booleano'),
  validate,
];

export const validateInstanceId = [
  param('id')
    .notEmpty()
    .withMessage('ID da instância é obrigatório')
    .matches(/^[a-fA-F0-9]{24}$/)
    .withMessage('ID da instância inválido'),
  validate,
];

/**
 * Validadores para contatos
 */
export const validateCreateContact = [
  body('phone')
    .trim()
    .notEmpty()
    .withMessage('Telefone é obrigatório')
    .matches(/^\+?[1-9]\d{1,14}$/)
    .withMessage('Telefone inválido'),
  body('name')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Nome deve ter no máximo 200 caracteres')
    .escape(),
  body('email')
    .optional()
    .trim()
    .isEmail()
    .withMessage('Email inválido')
    .normalizeEmail(),
  validate,
];

/**
 * Validadores para templates
 */
export const validateCreateTemplate = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Nome do template é obrigatório')
    .isLength({ min: 3, max: 100 })
    .withMessage('Nome do template deve ter entre 3 e 100 caracteres')
    .escape(),
  body('type')
    .notEmpty()
    .withMessage('Tipo do template é obrigatório')
    .isIn(['text', 'image', 'image_caption', 'video', 'video_caption', 'audio', 'file', 'sequence'])
    .withMessage('Tipo de template inválido'),
  body('content')
    .notEmpty()
    .withMessage('Conteúdo do template é obrigatório')
    .isObject()
    .withMessage('Conteúdo deve ser um objeto'),
  validate,
];

/**
 * Validadores para workflows
 */
export const validateCreateWorkflow = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Nome do workflow é obrigatório')
    .isLength({ min: 3, max: 100 })
    .withMessage('Nome do workflow deve ter entre 3 e 100 caracteres')
    .escape(),
  body('nodes')
    .isArray()
    .withMessage('Nodes deve ser um array')
    .notEmpty()
    .withMessage('Nodes não pode estar vazio'),
  body('edges')
    .isArray()
    .withMessage('Edges deve ser um array'),
  validate,
];

/**
 * Validadores para query parameters
 */
export const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Página deve ser um número inteiro maior que 0'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit deve ser um número entre 1 e 100'),
  validate,
];
