import { default as makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion, downloadMediaMessage } from '@whiskeysockets/baileys';
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

dotenv.config();

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

// Lista de voces predefinidas en español
const AVAILABLE_VOICES = [
    { name: 'es-US-Chirp3-HD-Achird', lang: 'es-US', gender: 'FEMALE' },
    { name: 'es-US-Chirp3-HD-Bella', lang: 'es-US', gender: 'FEMALE' },
    { name: 'es-US-Chirp3-HD-Celeste', lang: 'es-US', gender: 'FEMALE' },
    { name: 'es-US-Chirp3-HD-Diana', lang: 'es-US', gender: 'FEMALE' },
    { name: 'es-US-Chirp3-HD-Elena', lang: 'es-US', gender: 'FEMALE' },
    { name: 'es-US-Chirp3-HD-Fiona', lang: 'es-US', gender: 'FEMALE' },
    { name: 'es-US-Chirp3-HD-Gabriela', lang: 'es-US', gender: 'FEMALE' },
    { name: 'es-US-Chirp3-HD-Helena', lang: 'es-US', gender: 'FEMALE' },
    { name: 'es-US-Chirp3-HD-Isabella', lang: 'es-US', gender: 'FEMALE' },
    { name: 'es-US-Chirp3-HD-Julia', lang: 'es-US', gender: 'FEMALE' },
    { name: 'es-US-Chirp3-HD-Karina', lang: 'es-US', gender: 'FEMALE' },
    { name: 'es-US-Chirp3-HD-Laura', lang: 'es-US', gender: 'FEMALE' },
    { name: 'es-US-Chirp3-HD-Maria', lang: 'es-US', gender: 'FEMALE' },
    { name: 'es-US-Chirp3-HD-Natalia', lang: 'es-US', gender: 'FEMALE' },
    { name: 'es-US-Chirp3-HD-Olga', lang: 'es-US', gender: 'FEMALE' },
    { name: 'es-US-Chirp3-HD-Patricia', lang: 'es-US', gender: 'FEMALE' },
    { name: 'es-US-Chirp3-HD-Rosa', lang: 'es-US', gender: 'FEMALE' },
    { name: 'es-US-Chirp3-HD-Sofia', lang: 'es-US', gender: 'FEMALE' },
    { name: 'es-US-Chirp3-HD-Teresa', lang: 'es-US', gender: 'FEMALE' },
    { name: 'es-US-Chirp3-HD-Ursula', lang: 'es-US', gender: 'FEMALE' },
    { name: 'es-US-Chirp3-HD-Victoria', lang: 'es-US', gender: 'FEMALE' },
    { name: 'es-US-Chirp3-HD-Wendy', lang: 'es-US', gender: 'FEMALE' },
    { name: 'es-US-Chirp3-HD-Ximena', lang: 'es-US', gender: 'FEMALE' },
    { name: 'es-US-Chirp3-HD-Yolanda', lang: 'es-US', gender: 'FEMALE' },
    { name: 'es-US-Chirp3-HD-Zoe', lang: 'es-US', gender: 'FEMALE' }
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
    console.error('Error: GOOGLE_CLOUD_PROJECT no está definido en el archivo .env');
    process.exit(1);
}

console.log('Configurando Vertex AI con proyecto:', process.env.GOOGLE_CLOUD_PROJECT);

// Configuración de Vertex AI
let vertexai;
try {
    vertexai = new VertexAI({
        project: process.env.GOOGLE_CLOUD_PROJECT,
        location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
    });
    console.log('Vertex AI configurado correctamente');
} catch (error) {
    console.error('Error al configurar Vertex AI:', error);
    process.exit(1);
}

