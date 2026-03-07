/**
 * Script para testar envio de notificação promocional
 * 
 * Uso: ts-node-dev --transpile-only src/scripts/testPromotionalNotification.ts
 */

// dotenv já é carregado em ../config/constants.ts
import { connectAllDatabases } from '../config/databases';
import { sendPromotionalNotificationToAll } from '../services/pushNotificationService';

async function testPromotionalNotification() {
  try {
    console.log('🔌 Conectando aos bancos de dados...');
    await connectAllDatabases();
    console.log('✅ Conectado com sucesso\n');

    const title = '🎉 Promoção Especial!';
    const body = 'Aproveite nossa oferta especial por tempo limitado!';

    console.log('📤 Enviando notificação promocional de teste...');
    console.log(`Título: ${title}`);
    console.log(`Corpo: ${body}\n`);

    const result = await sendPromotionalNotificationToAll(
      title,
      body,
      {
        promoId: 'test-' + Date.now(),
        url: 'https://onlyflow.com.br/promo',
      },
      {
        platform: 'ios', // Apenas iOS
        // isPremium: true, // Descomente para enviar apenas para premium
        // isPremium: false, // Descomente para enviar apenas para não-premium
      }
    );

    console.log('\n📊 Resultado:');
    console.log(`Total de dispositivos: ${result.totalDevices}`);
    console.log(`✅ Sucessos: ${result.successCount}`);
    console.log(`❌ Falhas: ${result.failedCount}`);

    if (result.errors.length > 0) {
      console.log('\n⚠️ Erros encontrados:');
      result.errors.forEach((error, index) => {
        console.log(`  ${index + 1}. ${error}`);
      });
    }

    console.log('\n✅ Teste concluído!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro ao testar notificação promocional:', error);
    process.exit(1);
  }
}

// Executar teste
testPromotionalNotification();

