import { default as makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion, downloadMediaMessage, isJidBroadcast } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { VertexAI } from '@google-cloud/vertexai';
import qrcode from 'qrcode-terminal';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import pino from 'pino';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { BOT_CONTEXT } from './config/bot-context.js';
import { isNumberAllowed } from './config/allowed-numbers.js';
import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import speech from '@google-cloud/speech';
import { ALWAYS_AUDIO } from './config/audio-mode.js';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { IMAGE_CONTEXT } from './config/image-context.js';
import { handleNequiContext } from './contexts/nequi/nequi-context.js';
import { handleAccessContext } from './contexts/access/access-context.js';
import path from 'path';
import bodyParser from 'body-parser';
import qr from 'qrcode';
import admin from 'firebase-admin';
import { responderBotVentas } from './bot_ventas.js';
import axios from 'axios';

dotenv.config();

// Inicializar Firebase Admin
let firestoreDB = null;
try {
    // Verificar si Firebase ya está inicializado
    const apps = admin.apps;
    if (apps.length > 0) {
        console.log('Firebase ya está inicializado, usando la instancia existente');
        firestoreDB = admin.firestore();
        console.log('Firebase Firestore inicializado correctamente');
    } else {
        // Verificar si existe la variable de entorno con la ruta al archivo de credenciales
        if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
            console.log('Usando credenciales desde GOOGLE_APPLICATION_CREDENTIALS:', process.env.GOOGLE_APPLICATION_CREDENTIALS);
            // Si la variable apunta a un archivo, usamos ese archivo
            if (fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
                const serviceAccount = JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
                console.log('Credenciales cargadas correctamente. Proyecto:', serviceAccount.project_id);
                console.log('Email de la cuenta de servicio:', serviceAccount.client_email);
                admin.initializeApp({
                    credential: admin.credential.cert(serviceAccount)
                });
                console.log('Firebase inicializado con credenciales desde archivo especificado en variable de entorno');
            } else {
                console.error('El archivo especificado en GOOGLE_APPLICATION_CREDENTIALS no existe:', process.env.GOOGLE_APPLICATION_CREDENTIALS);
                // Intentar con archivo local
                if (fs.existsSync('./credentials.json')) {
                    const serviceAccount = JSON.parse(fs.readFileSync('./credentials.json', 'utf8'));
                    console.log('Credenciales locales cargadas. Proyecto:', serviceAccount.project_id);
                    console.log('Email de la cuenta de servicio:', serviceAccount.client_email);
                    admin.initializeApp({
                        credential: admin.credential.cert(serviceAccount)
                    });
                    console.log('Firebase inicializado con credenciales desde ./credentials.json');
                    // Establecer la variable de entorno para que otras bibliotecas la usen
                    process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve('./credentials.json');
                    console.log('Variable GOOGLE_APPLICATION_CREDENTIALS actualizada a:', process.env.GOOGLE_APPLICATION_CREDENTIALS);
                } else {
                    // Intentar con otras opciones
                    if (process.env.FIREBASE_CREDENTIALS) {
                        const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
                        admin.initializeApp({
                            credential: admin.credential.cert(serviceAccount)
                        });
                        console.log('Firebase inicializado con credenciales desde FIREBASE_CREDENTIALS');
                    } else {
                        admin.initializeApp();
                        console.log('Firebase inicializado con credenciales por defecto');
                    }
                }
            }
        }
        // Si no existe la variable de entorno, seguir con las otras opciones
        else if (fs.existsSync('./credentials.json')) {
            const serviceAccount = JSON.parse(fs.readFileSync('./credentials.json', 'utf8'));
            console.log('Credenciales locales cargadas. Proyecto:', serviceAccount.project_id);
            console.log('Email de la cuenta de servicio:', serviceAccount.client_email);
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
            console.log('Firebase inicializado con credenciales desde ./credentials.json');
            // Establecer la variable de entorno para que otras bibliotecas la usen
            process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve('./credentials.json');
            console.log('Variable GOOGLE_APPLICATION_CREDENTIALS actualizada a:', process.env.GOOGLE_APPLICATION_CREDENTIALS);
        } else if (process.env.FIREBASE_CREDENTIALS) {
            const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
            console.log('Firebase inicializado con credenciales desde FIREBASE_CREDENTIALS');
        } else {
            admin.initializeApp();
            console.log('Firebase inicializado con credenciales por defecto');
        }
        
        firestoreDB = admin.firestore();
        console.log('Firebase Firestore inicializado correctamente');
    }
} catch (error) {
    console.error('Error al inicializar Firebase:', error);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const AUTH_FOLDER = join(__dirname, 'auth');
const AUDIO_FOLDER = join(__dirname, 'audios');
const PUBLIC_FOLDER = join(__dirname, 'public');

// Crear carpetas necesarias
[PUBLIC_FOLDER, AUDIO_FOLDER].forEach(folder => {
    if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder, { recursive: true });
    }
});

// Configurar Express
const app = express();
app.use(express.static(PUBLIC_FOLDER));
app.use(bodyParser.json({ limit: '2mb' }));

// Ruta para mostrar el QR
app.get('/qr', async (req, res) => {
    if (!lastQR) {
        res.send('No hay código QR disponible. Por favor espera a que se genere...');
        return;
    }
    try {
        const qrImage = await qr.toDataURL(lastQR);
        res.send(`
            <html>
                <head>
                    <title>WhatsApp QR Code</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1">
                    <style>
                        body {
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            height: 100vh;
                            margin: 0;
                            background-color: #f0f2f5;
                            font-family: Arial, sans-serif;
                        }
                        .container {
                            text-align: center;
                            background-color: white;
                            padding: 20px;
                            border-radius: 10px;
                            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
                        }
                        img {
                            max-width: 300px;
                            margin: 20px 0;
                        }
                        h1 {
                            color: #128C7E;
                            margin-bottom: 20px;
                        }
                        p {
                            color: #666;
                            margin-top: 20px;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>Escanea el Código QR</h1>
                        <img src="${qrImage}" alt="WhatsApp QR Code">
                        <p>Abre WhatsApp en tu teléfono y escanea este código</p>
                    </div>
                </body>
            </html>
        `);
    } catch (error) {
        res.send('Error al generar el código QR');
    }
});

// Lista de voces predefinidas en español
const AVAILABLE_VOICES = [
    // Español (España)
    { name: 'es-ES-Chirp-HD-D', lang: 'es-ES', gender: 'MALE' },
    { name: 'es-ES-Chirp-HD-F', lang: 'es-ES', gender: 'FEMALE' },
    { name: 'es-ES-Chirp-HD-O', lang: 'es-ES', gender: 'FEMALE' },
    { name: 'es-ES-Chirp3-HD-Aoede', lang: 'es-ES', gender: 'FEMALE' },
    { name: 'es-ES-Chirp3-HD-Charon', lang: 'es-ES', gender: 'MALE' },
    { name: 'es-ES-Chirp3-HD-Fenrir', lang: 'es-ES', gender: 'MALE' },
    { name: 'es-ES-Chirp3-HD-Kore', lang: 'es-ES', gender: 'FEMALE' },
    { name: 'es-ES-Chirp3-HD-Leda', lang: 'es-ES', gender: 'FEMALE' },
    { name: 'es-ES-Chirp3-HD-Orus', lang: 'es-ES', gender: 'MALE' },
    { name: 'es-ES-Chirp3-HD-Puck', lang: 'es-ES', gender: 'MALE' },
    { name: 'es-ES-Chirp3-HD-Zephyr', lang: 'es-ES', gender: 'FEMALE' },
    { name: 'es-ES-Neural2-A', lang: 'es-ES', gender: 'FEMALE' },
    { name: 'es-ES-Neural2-E', lang: 'es-ES', gender: 'FEMALE' },
    { name: 'es-ES-Neural2-F', lang: 'es-ES', gender: 'MALE' },
    { name: 'es-ES-Neural2-G', lang: 'es-ES', gender: 'MALE' },
    { name: 'es-ES-Neural2-H', lang: 'es-ES', gender: 'FEMALE' },
    { name: 'es-ES-Standard-A', lang: 'es-ES', gender: 'FEMALE' },
    { name: 'es-ES-Standard-B', lang: 'es-ES', gender: 'MALE' },
    { name: 'es-ES-Standard-C', lang: 'es-ES', gender: 'FEMALE' },
    { name: 'es-ES-Standard-D', lang: 'es-ES', gender: 'FEMALE' },
    { name: 'es-ES-Standard-E', lang: 'es-ES', gender: 'MALE' },
    { name: 'es-ES-Standard-F', lang: 'es-ES', gender: 'FEMALE' },
    { name: 'es-ES-Standard-G', lang: 'es-ES', gender: 'MALE' },
    { name: 'es-ES-Standard-H', lang: 'es-ES', gender: 'FEMALE' },
    { name: 'es-ES-Wavenet-B', lang: 'es-ES', gender: 'MALE' },
    { name: 'es-ES-Wavenet-C', lang: 'es-ES', gender: 'FEMALE' },
    { name: 'es-ES-Wavenet-D', lang: 'es-ES', gender: 'FEMALE' },
    { name: 'es-ES-Wavenet-E', lang: 'es-ES', gender: 'MALE' },
    { name: 'es-ES-Wavenet-F', lang: 'es-ES', gender: 'FEMALE' },
    { name: 'es-ES-Wavenet-G', lang: 'es-ES', gender: 'MALE' },
    { name: 'es-ES-Wavenet-H', lang: 'es-ES', gender: 'FEMALE' },

    // Español (EE.UU.)
    { name: 'es-US-Chirp-HD-D', lang: 'es-US', gender: 'MALE' },
    { name: 'es-US-Chirp-HD-F', lang: 'es-US', gender: 'FEMALE' },
    { name: 'es-US-Chirp-HD-O', lang: 'es-US', gender: 'FEMALE' },
    { name: 'es-US-Chirp3-HD-Aoede', lang: 'es-US', gender: 'FEMALE' },
    { name: 'es-US-Chirp3-HD-Charon', lang: 'es-US', gender: 'MALE' },
    { name: 'es-US-Chirp3-HD-Fenrir', lang: 'es-US', gender: 'MALE' },
    { name: 'es-US-Chirp3-HD-Kore', lang: 'es-US', gender: 'FEMALE' },
    { name: 'es-US-Chirp3-HD-Leda', lang: 'es-US', gender: 'FEMALE' },
    { name: 'es-US-Chirp3-HD-Orus', lang: 'es-US', gender: 'MALE' },
    { name: 'es-US-Chirp3-HD-Puck', lang: 'es-US', gender: 'MALE' },
    { name: 'es-US-Chirp3-HD-Zephyr', lang: 'es-US', gender: 'FEMALE' },
    { name: 'es-US-Neural2-A', lang: 'es-US', gender: 'FEMALE' },
    { name: 'es-US-Neural2-B', lang: 'es-US', gender: 'MALE' },
    { name: 'es-US-Neural2-C', lang: 'es-US', gender: 'MALE' },
    { name: 'es-US-News-D', lang: 'es-US', gender: 'MALE' },
    { name: 'es-US-News-E', lang: 'es-US', gender: 'MALE' },
    { name: 'es-US-News-F', lang: 'es-US', gender: 'FEMALE' },
    { name: 'es-US-News-G', lang: 'es-US', gender: 'FEMALE' },
    { name: 'es-US-Standard-A', lang: 'es-US', gender: 'FEMALE' },
    { name: 'es-US-Standard-B', lang: 'es-US', gender: 'MALE' },
    { name: 'es-US-Standard-C', lang: 'es-US', gender: 'MALE' },
    { name: 'es-US-Wavenet-A', lang: 'es-US', gender: 'FEMALE' },
    { name: 'es-US-Wavenet-B', lang: 'es-US', gender: 'MALE' },
    { name: 'es-US-Wavenet-C', lang: 'es-US', gender: 'MALE' }
];

