import fs from 'fs';
import path from 'path';

const AUTH_FOLDER = './auth';

console.log('🧹 Limpiando carpeta de autenticación...');

try {
    if (fs.existsSync(AUTH_FOLDER)) {
        const files = fs.readdirSync(AUTH_FOLDER);
        
        for (const file of files) {
            const filePath = path.join(AUTH_FOLDER, file);
            fs.unlinkSync(filePath);
            console.log(`🗑️  Eliminado: ${file}`);
        }
        
        console.log(`✅ Se eliminaron ${files.length} archivos de autenticación`);
        console.log('🔄 Ahora puedes reiniciar el bot para forzar una nueva autenticación');
    } else {
        console.log('📁 La carpeta auth no existe, se creará automáticamente');
    }
} catch (error) {
    console.error('❌ Error al limpiar la carpeta de autenticación:', error);
} 