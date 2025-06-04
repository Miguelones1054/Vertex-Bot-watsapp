# Bot de WhatsApp con Gemini AI

Este bot utiliza la API de WhatsApp a través de Baileys y la inteligencia artificial de Google Gemini para proporcionar respuestas a mensajes de texto y analizar imágenes.

## Características

- Respuesta a mensajes de texto usando Google Gemini
- Análisis de imágenes recibidas
- Restricción de uso a números específicos
- Ignora mensajes de grupos

## Requisitos

- Node.js
- Cuenta de Google Cloud con API de Vertex AI habilitada
- Variables de entorno configuradas (ver archivo `.env`)

## Configuración

1. Clona el repositorio
2. Instala las dependencias: `npm install`
3. Crea un archivo `.env` con la siguiente estructura:
   ```
   GOOGLE_CLOUD_PROJECT=tu-proyecto-de-google-cloud
   ```
4. Configura la autenticación de Google Cloud siguiendo las [instrucciones oficiales](https://cloud.google.com/docs/authentication/application-default-credentials)
5. Ejecuta el bot: `node index.js`
6. Escanea el código QR que aparece en la consola con tu WhatsApp

## Control de Acceso (Números Permitidos)

El bot puede configurarse para responder solo a números específicos:

### Administración de Números Permitidos

Puedes gestionar fácilmente los números autorizados usando el script incluido:

```
node manage-allowed-numbers.js
```

Este script te permitirá:
- Ver la lista actual de números autorizados
- Agregar nuevos números
- Eliminar números existentes
- Vaciar la lista (permitir todos los números)

### Formato de Números

Los números deben ingresarse en formato internacional, sin el signo "+" ni espacios:
- Ejemplo: `34612345678` (España)
- Ejemplo: `521234567890` (México)
- Ejemplo: `1234567890` (Estados Unidos)

### Comportamiento del Bot

- Si la lista de números está vacía, el bot responderá a todos los números.
- Si hay al menos un número en la lista, el bot solo responderá a esos números específicos.
- Cualquier mensaje de un número no autorizado será ignorado.

## Uso

1. Envía mensajes de texto al número de WhatsApp vinculado
2. Envía imágenes para que Gemini las analice
3. El bot procesará los mensajes y responderá de acuerdo a su configuración

## Personalización

Puedes personalizar el comportamiento del bot modificando el archivo `config/bot-context.js` para ajustar las instrucciones que se envían a Gemini AI. 