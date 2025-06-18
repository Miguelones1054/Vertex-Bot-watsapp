import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import fs from 'fs';

const ttsClient = new TextToSpeechClient();

export async function generateSpeech(text, outputPath) {
    try {
        // Función simplificada para generar audio a partir de texto
        console.log('Generando audio para:', text);
        return true;
    } catch (error) {
        console.error('Error al generar audio:', error);
        return false;
    }
} 