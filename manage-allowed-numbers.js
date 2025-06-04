import fs from 'fs';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE = join(__dirname, 'config', 'allowed-numbers.js');

// Interfaz para leer de la consola
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Función para leer la lista actual de números permitidos
function readAllowedNumbers() {
    try {
        const fileContent = fs.readFileSync(CONFIG_FILE, 'utf8');
        const match = fileContent.match(/export const ALLOWED_NUMBERS = \[([\s\S]*?)\];/);
        
        if (!match || !match[1]) {
            console.error('Error al leer el archivo de configuración. Formato incorrecto.');
            return [];
        }
        
        // Extraer números de la lista
        const numbersText = match[1].trim();
        if (!numbersText) return [];
        
        return numbersText
            .split('\n')
            .filter(line => line.includes("'") || line.includes('"'))
            .map(line => {
                const match = line.match(/['"]([^'"]+)['"]/);
                return match ? match[1].trim() : null;
            })
            .filter(Boolean);
    } catch (error) {
        console.error('Error al leer el archivo de configuración:', error.message);
        return [];
    }
}

// Función para guardar la lista actualizada
function saveAllowedNumbers(numbers) {
    try {
        // Leer el contenido actual del archivo
        const currentContent = fs.readFileSync(CONFIG_FILE, 'utf8');
        
        // Formatear la lista de números
        const formattedNumbers = numbers.map(num => `    '${num}', // Número autorizado`).join('\n');
        
        // Reemplazar la sección de números en el archivo
        const newContent = currentContent.replace(
            /export const ALLOWED_NUMBERS = \[([\s\S]*?)\];/,
            `export const ALLOWED_NUMBERS = [\n${formattedNumbers}\n];`
        );
        
        // Guardar el archivo actualizado
        fs.writeFileSync(CONFIG_FILE, newContent);
        console.log('Lista de números permitidos actualizada con éxito.');
    } catch (error) {
        console.error('Error al guardar el archivo de configuración:', error.message);
    }
}

// Función para mostrar la lista actual
function displayCurrentList(numbers) {
    console.log('\nLista actual de números permitidos:');
    if (numbers.length === 0) {
        console.log('  No hay números autorizados (todos los números pueden usar el bot)');
    } else {
        numbers.forEach((num, index) => {
            console.log(`  ${index + 1}. ${num}`);
        });
    }
}

// Menú principal
function showMenu() {
    const numbers = readAllowedNumbers();
    
    console.log('\n=== ADMINISTRADOR DE NÚMEROS PERMITIDOS ===');
    displayCurrentList(numbers);
    
    console.log('\nOpciones:');
    console.log('1. Agregar un número');
    console.log('2. Eliminar un número');
    console.log('3. Vaciar la lista (permitir todos los números)');
    console.log('4. Salir');
    
    rl.question('\nSelecciona una opción (1-4): ', (answer) => {
        switch (answer.trim()) {
            case '1':
                addNumber(numbers);
                break;
            case '2':
                removeNumber(numbers);
                break;
            case '3':
                clearList();
                break;
            case '4':
                console.log('Saliendo del programa...');
                rl.close();
                break;
            default:
                console.log('Opción no válida. Inténtalo de nuevo.');
                showMenu();
        }
    });
}

// Función para agregar un número
function addNumber(currentNumbers) {
    rl.question('\nIngresa el número a agregar (formato: código país + número, sin "+" ni espacios, ej: 34612345678): ', (newNumber) => {
        // Validar formato del número
        if (!/^\d+$/.test(newNumber.trim())) {
            console.log('Formato incorrecto. El número debe contener solo dígitos.');
            return showMenu();
        }
        
        // Verificar si ya existe
        if (currentNumbers.includes(newNumber.trim())) {
            console.log('Este número ya está en la lista.');
            return showMenu();
        }
        
        // Agregar el número
        currentNumbers.push(newNumber.trim());
        saveAllowedNumbers(currentNumbers);
        showMenu();
    });
}

// Función para eliminar un número
function removeNumber(currentNumbers) {
    if (currentNumbers.length === 0) {
        console.log('\nNo hay números en la lista para eliminar.');
        return showMenu();
    }
    
    rl.question('\nIngresa el número a eliminar (1-' + currentNumbers.length + '): ', (index) => {
        const numIndex = parseInt(index.trim()) - 1;
        
        if (isNaN(numIndex) || numIndex < 0 || numIndex >= currentNumbers.length) {
            console.log('Índice no válido. Inténtalo de nuevo.');
            return showMenu();
        }
        
        // Eliminar el número
        currentNumbers.splice(numIndex, 1);
        saveAllowedNumbers(currentNumbers);
        showMenu();
    });
}

// Función para vaciar la lista
function clearList() {
    rl.question('\n¿Estás seguro de que quieres vaciar la lista? Esto permitirá que TODOS los números usen el bot (s/n): ', (answer) => {
        if (answer.toLowerCase() === 's') {
            saveAllowedNumbers([]);
        } else {
            console.log('Operación cancelada.');
        }
        showMenu();
    });
}

// Iniciar el programa
console.log('Iniciando administrador de números permitidos...');
showMenu(); 