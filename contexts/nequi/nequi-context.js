import { join } from 'path';
import fs from 'fs';
import { generateSpeech } from '../audio/audio-utils.js';

// Estado para usuarios esperando datos de Nequi
const pendingNequiUser = {};

export async function handleNequiContext(messageText, senderNumber, connectionStatus, sock) {
    // Verificar si el usuario está en proceso de crear usuario Nequi
    if (pendingNequiUser[senderNumber]) {
        // Esperando correo y/o contraseña
        const partes = messageText.split(/[\s,;]+/);
        if (partes.length >= 2 && partes[0].includes('@')) {
            // Asumimos que el usuario envió correo y contraseña
            const correo = partes[0];
            const contrasena = partes.slice(1).join(' ');
            // Aquí podrías guardar los datos o hacer lo que necesites
            delete pendingNequiUser[senderNumber];
            
            // Generar audio de confirmación
            const audioPath = join(process.cwd(), 'audios', `nequi_listo_${Date.now()}.mp3`);
            const textoAudio = "Listo, enseguida crearé el usuario con esos datos.";
            await generateSpeech(textoAudio, audioPath);
            const audioBuffer = fs.readFileSync(audioPath);
            
            if (connectionStatus === 'open') {
                await sock.sendMessage(senderNumber, {
                    audio: audioBuffer,
                    mimetype: 'audio/mpeg',
                    ptt: true,
                    fileName: 'respuesta.mp3'
                });
                console.log('Audio de confirmación Nequi enviado con éxito');
            }
            
            try {
                fs.unlinkSync(audioPath);
            } catch (unlinkError) {
                console.error('Error al eliminar archivo temporal:', unlinkError);
            }
            return true;
        } else {
            // Faltan datos, pedir ambos
            if (connectionStatus === 'open') {
                await sock.sendMessage(senderNumber, { 
                    text: "Por favor, dime el correo y la contraseña que deseas para el usuario de prueba, separados por un espacio." 
                });
            }
            return true;
        }
    }

    // Detectar solicitud de usuario de prueba para Nequi
    if (/usuario de prueba.*nequi|prueba.*nequi|nequi.*usuario de prueba/i.test(messageText)) {
        pendingNequiUser[senderNumber] = true;
        if (connectionStatus === 'open') {
            await sock.sendMessage(senderNumber, { 
                text: "¿Qué correo y contraseña deseas para el usuario de prueba? Por favor, envíalos en un solo mensaje, separados por un espacio." 
            });
        }
        return true;
    }

    return false;
} 