// Endpoint para obtener las voces disponibles
app.get('/api/tts/voices', (req, res) => {
    try {
        res.json({ 
            success: true, 
            voices: AVAILABLE_VOICES
        });
    } catch (error) {
        console.error('Error al obtener voces:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Error al obtener la lista de voces' 
        });
    }
});

// Endpoint para establecer la voz
app.post('/api/tts/set-voice', (req, res) => {
    try {
        const { voice } = req.body;
        const selectedVoice = AVAILABLE_VOICES.find(v => v.name === voice);
        if (!selectedVoice) {
            return res.status(400).json({ 
                success: false, 
                error: 'Voz no válida' 
            });
        }
        currentVoice = {
            languageCode: selectedVoice.lang,
            name: selectedVoice.name,
            ssmlGender: selectedVoice.gender
        };
        res.json({ success: true });
    } catch (error) {
        console.error('Error al establecer voz:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Error al establecer la voz' 
        });
    }
});

// Endpoint para probar la voz actual
app.post('/api/tts/test-voice', async (req, res) => {
    try {
        const { text, voice } = req.body;
        if (!text) {
            return res.status(400).json({ 
                success: false, 
                error: 'Se requiere un texto para probar' 
            });
        }

        // Si se proporciona una voz temporal, usarla
        let voiceToUse = currentVoice;
        if (voice) {
            const selectedVoice = AVAILABLE_VOICES.find(v => v.name === voice);
            if (selectedVoice) {
                voiceToUse = {
                    languageCode: selectedVoice.lang,
                    name: selectedVoice.name,
                    ssmlGender: selectedVoice.gender
                };
            }
        }

        // Generar audio temporal
        const timestamp = Date.now();
        const audioPath = join(AUDIO_FOLDER, `test_${timestamp}.mp3`);
        
        const request = {
            input: { text },
            voice: voiceToUse,
            audioConfig: {
                audioEncoding: 'LINEAR16',
                speakingRate: 1.0,
                pitch: 0,
                effectsProfileId: ['small-bluetooth-speaker-class-device']
            },
        };

        const [response] = await ttsClient.synthesizeSpeech(request);
        fs.writeFileSync(audioPath, response.audioContent);

        // Enviar el audio
        res.sendFile(audioPath, (err) => {
            // Eliminar el archivo después de enviarlo
            try {
                fs.unlinkSync(audioPath);
            } catch (unlinkError) {
                console.error('Error al eliminar archivo temporal:', unlinkError);
            }
        });
    } catch (error) {
        console.error('Error al probar voz:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Error al generar audio de prueba' 
        });
    }
});

// Endpoint para obtener la voz actual
app.get('/api/tts/current-voice', (req, res) => {
    try {
        res.json({ 
            success: true, 
            voice: currentVoice
        });
    } catch (error) {
        console.error('Error al obtener voz actual:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Error al obtener la voz actual' 
        });
    }
});

// Crear servidor HTTP
const server = createServer(app);

// Configurar WebSocket
const wss = new WebSocketServer({ server });

// Almacenar conexiones WebSocket
const clients = new Set();

// Estado del bot
let isBotActive = true;

wss.on('connection', (ws) => {
    console.log('Nueva conexión WebSocket establecida');
    clients.add(ws);
    
    // Enviar estado actual del bot al nuevo cliente
    ws.send(JSON.stringify({
        type: 'botStatus',
        active: isBotActive
    }));
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'toggle') {
                isBotActive = data.active;
                // Notificar a todos los clientes del cambio de estado
                broadcast({
                    type: 'botStatus',
                    active: isBotActive
                });
            }
        } catch (error) {
            console.error('Error al procesar mensaje WebSocket:', error);
        }
    });
    
    ws.on('close', () => {
        console.log('Conexión WebSocket cerrada');
        clients.delete(ws);
    });

    ws.on('error', (error) => {
        console.error('Error en WebSocket:', error);
        clients.delete(ws);
    });
});

// Función para enviar mensajes a todos los clientes WebSocket
function broadcast(message) {
    const messageStr = JSON.stringify(message);
    console.log('Enviando mensaje a clientes:', message.type);
    
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            try {
                client.send(messageStr);
                console.log('Mensaje enviado exitosamente');
            } catch (error) {
                console.error('Error al enviar mensaje WebSocket:', error);
            }
        }
    });
}

// Verificar variables de entorno
if (!process.env.GOOGLE_CLOUD_PROJECT) {
    console.log('GOOGLE_CLOUD_PROJECT no está definido en .env, usando el project_id de las credenciales');
    try {
        if (fs.existsSync('./credentials.json')) {
            const serviceAccount = JSON.parse(fs.readFileSync('./credentials.json', 'utf8'));
            process.env.GOOGLE_CLOUD_PROJECT = serviceAccount.project_id;
            console.log('GOOGLE_CLOUD_PROJECT establecido a:', process.env.GOOGLE_CLOUD_PROJECT);
        }
    } catch (error) {
        console.error('Error al leer credentials.json:', error);
    }
}

console.log('\n=== INICIALIZANDO VERTEX AI ===');
console.log('Configurando Vertex AI con proyecto:', process.env.GOOGLE_CLOUD_PROJECT);
console.log('Ruta de credenciales:', process.env.GOOGLE_APPLICATION_CREDENTIALS || 'No definida');

// Configuración de Vertex AI
let vertexai;
try {
    // Asegurarse de que las credenciales estén configuradas correctamente
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync('./credentials.json')) {
        const credentialsPath = path.resolve('./credentials.json');
        console.log('Estableciendo GOOGLE_APPLICATION_CREDENTIALS a:', credentialsPath);
        process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialsPath;
    }
    
    // Verificar que el archivo existe y obtener el project_id correcto
    let projectId = process.env.GOOGLE_CLOUD_PROJECT;
    if (fs.existsSync('./credentials.json')) {
        try {
            const credContent = JSON.parse(fs.readFileSync('./credentials.json', 'utf8'));
            console.log('Credenciales cargadas correctamente para Vertex AI:');
            console.log(`   - Proyecto en credenciales: ${credContent.project_id}`);
            console.log(`   - Email de la cuenta de servicio: ${credContent.client_email}`);
            
            // Usar siempre el project_id del archivo de credenciales
            projectId = credContent.project_id;
            process.env.GOOGLE_CLOUD_PROJECT = projectId;
            console.log(`   - Usando proyecto: ${projectId}`);
        } catch (err) {
            console.error('Error al leer el archivo de credenciales:', err);
        }
    }
    
    // Opciones de inicialización
    const vertexOptions = {
        project: projectId,
        location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
    };
    
    console.log('Opciones de inicialización de Vertex AI:', JSON.stringify(vertexOptions, null, 2));
    
    // Intentar inicializar Vertex AI
    vertexai = new VertexAI(vertexOptions);
    console.log('Vertex AI inicializado correctamente');
    
    console.log('=== FIN DE INICIALIZACIÓN DE VERTEX AI ===\n');
} catch (error) {
    console.error('Error al configurar Vertex AI:', error);
}

// Configuración de Text-to-Speech
const ttsClient = new TextToSpeechClient();
// Voz actual por defecto
let currentVoice = {
    languageCode: 'es-US',
    name: 'es-US-Neural2-A',
    ssmlGender: 'FEMALE'
};

// Configuración de Speech-to-Text
const speechClient = new speech.SpeechClient();

const logger = pino({ level: 'silent' });

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// Guardar el timestamp de inicio del bot (en segundos)
const BOT_START_TIMESTAMP = Math.floor(Date.now() / 1000);

// Estado para usuarios esperando datos de Nequi
const pendingNequiUser = {};

// Agregar variable para almacenar el último QR generado
let lastQR = '';

