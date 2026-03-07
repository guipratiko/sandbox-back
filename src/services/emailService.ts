/**
 * Serviço de envio de emails
 * Usa nodemailer para envio de emails transacionais
 */

import nodemailer from 'nodemailer';
import { EMAIL_CONFIG } from '../config/constants';

// Criar transporter de email
const createTransporter = () => {
  return nodemailer.createTransport({
    host: EMAIL_CONFIG.SMTP_HOST,
    port: EMAIL_CONFIG.SMTP_PORT,
    secure: EMAIL_CONFIG.SMTP_PORT === 465, // true para 465, false para outras portas
    auth: {
      user: EMAIL_CONFIG.SMTP_USER,
      pass: EMAIL_CONFIG.SMTP_PASS,
    },
  });
};

/**
 * Enviar email de ativação de conta
 * @param email - Email do destinatário
 * @param name - Nome do usuário
 * @param activationToken - Token de ativação
 */
export const sendActivationEmail = async (
  email: string,
  name: string,
  activationToken: string
): Promise<void> => {
  try {
    const transporter = createTransporter();
    const activationUrl = `${EMAIL_CONFIG.FRONTEND_URL}/ativar-conta?token=${activationToken}`;

    const mailOptions = {
      from: `"${EMAIL_CONFIG.FROM_NAME}" <${EMAIL_CONFIG.FROM_EMAIL}>`,
      to: email,
      subject: 'Ative sua conta Onlyflow Premium',
      html: `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="X-UA-Compatible" content="IE=edge">
          <style>
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              line-height: 1.6;
              color: #1f2937;
              background: linear-gradient(135deg, #eff6ff 0%, #e0e7ff 50%, #f3e8ff 100%);
              padding: 20px;
              -webkit-font-smoothing: antialiased;
              -moz-osx-font-smoothing: grayscale;
            }
            .email-wrapper {
              max-width: 600px;
              margin: 0 auto;
              background-color: #ffffff;
              border-radius: 16px;
              overflow: hidden;
              box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
            }
            .header {
              background: linear-gradient(135deg, #0066FF 0%, #00CCFF 100%);
              padding: 40px 30px;
              text-align: center;
              position: relative;
            }
            .header::before {
              content: '';
              position: absolute;
              top: 0;
              left: 0;
              right: 0;
              bottom: 0;
              background: url('data:image/svg+xml,<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="1"/></pattern></defs><rect width="100" height="100" fill="url(%23grid)"/></svg>');
              opacity: 0.3;
            }
            .logo-container {
              margin-bottom: 24px;
              position: relative;
              z-index: 1;
            }
            .logo {
              max-width: 200px;
              height: auto;
              display: inline-block;
              filter: brightness(0) invert(1);
            }
            .header-title {
              color: #ffffff;
              font-size: 32px;
              font-weight: 700;
              margin: 0 0 8px 0;
              text-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
              position: relative;
              z-index: 1;
            }
            .header-subtitle {
              color: rgba(255, 255, 255, 0.95);
              font-size: 16px;
              margin: 0;
              font-weight: 400;
              position: relative;
              z-index: 1;
            }
            .content {
              padding: 48px 40px;
              background-color: #ffffff;
            }
            .greeting {
              font-size: 20px;
              color: #1f2937;
              margin-bottom: 24px;
              font-weight: 500;
            }
            .greeting strong {
              color: #0066FF;
              font-weight: 700;
            }
            .message {
              font-size: 16px;
              color: #4b5563;
              margin-bottom: 20px;
              line-height: 1.8;
            }
            .highlight-box {
              background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
              border-left: 4px solid #0066FF;
              padding: 24px;
              margin: 32px 0;
              border-radius: 12px;
              box-shadow: 0 2px 8px rgba(0, 102, 255, 0.1);
            }
            .highlight-box p {
              margin: 0;
              color: #1e40af;
              font-weight: 600;
              font-size: 16px;
              line-height: 1.6;
            }
            .button-container {
              text-align: center;
              margin: 40px 0;
            }
            .button {
              display: inline-block;
              padding: 18px 48px;
              background: linear-gradient(135deg, #0066FF 0%, #00CCFF 100%);
              color: #ffffff !important;
              text-decoration: none;
              border-radius: 12px;
              font-weight: 600;
              font-size: 16px;
              box-shadow: 0 8px 20px rgba(0, 102, 255, 0.3);
              transition: all 0.3s ease;
              letter-spacing: 0.3px;
            }
            .button:hover {
              transform: translateY(-2px);
              box-shadow: 0 12px 24px rgba(0, 102, 255, 0.4);
            }
            .link-container {
              background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
              padding: 20px;
              border-radius: 12px;
              margin: 32px 0;
              border: 1px solid #e2e8f0;
            }
            .link-label {
              font-size: 11px;
              color: #64748b;
              text-transform: uppercase;
              letter-spacing: 1px;
              margin-bottom: 10px;
              font-weight: 600;
            }
            .link-url {
              word-break: break-all;
              color: #0066FF;
              font-size: 13px;
              text-decoration: none;
              line-height: 1.6;
            }
            .link-url:hover {
              text-decoration: underline;
            }
            .warning-box {
              background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
              border-left: 4px solid #f59e0b;
              padding: 20px 24px;
              margin: 32px 0;
              border-radius: 12px;
              box-shadow: 0 2px 8px rgba(245, 158, 11, 0.1);
            }
            .warning-box p {
              margin: 0;
              color: #92400e;
              font-size: 14px;
              line-height: 1.6;
            }
            .warning-box strong {
              color: #78350f;
              font-weight: 700;
            }
            .divider {
              height: 1px;
              background: linear-gradient(90deg, transparent, #e2e8f0, transparent);
              margin: 40px 0;
            }
            .features {
              margin: 40px 0;
            }
            .features-title {
              font-size: 20px;
              font-weight: 700;
              color: #1f2937;
              margin-bottom: 20px;
              text-align: center;
            }
            .feature-list {
              list-style: none;
              padding: 0;
            }
            .feature-item {
              padding: 12px 0;
              padding-left: 36px;
              position: relative;
              color: #4b5563;
              font-size: 15px;
              line-height: 1.6;
            }
            .feature-item:before {
              content: "✓";
              position: absolute;
              left: 0;
              color: #10b981;
              font-weight: bold;
              font-size: 20px;
              width: 24px;
              height: 24px;
              display: flex;
              align-items: center;
              justify-content: center;
              background: #d1fae5;
              border-radius: 50%;
            }
            .footer {
              background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
              padding: 40px 30px;
              text-align: center;
              border-top: 1px solid #e2e8f0;
            }
            .footer-text {
              font-size: 13px;
              color: #64748b;
              margin-bottom: 12px;
              line-height: 1.6;
            }
            .footer-links {
              margin-top: 24px;
              padding-top: 24px;
              border-top: 1px solid #e2e8f0;
            }
            .footer-link {
              color: #0066FF;
              text-decoration: none;
              font-size: 13px;
              margin: 0 12px;
              font-weight: 500;
            }
            .footer-link:hover {
              text-decoration: underline;
            }
            .footer-copyright {
              margin-top: 24px;
              font-size: 11px;
              color: #94a3b8;
            }
            @media only screen and (max-width: 600px) {
              body {
                padding: 12px;
              }
              .header {
                padding: 32px 24px;
              }
              .logo {
                max-width: 160px;
              }
              .header-title {
                font-size: 26px;
              }
              .header-subtitle {
                font-size: 14px;
              }
              .content {
                padding: 32px 24px;
              }
              .button {
                padding: 16px 36px;
                font-size: 15px;
                display: block;
                width: 100%;
              }
              .greeting {
                font-size: 18px;
              }
              .message {
                font-size: 15px;
              }
              .features-title {
                font-size: 18px;
              }
              .footer {
                padding: 32px 24px;
              }
              .footer-link {
                display: block;
                margin: 8px 0;
              }
            }
          </style>
        </head>
        <body>
          <div class="email-wrapper">
            <!-- Header -->
            <div class="header">
              <div class="logo-container">
                <img src="${EMAIL_CONFIG.LOGO_DARK_URL}" alt="Onlyflow Logo" class="logo" />
              </div>
              <h1 class="header-title">Bem-vindo ao Onlyflow Premium!</h1>
              <p class="header-subtitle">Sua conta está quase pronta</p>
            </div>

            <!-- Content -->
            <div class="content">
              <p class="greeting">Olá, <strong>${name}</strong>! 👋</p>
              
              <p class="message">
                Parabéns! Sua compra do plano <strong>Premium</strong> foi confirmada com sucesso.
              </p>

              <div class="highlight-box">
                <p>✨ Agora você tem acesso a todas as funcionalidades premium do Onlyflow!</p>
              </div>

              <p class="message">
                Para ativar sua conta e começar a usar todas as funcionalidades premium, clique no botão abaixo:
              </p>

              <div class="button-container">
                <a href="${activationUrl}" class="button">🚀 Ativar Minha Conta</a>
              </div>

              <div class="link-container">
                <div class="link-label">Ou copie e cole este link no seu navegador:</div>
                <a href="${activationUrl}" class="link-url">${activationUrl}</a>
              </div>

              <div class="warning-box">
                <p>
                  <strong>⏰ Importante:</strong> Este link expira em <strong>7 dias</strong>. 
                  Se não ativar sua conta neste período, entre em contato com o suporte.
                </p>
              </div>

              <div class="divider"></div>

              <div class="features">
                <h3 class="features-title">O que você ganha com o Premium:</h3>
                <ul class="feature-list">
                  <li class="feature-item">Acesso completo a todas as funcionalidades</li>
                  <li class="feature-item">Disparos em massa ilimitados</li>
                  <li class="feature-item">CRM completo e personalizado</li>
                  <li class="feature-item">Workflows automatizados (MindonlyFlow)</li>
                  <li class="feature-item">Agente de IA avançado</li>
                  <li class="feature-item">Gerenciamento de grupos</li>
                  <li class="feature-item">Suporte prioritário</li>
                </ul>
              </div>
            </div>

            <!-- Footer -->
            <div class="footer">
              <p class="footer-text">
                Este é um email automático, por favor não responda.
              </p>
              <p class="footer-text">
                Se você não solicitou esta conta, pode ignorar este email com segurança.
              </p>
              <div class="footer-links">
                <a href="https://www.onlyflow.com.br" class="footer-link">Visite nosso site</a>
                <a href="https://www.onlyflow.com.br/suporte" class="footer-link">Suporte</a>
                <a href="https://www.onlyflow.com.br/privacidade" class="footer-link">Privacidade</a>
              </div>
              <p class="footer-copyright">
                © ${new Date().getFullYear()} Onlyflow. Todos os direitos reservados.
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        Bem-vindo ao Onlyflow Premium!
        
        Olá, ${name}!
        
        Parabéns! Sua compra do plano Premium foi confirmada.
        
        Para ativar sua conta e começar a usar todas as funcionalidades premium, acesse:
        ${activationUrl}
        
        Importante: Este link expira em 7 dias. Se não ativar sua conta neste período, entre em contato com o suporte.
        
        Este é um email automático, por favor não responda.
        Se você não solicitou esta conta, ignore este email.
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Email de ativação enviado para ${email}`);
  } catch (error) {
    console.error('❌ Erro ao enviar email de ativação:', error);
    throw new Error('Erro ao enviar email de ativação');
  }
};

