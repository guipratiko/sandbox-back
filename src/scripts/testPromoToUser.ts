/**
 * Script para testar envio de notificação promocional para um usuário específico
 * 
 * Uso: ts-node-dev --transpile-only src/scripts/testPromoToUser.ts
 */

// dotenv já é carregado em ../config/constants.ts
import { connectAllDatabases } from '../config/databases';
import { sendPromotionalNotification } from '../services/pushNotificationService';
import DeviceToken from '../models/DeviceToken';

async function testPromoToUser() {
  try {
    console.log('🔌 Conectando aos bancos de dados...');
    await connectAllDatabases();
    console.log('✅ Conectado com sucesso\n');

    // User ID do usuário que você quer testar
    const userId = '6952cb9fdf901becd9e8c999';

    // Verificar se o usuário tem device tokens
    const devices = await DeviceToken.find({ 
      userId: userId as any, 
      isActive: true 
    });

    console.log(`📱 Dispositivos encontrados para o usuário: ${devices.length}\n`);

    if (devices.length === 0) {
      console.log('❌ Nenhum dispositivo ativo encontrado para este usuário');
      console.log('💡 Certifique-se de que o app iOS está instalado e registrou o device token');
      process.exit(1);
    }

    // Mostrar detalhes dos dispositivos
    devices.forEach((device: any, index: number) => {
      console.log(`📱 Dispositivo ${index + 1}:`);
      console.log(`   Token: ${device.deviceToken.substring(0, 30)}...`);
      console.log(`   Platform: ${device.platform}`);
      console.log(`   Is Production: ${device.isProduction}`);
      console.log(`   App Version: ${device.appVersion || 'N/A'}\n`);
    });

    const title = '🎉 Teste de Notificação Promocional!';
    const body = 'Esta é uma notificação de teste para verificar o funcionamento do sistema.';

    console.log('📤 Enviando notificação promocional...');
    console.log(`Título: ${title}`);
    console.log(`Corpo: ${body}\n`);

    await sendPromotionalNotification(
      userId,
      title,
      body,
      {
        promoId: 'test-' + Date.now(),
        url: 'https://onlyflow.com.br/promo',
        test: true,
      }
    );

    console.log('✅ Notificação enviada com sucesso!');
    console.log('📱 Verifique o dispositivo iOS para ver a notificação');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro ao testar notificação promocional:', error);
    if (error instanceof Error) {
      console.error('   Mensagem:', error.message);
      console.error('   Stack:', error.stack);
    }
    process.exit(1);
  }
}

// Executar teste
testPromoToUser();