// Función para transcribir audio
async function transcribeAudio(audioBuffer) {
    const idiomas = ['es-CO', 'es-MX', 'es-US', 'es-ES'];
    let mejorTranscripcion = '';
    let mejorIdioma = '';
    let responseDebug = null;
    // Guardar el audio OGG temporalmente
    const oggPath = join(AUDIO_FOLDER, `tmp_audio_${Date.now()}.ogg`);
    const wavPath = join(AUDIO_FOLDER, `tmp_audio_${Date.now()}.wav`);
    fs.writeFileSync(oggPath, audioBuffer);
    // Convertir OGG_OPUS a WAV (PCM)
    await new Promise((resolve, reject) => {
        ffmpeg(oggPath)
            .output(wavPath)
            .audioCodec('pcm_s16le')
            .on('end', resolve)
            .on('error', reject)
            .run();
    });
    // Leer el WAV convertido
    const wavBuffer = fs.readFileSync(wavPath);
    for (const idioma of idiomas) {
        try {
            const audio = {
                content: wavBuffer.toString('base64')
            };
            const config = {
                encoding: 'LINEAR16',
                sampleRateHertz: 48000,
                languageCode: idioma,
            };
            const request = {
                audio: audio,
                config: config,
            };
            const [response] = await speechClient.recognize(request);
            if (!responseDebug) responseDebug = response;
            const transcription = response.results
                .map(result => result.alternatives[0].transcript)
                .join('\n');
            if (transcription && transcription.length > mejorTranscripcion.length) {
                mejorTranscripcion = transcription;
                mejorIdioma = idioma;
            }
        } catch (error) {
            // No hacer nada, probar siguiente idioma
        }
    }
    // Limpiar archivos temporales
    try { fs.unlinkSync(oggPath); } catch {}
    try { fs.unlinkSync(wavPath); } catch {}
    if (!mejorTranscripcion) {
        // Guardar el audio para depuración
        const debugPath = join(AUDIO_FOLDER, `audio_no_transcrito_${Date.now()}.ogg`);
        fs.writeFileSync(debugPath, audioBuffer);
        console.log('No se pudo transcribir el audio. Audio guardado en:', debugPath);
        console.log('Última respuesta de Speech-to-Text:', JSON.stringify(responseDebug, null, 2));
    } else {
        console.log('Transcripción del audio (', mejorIdioma, '):', mejorTranscripcion);
    }
    return mejorTranscripcion;
}

// Función para convertir texto a audio usando Google Cloud TTS
async function generateSpeech(text, outputPath) {
    try {
        const request = {
            input: { text },
            voice: currentVoice,
            audioConfig: {
                audioEncoding: 'LINEAR16',
                speakingRate: 1.0,
                pitch: 0,
                effectsProfileId: ['small-bluetooth-speaker-class-device']
            },
        };

        const [response] = await ttsClient.synthesizeSpeech(request);
        fs.writeFileSync(outputPath, response.audioContent);
        console.log('Audio generado con éxito:', outputPath);
        return true;
    } catch (error) {
        console.error('Error al generar audio:', error);
        return false;
    }
}

// Historial de conversación por usuario
const userConversations = {};
const MAX_HISTORY = 5;

