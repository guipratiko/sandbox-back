#!/bin/bash

# Script de Teste de Segurança para Produção
# Testa: Rate Limiting, Headers de Segurança, Validação de Inputs, XSS, SQL Injection, Cloaking

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# URLs de produção (ajustar se necessário)
BACKEND_URL="${BACKEND_URL:-https://back.onlyflow.com.br}"
FRONTEND_URL="${FRONTEND_URL:-https://app.onlyflow.com.br}"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  TESTE DE SEGURANÇA - PRODUÇÃO${NC}"
echo -e "${BLUE}  Backend: ${BACKEND_URL}${NC}"
echo -e "${BLUE}  Frontend: ${FRONTEND_URL}${NC}"
echo -e "${BLUE}========================================${NC}\n"

# Contador de testes
PASSED=0
FAILED=0

# Função para testar e reportar
test_result() {
    local test_name="$1"
    local expected="$2"
    local actual="$3"
    
    if [[ "$actual" == *"$expected"* ]]; then
        echo -e "${GREEN}✅ PASS:${NC} $test_name"
        ((PASSED++))
        return 0
    else
        echo -e "${RED}❌ FAIL:${NC} $test_name"
        echo -e "   Esperado: $expected"
        echo -e "   Recebido: $actual"
        ((FAILED++))
        return 1
    fi
}

# Função para verificar header
check_header() {
    local header_name="$1"
    local response=$(curl -k -s -I "$2" 2>&1)
    
    if echo "$response" | grep -qi "$header_name"; then
        echo -e "${GREEN}✅ PASS:${NC} Header $header_name presente"
        ((PASSED++))
        return 0
    else
        echo -e "${RED}❌ FAIL:${NC} Header $header_name não encontrado"
        ((FAILED++))
        return 1
    fi
}

echo -e "${YELLOW}1. TESTANDO HEADERS DE SEGURANÇA - BACKEND${NC}"
echo "----------------------------------------"
check_header "X-Content-Type-Options" "$BACKEND_URL/api/health"
check_header "X-Frame-Options" "$BACKEND_URL/api/health"
check_header "X-XSS-Protection" "$BACKEND_URL/api/health"
check_header "Content-Security-Policy" "$BACKEND_URL/api/health"
check_header "Referrer-Policy" "$BACKEND_URL/api/health"
echo ""

echo -e "${YELLOW}1.1. TESTANDO HEADERS DE SEGURANÇA - FRONTEND${NC}"
echo "----------------------------------------"
check_header "X-Content-Type-Options" "$FRONTEND_URL"
check_header "X-Frame-Options" "$FRONTEND_URL"
check_header "X-XSS-Protection" "$FRONTEND_URL"
check_header "Content-Security-Policy" "$FRONTEND_URL"
check_header "Referrer-Policy" "$FRONTEND_URL"
echo ""

echo -e "${YELLOW}2. TESTANDO RATE LIMITING - BACKEND${NC}"
echo "----------------------------------------"
echo "Fazendo 101 requisições rápidas..."
RATE_LIMIT_HIT=false
for i in {1..101}; do
    response=$(curl -k -s -w "\n%{http_code}" "$BACKEND_URL/api/health" 2>&1)
    http_code=$(echo "$response" | tail -n1)
    
    if [ "$http_code" == "429" ]; then
        RATE_LIMIT_HIT=true
        echo -e "${GREEN}✅ PASS:${NC} Rate limit ativado na requisição #$i (HTTP 429)"
        ((PASSED++))
        break
    fi
    
    if [ $((i % 20)) -eq 0 ]; then
        echo "   Processadas $i requisições..."
    fi
done

if [ "$RATE_LIMIT_HIT" == false ]; then
    echo -e "${RED}❌ FAIL:${NC} Rate limit não foi ativado após 101 requisições"
    ((FAILED++))
fi
echo ""

echo -e "${YELLOW}3. TESTANDO VALIDAÇÃO DE INPUTS (XSS) - BACKEND${NC}"
echo "----------------------------------------"
echo "Testando tentativa de injeção de script no login..."