// Configuración de Text-to-Speech
const ttsClient = new TextToSpeechClient();
// Voz actual por defecto
let currentVoice = {
    languageCode: 'es-US',
    name: 'es-US-Chirp3-HD-Achird',
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
        
        const sock = makeWASocket.default({
            version,
            auth: state,
            logger,
            browser: ['WhatsApp Bot', 'Chrome', '1.0.0'],
            defaultQueryTimeoutMs: undefined,
            printQRInTerminal: true
        });

        let connectionStatus = 'connecting';

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            connectionStatus = connection;
            console.log('Estado de conexión:', connection);

            if (qr) {
                console.log('Generando código QR...');
                try {
                    // Generar QR en la consola
                    qrcode.generate(qr, { small: true });
                    
                    // Enviar QR a todos los clientes WebSocket
                    broadcast({ 
                        type: 'qr', 
                        qr: qr 
                    });
                    
                    console.log('Código QR enviado a los clientes');
                } catch (error) {
                    console.error('Error al generar/enviar QR:', error);
                }
            }

            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect?.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
                console.log('Conexión cerrada debido a:', lastDisconnect?.error?.output?.statusCode);
                broadcast({ type: 'disconnected' });
                
                if (shouldReconnect) {
                    console.log('Intentando reconectar...');
                    setTimeout(connectToWhatsApp, 5000);
                }
            } else if (connection === 'open') {
                console.log('¡Conexión establecida con éxito!');
                broadcast({ type: 'connected' });
            }
        });

        sock.ev.on('creds.update', saveCreds);

        // Estado temporal para usuarios esperando correo tras acceso denegado
        const pendingAccessRestore = {};

        sock.ev.on('messages.upsert', async ({ messages }) => {
            const m = messages[0];
            
            if (!m.message || m.key.fromMe) return;

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
            
            // Obtener el texto del mensaje
            let messageText = '';
            if (m.message.conversation) messageText = m.message.conversation;
            else if (m.message.extendedTextMessage?.text) messageText = m.message.extendedTextMessage.text;
            messageText = messageText.trim().toLowerCase();

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
                    
                    // Obtener respuesta de IA
                    textResponse = await getAIResponse(transcription, userConversations[senderNumber]);
                    userConversations[senderNumber].push({ tipo: 'audio', texto: transcription });
                } else if (m.message.imageMessage || m.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage) {
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
                    } else {
                        imgMsg = m.message.extendedTextMessage.contextInfo.quotedMessage.imageMessage;
                    }
                    
                    // Descargar la imagen
                    console.log('Intentando descargar imagen...');
                    const buffer = await downloadMediaMessage(
                        m,
                        'buffer',
                        {},
                        { 
                            logger,
                            reuploadRequest: sock.updateMediaMessage
                        }
                    );
                    console.log('Imagen descargada, tamaño:', buffer.length, 'bytes');
                    
                    // Analizar la imagen con Vertex AI
                    textResponse = await getAIResponseForImage(buffer, caption, userConversations[senderNumber]);
                    console.log('Respuesta generada para imagen');
                    if (ALWAYS_AUDIO) shouldUseAudio = true;
                    // Detectar si la respuesta de la IA sugiere acceso denegado y pedir correo
                    if (textResponse.toLowerCase().includes('acceso denegado') && textResponse.toLowerCase().includes('correo')) {
                        pendingAccessRestore[senderNumber] = true;
                    }
                    userConversations[senderNumber].push({ tipo: 'imagen', texto: caption, descripcion: textResponse });
                } else if (m.message.conversation || m.message.extendedTextMessage?.text) {
                    console.log('Tipo de mensaje recibido: texto');
                    const messageContent = m.message.conversation || m.message.extendedTextMessage?.text;
                    console.log('Mensaje recibido (texto):', messageContent);
                    textResponse = await getAIResponse(messageContent, userConversations[senderNumber]);
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
        });
    } catch (error) {
        console.error('Error en la conexión:', error);
        // Intentar reconectar después de un error
        setTimeout(connectToWhatsApp, 5000);
    }
}