async function connectToWhatsApp() {
    try {
        if (!fs.existsSync(AUTH_FOLDER)) {
            fs.mkdirSync(AUTH_FOLDER, { recursive: true });
        }

        const { version } = await fetchLatestBaileysVersion();
        console.log(`usando la versión ${version} de baileys`);

        const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
        
        // Configuración básica para evitar errores 405
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

        let connectionStatus = 'connecting';
        let reconnectAttempts = 0;
        const maxReconnectAttempts = 10;

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (connection) {
                connectionStatus = connection;
                console.log('Estado de conexión:', connection);
            }
            
            if(qr) {
                console.log('='.repeat(50));
                console.log('📱 ESCANEA ESTE CÓDIGO QR EN WHATSAPP:');
                console.log('='.repeat(50));
                // Generar QR en consola usando qrcode-terminal
                qrcode.generate(qr, {small: true});
                console.log('='.repeat(50));
                console.log('💡 Instrucciones:');
                console.log('1. Abre WhatsApp en tu teléfono');
                console.log('2. Ve a Configuración > Dispositivos vinculados');
                console.log('3. Toca "Vincular un dispositivo"');
                console.log('4. Escanea el código QR de arriba');
                console.log('='.repeat(50));
                // Guardar el último QR generado para la interfaz web
                lastQR = qr;
                console.log('QR también disponible en http://localhost:3000/qr');
            }
            
            if(connection === 'close') {
                reconnectAttempts++;
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                console.log('Conexión cerrada debido a:', lastDisconnect?.error);
                
                // Log detallado del error para diagnóstico
                if (lastDisconnect?.error) {
                    console.log('Detalles del error:');
                    console.log('- Status Code:', lastDisconnect.error.output?.statusCode);
                    console.log('- Error Message:', lastDisconnect.error.output?.payload?.message);
                    console.log('- Error Type:', lastDisconnect.error.output?.payload?.error);
                    console.log('- Data:', lastDisconnect.error.data);
                    
                    // Manejo específico para error 405
                    if (lastDisconnect.error.output?.statusCode === 405) {
                        console.log('⚠️ Error 405 detectado - Intentando con configuración alternativa...');
                        // Limpiar archivos de autenticación y reintentar
                        if (fs.existsSync(AUTH_FOLDER)) {
                            try {
                                const files = fs.readdirSync(AUTH_FOLDER);
                                for (const file of files) {
                                    fs.unlinkSync(path.join(AUTH_FOLDER, file));
                                }
                                console.log('🧹 Archivos de autenticación limpiados');
                            } catch (error) {
                                console.log('Error al limpiar archivos de autenticación:', error);
                            }
                        }
                    }
                }
                
                broadcast({ type: 'disconnected' });
                
                if(shouldReconnect && reconnectAttempts < maxReconnectAttempts) {
                    const delay = Math.min(5000 * reconnectAttempts, 30000); // Delay progresivo
                    console.log(`Intentando reconectar en ${delay/1000} segundos... (${reconnectAttempts}/${maxReconnectAttempts})`);
                    setTimeout(connectToWhatsApp, delay);
                } else {
                    console.log('Usuario desconectado manualmente o máximo de intentos alcanzado');
                    if (reconnectAttempts >= maxReconnectAttempts) {
                        console.log('❌ Máximo de intentos de reconexión alcanzado. Reiniciando aplicación...');
                        process.exit(1);
                    }
                }
            } else if(connection === 'open') {
                console.log('¡Conexión establecida con éxito!');
                reconnectAttempts = 0; // Resetear contador de intentos
                broadcast({ type: 'connected' });
                // Limpiar el QR cuando la conexión es exitosa
                lastQR = '';
            }
        });

        sock.ev.on('creds.update', saveCreds);

        // Manejar errores de conexión
        sock.ev.on('error', (error) => {
            console.error('Error en la conexión de WhatsApp:', error);
            broadcast({ type: 'disconnected' });
            console.log('Intentando reconectar después de error...');
            setTimeout(connectToWhatsApp, 3000);
        });
        
        // Mantener la sesión activa con presencia
        setInterval(() => {
            if (connectionStatus === 'open') {
                try {
                    sock.sendPresenceUpdate('available');
                    console.log('Señal de presencia enviada para mantener conexión');
                } catch (error) {
                    console.error('Error al enviar señal de presencia:', error);
                }
            }
        }, 30000);

        // Estado temporal para usuarios esperando correo tras acceso denegado
        const pendingAccessRestore = {};

        sock.ev.on('messages.upsert', async ({ messages }) => {
            const m = messages[0];
            
            if (!m.message) return; // Solo verificamos si hay mensaje, eliminando la condición m.key.fromMe

            // Ignorar reacciones de mensajes
            if (m.message.reactionMessage) {
                console.log('Reacción de mensaje ignorada');
                return;
            }

            // Verificar si el bot está activo
            if (!isBotActive) {
                console.log('Bot está desactivado, ignorando mensaje');
                return;
            }

            // Ignorar mensajes antiguos (enviados antes de que el bot se iniciara)
            if (m.messageTimestamp && m.messageTimestamp < BOT_START_TIMESTAMP) {
                console.log('Mensaje antiguo ignorado:', m.messageTimestamp, '<', BOT_START_TIMESTAMP);
                return;
            }
  // Obtener el texto del mensaje
  let messageText = '';
  if (m.message.conversation) messageText = m.message.conversation;
  else if (m.message.extendedTextMessage?.text) messageText = m.message.extendedTextMessage.text;
  messageText = messageText.trim();
            // --- DETECCIÓN DE SOLICITUD DE COMPROBANTE NEQUI (ANTES DEL FILTRO DE GRUPO) ---
            const comprobanteRegex = /^comprobante\s+para\s+(.+?)\s+de\s+(\d+(?:[.,]\d{3})*)\s+al\s+numero\s+(\d{10})$/i;
            const comprobanteMatch = messageText.match(comprobanteRegex);
            if (comprobanteMatch) {
                // --- Verificar en Firestore si está habilitado el comando de comprobantes ---
                const docRef = firestoreDB.collection('bot_ventas').doc('bot_comprobantes');
                const docSnap = await docRef.get();
                if (!docSnap.exists || !docSnap.data().comprobantes) {
                    await sock.sendMessage(m.key.remoteJid, { text: 'La función de comprobantes está desactivada.' });
                    return;
                }
                // --- Fin verificación ---
                const recipient = comprobanteMatch[1].trim();
                const amount = comprobanteMatch[2].replace(/\./g, ''); // Quitar puntos de miles
                const phone = comprobanteMatch[3];
                // Cambiar tipo a 'bot' para que la API no requiera autenticación ni firma
                const apiUrl = 'https://nequifrontx.onrender.com/generate_image/';
                const payload = {
                    tipo: 'bot',
                    datos: {
                        recipient,
                        amount,
                        phone
                    }
                };
                try {
                    const apiResponse = await axios.post(apiUrl, payload, {
                        responseType: 'arraybuffer',
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    });
                    if (apiResponse.status === 200 && apiResponse.data) {
                        // Enviar la imagen al chat
                        await sock.sendMessage(m.key.remoteJid, {
                            image: Buffer.from(apiResponse.data, 'binary'),
                            caption: `Comprobante generado para ${recipient} de $${amount} al número ${phone}`
                        });
                        return;
                    } else {
                        await sock.sendMessage(m.key.remoteJid, { text: 'No se pudo generar el comprobante. Intenta más tarde.' });
                        return;
                    }
                } catch (error) {
                    console.error('Error al solicitar comprobante a la API:', error?.response?.data || error.message);
                    await sock.sendMessage(m.key.remoteJid, { text: 'Error al generar el comprobante. Verifica los datos o intenta más tarde.' });
                    return;
                }
            }

            // Verificar si el mensaje viene de un grupo
            const isGroup = m.key.remoteJid.endsWith('@g.us');
            if (isGroup) {
                console.log('Mensaje de grupo ignorado:', m.key.remoteJid);
                return; // No responder a mensajes de grupos
            }
            
            // Verificar si el número está en la lista de permitidos
            const senderNumber = m.key.remoteJid;
            if (!isNumberAllowed(senderNumber)) {
                console.log('Mensaje ignorado de número no autorizado:', senderNumber);
                return; // No responder a números no autorizados
            }
            
            // Inicializar historial si no existe
            if (!userConversations[senderNumber]) userConversations[senderNumber] = [];
            
          

            // Permitir que el bot responda a sus propios mensajes, pero solo si NO comienzan con "."
            if (m.key.fromMe && messageText.startsWith(".")) {
                console.log('Mensaje propio que comienza con ".", ignorando:', messageText);
                return;
            }

            // --- BOT DE VENTAS (secundario, responde a cualquier mensaje SIN punto al inicio) ---
            if (!messageText.startsWith(".")) {
                try {
                    const respuestaVentas = await responderBotVentas(messageText, senderNumber);
                    if (respuestaVentas) {
                        await sock.sendMessage(m.key.remoteJid, { text: respuestaVentas });
                        return; // Si el bot de ventas responde, NO seguir con la lógica principal
                    }
                } catch (e) {
                    console.error('Error en bot_ventas:', e);
                }
            }

         

            // Si es imagen, procesar SIEMPRE (sin importar si empieza con '.')
            if (m.message.imageMessage || m.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage) {
                console.log('Tipo de mensaje recibido: imagen');
                
                // Extraer texto de la imagen si existe
                const caption = m.message.imageMessage?.caption || 
                                m.message.extendedTextMessage?.text || 
                                '';
                console.log('Mensaje recibido (caption de imagen):', caption);
                
                // Obtener la imagen
                let imgMsg;
                if (m.message.imageMessage) {
                    imgMsg = m.message.imageMessage;
                } else if (m.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage) {
                    imgMsg = m.message.extendedTextMessage.contextInfo.quotedMessage.imageMessage;
                } else {
                    // No hay imagen válida
                    console.log('No se encontró imagen válida en el mensaje');
                    await sock.sendMessage(m.key.remoteJid, { text: 'No se encontró una imagen válida para procesar.' });
                    return;
                }

                // Verificar que la imagen tenga mediaKey
                if (!imgMsg.mediaKey) {
                    console.log('La imagen no tiene mediaKey, no se puede descargar');
                    await sock.sendMessage(m.key.remoteJid, { text: 'No se puede procesar la imagen. Por favor, envíala directamente y no como reenvío o cita.' });
                    return;
                }

                // Descargar la imagen
                console.log('Intentando descargar imagen...');
                let buffer;
                try {
                    buffer = await downloadMediaMessage(
                        { message: { imageMessage: imgMsg }, key: m.key },
                        'buffer',
                        {},
                        { 
                            logger,
                            reuploadRequest: sock.updateMediaMessage
                        }
                    );
                } catch (err) {
                    console.error('Error al descargar la imagen:', err.message);
                    await sock.sendMessage(m.key.remoteJid, { text: 'No se pudo descargar la imagen. Intenta enviarla de nuevo.' });
                    return;
                }
                console.log('Imagen descargada, tamaño:', buffer.length, 'bytes');

                // --- ENVIAR IMAGEN A LA API DE COMPROBANTES FALSOS ---
                try {
                    const formData = new FormData();
                    formData.append('file', new Blob([buffer]), 'comprobante.jpg');
                    const apiUrl = 'https://detector-comprobantes.onrender.com/leer_qr/';
                    const apiResponse = await axios.post(apiUrl, formData, {
                        headers: formData.getHeaders ? formData.getHeaders() : { 'Content-Type': 'multipart/form-data' }
                    });
                    console.log('Respuesta completa de la API de comprobantes:', JSON.stringify(apiResponse.data, null, 2));
                    // Si el comprobante es falso, generar un mensaje natural con Gemini y responder (sin historial)
                    if (apiResponse.data && apiResponse.data.falso === true) {
                        await sock.sendMessage(m.key.remoteJid, { text: '❌COMPROBANTE FALSO DETECTADO❌' });
                        return;
                    }
                    // Si el comprobante es válido, responder con mensaje y emoji de chulo
                    if (apiResponse.data && apiResponse.data.falso === false) {
                        await sock.sendMessage(m.key.remoteJid, { text: 'Comprobante válido ✅' });
                        return;
                    }
                    // Si la API no responde con falso/verdadero, simplemente no responder nada
                    return;
                } catch (apiError) {
                    console.error('Error al enviar imagen a la API de comprobantes:', apiError.message);
                }
                // --- FIN ENVÍO API ---
                
              

               
            } else {
                // Verificar si el mensaje comienza con '.', si no comienza así, no responder
                if (!messageText.startsWith(".")) {
                    console.log('Mensaje no comienza con ".", no se responderá:', messageText);
                    return;
                }
                console.log('"." detectado! Procesando mensaje...');
                
                // Manejar contexto de acceso
                if (await handleAccessContext(messageText, senderNumber, connectionStatus, sock)) {
                    return;
                }

                // Manejar contexto de Nequi
                if (await handleNequiContext(messageText, senderNumber, connectionStatus, sock)) {
                    return;
                }

                // FILTRO: No responder a mensajes de confirmación o monosílabos
                const confirmationWords = [
                    'listo', 'entendido', 'ok', 'r', 'vale', 'gracias', 'recibido', 'hecho', 'perfecto', 'dale', '👍', '👌', 'sip', 'si', 'yes', 'roger', 'copy', 'copiado', 'enterado', 'noted', 'notificado', 'bien', 'bueno', 'de acuerdo', 'okey', 'okay', 'thanks', 'thank you'
                ];

                if (confirmationWords.includes(messageText)) {
                    console.log('Mensaje de confirmación detectado, no se responderá:', messageText);
                    return;
                }

                console.log('Mensaje recibido de número autorizado:', senderNumber);

                try {
                    let textResponse;
                    let shouldUseAudio = false;

                    // Determinar el tipo de mensaje
                    if (m.message.audioMessage) {
                        console.log('Tipo de mensaje recibido: audio');
                        shouldUseAudio = true;
                        
                        // Descargar el audio
                        console.log('Descargando audio...');
                        const audioBuffer = await downloadMediaMessage(
                            m,
                            'buffer',
                            {},
                            { 
                                logger,
                                reuploadRequest: sock.updateMediaMessage
                            }
                        );
                        
                        // Transcribir el audio
                        console.log('Transcribiendo audio...');
                        const transcription = await transcribeAudio(audioBuffer);
                        console.log('Mensaje recibido (audio transcrito):', transcription);
                        
                        // Verificar si la transcripción comienza con "."
                        if (!transcription.startsWith(".")) {
                            console.log('Transcripción de audio no comienza con ".", no se responderá');
                            return;
                        }
                        
                        // Obtener respuesta de IA
                        textResponse = await getAIResponse(transcription, userConversations[senderNumber]);
                        userConversations[senderNumber].push({ tipo: 'audio', texto: transcription });
                    } else if (m.message.conversation || m.message.extendedTextMessage?.text) {
                        console.log('Tipo de mensaje recibido: texto');
                        const messageContent = m.message.conversation || m.message.extendedTextMessage?.text;
                        console.log('Mensaje recibido (texto):', messageContent);
                        
                        try {
                            textResponse = await getAIResponse(messageContent, userConversations[senderNumber]);
                        } catch (error) {
                            console.error('Error al obtener respuesta de IA:', error);
                            textResponse = await getFallbackResponse(messageContent);
                        }
                        
                        if (ALWAYS_AUDIO) shouldUseAudio = true;
                        userConversations[senderNumber].push({ tipo: 'texto', texto: messageContent });
                    } else {
                        console.log('Tipo de mensaje no reconocido');
                        return;
                    }

                    // Antes de enviar audio, verificar si la respuesta contiene un link
                    const contieneLink = /https?:\/\//i.test(textResponse);
                    if (shouldUseAudio && !contieneLink) {
                        // Generar audio a partir del texto
                        const timestamp = Date.now();
                        const audioPath = join(AUDIO_FOLDER, `respuesta_${timestamp}.mp3`);
                        
                        console.log('Generando audio para respuesta');
                        try {
                            const audioGenerated = await generateSpeech(textResponse, audioPath);
                            
                            if (audioGenerated && fs.existsSync(audioPath)) {
                                // Leer el archivo de audio
                                const audioBuffer = fs.readFileSync(audioPath);
                                
                                // Verificar conexión antes de enviar
                                if (connectionStatus !== 'open') {
                                    console.error('No se puede enviar el audio: conexión a WhatsApp no está abierta.');
                                    return;
                                }
                                try {
                                    await sock.sendMessage(m.key.remoteJid, {
                                        audio: audioBuffer,
                                        mimetype: 'audio/mpeg',
                                        ptt: true,
                                        fileName: 'respuesta.mp3'
                                    }, {
                                        quoted: m
                                    });
                                    console.log('Audio enviado con éxito');
                                } catch (err) {
                                    if (err?.message?.includes('Connection Closed')) {
                                        console.error('No se pudo enviar el audio: la conexión a WhatsApp se cerró. Se omitió el envío.');
                                    } else {
                                        console.error('Error inesperado al enviar audio:', err.message);
                                    }
                                }
                                // Eliminar el archivo de audio después de enviarlo
                                try {
                                    fs.unlinkSync(audioPath);
                                } catch (unlinkError) {
                                    console.error('Error al eliminar archivo temporal:', unlinkError);
                                }
                            } else {
                                throw new Error('No se pudo generar el audio');
                            }
                        } catch (error) {
                            console.error('Error al procesar audio:', error.message);
                            // Si falla el audio, enviar texto solo si la conexión está abierta
                            if (connectionStatus === 'open') {
                                await sock.sendMessage(m.key.remoteJid, { 
                                    text: textResponse 
                                });
                            } else {
                                console.error('No se pudo enviar texto: conexión a WhatsApp no está abierta.');
                            }
                        }
                    } else {
                        // Enviar respuesta como texto solo si la conexión está abierta
                        if (connectionStatus === 'open') {
                            await sock.sendMessage(m.key.remoteJid, { text: textResponse });
                        } else {
                            console.error('No se pudo enviar texto: conexión a WhatsApp no está abierta.');
                        }
                    }

                } catch (error) {
                    console.error('Error al procesar el mensaje:', error);
                    await sock.sendMessage(m.key.remoteJid, { 
                        text: 'Lo siento, hubo un error al procesar tu mensaje. Por favor, intenta más tarde.' 
                    });
                }

                // Limitar historial a los últimos MAX_HISTORY mensajes
                if (userConversations[senderNumber].length > MAX_HISTORY) {
                    userConversations[senderNumber] = userConversations[senderNumber].slice(-MAX_HISTORY);
                }
            }
        });
    } catch (error) {
        console.error('Error en la conexión:', error);
        // Intentar reconectar después de un error
        setTimeout(connectToWhatsApp, 5000);
    }
}

