import { VertexAI } from '@google-cloud/vertexai';
import fs from 'fs';
import path from 'path';
import { CONTEXTO_VENTAS } from './config/bot-context-ventas.js';
import admin from 'firebase-admin';

// Inicializar Firebase Admin si no está inicializado
if (!admin.apps.length) {
    let serviceAccount;
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
        serviceAccount = JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    } else if (fs.existsSync('./credentials.json')) {
        serviceAccount = JSON.parse(fs.readFileSync('./credentials.json', 'utf8'));
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    } else {
        admin.initializeApp();
    }
}

const firestoreDB = admin.firestore();

// Historial de conversación por usuario (máximo 10 mensajes)
const userConversations = new Map();
const MAX_HISTORY = 10;

// Función para verificar si el bot de ventas está activo
async function isBotVentasActivo() {
    try {
        const docRef = firestoreDB.collection('bot_ventas').doc('bot_config_ventas');
        const doc = await docRef.get();
        if (!doc.exists) {
            console.log('El documento de configuración de bot_ventas no existe.');
            return false;
        }
        const data = doc.data();
        return data.bot_activo === true;
    } catch (error) {
        console.error('Error al verificar el estado de bot_ventas:', error);
        return false;
    }
}

// Configuración de Vertex AI
let vertexai;
try {
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync('./credentials.json')) {
        process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve('./credentials.json');
    }
    let projectId = process.env.GOOGLE_CLOUD_PROJECT;
    if (fs.existsSync('./credentials.json')) {
        const credContent = JSON.parse(fs.readFileSync('./credentials.json', 'utf8'));
        projectId = credContent.project_id;
        process.env.GOOGLE_CLOUD_PROJECT = projectId;
    }
    vertexai = new VertexAI({
        project: projectId,
        location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
    });
} catch (error) {
    console.error('Error al configurar Vertex AI:', error);
}

// Función para responder usando Gemini
export async function responderBotVentas(mensaje, userId = 'default') {
    // Verificar si el bot de ventas está activo
    const activo = await isBotVentasActivo();
    if (!activo) {
        console.log('El bot de ventas está inactivo. No se responderá.');
        return null;
    }
    
    if (!vertexai) {
        return 'Lo siento, la IA no está disponible en este momento.';
    }
    
    try {
        // Obtener historial del usuario
        if (!userConversations.has(userId)) {
            userConversations.set(userId, []);
        }
        const history = userConversations.get(userId);
        
        // Agregar mensaje actual al historial
        history.push({ role: "user", parts: [{ text: mensaje }] });
        
        // Mantener solo los últimos MAX_HISTORY mensajes
        if (history.length > MAX_HISTORY) {
            history.splice(0, history.length - MAX_HISTORY);
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
        
        // Crear el prompt con contexto e historial
        const systemPrompt = CONTEXTO_VENTAS.instrucciones;
        const request = {
            contents: [
                { role: "user", parts: [{ text: systemPrompt }] },
                ...history
            ]
        };
        
        const result = await generativeModel.generateContent(request);
        const response = result.response;
        
        let responseText;
        if (response && response.candidates && response.candidates[0] &&
            response.candidates[0].content && response.candidates[0].content.parts &&
            response.candidates[0].content.parts[0]) {
            responseText = response.candidates[0].content.parts[0].text;
        } else if (typeof response.text === 'function') {
            responseText = response.text();
        } else if (response.text) {
            responseText = response.text;
        } else {
            responseText = 'No se pudo obtener respuesta de Gemini.';
        }
        
        // Agregar respuesta al historial
        history.push({ role: "model", parts: [{ text: responseText }] });
        
        // Mantener solo los últimos MAX_HISTORY mensajes
        if (history.length > MAX_HISTORY) {
            history.splice(0, history.length - MAX_HISTORY);
        }
        
        return responseText;
        
    } catch (error) {
        console.error('Error en responderBotVentas:', error);
        return 'Lo siento, hubo un error al procesar tu mensaje.';
    }
} 