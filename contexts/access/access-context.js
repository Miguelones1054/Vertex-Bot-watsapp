// Estado para usuarios esperando restauración de acceso
const pendingAccessRestore = {};

export async function handleAccessContext(messageText, senderNumber, connectionStatus, sock) {
    if (pendingAccessRestore[senderNumber]) {
        // Detectar si el mensaje es un correo electrónico
        const emailRegex = /^[\w.-]+@[\w.-]+\.[A-Za-z]{2,}$/;
        if (emailRegex.test(messageText)) {
            // Responder automáticamente
            if (connectionStatus === 'open') {
                await sock.sendMessage(senderNumber, { 
                    text: 'Vale, en unos momentos restableceré el acceso para que lo uses en otro teléfono.' 
                });
            }
            delete pendingAccessRestore[senderNumber];
            return true;
        }
    }
    return false;
}

export function setPendingAccessRestore(senderNumber) {
    pendingAccessRestore[senderNumber] = true;
} 