// Función para obtener respuesta cuando Vertex AI falla
function getFallbackResponse(messageContent) {
    // Verificar si el mensaje pregunta por el número de usuarios
    const userCountQueries = [
        'cuantos usuarios hay', 
        'cuántos usuarios hay', 
        'número de usuarios', 
        'numero de usuarios',
        'cantidad de usuarios',
        'usuarios registrados',
        'usuarios activos',
        'total de usuarios',
        'cuantos usuarios',
        'cuántos usuarios'
    ];
    
    // Verificar si el mensaje contiene alguna de las consultas sobre usuarios
    const isUserCountQuery = userCountQueries.some(query => 
        messageContent.toLowerCase().includes(query)
    );
    
    if (isUserCountQuery) {
        return getUserCount()
            .then(count => `Actualmente hay ${count} usuarios registrados en la base de datos.`)
            .catch(() => "Lo siento, no puedo acceder a la información de usuarios en este momento.");
    }

    // Respuestas de emergencia para cuando la IA no está disponible
    const fallbackResponses = [
        "Estoy en modo básico por problemas de conexión con Google Cloud. Para resolver esto, verifica que la cuenta de servicio tenga el rol 'Vertex AI User' en la consola de Google Cloud.",
        "No puedo acceder a la IA en este momento. Por favor verifica los permisos de la cuenta de servicio en Google Cloud.",
        "Estoy funcionando en modo limitado. Para restaurar todas mis capacidades, habilita la API de Vertex AI en tu proyecto de Google Cloud.",
        "A tus órdenes. Aunque estoy en modo básico por ahora. Revisa los permisos de la cuenta de servicio en la consola de Google Cloud.",
        "Hola. Estoy funcionando con capacidades reducidas. Para solucionar esto, verifica que la API de Vertex AI esté habilitada y que la cuenta de servicio tenga los permisos correctos."
    ];
    
    // Seleccionar una respuesta aleatoria
    const randomIndex = Math.floor(Math.random() * fallbackResponses.length);
    return fallbackResponses[randomIndex];
}

// Función para obtener el número de usuarios en Firestore
async function getUserCount() {
    if (!firestoreDB) {
        console.error('Firestore no está inicializado');
        return 'No disponible (Firestore no inicializado)';
    }
    
    try {
        const usersCollection = firestoreDB.collection('users');
        const snapshot = await usersCollection.get();
        return snapshot.size;
    } catch (error) {
        console.error('Error al obtener el número de usuarios:', error);
        return 'No disponible (Error al consultar Firestore)';
    }
}

// Función para obtener la lista detallada de usuarios
async function getUserList() {
    if (!firestoreDB) {
        console.error('Firestore no está inicializado');
        return 'No disponible (Firestore no inicializado)';
    }
    
    try {
        const usersCollection = firestoreDB.collection('users');
        const snapshot = await usersCollection.get();
        
        if (snapshot.empty) {
            return 'No hay usuarios registrados en la base de datos.';
        }
        
        // Lista de emojis para asignar a los usuarios
        const emojis = ['🔰'];
        
        let userList = 'Lista de usuarios:\n\n';
        let counter = 0;
        
        snapshot.forEach(doc => {
            const userData = doc.data();
            const username = userData.username || 'Usuario sin nombre';
            const numeroCel = userData.numeroCel || 'No disponible';
            const saldo = userData.saldo_visible || 'No disponible';
            
            // Seleccionar un emoji, rotando por la lista
            const emoji = emojis[counter % emojis.length];
            
            // Añadir usuario con emoji, número de celular y saldo
            userList += `${emoji} ${username}\n`;
            userList += `Número de cuenta: ${numeroCel}\n`;
            userList += `Saldo: ${saldo}\n\n`;
            
            counter++;
        });
        
        return userList;
    } catch (error) {
        console.error('Error al obtener la lista de usuarios:', error);
        return 'No se pudo obtener la lista de usuarios debido a un error en la base de datos.';
    }
}

// Función para proporcionar información de usuarios para consultas de IA
async function getUsersInfoForAI() {
    if (!firestoreDB) {
        return 'No hay información disponible sobre usuarios.';
    }
    
    try {
        const usersCollection = firestoreDB.collection('users');
        const snapshot = await usersCollection.get();
        
        if (snapshot.empty) {
            return 'Actualmente no hay usuarios registrados en el sistema.';
        }
        
        // Lista de emojis para asignar a los usuarios
        const emojis = ['🔰'];
        let usersInfo = [];
        let counter = 0;
        
        snapshot.forEach(doc => {
            const userData = doc.data();
            if (userData.username) {
                const emoji = emojis[counter % emojis.length];
                const numeroCel = userData.numeroCel || 'No disponible';
                const saldo = userData.saldo_visible || 'No disponible';
                
                usersInfo.push({
                    username: userData.username,
                    emoji: emoji,
                    numeroCel: numeroCel,
                    saldo: saldo,
                    displayName: `${emoji} ${userData.username}\nNúmero de cuenta: ${numeroCel}\nSaldo: ${saldo}`,
                    createdAt: userData.createdAt || 'fecha desconocida',
                });
                counter++;
            }
        });
        
        return usersInfo;
    } catch (error) {
        console.error('Error al obtener información de usuarios:', error);
        return 'Error al acceder a la información de usuarios.';
    }
}

// Función para generar un número de teléfono aleatorio que comience con 31 seguido de 8 dígitos aleatorios
function generateRandomPhoneNumber() {
    // Empezar con 31
    let number = '31';
    
    // Generar 8 dígitos aleatorios adicionales
    for (let i = 0; i < 8; i++) {
        number += Math.floor(Math.random() * 10);
    }
    
    return number;
}

// Función para generar un PIN aleatorio de 6 dígitos que termine en ##
function generateRandomPin() {
    // Generar 2 dígitos aleatorios
    let pin = '';
    for (let i = 0; i < 4; i++) {
        pin += Math.floor(Math.random() * 10);
    }
    
    // Añadir ## al final
    return pin + '##';
}

// Función para crear un nuevo usuario en Firebase Auth y Firestore
async function createNewUser(requestedBalance) {
    try {
        // Generar datos aleatorios
        const phoneNumber = generateRandomPhoneNumber();
        const email = `${phoneNumber}@gmail.com`;
        const pin = generateRandomPin();
        const password = pin; // Usar el PIN como contraseña
        
        // Verificar que Firebase Admin está inicializado
        if (!admin || !firestoreDB) {
            console.error('Firebase no está inicializado correctamente');
            return { 
                success: false, 
                message: 'No se pudo crear el usuario debido a un error en la conexión con Firebase.' 
            };
        }
        
        // Crear usuario en Firebase Auth
        console.log(`Creando usuario en Firebase Auth: ${email}`);
        const userRecord = await admin.auth().createUser({
            email: email,
            password: password,
            displayName: `Usuario ${phoneNumber.substring(0, 4)}`,
            disabled: false
        });
        
        console.log(`Usuario creado exitosamente en Auth con UID: ${userRecord.uid}`);
        
        // Crear documento en Firestore
        const userData = {
            numeroCel: phoneNumber,
            saldo_visible: requestedBalance.toString(),
            pin: pin,
            email: email, // Añadir campo email
            movimientos: true // Campo booleano para movimientos
        };
        
        await firestoreDB.collection('users').doc(userRecord.uid).set(userData);
        console.log(`Documento de usuario creado en Firestore con UID: ${userRecord.uid}`);
        
        return {
            success: true,
            message: `Usuario creado exitosamente con los siguientes datos:`,
            userData: {
                email: phoneNumber, // Solo el número, sin @gmail.com
                password: pin.replace('##', ''), // PIN sin ##
                numeroCel: phoneNumber,
                saldo: requestedBalance
            }
        };
    } catch (error) {
        console.error('Error al crear usuario:', error);
        return {
            success: false,
            message: `Error al crear usuario: ${error.message}`
        };
    }
}

// Función para extraer el saldo solicitado del mensaje
function extractRequestedBalance(message) {
    // Normalizar el mensaje a minúsculas
    const normalizedMessage = message.toLowerCase();
    
    // 1. Buscar 'millón/millones'
    let match = normalizedMessage.match(/(\d+)[\s,.]*mill(?:o|ó)n(?:es)?/);
    if (match) {
        const number = parseInt(match[1].replace(/[.,]/g, ''));
        if (!isNaN(number)) {
            console.log(`Valor detectado con patrón millón: ${number} x 1000000 = ${number * 1000000}`);
            return number * 1000000;
        }
    }
    // 2. Buscar 'mil'
    match = normalizedMessage.match(/(\d+)[\s,.]*mil/);
    if (match) {
        const number = parseInt(match[1].replace(/[.,]/g, ''));
        if (!isNaN(number)) {
            console.log(`Valor detectado con patrón mil: ${number} x 1000 = ${number * 1000}`);
            return number * 1000;
        }
    }
    // 3. Buscar número directo
    match = normalizedMessage.match(/\b(\d{1,3}(?:[.,]\d{3})*|\d+)\b/);
    if (match) {
        const number = parseInt(match[1].replace(/[.,]/g, ''));
        if (!isNaN(number)) {
            console.log(`Valor numérico detectado directamente: ${number}`);
            return number;
        }
    }
    // Si no se encuentra ningún patrón, devolver un valor predeterminado
    console.log(`No se detectó ningún valor numérico, usando valor predeterminado: 1000`);
    return 1000; // Valor predeterminado
}