/**
 * Enviar email de recuperação de senha
 * @param email - Email do destinatário
 * @param name - Nome do usuário
 * @param resetToken - Token de recuperação de senha
 */
export const sendPasswordResetEmail = async (
  email: string,
  name: string,
  resetToken: string
): Promise<void> => {
  try {
    const transporter = createTransporter();
    const resetUrl = `${EMAIL_CONFIG.FRONTEND_URL}/reset-password?token=${resetToken}`;

    const mailOptions = {
      from: `"${EMAIL_CONFIG.FROM_NAME}" <${EMAIL_CONFIG.FROM_EMAIL}>`,
      to: email,
      subject: 'Recuperação de Senha - Onlyflow',
      html: `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="X-UA-Compatible" content="IE=edge">
          <style>
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              line-height: 1.6;
              color: #1f2937;
              background: linear-gradient(135deg, #eff6ff 0%, #e0e7ff 50%, #f3e8ff 100%);
              padding: 20px;
              -webkit-font-smoothing: antialiased;
              -moz-osx-font-smoothing: grayscale;
            }
            .email-wrapper {
              max-width: 600px;
              margin: 0 auto;
              background-color: #ffffff;
              border-radius: 16px;
              overflow: hidden;
              box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
            }
            .header {
              background: #ffffff;
              padding: 40px 30px;
              text-align: center;
              position: relative;
              border-bottom: 2px solid #e2e8f0;
            }
            .header::before {
              content: '';
              position: absolute;
              top: 0;
              left: 0;
              right: 0;
              bottom: 0;
              background: url('data:image/svg+xml,<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(0,0,0,0.05)" stroke-width="1"/></pattern></defs><rect width="100" height="100" fill="url(%23grid)"/></svg>');
              opacity: 0.3;
            }
            .logo-container {
              margin-bottom: 24px;
              position: relative;
              z-index: 1;
            }
            .logo {
              max-width: 200px;
              height: auto;
              display: inline-block;
            }
            .header-title {
              color: #000000;
              font-size: 32px;
              font-weight: 700;
              margin: 0 0 8px 0;
              position: relative;
              z-index: 1;
            }
            .header-subtitle {
              color: #1f2937;
              font-size: 16px;
              margin: 0;
              font-weight: 400;
              position: relative;
              z-index: 1;
            }
            .content {
              padding: 48px 40px;
              background-color: #ffffff;
            }
            .greeting {
              font-size: 20px;
              color: #1f2937;
              margin-bottom: 24px;
              font-weight: 500;
            }
            .greeting strong {
              color: #0066FF;
              font-weight: 700;
            }
            .message {
              font-size: 16px;
              color: #4b5563;
              margin-bottom: 20px;
              line-height: 1.8;
            }
            .button-container {
              text-align: center;
              margin: 40px 0;
            }
            .button {
              display: inline-block;
              padding: 18px 48px;
              background: linear-gradient(135deg, #0066FF 0%, #00CCFF 100%);
              color: #000000 !important;
              text-decoration: none;
              border-radius: 12px;
              font-weight: 600;
              font-size: 16px;
              box-shadow: 0 8px 20px rgba(0, 102, 255, 0.3);
              transition: all 0.3s ease;
              letter-spacing: 0.3px;
              border: 2px solid #0066FF;
            }
            .button:hover {
              transform: translateY(-2px);
              box-shadow: 0 12px 24px rgba(0, 102, 255, 0.4);
            }
            .link-container {
              background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
              padding: 20px;
              border-radius: 12px;
              margin: 32px 0;
              border: 1px solid #e2e8f0;
            }
            .link-label {
              font-size: 11px;
              color: #64748b;
              text-transform: uppercase;
              letter-spacing: 1px;
              margin-bottom: 10px;
              font-weight: 600;
            }
            .link-url {
              word-break: break-all;
              color: #0066FF;
              font-size: 13px;
              text-decoration: none;
              line-height: 1.6;
            }
            .link-url:hover {
              text-decoration: underline;
            }
            .warning-box {
              background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
              border-left: 4px solid #f59e0b;
              padding: 20px 24px;
              margin: 32px 0;
              border-radius: 12px;
              box-shadow: 0 2px 8px rgba(245, 158, 11, 0.1);
            }
            .warning-box p {
              margin: 0;
              color: #92400e;
              font-size: 14px;
              line-height: 1.6;
            }
            .warning-box strong {
              color: #78350f;
              font-weight: 700;
            }
            .security-note {
              margin-top: 32px;
              padding: 16px;
              background-color: #f8fafc;
              border-radius: 8px;
              border: 1px solid #e2e8f0;
            }
            .security-note p {
              font-size: 13px;
              color: #64748b;
              line-height: 1.6;
              margin: 0;
            }
            .footer {
              background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
              padding: 40px 30px;
              text-align: center;
              border-top: 1px solid #e2e8f0;
            }
            .footer-text {
              font-size: 13px;
              color: #64748b;
              margin-bottom: 12px;
              line-height: 1.6;
            }
            .footer-links {
              margin-top: 24px;
              padding-top: 24px;
              border-top: 1px solid #e2e8f0;
            }
            .footer-link {
              color: #0066FF;
              text-decoration: none;
              font-size: 13px;
              margin: 0 12px;
              font-weight: 500;
            }
            .footer-link:hover {
              text-decoration: underline;
            }
            .footer-copyright {
              margin-top: 24px;
              font-size: 11px;
              color: #94a3b8;
            }
            @media only screen and (max-width: 600px) {
              body {
                padding: 12px;
              }
              .header {
                padding: 32px 24px;
              }
              .logo {
                max-width: 160px;
              }
              .header-title {
                font-size: 26px;
              }
              .header-subtitle {
                font-size: 14px;
              }
              .content {
                padding: 32px 24px;
              }
              .button {
                padding: 16px 36px;
                font-size: 15px;
                display: block;
                width: 100%;
              }
              .greeting {
                font-size: 18px;
              }
              .message {
                font-size: 15px;
              }
              .footer {
                padding: 32px 24px;
              }
              .footer-link {
                display: block;
                margin: 8px 0;
              }
            }
          </style>
        </head>
        <body>
          <div class="email-wrapper">
            <!-- Header -->
            <div class="header">
              <div class="logo-container">
                <img src="${EMAIL_CONFIG.LOGO_LIGHT_URL}" alt="Onlyflow Logo" class="logo" />
              </div>
              <h1 class="header-title">Recuperação de Senha</h1>
              <p class="header-subtitle">Redefina sua senha com segurança</p>
            </div>

            <!-- Content -->
            <div class="content">
              <p class="greeting">Olá, <strong>${name}</strong>! 👋</p>
              
              <p class="message">
                Recebemos uma solicitação para redefinir a senha da sua conta Onlyflow. 
                Para criar uma nova senha, clique no botão abaixo:
              </p>

              <div class="button-container">
                <a href="${resetUrl}" class="button">🔐 Redefinir Minha Senha</a>
              </div>

              <div class="link-container">
                <div class="link-label">Ou copie e cole este link no seu navegador:</div>
                <a href="${resetUrl}" class="link-url">${resetUrl}</a>
              </div>

              <div class="warning-box">
                <p>
                  <strong>⏰ Importante:</strong> Este link expira em <strong>1 hora</strong>. 
                  Se você não solicitou esta recuperação de senha, ignore este email com segurança.
                </p>
              </div>

              <div class="security-note">
                <p>
                  🔒 <strong>Dica de segurança:</strong> Por segurança, nunca compartilhe este link com outras pessoas. 
                  Se você não reconhece esta solicitação, entre em contato com nosso suporte imediatamente.
                </p>
              </div>
            </div>

            <!-- Footer -->
            <div class="footer">
              <p class="footer-text">
                Este é um email automático, por favor não responda.
              </p>
              <p class="footer-text">
                Se você não solicitou esta recuperação de senha, pode ignorar este email com segurança.
              </p>
              <div class="footer-links">
                <a href="https://www.onlyflow.com.br" class="footer-link">Visite nosso site</a>
                <a href="https://www.onlyflow.com.br/suporte" class="footer-link">Suporte</a>
                <a href="https://www.onlyflow.com.br/privacidade" class="footer-link">Privacidade</a>
              </div>
              <p class="footer-copyright">
                © ${new Date().getFullYear()} Onlyflow. Todos os direitos reservados.
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        Recuperação de Senha - Onlyflow
        
        Olá, ${name}!
        
        Recebemos uma solicitação para redefinir a senha da sua conta Onlyflow.
        
        Para criar uma nova senha, acesse:
        ${resetUrl}
        
        Importante: Este link expira em 1 hora. Se você não solicitou esta recuperação de senha, ignore este email.
        
        Por segurança, nunca compartilhe este link com outras pessoas.
        
        Este é um email automático, por favor não responda.
        Se você não solicitou esta recuperação de senha, ignore este email.
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Email de recuperação de senha enviado para ${email}`);
  } catch (error) {
    console.error('❌ Erro ao enviar email de recuperação de senha:', error);
    throw new Error('Erro ao enviar email de recuperação de senha');
  }
};

