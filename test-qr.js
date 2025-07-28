import { default as makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import fs from 'fs';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import path from 'path';

const AUTH_FOLDER = './auth';

async function testQR() {
    try {
        console.log('🧪 Probando generación de QR...');
        
        // Limpiar carpeta de autenticación
        if (fs.existsSync(AUTH_FOLDER)) {
            const files = fs.readdirSync(AUTH_FOLDER);
            for (const file of files) {
                fs.unlinkSync(path.join(AUTH_FOLDER, file));
            }
            console.log('🧹 Archivos de autenticación limpiados');
        } else {
            fs.mkdirSync(AUTH_FOLDER, { recursive: true });
        }

        const { version } = await fetchLatestBaileysVersion();
        console.log(`📦 Versión Baileys: ${version}`);

        const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
        
        const logger = pino({ level: 'silent' });
        
        // Configuración mínima y estable
        const sock = makeWASocket.default({
            version,
            auth: state,
            logger,
            printQRInTerminal: false,
            browser: ['Chrome', '', ''],
            defaultQueryTimeoutMs: 30000,
            connectTimeoutMs: 30000,
            keepAliveIntervalMs: 15000,
            retryRequestDelayMs: 1000,
            maxRetries: 3,
            emitOwnEvents: false,
            markOnlineOnConnect: false,
            syncFullHistory: false,
            generateHighQualityLinkPreview: false
        });

        let qrGenerated = false;

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (connection) {
                console.log(`🔗 Estado: ${connection}`);
            }
            
            if(qr && !qrGenerated) {
                qrGenerated = true;
                console.log('='.repeat(50));
                console.log('📱 ESCANEA ESTE CÓDIGO QR EN WHATSAPP:');
                console.log('='.repeat(50));
                qrcode.generate(qr, {small: true});
                console.log('='.repeat(50));
                console.log('💡 Instrucciones:');
                console.log('1. Abre WhatsApp en tu teléfono');
                console.log('2. Ve a Configuración > Dispositivos vinculados');
                console.log('3. Toca "Vincular un dispositivo"');
                console.log('4. Escanea el código QR de arriba');
                console.log('='.repeat(50));
                console.log('✅ QR generado exitosamente');
            }
            
            if(connection === 'close') {
                console.log('❌ Conexión cerrada');
                
                if (lastDisconnect?.error) {
                    console.log('Error:', lastDisconnect.error.output?.statusCode, lastDisconnect.error.output?.payload?.message);
                    console.log('Data:', lastDisconnect.error.data);
                }
                
                if (!qrGenerated) {
                    console.log('⚠️ No se pudo generar el QR');
                }
                
                process.exit(1);
            } else if(connection === 'open') {
                console.log('✅ ¡Conexión exitosa!');
                process.exit(0);
            }
        });

        sock.ev.on('creds.update', saveCreds);

        // Timeout después de 30 segundos
        setTimeout(() => {
            console.log('⏰ Timeout: No se pudo generar el QR');
            process.exit(1);
        }, 30000);

    } catch (error) {
        console.error('💥 Error:', error);
        process.exit(1);
    }
}

testQR(); 