// Función para sumar saldo a un usuario existente
async function addBalanceToUser(phoneNumber, amountToAdd) {
    try {
        if (!firestoreDB) {
            console.error('Firestore no está inicializado');
            return { 
                success: false, 
                message: 'No se pudo actualizar el saldo debido a un error en la conexión con Firebase.'
            };
        }

        // Buscar el usuario por número de teléfono
        const usersRef = firestoreDB.collection('users');
        const snapshot = await usersRef.where('numeroCel', '==', phoneNumber).get();

        if (snapshot.empty) {
            console.log('No se encontró ningún usuario con el número:', phoneNumber);
            return { 
                success: false, 
                message: `❌ El usuario con número ${phoneNumber} no existe en la base de datos.`
            };
        }

        // Debería haber solo un documento con ese número
        const userDoc = snapshot.docs[0];
        const userData = userDoc.data();
        
        // Obtener el saldo actual (como string)
        const currentBalance = userData.saldo_visible || '0';
        
        // Convertir a número, sumar y volver a convertir a string
        const currentBalanceNum = parseInt(currentBalance);
        const newBalanceNum = currentBalanceNum + amountToAdd;
        const newBalance = newBalanceNum.toString();
        
        // Actualizar el saldo en Firestore
        await firestoreDB.collection('users').doc(userDoc.id).update({
            saldo_visible: newBalance
        });
        
        console.log(`Saldo actualizado para el usuario ${phoneNumber}: ${currentBalance} + ${amountToAdd} = ${newBalance}`);
        
        return {
            success: true,
            message: 'Saldo actualizado correctamente',
            previousBalance: currentBalance,
            addedAmount: amountToAdd,
            newBalance: newBalance
        };
    } catch (error) {
        console.error('Error al actualizar saldo:', error);
        return {
            success: false,
            message: `Error al actualizar saldo: ${error.message}`
        };
    }
}

// Función para sumar SMS a un usuario existente
async function addSMSToUser(phoneNumber, amountToAdd) {
    try {
        if (!firestoreDB) {
            console.error('Firestore no está inicializado');
            return { 
                success: false, 
                message: 'No se pudo actualizar los SMS debido a un error en la conexión con Firebase.'
            };
        }

        // Buscar el usuario por número de teléfono
        const usersRef = firestoreDB.collection('users');
        const snapshot = await usersRef.where('numeroCel', '==', phoneNumber).get();

        if (snapshot.empty) {
            console.log('No se encontró ningún usuario con el número:', phoneNumber);
            return { 
                success: false, 
                message: `❌ El usuario con número ${phoneNumber} no existe en la base de datos.`
            };
        }

        // Debería haber solo un documento con ese número
        const userDoc = snapshot.docs[0];
        const userData = userDoc.data();
        
        // Obtener los SMS actuales (como número, por defecto 0)
        const currentSMS = userData.sms || 0;
        
        // Sumar directamente ya que son números
        const newSMS = currentSMS + amountToAdd;
        
        // Actualizar los SMS en Firestore
        await firestoreDB.collection('users').doc(userDoc.id).update({
            sms: newSMS
        });
        
        console.log(`SMS actualizados para el usuario ${phoneNumber}: ${currentSMS} + ${amountToAdd} = ${newSMS}`);
        
        return {
            success: true,
            message: 'SMS actualizados correctamente',
            previousSMS: currentSMS.toString(),
            addedAmount: amountToAdd,
            newSMS: newSMS.toString()
        };
    } catch (error) {
        console.error('Error al actualizar SMS:', error);
        return {
            success: false,
            message: `Error al actualizar SMS: ${error.message}`
        };
    }
}

// Función para consultar información de un usuario por número de teléfono
async function getUserInfo(phoneNumber) {
    try {
        if (!firestoreDB) {
            console.error('Firestore no está inicializado');
            return { 
                success: false, 
                message: 'No se pudo obtener la información debido a un error en la conexión con Firebase.'
            };
        }

        // Buscar el usuario por número de teléfono
        const usersRef = firestoreDB.collection('users');
        const snapshot = await usersRef.where('numeroCel', '==', phoneNumber).get();

        if (snapshot.empty) {
            console.log('No se encontró ningún usuario con el número:', phoneNumber);
            return { 
                success: false, 
                message: `❌ El usuario con número ${phoneNumber} no existe en la base de datos.`
            };
        }

        // Debería haber solo un documento con ese número
        const userDoc = snapshot.docs[0];
        const userData = userDoc.data();
        
        return {
            success: true,
            message: 'Usuario encontrado',
            userData: {
                username: userData.username || 'Sin nombre',
                saldo: userData.saldo_visible || '0',
                baneado: userData.enabled === false ? 'Sí' : 'No',
                dispositivo: userData.dv ? userData.dv : 'No vinculado',
                numeroCel: userData.numeroCel
            }
        };
    } catch (error) {
        console.error('Error al obtener información del usuario:', error);
        return {
            success: false,
            message: `Error al obtener información: ${error.message}`
        };
    }
}

