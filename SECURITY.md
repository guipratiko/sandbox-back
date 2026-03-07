# Implementações de Segurança

Este documento descreve as proteções de segurança implementadas no sistema Clerky.

## ✅ Proteções Implementadas

### 1. **Helmet - Headers de Segurança**
- **Localização**: `Backend/src/middleware/security.ts`
- **Proteção**: Headers HTTP de segurança (CSP, X-Frame-Options, etc.)
- **Status**: ✅ Implementado

### 2. **Rate Limiting**
- **Localização**: `Backend/src/middleware/security.ts`
- **Tipos**:
  - **Geral**: 100 requisições por IP a cada 15 minutos
  - **Autenticação**: 5 tentativas de login por IP a cada 15 minutos
  - **Criação de Recursos**: 20 criações por IP por hora
- **Status**: ✅ Implementado

### 3. **Validação de Inputs**
- **Localização**: `Backend/src/middleware/validators.ts`
- **Endpoints protegidos**:
  - `/api/auth/login` - Validação de email e senha
  - `/api/auth/register` - Validação completa de registro
  - `/api/instances` - Validação de criação de instâncias
- **Status**: ✅ Implementado

### 4. **Sanitização Frontend**
- **Localização**: `Frontend/src/utils/sanitize.ts`
- **Componente**: `Frontend/src/components/UI/SafeHTML.tsx`
- **Proteção**: Prevenção de XSS através de DOMPurify
- **Status**: ✅ Implementado

### 5. **Headers Customizados**
- **Localização**: `Backend/src/middleware/security.ts`
- **Headers**:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `X-XSS-Protection: 1; mode=block`
  - `Referrer-Policy: strict-origin-when-cross-origin`
- **Status**: ✅ Implementado

### 6. **Detecção de User-Agents Suspeitos**
- **Localização**: `Backend/src/middleware/security.ts`
- **Funcionalidade**: Logging de bots e crawlers suspeitos
- **Status**: ✅ Implementado (logging apenas, não bloqueia)

## 📦 Dependências Instaladas

### Backend
- `helmet` - Headers de segurança
- `express-rate-limit` - Rate limiting
- `express-validator` - Validação de inputs

### Frontend
- `dompurify` - Sanitização de HTML
- `@types/dompurify` - Tipos TypeScript

## 🧪 Como Testar

### 1. Testar Rate Limiting

```bash
# Fazer múltiplas requisições rapidamente
for i in {1..110}; do
  curl -X GET http://localhost:4331/api/health
done

# Deve retornar erro 429 após 100 requisições
```

### 2. Testar Validação de Inputs

```bash
# Tentar criar instância com nome inválido
curl -X POST http://localhost:4331/api/instances \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"instanceName": "<script>alert(1)</script>"}'

# Deve retornar erro de validação
```

### 3. Testar Headers de Segurança

```bash
# Verificar headers de resposta
curl -I http://localhost:4331/api/health

# Deve incluir:
# X-Content-Type-Options: nosniff
# X-Frame-Options: DENY
# X-XSS-Protection: 1; mode=block
```

### 4. Testar Rate Limiting de Autenticação

```bash
# Tentar fazer login múltiplas vezes
for i in {1..6}; do
  curl -X POST http://localhost:4331/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"wrong"}'
done

# Deve bloquear após 5 tentativas
```

## 🔧 Configuração

### Ajustar Rate Limits

Edite `Backend/src/middleware/security.ts`:

```typescript
// Aumentar limite geral
export const generalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200, // Aumentar de 100 para 200
  // ...
});
```

### Ajustar Content Security Policy

Edite `Backend/src/middleware/security.ts`:

```typescript
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      // Adicionar domínios permitidos
      connectSrc: ["'self'", "https://seu-dominio.com"],
      // ...
    },
  },
});
```

## 📝 Próximos Passos (Opcional)

1. **CSRF Protection**: Implementar proteção CSRF para formulários
2. **CAPTCHA**: Adicionar CAPTCHA em endpoints críticos
3. **Logging Avançado**: Implementar sistema de logging de segurança
4. **Monitoramento**: Configurar alertas para atividades suspeitas
5. **Validação de Arquivos**: Validar tipos MIME de arquivos uploadados

## ⚠️ Notas Importantes

- **Webhooks**: Rate limiting é desabilitado para webhooks (Meta, Evolution API)
- **Desenvolvimento**: Em desenvolvimento, alguns limites podem ser mais permissivos
- **Produção**: Ajustar limites conforme necessário em produção

## 🔒 Boas Práticas

1. **Nunca desabilitar** as proteções em produção
2. **Monitorar logs** de rate limiting e user-agents suspeitos
3. **Atualizar dependências** regularmente para correções de segurança
4. **Revisar** Content Security Policy periodicamente
5. **Testar** as proteções após cada deploy
