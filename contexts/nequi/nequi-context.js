import { join } from 'path';
import fs from 'fs';
import { generateSpeech } from '../audio/audio-utils.js';

// Estado para usuarios esperando datos de Nequi
const pendingNequiUser = {};

export async function handleNequiContext(messageText, senderNumber, connectionStatus, sock) {
    // Función vacía para manejar el contexto de Nequi
    return false;
} 