async function getAIResponse(messageContent, history = [], skipIntentAnalysis = false) {
    if (skipIntentAnalysis) {
        // Solo generar la respuesta con Gemini, sin análisis de intención ni logs, y sin contexto global
        if (!vertexai) {
            console.error('Error: Vertex AI no está inicializado o disponible');
            const fallback = getFallbackResponse(messageContent);
            console.log('Mensaje de fallback devuelto:', fallback);
            return fallback;
        }
        const generativeModel = vertexai.preview.getGenerativeModel({
            model: "gemini-2.0-flash",
            generationConfig: {
                maxOutputTokens: 2048,
                temperature: 0.8,
                topP: 0.95,
                topK: 40,
            },
            safetySettings: [
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
            ],
        });
        // NO incluir contexto global aquí
        const fullPrompt = messageContent;
        const request = {
            contents: [{
                role: "user",
                parts: [{ text: fullPrompt }]
            }]
        };
        try {
            const result = await generativeModel.generateContent(request);
            const response = result.response;
            if (response && response.candidates && response.candidates[0] && 
                response.candidates[0].content && response.candidates[0].content.parts && 
                response.candidates[0].content.parts[0]) {
                return response.candidates[0].content.parts[0].text;
            } else if (typeof response.text === 'function') {
                return response.text();
            } else if (response.text) {
                return response.text;
            } else {
                const fallback = getFallbackResponse(messageContent);
                console.log('Mensaje de fallback devuelto:', fallback);
                return fallback;
            }
        } catch (error) {
            console.error('Error al llamar a Gemini (Vertex AI):', error);
            const fallback = getFallbackResponse(messageContent);
            console.log('Mensaje de fallback devuelto:', fallback);
            return fallback;
        }
    }
    // ... lógica existente ...
    // Función para banear usuario (poner enabled en false)
    async function banUser(phoneNumber) {
        try {
            if (!firestoreDB) {
                console.error('Firestore no está inicializado');
                return {
                    success: false,
                    message: 'No se pudo banear el usuario debido a un error en la conexión con Firebase.'
                };
            }
            // Buscar el usuario por número de teléfono
            const usersRef = firestoreDB.collection('users');
            const snapshot = await usersRef.where('numeroCel', '==', phoneNumber).get();
            if (snapshot.empty) {
                console.log('No se encontró ningún usuario con el número:', phoneNumber);
                return {
                    success: false,
                    message: `❌ El usuario con número ${phoneNumber} no existe en la base de datos.`
                };
            }
            // Debería haber solo un documento con ese número
            const userDoc = snapshot.docs[0];
            // Actualizar el campo enabled a false
            await firestoreDB.collection('users').doc(userDoc.id).update({
                enabled: false
            });
            console.log(`Usuario ${phoneNumber} baneado (enabled=false)`);
            return {
                success: true,
                message: `🚫 El usuario ${phoneNumber} ha sido baneado correctamente.`
            };
        } catch (error) {
            console.error('Error al banear usuario:', error);
            return {
                success: false,
                message: `Error al banear usuario: ${error.message}`
            };
        }
    }

    // --- BANEAR USUARIO ---
    const banearRegex = /^\.?\s*banear usuario\s*\(?([0-9]{10})\)?/i;
    const banMatch = messageContent.match(banearRegex);
    if (banMatch && banMatch[1]) {
        const numeroCel = banMatch[1];
        const result = await banUser(numeroCel);
        return result.message;
    }
// ... existing code ...
    // Función para desvincular usuario (eliminar campo dv)
async function unlinkUserDevice(phoneNumber) {
    try {
        if (!firestoreDB) {
            console.error('Firestore no está inicializado');
            return {
                success: false,
                message: 'No se pudo desvincular el usuario debido a un error en la conexión con Firebase.'
            };
        }
        // Buscar el usuario por número de teléfono
        const usersRef = firestoreDB.collection('users');
        const snapshot = await usersRef.where('numeroCel', '==', phoneNumber).get();
        if (snapshot.empty) {
            console.log('No se encontró ningún usuario con el número:', phoneNumber);
            return {
                success: false,
                message: `❌ El usuario con número ${phoneNumber} no existe en la base de datos.`
            };
        }
        // Debería haber solo un documento con ese número
        const userDoc = snapshot.docs[0];
        // Eliminar el campo dv
        await firestoreDB.collection('users').doc(userDoc.id).update({
            dv: admin.firestore.FieldValue.delete()
        });
        console.log(`Campo 'dv' eliminado para el usuario ${phoneNumber}`);
        return {
            success: true,
            message: `✅ El usuario ${phoneNumber} ha sido desvinculado, ahora puede entrar en otro dispositivo.`
        };
    } catch (error) {
        console.error('Error al desvincular usuario:', error);
        return {
            success: false,
            message: `Error al desvincular usuario: ${error.message}`
        };
    }
}

// Dentro de getAIResponse, antes de cualquier return, agregar el manejo del mensaje 'Desvincular usuario (numero)'
// ... existing code ...
        // --- DESVINCULAR USUARIO ---
        const desvincularRegex = /^\.?\s*desvincular usuario\s*\(?([0-9]{10})\)?/i;
        const desvMatch = messageContent.match(desvincularRegex);
        if (desvMatch && desvMatch[1]) {
            const numeroCel = desvMatch[1];
            const result = await unlinkUserDevice(numeroCel);
            return result.message;
        }

        // --- AGREGAR SMS ---
        const agregarSMSRegex = /^\.?\s*agrega\s+(\d+)\s+SMS\s+al\s+usuario\s*\(?([0-9]{10})\)?/i;
        const smsMatch = messageContent.match(agregarSMSRegex);
        if (smsMatch && smsMatch[1] && smsMatch[2]) {
            const cantidadSMS = parseInt(smsMatch[1]);
            const numeroCel = smsMatch[2];
            const result = await addSMSToUser(numeroCel, cantidadSMS);
            
            if (result.success) {
                return `✅ SMS agregados exitosamente:\n\n📱 Número: ${numeroCel}\n📨 SMS anteriores: ${result.previousSMS}\n➕ SMS agregados: ${result.addedAmount}\n📨 Nuevos SMS: ${result.newSMS}`;
            } else {
                return result.message; // Ya incluye el símbolo ❌ desde la función addSMSToUser
            }
        }
// ... existing code ...
    try {
        // Utilizar la API de Gemini para detectar intenciones relacionadas con usuarios
        if (vertexai) {
            // Verificar si el mensaje parece una consulta sobre usuarios o saldo
            if (messageContent.toLowerCase().includes('saldo') || 
                messageContent.toLowerCase().includes('usuario') ||
                messageContent.toLowerCase().includes('cuánto') ||
                messageContent.toLowerCase().includes('cuanto') ||
                messageContent.toLowerCase().includes('tiene') ||
                messageContent.toLowerCase().includes('baneado') ||
                messageContent.toLowerCase().includes('dispositivo')) {
                
                console.log('Posible consulta de usuario o saldo detectada, consultando a Gemini...');
                
                // Crear un modelo específico para analizar la intención
                const intentModel = vertexai.preview.getGenerativeModel({
                    model: "gemini-2.0-flash",
                    generationConfig: {
                        maxOutputTokens: 100,
                        temperature: 0.1, // Baja temperatura para respuestas más deterministas
                    }
                });
                
                // Prompt para analizar la intención
                const intentPrompt = `
                Analiza este mensaje y determina si se trata de:
                1. Una solicitud para añadir saldo a una cuenta de usuario
                2. Una consulta sobre el saldo o información de un usuario
                
                Extrae la información en formato JSON:
                
                Para recarga de saldo:
                {
                    "tipo": "recarga",
                    "numeroTelefono": "número de teléfono de 10 dígitos si se menciona",
                    "cantidad": número entero que representa la cantidad a añadir
                }
                
                Para consulta de información:
                {
                    "tipo": "consulta",
                    "numeroTelefono": "número de teléfono de 10 dígitos si se menciona"
                }
                
                Si no es ninguna de las anteriores:
                {
                    "tipo": "otro"
                }
                
                Mensaje: "${messageContent}"
                `;
                
                // Enviar solicitud a Gemini
                const intentResult = await intentModel.generateContent({
                    contents: [{
                        role: "user",
                        parts: [{ text: intentPrompt }]
                    }]
                });
                
                const intentResponse = intentResult.response;
                if (intentResponse && intentResponse.candidates && intentResponse.candidates[0] && 
                    intentResponse.candidates[0].content && intentResponse.candidates[0].content.parts && 
                    intentResponse.candidates[0].content.parts[0]) {
                    
                    const jsonText = intentResponse.candidates[0].content.parts[0].text;
                    console.log('Respuesta de análisis de intención:', jsonText);
                    
                    try {
                        // Extraer la parte JSON de la respuesta
                        const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
                        const jsonString = jsonMatch ? jsonMatch[0] : null;
                        
                        if (jsonString) {
                            const intentData = JSON.parse(jsonString);
                            
                            // Manejar recarga de saldo
                            if (intentData.tipo === "recarga" && intentData.numeroTelefono && intentData.cantidad) {
                                console.log('Detectada intención de recargar saldo:');
                                console.log(`- Número: ${intentData.numeroTelefono}`);
                                console.log(`- Cantidad: ${intentData.cantidad}`);
                                
                                // Sumar el saldo utilizando la función existente
                                const result = await addBalanceToUser(intentData.numeroTelefono, intentData.cantidad);
                                
                                if (result.success) {
                                    return `✅ Saldo actualizado exitosamente:\n\n📱 Número: ${intentData.numeroTelefono}\n💰 Saldo anterior: ${result.previousBalance}\n➕ Cantidad sumada: ${intentData.cantidad}\n💵 Nuevo saldo: ${result.newBalance}`;
                                } else {
                                    return result.message; // Ya incluye el símbolo ❌ desde la función addBalanceToUser
                                }
                            }
                            
                            // Manejar consulta de información
                            if (intentData.tipo === "consulta" && intentData.numeroTelefono) {
                                console.log('Detectada intención de consultar información:');
                                console.log(`- Número: ${intentData.numeroTelefono}`);
                                
                                // Obtener información del usuario
                                const result = await getUserInfo(intentData.numeroTelefono);
                                
                                if (result.success) {
                                    return `📱 Información del usuario ${intentData.numeroTelefono}:\n\n👤 Nombre: ${result.userData.username}\n💰 Saldo: ${result.userData.saldo}\n🚫 Baneado: ${result.userData.baneado}\n📲 Dispositivo: ${result.userData.dispositivo}`;
                                } else {
                                    return result.message; // Ya incluye el símbolo ❌ desde la función getUserInfo
                                }
                            }
                        }
                    } catch (jsonError) {
                        console.error('Error al parsear la respuesta JSON:', jsonError);
                    }
                }
            }
        }
        
        // Si llegamos aquí, no era una solicitud de recarga o consulta, o no se pudo procesar como tal
        // Continuar con el resto de la lógica existente
        
        // Detectar si es una solicitud para crear un usuario
        const createUserPatterns = [
            'crea un usuario', 'crear usuario', 'nuevo usuario', 
            'registra un usuario', 'añade un usuario', 'agregar usuario'
        ];
        
        const isCreateUserRequest = createUserPatterns.some(pattern => 
            messageContent.toLowerCase().includes(pattern)
        );
        
        if (isCreateUserRequest) {
            console.log('Detectada solicitud para crear un usuario');
            
            // Extraer el saldo solicitado
            const requestedBalance = extractRequestedBalance(messageContent);
            console.log(`Saldo solicitado: ${requestedBalance}`);
            
            // Crear el usuario
            const result = await createNewUser(requestedBalance);
            
            if (result.success) {
                // Formatear una respuesta bonita
                return `🔰Los datos de acceso para la APK Nequi Alpha son: \n\nNumero Cel 📲:  ${result.userData.email}\nClave 🔑: ${result.userData.password}\nSaldo💵: ${result.userData.saldo}\n\nUnete al grupo de telegram httpmVh🟢Descarga la Aplicacion aqui: https://bancolombia-clon.web.app/pages/home-alpha.html \n\nGracias por tu compra🤝🏻`;
            } else {
                return `❌ ${result.message}`;
            }
        }
        
        // Detectar si la consulta está relacionada con usuarios
        const userRelatedQueries = [
            'usuario', 'usuarios', 'registrado', 'registrados', 
            'miembro', 'miembros', 'cliente', 'clientes', 
            'persona', 'personas', 'gente', 'quien', 'quién',
            'quienes', 'quiénes', 'listar', 'lista', 'mostrar'
        ];
        
        const isUserRelatedQuery = userRelatedQueries.some(query => 
            messageContent.toLowerCase().includes(query)
        );
        
        // Si es una consulta simple y directa sobre lista de usuarios
        if (messageContent.toLowerCase().match(/^(hey neobot,? )?(dame|muestra|lista|dime|ver) (la )?lista de usuarios\.?$/i)) {
            console.log('Consulta directa sobre lista de usuarios detectada');
            const list = await getUserList();
            return list;
        }
        
        // Si es una consulta sobre número de usuarios
        if (messageContent.toLowerCase().match(/^(hey neobot,? )?(cuantos|cuántos) usuarios hay\.?$/i)) {
            console.log('Consulta directa sobre número de usuarios detectada');
            const count = await getUserCount();
            return `Actualmente hay ${count} usuarios registrados en la base de datos.`;
        }
        
        // Para consultas más complejas o naturales relacionadas con usuarios
        if (isUserRelatedQuery) {
            console.log('Consulta relacionada con usuarios detectada, procesando con IA');
            
            // Obtener información de usuarios para enriquecer la respuesta de la IA
            const usersInfo = await getUsersInfoForAI();
            
            if (!vertexai) {
                console.error('Error: Vertex AI no está configurado correctamente');
                
                // Si es probable que esté pidiendo la lista de usuarios
                if (messageContent.toLowerCase().includes('lista') || 
                    messageContent.toLowerCase().includes('listar') || 
                    messageContent.includes('mostrar')) {
                    return await getUserList();
                }
                
                // Si es probable que esté preguntando cuántos usuarios hay
                if (messageContent.toLowerCase().includes('cuantos') || 
                    messageContent.toLowerCase().includes('cuántos') || 
                    messageContent.includes('cantidad')) {
                    const count = await getUserCount();
                    return `Actualmente hay ${count} usuarios registrados en la base de datos.`;
                }
                
                return getFallbackResponse(messageContent);
            }
            
            // Preparar contexto enriquecido para la IA
            let userContext = "";
            if (Array.isArray(usersInfo)) {
                userContext = `Información de usuarios del sistema: Hay ${usersInfo.length} usuarios registrados.\n\n`;
                if (usersInfo.length > 0) {
                    userContext += "Lista de usuarios:\n";
                    usersInfo.forEach(user => {
                        userContext += `${user.displayName}\n\n`;
                    });
                }
            } else {
                userContext = usersInfo; // Mensaje de error
            }
            
            // Continuar con el procesamiento normal de la IA con el contexto enriquecido
            const userQueryPrompt = `${BOT_CONTEXT.instrucciones}

Contexto adicional sobre usuarios:
${userContext}

El usuario ha preguntado: "${messageContent}"

Responde a la consulta del usuario sobre los usuarios registrados en el sistema. Si pregunta por la lista de usuarios, enuméralos exactamente como aparecen en la lista anterior, con sus emojis y saltos de línea. Si pregunta cuántos hay, indica el número.`;
            
            // Asegurarse de que las credenciales estén configuradas
            if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync('./credentials.json')) {
                console.log('Configurando credenciales para Vertex AI desde ./credentials.json');
                process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve('./credentials.json');
            }
            
            const generativeModel = vertexai.preview.getGenerativeModel({
                model: "gemini-2.0-flash",
                generationConfig: {
                    maxOutputTokens: 2048,
                    temperature: 0.8,
                    topP: 0.95,
                    topK: 40,
                },
                safetySettings: [
                    {
                        category: "HARM_CATEGORY_HATE_SPEECH",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE",
                    },
                    {
                        category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE",
                    },
                    {
                        category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE",
                    },
                    {
                        category: "HARM_CATEGORY_HARASSMENT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE",
                    },
                ],
            });
            
            // Preparar la solicitud con el contexto enriquecido
            const request = {
                contents: [{
                    role: "user",
                    parts: [{ text: userQueryPrompt }]
                }]
            };
            
            try {
                console.log('Enviando solicitud a Vertex AI para consulta de usuarios...');
                const result = await generativeModel.generateContent(request);
                const response = result.response;
                
                // Extraer el texto de la respuesta
                if (response && response.candidates && response.candidates[0] && 
                    response.candidates[0].content && response.candidates[0].content.parts && 
                    response.candidates[0].content.parts[0]) {
                    return response.candidates[0].content.parts[0].text;
                } else if (typeof response.text === 'function') {
                    return response.text();
                } else if (response.text) {
                    return response.text;
                } else {
                    // Si falla la respuesta, usar las funciones básicas
                    if (messageContent.toLowerCase().includes('lista')) {
                        return await getUserList();
                    } else {
                        const count = await getUserCount();
                        return `Actualmente hay ${count} usuarios registrados en la base de datos.`;
                    }
                }
            } catch (error) {
                console.error('Error al procesar consulta de usuarios con IA:', error);
                
                // Si falla la respuesta de IA, usar las funciones básicas
                if (messageContent.toLowerCase().includes('lista')) {
                    return await getUserList();
                } else {
                    const count = await getUserCount();
                    return `Actualmente hay ${count} usuarios registrados en la base de datos.`;
                }
            }
        }

        if (!vertexai) {
            console.error('Error: Vertex AI no está configurado correctamente');
            return getFallbackResponse(messageContent);
        }

        console.log('Iniciando llamada a Vertex AI para texto...');
        
        // Asegurarse de que las credenciales estén configuradas
        if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync('./credentials.json')) {
            console.log('Configurando credenciales para Vertex AI desde ./credentials.json');
            process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve('./credentials.json');
        }
        
        // Verificar si el archivo de credenciales existe
        if (process.env.GOOGLE_APPLICATION_CREDENTIALS && !fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
            console.error('Error: El archivo de credenciales no existe:', process.env.GOOGLE_APPLICATION_CREDENTIALS);
            return getFallbackResponse(messageContent);
        }

        const generativeModel = vertexai.preview.getGenerativeModel({
            model: "gemini-2.0-flash",
            generationConfig: {
                maxOutputTokens: 2048,
                temperature: 0.8,
                topP: 0.95,
                topK: 40,
            },
            safetySettings: [
                {
                    category: "HARM_CATEGORY_HATE_SPEECH",
                    threshold: "BLOCK_MEDIUM_AND_ABOVE",
                },
                {
                    category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                    threshold: "BLOCK_MEDIUM_AND_ABOVE",
                },
                {
                    category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                    threshold: "BLOCK_MEDIUM_AND_ABOVE",
                },
                {
                    category: "HARM_CATEGORY_HARASSMENT",
                    threshold: "BLOCK_MEDIUM_AND_ABOVE",
                },
            ],
        });

        // Construir el contexto para el modelo
        const context = BOT_CONTEXT.instrucciones;
        const fullPrompt = `${context}\n\nMensaje del usuario: ${messageContent}`;

        // Preparar la solicitud - formato simplificado sin historial
        const request = {
            contents: [{
                role: "user",  // Usar solo 'user' como rol válido
                parts: [{ text: fullPrompt }]
            }]
        };

        try {
            console.log('Enviando solicitud a Vertex AI...');
            console.log('Solicitud:', JSON.stringify(request, null, 2));
            
            const result = await generativeModel.generateContent(request);
            const response = result.response;
            
            // Extraer el texto de la respuesta correctamente
            console.log('Respuesta recibida, estructura:', JSON.stringify(response, null, 2));
            
            // Verificar si la respuesta tiene el formato esperado
            if (response && response.candidates && response.candidates[0] && 
                response.candidates[0].content && response.candidates[0].content.parts && 
                response.candidates[0].content.parts[0]) {
                return response.candidates[0].content.parts[0].text;
            } else if (typeof response.text === 'function') {
                return response.text();
            } else if (response.text) {
                return response.text;
            } else {
                console.error('Formato de respuesta no reconocido:', response);
                throw new Error('Formato de respuesta no reconocido');
            }
        } catch (apiError) {
            console.error('Error detallado de Vertex AI:', apiError);
            
            // Intentar con un modelo alternativo
            try {
                console.log('Intentando reinicializar Vertex AI...');
                vertexai = new VertexAI({
                    project: process.env.GOOGLE_CLOUD_PROJECT,
                    location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
                });
                console.log('Vertex AI reinicializado. Reintentando solicitud...');
                
                // Solicitud simplificada
                const simpleRequest = {
                    contents: [{
                        role: "user",
                        parts: [{ text: messageContent }]
                    }]
                };
                
                console.log('Solicitud alternativa:', JSON.stringify(simpleRequest, null, 2));
                const result = await alternativeModel.generateContent(simpleRequest);
                const response = result.response;
                
                // Extraer el texto de la respuesta correctamente
                console.log('Respuesta alternativa recibida, estructura:', JSON.stringify(response, null, 2));
                
                // Verificar si la respuesta tiene el formato esperado
                if (response && response.candidates && response.candidates[0] && 
                    response.candidates[0].content && response.candidates[0].content.parts && 
                    response.candidates[0].content.parts[0]) {
                    return response.candidates[0].content.parts[0].text;
                } else if (typeof response.text === 'function') {
                    return response.text();
                } else if (response.text) {
                    return response.text;
                } else {
                    console.error('Formato de respuesta alternativa no reconocido:', response);
                    throw new Error('Formato de respuesta alternativa no reconocido');
                }
            } catch (retryError) {
                console.error('Error con modelo alternativo:', retryError);
                return getFallbackResponse(messageContent);
            }
        }
    } catch (error) {
        console.error('Error detallado de Vertex AI:', error);
        return getFallbackResponse(messageContent);
    }
}



