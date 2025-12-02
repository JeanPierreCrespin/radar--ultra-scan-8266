const radarArm = document.getElementById('radar-arm');
const objectPointsContainer = document.getElementById('object-points-container');
const displayAngle = document.getElementById('display-angle');
const displayDistance = document.getElementById('display-distance');
const displayStatus = document.getElementById('display-status');
const messageBox = document.getElementById('message-box');
const messageContent = document.getElementById('message-content');
const inputJson = document.getElementById('input-json');
const simulateButton = document.getElementById('simulate-button');
const clearButton = document.getElementById('clear-button');

const MAX_RADAR_WIDTH = 600; // Ancho del contenedor del radar en píxeles
const MAX_RANGE_CM = 200; // Máximo rango del sensor para visualización (ej. 200cm)

const COLOR_SCHEME = {
    NEAR: { background: '#ff7b7b', border: '#ff4d4d', shadow: '#ff4d4d' },  // Cercano
    MEDIUM: { background: '#ffd17b', border: '#ffc34d', shadow: '#ffc34d' },    // Medio
    FAR: { background: '#ffa07b', border: '#ff8a4d', shadow: '#ff8a4d' }    // Lejano
};

// Rangos de distancia en CM
const DISTANCE_RANGES = {
    50: 'NEAR', // 0cm a 50cm
    120: 'MEDIUM',  // 51cm a 120cm
    [MAX_RANGE_CM]: 'FAR' // 121cm a 200cm+
};

/**
 * Determina el esquema de color para un objeto basado en su distancia.
 * @param {number} distance Distancia del objeto en CM.
 * @returns {object} Objeto con propiedades background, border, y shadow.
 */
function getPointColor(distance) {
    let rangeKey = 'FAR';
    for (const limitStr in DISTANCE_RANGES) {
        const limit = parseInt(limitStr);
        if (distance <= limit) {
            rangeKey = DISTANCE_RANGES[limit];
            break;
        }
    }
    return COLOR_SCHEME[rangeKey] || COLOR_SCHEME.FAR;
}

function showMessage(message) {
    messageContent.textContent = message;
    messageBox.classList.remove('hidden');
    messageBox.style.opacity = '1';
    setTimeout(() => {
        messageBox.style.opacity = '0';
        setTimeout(() => messageBox.classList.add('hidden'), 300);
    }, 4000);
}

/**
 * Calcula la posición X, Y de un punto en el radar basada en el ángulo y la distancia.
 * @param {number} angle Ángulo del radar (0 a 180 grados).
 * @param {number} distance Distancia del objeto en CM.
 * @returns {{x: number, y: number}} Coordenadas X, Y en píxeles dentro del contenedor.
 */
function calculatePointPosition(angle, distance) {

    let radiusPixels = (distance / MAX_RANGE_CM) * (MAX_RADAR_WIDTH / 2);

    if (radiusPixels > (MAX_RADAR_WIDTH / 2)) {
        radiusPixels = MAX_RADAR_WIDTH / 2;
    }

    // 2. Convertir el ángulo del radar (0-180) a radianes cartesianos.
    // 0° radar (izquierda) -> 180° cartesianos (PI rad)
    // 180° radar (derecha) -> 0° cartesianos (0 rad)
    const radians = (180 - angle) * (Math.PI / 180);

    // Calcular coordenadas (x, y) relativas al centro del semicírculo
    const x = radiusPixels * Math.cos(radians);
    const y = radiusPixels * Math.sin(radians);

    // Trasladar al sistema de coordenadas CSS (desde el centro de la base)
    const containerCenter = MAX_RADAR_WIDTH / 2;

    const finalX = containerCenter + x;
    const finalY = y;

    return { x: finalX, y: finalY };
}


/**
 * Función principal para actualizar la visualización del radar con múltiples detecciones.
 * @param {Array<{angle: number, distance: number}>} detections - Lista de objetos detectados.
 */