// Modificar getAIResponse y getAIResponseForImage para incluir historial
async function getAIResponse(messageContent, history = []) {
    try {
        if (!vertexai) {
            throw new Error('Vertex AI no está configurado correctamente');
        }

        console.log('Iniciando llamada a Vertex AI para texto...');
        // Construir historial para el prompt
        let historyPrompt = '';
        if (history.length > 0) {
            historyPrompt = '\nHistorial reciente de la conversación:\n';
            history.forEach((msg, idx) => {
                if (msg.tipo === 'imagen') {
                    historyPrompt += `Imagen enviada: ${msg.texto}\nDescripción: ${msg.descripcion}\n`;
                } else {
                    historyPrompt += `${msg.tipo === 'audio' ? 'Audio transcrito' : 'Mensaje'}: ${msg.texto}\n`;
                }
            });
        }
        // Crear el modelo generativo
        const model = vertexai.preview.getGenerativeModel({
            model: "gemini-2.0-flash",
            generation_config: {
                max_output_tokens: 2048,
                temperature: 0.9,
                top_p: 1,
                top_k: 40
            }
        });
        // Crear el prompt con el contexto de la empresa y el historial
        const contextualizedPrompt = `
            ${BOT_CONTEXT.instrucciones}
            ${historyPrompt}
            \n---\n
            Información importante:
            - Empresa: ${BOT_CONTEXT.nombreEmpresa}
            - Descripción: ${BOT_CONTEXT.descripcion}
            - Horario: ${BOT_CONTEXT.horarioAtencion}
            
            Mensaje del usuario: ${messageContent}
            
            Responde de acuerdo al contexto proporcionado y las políticas de la empresa.
        `;
        // Generar contenido con el contexto
        const request = {
            contents: [{
                role: 'user',
                parts: [{ text: contextualizedPrompt }]
            }]
        };
        const response = await model.generateContent(request);
        console.log('Respuesta recibida de Vertex AI');
        const result = await response.response;
        if (!result?.candidates?.[0]?.content?.parts?.[0]?.text) {
            throw new Error('Respuesta inválida de Vertex AI');
        }
        return result.candidates[0].content.parts[0].text;
    } catch (error) {
        console.error('Error detallado de Vertex AI:', error);
        
        // Manejar específicamente errores de autenticación
        if (error.message?.includes('Unable to authenticate') || error.message?.includes('Could not load the default credentials')) {
            console.error('\n⚠️ Error de autenticación con Google Cloud. Por favor:');
            console.error('1. Verifica que las credenciales de servicio estén configuradas en Render:');
            console.error('   - Ve a la sección "Environment" en tu servicio de Render');
            console.error('   - Agrega la variable GOOGLE_APPLICATION_CREDENTIALS_JSON con el contenido del archivo JSON de credenciales');
            console.error('2. Asegúrate de que el proyecto de Google Cloud tenga habilitada la API de Vertex AI');
            console.error('3. Verifica que la cuenta de servicio tenga los permisos necesarios\n');
        }
        
        throw error;
    }
}

async function getAIResponseForImage(imageBuffer, messageText = '', history = []) {
    try {
        console.log('Iniciando llamada a Vertex AI para imagen...');
        // Construir historial para el prompt
        let historyPrompt = '';
        if (history.length > 0) {
            historyPrompt = '\nHistorial reciente de la conversación:\n';
            history.forEach((msg, idx) => {
                if (msg.tipo === 'imagen') {
                    historyPrompt += `Imagen enviada: ${msg.texto}\nDescripción: ${msg.descripcion}\n`;
                } else {
                    historyPrompt += `${msg.tipo === 'audio' ? 'Audio transcrito' : 'Mensaje'}: ${msg.texto}\n`;
                }
            });
        }
        // Crear el modelo generativo multimodal
        const model = vertexai.preview.getGenerativeModel({
            model: "gemini-2.0-flash",
            generation_config: {
                max_output_tokens: 2048,
                temperature: 0.9,
                top_p: 1,
                top_k: 40
            }
        });
        // Crear el prompt con el contexto de la empresa, el contexto de imágenes y el historial
        const contextualizedPrompt = `
            ${BOT_CONTEXT.instrucciones}
            \n---\n
            ${IMAGE_CONTEXT}
            ${historyPrompt}
            \n---\n
            Información importante:
            - Empresa: ${BOT_CONTEXT.nombreEmpresa}
            - Descripción: ${BOT_CONTEXT.descripcion}
            - Horario: ${BOT_CONTEXT.horarioAtencion}
            
            Analiza la imagen adjunta.
            ${messageText ? `Pregunta/comentario del usuario sobre la imagen: ${messageText}` : 'Describe lo que ves en la imagen y responde de acuerdo al contexto de la empresa.'}
            
            Responde de acuerdo al contexto proporcionado y las políticas de la empresa.
        `;
        // Convertir la imagen a base64
        const imageBase64 = imageBuffer.toString('base64');
        // Generar contenido con imagen y contexto
        const request = {
            contents: [{
                role: 'user',
                parts: [
                    { text: contextualizedPrompt },
                    { inline_data: { mime_type: 'image/jpeg', data: imageBase64 } }
                ]
            }]
        };
        const response = await model.generateContent(request);
        console.log('Respuesta recibida de Vertex AI para imagen');
        const result = await response.response;
        if (!result?.candidates?.[0]?.content?.parts?.[0]?.text) {
            throw new Error('Respuesta inválida de Vertex AI');
        }
        return result.candidates[0].content.parts[0].text;
    } catch (error) {
        console.error('Error detallado de Vertex AI para imagen:', error);
        throw error;
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