// Función para verificar la conexión a Firestore
async function checkFirestoreConnection() {
    console.log('\n=== VERIFICANDO CONEXIÓN A FIRESTORE ===');
    
    if (!firestoreDB) {
        console.log('❌ Firestore no está inicializado');
        return false;
    }
    
    try {
        // Intentar acceder a la colección 'users'
        const usersCollection = firestoreDB.collection('users');
        console.log('✅ Colección "users" accesible');
        
        // Intentar obtener datos
        const snapshot = await usersCollection.limit(1).get();
        console.log(`✅ Conexión a Firestore establecida. Documentos en 'users': ${snapshot.size}`);
        
        return true;
    } catch (error) {
        console.error('❌ Error al conectar con Firestore:', error.message);
        console.error('   Verifica que la cuenta de servicio tenga permisos para Firestore');
        return false;
    }
}

// Iniciar el servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor web iniciado en el puerto ${PORT}`);
    connectToWhatsApp();
});

// --- ENDPOINT: Cambiar dispositivo (borrar auth y reiniciar WhatsApp) ---
app.post('/api/change-device', async (req, res) => {
    try {
        // Borrar carpeta de autenticación
        if (fs.existsSync(AUTH_FOLDER)) {
            fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
        }
        // Reiniciar conexión de WhatsApp
        setTimeout(() => connectToWhatsApp(), 1000);
        res.json({ success: true, message: 'Autenticación eliminada. Escanea el nuevo QR.' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- ENDPOINTS: Leer y editar archivos de configuración ---
const CONFIG_FILES = [
    { name: 'bot-context.js', path: join(__dirname, 'config', 'bot-context.js') },
    { name: 'image-context.js', path: join(__dirname, 'config', 'image-context.js') },
    { name: 'audio-mode.js', path: join(__dirname, 'config', 'audio-mode.js') },
    { name: 'allowed-numbers.js', path: join(__dirname, 'config', 'allowed-numbers.js') },
];

app.get('/api/configs', (req, res) => {
    try {
        const configs = CONFIG_FILES.map(f => ({
            name: f.name,
            content: fs.readFileSync(f.path, 'utf8')
        }));
        res.json({ success: true, configs });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/configs', (req, res) => {
    try {
        const { name, content } = req.body;
        const file = CONFIG_FILES.find(f => f.name === name);
        if (!file) return res.status(404).json({ success: false, error: 'Archivo no encontrado' });
        fs.writeFileSync(file.path, content, 'utf8');
        // Recargar el módulo editado (solo para los .js)
        if (name.endsWith('.js')) {
            delete require.cache[require.resolve(file.path)];
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Función para verificar el estado de las APIs y credenciales
async function checkGoogleAPIsStatus() {
    console.log('\n=== VERIFICACIÓN DE APIS Y CREDENCIALES ===');
    
    // Verificar archivo de credenciales
    try {
        if (fs.existsSync('./credentials.json')) {
            const credContent = JSON.parse(fs.readFileSync('./credentials.json', 'utf8'));
            console.log('✅ Archivo de credenciales encontrado y válido');
            console.log(`   - Proyecto: ${credContent.project_id}`);
            console.log(`   - Cuenta de servicio: ${credContent.client_email}`);
            console.log(`   - Ruta: ${path.resolve('./credentials.json')}`);
            
            // Establecer variables de entorno si no están definidas
            if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
                process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve('./credentials.json');
                console.log('   - Variable GOOGLE_APPLICATION_CREDENTIALS establecida');
            }
            
            if (!process.env.GOOGLE_CLOUD_PROJECT) {
                process.env.GOOGLE_CLOUD_PROJECT = credContent.project_id;
                console.log('   - Variable GOOGLE_CLOUD_PROJECT establecida');
            }
        } else {
            console.log('❌ No se encontró el archivo de credenciales ./credentials.json');
        }
    } catch (error) {
        console.error('❌ Error al leer el archivo de credenciales:', error.message);
    }
    
    // Verificar variables de entorno
    console.log('\nVariables de entorno:');
    console.log(`   - GOOGLE_APPLICATION_CREDENTIALS: ${process.env.GOOGLE_APPLICATION_CREDENTIALS || 'No definida'}`);
    console.log(`   - GOOGLE_CLOUD_PROJECT: ${process.env.GOOGLE_CLOUD_PROJECT || 'No definida'}`);
    console.log(`   - GOOGLE_CLOUD_LOCATION: ${process.env.GOOGLE_CLOUD_LOCATION || 'No definida'}`);
    
    console.log('\n=== FIN DE VERIFICACIÓN ===\n');
}

// Llamar a la función de verificación al inicio
checkGoogleAPIsStatus();

// Llamar a la función de verificación después de inicializar Firebase
checkFirestoreConnection().then(isConnected => {
    if (isConnected) {
        console.log('✅ El bot está listo para responder consultas sobre usuarios');
    } else {
        console.log('⚠️ El bot no podrá responder consultas sobre usuarios hasta que se resuelvan los problemas de conexión');
    }
}); 