function updateRadar(detections) {
    detections = [
            {"angle": 45.5, "distance": 72},
        {"angle": 105, "distance": 50}
    ]

    objectPointsContainer.innerHTML = '';

    let closestObject = null;
    let minDistance = Infinity;

    detections.forEach(detection => {
        const { angle, distance } = detection;

        if (typeof angle !== 'number' || typeof distance !== 'number' || angle < 0 || angle > 180 || distance < 0) {
            console.warn(`Detección inválida ignorada. Datos: ${JSON.stringify(detection)}`);
            return;
        }

        const displayDistance = Math.min(distance, MAX_RANGE_CM);

        const { x, y } = calculatePointPosition(angle, displayDistance);

        const colors = getPointColor(distance);

        const pointDiv = document.createElement('div');
        pointDiv.className = 'object-point detected';
        pointDiv.style.left = `${x - 6}px`;
        pointDiv.style.bottom = `${y - 6}px`;

        pointDiv.style.backgroundColor = colors.background;
        pointDiv.style.borderColor = colors.border;
        pointDiv.style.boxShadow = `0 0 10px ${colors.shadow}`;

        pointDiv.title = `Angulo: ${angle.toFixed(1)}°, Distancia: ${distance.toFixed(1)} cm`;

        objectPointsContainer.appendChild(pointDiv);

        if (distance < minDistance) {
            minDistance = distance;
            closestObject = detection;
        }
    });

    if (closestObject) {
        const angle = closestObject.angle;
        const distance = closestObject.distance;

        displayAngle.textContent = angle.toFixed(1);
        displayDistance.textContent = distance.toFixed(1);
        displayStatus.textContent = `Detectados ${detections.length} objetos (Mostrando el más cercano)`;
        displayStatus.classList.remove('text-green-700', 'bg-green-50');
        displayStatus.classList.add('text-red-700', 'bg-red-50');
    } else {
        clearDetection();
    }
}

function clearDetection() {
    radarArm.classList.add('scanning');
    objectPointsContainer.innerHTML = '';
    displayAngle.textContent = '--';
    displayDistance.textContent = '--';
    displayStatus.textContent = 'Esperando datos...';
    displayStatus.classList.remove('text-red-700', 'bg-red-50');
    displayStatus.classList.add('text-green-700', 'bg-green-50');
}


simulateButton.addEventListener('click', () => {
    try {
        const jsonText = inputJson.value.trim();

        if (!jsonText) {
            clearDetection();
            return;
        }

        const detections = JSON.parse(jsonText);

        if (!Array.isArray(detections)) {
            showMessage('Error de formato: El input debe ser un array JSON (Ej: [{}, {}]).');
            return;
        }

        updateRadar(detections);

    } catch (e) {
        console.error("Error al parsear JSON:", e);
        showMessage('Error al parsear el JSON de entrada. Asegúrate de que el formato sea un array de objetos válido.');
    }
});

clearButton.addEventListener('click', clearDetection);

window.onload = clearDetection;

// --- Implementación Conceptual de WebSocket (opcional para la API) ---
/*
function setupWebSocket() {
    const socket = new WebSocket('ws://localhost:8080/ws/radar');

    socket.onopen = () => {
        console.log('Conexión WebSocket establecida.');
        displayStatus.textContent = 'Conectado. Esperando Escaneo...';
    };

    socket.onmessage = (event) => {
        try {
            const detections = JSON.parse(event.data);
            if (Array.isArray(detections)) {
                updateRadar(detections);
            } else {
                console.warn("Dato recibido no es un array:", detections);
            }
        } catch (e) {
            console.error("Error al procesar el mensaje del WebSocket:", e);
        }
    };

    socket.onclose = () => {
        console.log('Conexión WebSocket cerrada. Reintentando en 5s...');
        displayStatus.textContent = 'Desconectado. Reintentando...';
        setTimeout(setupWebSocket, 5000);
    };

    socket.onerror = (error) => {
        console.error('Error de WebSocket:', error);
    };
}

window.onload = () => {
    clearDetection();
    // setupWebSocket();
};
*/