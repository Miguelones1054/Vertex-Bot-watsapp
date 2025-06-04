/**
 * Lista de números permitidos para usar el bot
 * Formato: número de teléfono con código de país, sin '+' ni espacios
 * Ejemplo: 34612345678 (España)
 */

export const ALLOWED_NUMBERS = [

];

// Función para verificar si un número está en la lista de permitidos
export function isNumberAllowed(phoneNumber) {
    // Si la lista está vacía, permitir todos los números (desactivar restricción)
    if (ALLOWED_NUMBERS.length === 0) {
        return true;
    }
    
    // Limpiar el número de teléfono (quitar '@s.whatsapp.net' si existe)
    const cleanNumber = phoneNumber.replace('@s.whatsapp.net', '');
    
    // Verificar si el número está en la lista de permitidos
    return ALLOWED_NUMBERS.includes(cleanNumber);
} 