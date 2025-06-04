import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import fs from 'fs';

const ttsClient = new TextToSpeechClient();

export async function generateSpeech(text, outputPath) {
    try {
        // Configurar la voz Chirp3 HD
        const voice = {
            languageCode: 'es-US',
            name: 'es-US-Chirp3-HD-Achird',
            ssmlGender: 'FEMALE'
        };

        // Configurar la solicitud
        const request = {
            input: { text },
            voice: voice,
            audioConfig: {
                audioEncoding: 'LINEAR16',
                speakingRate: 1.0,
                pitch: 0,
                effectsProfileId: ['small-bluetooth-speaker-class-device']
            },
        };

        // Realizar la solicitud
        const [response] = await ttsClient.synthesizeSpeech(request);
        
        // Guardar el audio
        fs.writeFileSync(outputPath, response.audioContent);
        console.log('Audio generado con éxito:', outputPath);
        return true;
    } catch (error) {
        console.error('Error al generar audio:', error);
        
        // Manejar específicamente el error de API no habilitada
        if (error.code === 7 && error.details?.includes('API has not been used') || error.details?.includes('is disabled')) {
            console.error('\n⚠️ La API de Text-to-Speech no está habilitada. Por favor:');
            console.error('1. Ve a la consola de Google Cloud:');
            console.error('   https://console.cloud.google.com/apis/library/texttospeech.googleapis.com');
            console.error('2. Selecciona tu proyecto');
            console.error('3. Haz clic en "Habilitar"');
            console.error('4. Espera unos minutos y vuelve a intentarlo\n');
        }
        
        return false;
    }
} 