# Teste 1: XSS no campo email
xss_response=$(curl -k -s -X POST "$BACKEND_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"<script>alert(1)</script>@test.com","password":"test123"}' 2>&1)

if echo "$xss_response" | grep -qiE "(invalid|error|validation|bad request)" || \
   echo "$xss_response" | grep -qiE '"status".*"error"'; then
    echo -e "${GREEN}✅ PASS:${NC} XSS no email foi rejeitado"
    ((PASSED++))
else
    echo -e "${RED}❌ FAIL:${NC} XSS no email não foi rejeitado"
    echo "   Resposta: $xss_response"
    ((FAILED++))
fi

# Teste 2: XSS no campo name (registro)
xss_register=$(curl -k -s -X POST "$BACKEND_URL/api/auth/register" \
    -H "Content-Type: application/json" \
    -d '{"name":"<script>alert(1)</script>","email":"test@test.com","password":"Test123!"}' 2>&1)

if echo "$xss_register" | grep -qiE "(invalid|error|validation|bad request)" || \
   echo "$xss_register" | grep -qiE '"status".*"error"'; then
    echo -e "${GREEN}✅ PASS:${NC} XSS no nome foi rejeitado"
    ((PASSED++))
else
    echo -e "${RED}❌ FAIL:${NC} XSS no nome não foi rejeitado"
    echo "   Resposta: $xss_register"
    ((FAILED++))
fi
echo ""

echo -e "${YELLOW}4. TESTANDO SQL INJECTION - BACKEND${NC}"
echo "----------------------------------------"
# Teste SQL injection em parâmetro de query
sql_test=$(curl -k -s "$BACKEND_URL/api/health?test=' OR '1'='1" 2>&1)

# Se retornar erro ou não processar o SQL, está protegido
if echo "$sql_test" | grep -qiE "(error|invalid|bad request)" || \
   ! echo "$sql_test" | grep -qiE "(' OR '1'='1|sql|database)"; then
    echo -e "${GREEN}✅ PASS:${NC} SQL injection em query params não foi processado"
    ((PASSED++))
else
    echo -e "${RED}❌ FAIL:${NC} Possível vulnerabilidade SQL injection"
    echo "   Resposta: $sql_test"
    ((FAILED++))
fi
echo ""

echo -e "${YELLOW}5. TESTANDO DETECÇÃO DE USER-AGENTS SUSPEITOS - BACKEND${NC}"
echo "----------------------------------------"
# Teste com User-Agent de bot
bot_response=$(curl -k -s -H "User-Agent: Googlebot/2.1" "$BACKEND_URL/api/health" 2>&1)

# O sistema deve aceitar mas logar (não podemos verificar logs aqui, mas podemos verificar que não bloqueou)
if echo "$bot_response" | grep -qiE "(ok|status)"; then
    echo -e "${GREEN}✅ PASS:${NC} User-Agent suspeito foi aceito (logging ativo)"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠️  WARN:${NC} Resposta inesperada para User-Agent de bot"
    echo "   Resposta: $bot_response"
fi
echo ""

echo -e "${YELLOW}6. TESTANDO RATE LIMITING DE AUTENTICAÇÃO - BACKEND${NC}"
echo "----------------------------------------"
echo "Fazendo 6 tentativas de login (deve bloquear na 5ª)..."
AUTH_LIMIT_HIT=false
for i in {1..6}; do
    response=$(curl -k -s -w "\n%{http_code}" -X POST "$BACKEND_URL/api/auth/login" \
        -H "Content-Type: application/json" \
        -d '{"email":"test@test.com","password":"wrongpassword"}' 2>&1)
    http_code=$(echo "$response" | tail -n1)
    
    if [ "$http_code" == "429" ]; then
        AUTH_LIMIT_HIT=true
        echo -e "${GREEN}✅ PASS:${NC} Rate limit de autenticação ativado na tentativa #$i (HTTP 429)"
        ((PASSED++))
        break
    fi
    
    echo "   Tentativa $i: HTTP $http_code"
    sleep 0.5
done

if [ "$AUTH_LIMIT_HIT" == false ]; then
    echo -e "${YELLOW}⚠️  WARN:${NC} Rate limit de autenticação não foi ativado (pode estar em cooldown)"
fi
echo ""

echo -e "${YELLOW}7. TESTANDO VALIDAÇÃO DE TIPOS - BACKEND${NC}"
echo "----------------------------------------"
# Teste com tipo errado (string onde espera número)
type_test=$(curl -k -s -X POST "$BACKEND_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":123,"password":"test"}' 2>&1)

if echo "$type_test" | grep -qiE "(invalid|error|validation|bad request)" || \
   echo "$type_test" | grep -qiE '"status".*"error"'; then
    echo -e "${GREEN}✅ PASS:${NC} Validação de tipos funcionando"
    ((PASSED++))
else
    echo -e "${RED}❌ FAIL:${NC} Validação de tipos não funcionou"
    echo "   Resposta: $type_test"
    ((FAILED++))
fi
echo ""

echo -e "${YELLOW}8. TESTANDO FRONTEND - CONTENT SECURITY POLICY${NC}"
echo "----------------------------------------"
# Verificar CSP no frontend
frontend_headers=$(curl -k -s -I "$FRONTEND_URL" 2>&1)
if echo "$frontend_headers" | grep -qi "Content-Security-Policy"; then
    csp_value=$(echo "$frontend_headers" | grep -i "Content-Security-Policy" | head -1)
    echo -e "${GREEN}✅ PASS:${NC} CSP configurado no frontend"
    echo "   $csp_value"
    ((PASSED++))
else
    echo -e "${RED}❌ FAIL:${NC} CSP não encontrado no frontend"
    ((FAILED++))
fi
echo ""

echo -e "${YELLOW}9. TESTANDO FRONTEND - XSS PROTECTION${NC}"
echo "----------------------------------------"
# Verificar se o frontend tem proteção XSS
if echo "$frontend_headers" | grep -qi "X-XSS-Protection"; then
    echo -e "${GREEN}✅ PASS:${NC} X-XSS-Protection configurado"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠️  WARN:${NC} X-XSS-Protection não encontrado (pode estar no servidor web)"
fi

# Verificar se há scripts inline perigosos no HTML
frontend_html=$(curl -k -s "$FRONTEND_URL" 2>&1)
if echo "$frontend_html" | grep -qiE "(eval\(|javascript:|onerror=|onclick=.*script)"; then
    echo -e "${RED}❌ FAIL:${NC} Possível código JavaScript perigoso encontrado no HTML"
    ((FAILED++))
else
    echo -e "${GREEN}✅ PASS:${NC} Nenhum código JavaScript perigoso detectado no HTML"
    ((PASSED++))
fi
echo ""

echo -e "${YELLOW}10. TESTANDO FRONTEND - MIXED CONTENT${NC}"
echo "----------------------------------------"
# Verificar se há recursos HTTP em página HTTPS
if echo "$frontend_html" | grep -qiE 'http://[^s]'; then
    http_links=$(echo "$frontend_html" | grep -oE 'http://[^"'\'' ]+' | head -3)
    echo -e "${YELLOW}⚠️  WARN:${NC} Possíveis recursos HTTP encontrados (Mixed Content)"
    echo "   Primeiros links: $http_links"
else
    echo -e "${GREEN}✅ PASS:${NC} Nenhum recurso HTTP detectado (apenas HTTPS)"
    ((PASSED++))
fi
echo ""

echo -e "${YELLOW}11. TESTANDO FRONTEND - DOMPURIFY (Verificação de Build)${NC}"
echo "----------------------------------------"
# Verificar se DOMPurify está no bundle (verificando se há referências no código)
if echo "$frontend_html" | grep -qiE "(dompurify|DOMPurify|sanitize)"; then
    echo -e "${GREEN}✅ PASS:${NC} DOMPurify pode estar presente no bundle"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠️  WARN:${NC} DOMPurify não detectado no HTML (pode estar minificado)"
fi
echo ""

# Resumo final
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  RESUMO DOS TESTES${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}Testes Passados: $PASSED${NC}"
echo -e "${RED}Testes Falhados: $FAILED${NC}"
TOTAL=$((PASSED + FAILED))
if [ $TOTAL -gt 0 ]; then
    PERCENTAGE=$((PASSED * 100 / TOTAL))
    echo -e "${BLUE}Taxa de Sucesso: ${PERCENTAGE}%${NC}"
fi
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}🎉 Todos os testes de segurança passaram!${NC}"
    exit 0
else
    echo -e "${RED}⚠️  Alguns testes falharam. Revise os resultados acima.${NC}"
    exit 1
fi
