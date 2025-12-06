const CANVAS_ID = 'radarCanvas';
const CONTAINER_ID = 'canvasContainer';
const TARGET_CONTAINER_ID = 'targetContainer';

// ============================================
// PALETA DE COLORES RADAR PROFESIONAL
// ============================================
const PRIMARY_COLOR = '#2EC4D6'; // Líneas principales (arcos)
const RADAR_FILL_COLOR = '#060B10'; // Fondo principal del radar
const GRID_LINE_COLOR = 'rgba(26, 127, 142, 0.6)'; // Líneas secundarias y grilla (50-70% opacidad)
const DASHED_LINE_COLOR = 'rgba(19, 76, 87, 0.35)'; // Líneas punteadas (30-40% opacidad)
const SWEEP_MAIN_COLOR = '#3FFFD2'; // Barra de barrido - color principal
const SWEEP_GLOW_COLOR = '#1BD8C4'; // Barra de barrido - glow/borde
const ECHO_STRONG_COLOR = '#9AFF00'; // Eco fuerte
const ECHO_MEDIUM_COLOR = '#6AFF3D'; // Eco medio
const ECHO_WEAK_COLOR = 'rgba(154, 255, 0, 0.3)'; // Eco débil
const TEXT_PRIMARY_COLOR = '#CDEFF5'; // Texto principal
const TEXT_SECONDARY_COLOR = '#6FB6C1'; // Texto secundario / grados
const TEXT_TERTIARY_COLOR = '#4A7F88'; // Labels de menor relevancia

const MAX_DISTANCE = 100;
const NUM_RANGE_CIRCLES = 4;

let distanceValueEl = document.getElementById('distanceValue');
let angleValueEl = document.getElementById('angleValue');
let lastUpdateTimeEl = document.getElementById('lastUpdateTime');
const connectionStatusEl = document.getElementById('connectionStatus');
const jsonDisplayEl = document.getElementById('jsonDisplay');

// Función auxiliar para actualizar elementos de forma segura
function safeUpdateElement(element, value) {
    if (element) {
        element.textContent = value;
    }
}

let canvas, ctx;
let container;
let targetContainer;
let radarSize = 0;
let centerX = 0;
let centerY = 0;
let paddingSides = 55; // Padding lateral (accesible globalmente)
let paddingBottom = 5; // Padding inferior (accesible globalmente)

let stompClient = null;

// ============================================
// SISTEMA DE DETECCIONES Y PUNTOS
// ============================================
let pendingDetections = []; // Detecciones pendientes (no reveladas aún)
let revealedPoints = []; // Puntos revelados con timestamps para desvanecimiento
const TARGET_LIFETIME = 3000; // 3 segundos de vida total
const FADE_DURATION = 2000; // 2 segundos de desvanecimiento
const SWEEP_TOLERANCE = 3; // ±3° de tolerancia para revelar detecciones
const DOT_SIZE = 12;
const DOT_RADIUS = DOT_SIZE / 2;

// ============================================
// SISTEMA DE BARRIDO IDA Y VUELTA SINCRONIZADO CON SERVO
// ============================================
// Cálculo basado en código Arduino:
// - sweepDelay = 30ms por paso
// - 180 pasos = 180 * 30ms = 5400ms = 5.4 segundos para barrido completo
// - Velocidad: 180° / 5.4s = 33.33 grados/segundo
// - A 60 FPS: 33.33 / 60 = 0.555 grados por frame
let sweepAngle = 0;
let sweepDirection = 1; // 1 = hacia 180° (izquierda), -1 = hacia 0° (derecha)
const SWEEP_SPEED = 0.555; // Velocidad sincronizada con servo real (grados por frame a 60 FPS)
const SWEEP_MIN_ANGLE = 0; // Ángulo mínimo (derecha)
const SWEEP_MAX_ANGLE = 180; // Ángulo máximo (izquierda)

// Sistema de sincronización con datos del servo
let lastReceivedAngle = null;
let lastReceivedTime = null;
let isSynchronized = false;
const SYNC_THRESHOLD = 5; // Grados de diferencia para considerar sincronizado
const SERVO_PAUSE_DELAY = 3000; // Pausa de 3 segundos al final de cada ciclo (del Arduino)
let isInPause = false;
let pauseStartTime = null;

// ============================================
// FUNCIÓN: DIBUJAR BARRIDO DEL RADAR
// ============================================
function drawSweep() {
    ctx.save();
    ctx.translate(centerX, centerY);

    // ============================================
    // CONVERSIÓN CORRECTA DE ÁNGULO RADAR → CANVAS
    // ============================================
    // El semicírculo visible va de Math.PI (izquierda) a 2*Math.PI (derecha)
    // Mapear ángulos del radar (0°=derecha, 180°=izquierda) al rango del semicírculo
    // 0° radar → 2π canvas (derecha)
    // 180° radar → π canvas (izquierda)
    const canvasAngle = 2 * Math.PI - (sweepAngle * Math.PI / 180);

    // Crear clipping path para el semicírculo (solo dibujar dentro del área visible)
    ctx.beginPath();
    ctx.arc(0, 0, radarSize, Math.PI, 2 * Math.PI);
    ctx.lineTo(-radarSize, 0);
    ctx.lineTo(radarSize, 0);
    ctx.closePath();
    ctx.clip();

    // Gradiente radial para el efecto de barrido profesional
    // Color principal: #3FFFD2, Glow: #1BD8C4
    // Desde rgba(63,255,210,0.35) en el centro hasta rgba(63,255,210,0) en el borde
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, radarSize);
    grad.addColorStop(0, "rgba(63, 255, 210, 0.35)"); // Máxima intensidad en el origen
    grad.addColorStop(0.15, "rgba(63, 255, 210, 0.28)");
    grad.addColorStop(0.3, "rgba(63, 255, 210, 0.2)");
    grad.addColorStop(0.5, "rgba(63, 255, 210, 0.12)");
    grad.addColorStop(0.7, "rgba(63, 255, 210, 0.06)");
    grad.addColorStop(0.85, "rgba(63, 255, 210, 0.03)");
    grad.addColorStop(1, "rgba(63, 255, 210, 0)"); // Transparencia total en la punta
    ctx.fillStyle = grad;
    
    // Agregar glow/borde con el color secundario
    ctx.shadowBlur = 15;
    ctx.shadowColor = SWEEP_GLOW_COLOR;

    // Dibujar el sweep como un arco dentro del semicírculo visible
    const sweepWidth = 0.08; // Ancho del barrido en radianes (un poco más ancho para mejor visibilidad)
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, radarSize, canvasAngle - sweepWidth, canvasAngle + sweepWidth);
    ctx.closePath();
    ctx.fill();
    
    // Restaurar shadow
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';

    ctx.restore();

    // ============================================
    // ACTUALIZAR ÁNGULO DEL BARRIDO (IDA Y VUELTA 0° ↔ 180°)
    // ============================================
    const currentTime = Date.now();
    const TIME_WITHOUT_DATA = 2000; // 2 segundos sin datos = modo autónomo
    
    // Si el servo está en pausa, mantener el barrido en su posición
    if (isInPause && pauseStartTime !== null) {
        const pauseDuration = currentTime - pauseStartTime;
        // Si la pausa ha terminado (más de 3 segundos), preparar para reiniciar
        if (pauseDuration > SERVO_PAUSE_DELAY) {
            isInPause = false;
            pauseStartTime = null;
            // El servo reiniciará, así que el barrido también
        }
        // Durante la pausa, no mover el barrido
        return;
    }
    
    // Si no hay datos recientes, mover el barrido de forma autónoma
    if (lastReceivedTime === null || (currentTime - lastReceivedTime) > TIME_WITHOUT_DATA) {
        // Modo autónomo: continuar el barrido
        sweepAngle += SWEEP_SPEED * sweepDirection;
        
        // Invertir dirección en los extremos (ida y vuelta)
        if (sweepAngle >= SWEEP_MAX_ANGLE) {
            sweepAngle = SWEEP_MAX_ANGLE;
            sweepDirection = -1; // Cambiar a dirección hacia 0° (derecha)
        } else if (sweepAngle <= SWEEP_MIN_ANGLE) {
            sweepAngle = SWEEP_MIN_ANGLE;
            sweepDirection = 1; // Cambiar a dirección hacia 180° (izquierda)
        }
        
        isSynchronized = false; // Perder sincronización si no hay datos
    }
    // Si hay datos recientes y no está en pausa, el ángulo se actualiza cuando llegan datos del WebSocket
    // (la actualización se hace en la función de suscripción del WebSocket)
}

function resizeCanvas() {
    container = document.getElementById(CONTAINER_ID);

    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    // Calcular tamaño del radar (semicírculo: ancho = 2 * radio)
    // Dejar espacio para las etiquetas de ángulos
    const paddingTop = 50; // Espacio arriba para etiquetas superiores
    paddingSides = 55; // Espacio lateral para etiquetas 0° y 180° (variable global)
    paddingBottom = 0; // NO hay espacio abajo - el radar está pegado al borde inferior
    
    // Calcular el tamaño del radar considerando el espacio necesario
    const maxCanvasWidth = containerWidth;
    const maxCanvasHeight = containerHeight;
    
    // Calcular radarSize: el ancho del radar será radarSize*2 + paddingSides*2
    const maxRadarWidth = (maxCanvasWidth - paddingSides * 2) / 2;
    // Altura disponible: altura total menos padding superior (no hay padding inferior)
    const maxRadarHeight = maxCanvasHeight - paddingTop;
    
    radarSize = Math.min(maxRadarHeight, maxRadarWidth);
    if (radarSize < 50) radarSize = 50;

    // Canvas: ancho = radarSize*2 + padding lateral, alto = radarSize + padding superior
    // NO hay padding inferior - el radar está pegado al borde
    const canvasWidth = Math.min(radarSize * 2 + paddingSides * 2, containerWidth);
    const canvasHeight = radarSize + paddingTop; // Sin padding inferior
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    // ============================================
    // POSICIONAR EL ORIGEN EN LA PARTE INFERIOR CENTRAL
    // ============================================
    // El centro del radar está en el punto central de la parte inferior del canvas
    // centerX = width / 2 (centro horizontal)
    // centerY = height (parte inferior - sin padding)
    centerX = canvasWidth / 2;
    centerY = canvasHeight; // Exactamente en el borde inferior

    // Centrar el canvas en el contenedor - pegado al borde inferior
    canvas.style.position = 'absolute';
    canvas.style.left = '50%';
    canvas.style.top = 'auto';
    canvas.style.transform = 'translateX(-50%)';
    canvas.style.bottom = '0';
    canvas.style.zIndex = '1';
    canvas.style.maxWidth = '100%';

    // targetContainer cubre exactamente el área del semicírculo
    // Se posiciona para que su borde inferior coincida con el borde inferior del canvas
    targetContainer.style.width = `${radarSize * 2}px`;
    targetContainer.style.height = `${radarSize}px`;
    targetContainer.style.position = 'absolute';
    targetContainer.style.left = '50%';
    targetContainer.style.transform = 'translateX(-50%)';
    targetContainer.style.bottom = '0'; // Pegado al borde inferior
    targetContainer.style.zIndex = '2';
    targetContainer.style.pointerEvents = 'none';
    // CRÍTICO: Ocultar cualquier punto que se dibuje fuera del área visible
    targetContainer.style.overflow = 'hidden';

    drawRadarGrid();
}

function drawRadarGrid() {
    if (!ctx || !canvas) return;

    ctx.fillStyle = RADAR_FILL_COLOR;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(centerX, centerY);

    // Base horizontal recta del radar (línea base)
    // Extender bien para asegurar que las esquinas sean completamente visibles
    ctx.strokeStyle = PRIMARY_COLOR;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-radarSize - 8, 0);
    ctx.lineTo(radarSize + 8, 0);
    ctx.stroke();

    // Semicírculo perfecto desde la base
    ctx.beginPath();
    ctx.arc(0, 0, radarSize, Math.PI, 2 * Math.PI);
    ctx.closePath();
    ctx.fillStyle = RADAR_FILL_COLOR;
    ctx.fill();

    // Círculos de rango (líneas principales - arcos)
    ctx.strokeStyle = PRIMARY_COLOR; // #2EC4D6
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 1; // Líneas principales sin opacidad

    for (let i = 1; i <= NUM_RANGE_CIRCLES; i++) {
        const radius = (radarSize / NUM_RANGE_CIRCLES) * i;
        ctx.beginPath();
        ctx.arc(0, 0, radius, Math.PI, 2 * Math.PI);
        ctx.stroke();
    }

    ctx.globalAlpha = 1;

    // Líneas guía cada 20° (diagonales más visibles)
    ctx.setLineDash([3, 3]); // Líneas punteadas más visibles
    ctx.strokeStyle = GRID_LINE_COLOR; // #1A7F8E con 60% opacidad - más visible
    ctx.lineWidth = 0.8; // Aumentar grosor para mayor visibilidad
    ctx.globalAlpha = 1; // La opacidad ya está en el color

    const guideAngles = [];
    for (let i = 0; i <= 180; i += 20) {
        guideAngles.push(i);
    }

    guideAngles.forEach(angle => {
        const radian = angle * (Math.PI / 180); // 0° = derecha, 180° = izquierda
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(radarSize * Math.cos(radian), -radarSize * Math.sin(radian));
        ctx.stroke();
    });

    // ============================================
    // ETIQUETAS DE DISTANCIA EN CM EN LAS INTERSECCIONES
    // ============================================
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.fillStyle = TEXT_TERTIARY_COLOR; // #4A7F88 - Labels de menor relevancia
    ctx.font = '9px Inter';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Dibujar etiquetas de distancia en las intersecciones de líneas guía con círculos de rango
    guideAngles.forEach(angle => {
        const radian = angle * (Math.PI / 180);
        
        // Para cada círculo de rango, agregar etiqueta de distancia
        for (let i = 1; i <= NUM_RANGE_CIRCLES; i++) {
            const radius = (radarSize / NUM_RANGE_CIRCLES) * i;
            const distanceCm = (radius / radarSize) * MAX_DISTANCE;
            
            // Calcular posición de la intersección
            const intersectionX = radius * Math.cos(radian);
            const intersectionY = -radius * Math.sin(radian);
            
            // Distribuir etiquetas de forma inteligente:
            // - En ángulos 20°, 60°, 100°, 140°: mostrar en círculos 1, 3
            // - En ángulos 40°, 80°, 120°, 160°: mostrar en círculos 2, 4
            // - Evitar 0° y 180° para no superponer con etiquetas de ángulo
            let shouldShow = false;
            if (angle !== 0 && angle !== 180) {
                if ((angle === 20 || angle === 60 || angle === 100 || angle === 140) && (i === 1 || i === 3)) {
                    shouldShow = true;
                } else if ((angle === 40 || angle === 80 || angle === 120 || angle === 160) && (i === 2 || i === 4)) {
                    shouldShow = true;
                }
            }
            
            if (shouldShow) {
                // Offset perpendicular a la línea para que la etiqueta no esté exactamente en la línea
                const labelOffset = 10;
                const perpAngle = radian + Math.PI / 2; // Ángulo perpendicular
                const labelX = intersectionX + labelOffset * Math.cos(perpAngle);
                const labelY = intersectionY - labelOffset * Math.sin(perpAngle);
                
                // Verificar que la etiqueta esté dentro del semicírculo visible
                if (labelY < 0) { // Solo arriba de la línea base
                    ctx.fillText(`${Math.round(distanceCm)}cm`, labelX, labelY);
                }
            }
        }
    });

    // Etiquetas de ángulos cada 20°
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = PRIMARY_COLOR;
    ctx.lineWidth = 1;
    ctx.fillStyle = TEXT_SECONDARY_COLOR; // #6FB6C1 - Texto secundario / grados
    ctx.font = 'bold 13px Inter';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const angleMarkers = [0, 20, 40, 60, 80, 100, 120, 140, 160, 180];

    angleMarkers.forEach(angle => {
        const radian = angle * (Math.PI / 180); // 0° = derecha, 180° = izquierda
        let labelRadius = radarSize + 20; // Radio base para etiquetas
        let x, y;
        
        // Ajustar posición especial para etiquetas en los extremos (0° y 180°)
        if (angle === 0) {
            // Etiqueta 0° a la derecha - posicionar bien dentro del padding
            labelRadius = radarSize + 30;
            x = labelRadius * Math.cos(radian);
            y = -labelRadius * Math.sin(radian);
            // Ajustar hacia abajo para mejor visibilidad en la esquina
            y += 3;
        } else if (angle === 180) {
            // Etiqueta 180° a la izquierda - posicionar bien dentro del padding
            labelRadius = radarSize + 30;
            x = labelRadius * Math.cos(radian);
            y = -labelRadius * Math.sin(radian);
            // Ajustar hacia abajo para mejor visibilidad en la esquina
            y += 3;
        } else {
            // Etiquetas intermedias
            x = labelRadius * Math.cos(radian);
            y = -labelRadius * Math.sin(radian);
        }

        ctx.fillText(`${angle}°`, x, y);
    });

    ctx.restore();
}

// ============================================
// FUNCIÓN: PROCESAR DETECCIONES PENDIENTES Y REVELAR PUNTOS
// ============================================
function processPendingDetections() {
    const now = Date.now();
    const MAX_PENDING_AGE = 10000; // 10 segundos máximo para detecciones pendientes
    
    // Limpiar detecciones pendientes muy antiguas
    pendingDetections = pendingDetections.filter(detection => {
        const age = now - detection.receivedTime;
        return age < MAX_PENDING_AGE;
    });
    
    // Verificar qué detecciones pendientes están dentro de la ventana del barrido (±3°)
    const sweepMin = sweepAngle - SWEEP_TOLERANCE;
    const sweepMax = sweepAngle + SWEEP_TOLERANCE;
    
    // Filtrar y revelar detecciones dentro de la ventana
    const toReveal = [];
    pendingDetections = pendingDetections.filter(detection => {
        // Normalizar ángulo para comparación (0° a 180°)
        let normalizedAngle = detection.angle;
        if (normalizedAngle < 0) normalizedAngle = 0;
        if (normalizedAngle > 180) normalizedAngle = 180;
        
        // Verificar si está dentro de la ventana del barrido
        // Manejar el caso cuando el barrido está cerca de 0° o 180° (wrap-around)
        let isInWindow = false;
        
        if (sweepMin < 0) {
            // Barrido cerca de 0°: ventana se extiende hacia valores negativos
            isInWindow = (normalizedAngle >= 0 && normalizedAngle <= sweepMax) || 
                        (normalizedAngle >= (180 + sweepMin) && normalizedAngle <= 180);
        } else if (sweepMax > 180) {
            // Barrido cerca de 180°: ventana se extiende más allá de 180°
            isInWindow = (normalizedAngle >= sweepMin && normalizedAngle <= 180) ||
                        (normalizedAngle >= 0 && normalizedAngle <= (sweepMax - 180));
        } else {
            // Ventana normal dentro del rango
            isInWindow = normalizedAngle >= sweepMin && normalizedAngle <= sweepMax;
        }
        
        if (isInWindow) {
            // Revelar esta detección
            toReveal.push({
                angle: normalizedAngle,
                distance: detection.distance,
                revealTime: now
            });
            return false; // Remover de pendientes
        }
        
        return true; // Mantener en pendientes
    });
    
    // Agregar puntos revelados
    toReveal.forEach(point => {
        revealedPoints.push({
            angle: point.angle,
            distance: point.distance,
            revealTime: point.revealTime,
            timestamp: now // Timestamp para calcular desvanecimiento
        });
    });
}

// ============================================
// FUNCIÓN: DIBUJAR PUNTOS REVELADOS CON DESVANECIMIENTO
// ============================================
function drawRevealedPoints() {
    const now = Date.now();
    
    // Limpiar el contenedor
    targetContainer.innerHTML = '';
    
    // Filtrar puntos que han expirado
    revealedPoints = revealedPoints.filter(point => {
        const age = now - point.timestamp;
        return age < TARGET_LIFETIME;
    });
    
    // Dibujar cada punto revelado
    revealedPoints.forEach(point => {
        const age = now - point.timestamp;
        const fadeProgress = Math.min(age / FADE_DURATION, 1); // 0 = recién revelado, 1 = completamente desvanecido
        
        // ============================================
        // NORMALIZAR Y VALIDAR DATOS
        // ============================================
        let normalizedAngle = point.angle;
        if (normalizedAngle < 0) normalizedAngle = 0;
        if (normalizedAngle > 180) normalizedAngle = 180;
        
        // Filtrar ángulos en la línea base
        if (normalizedAngle === 0 || normalizedAngle === 180) {
            return;
        }
        
        let normalizedDistance = Math.max(0, point.distance);
        normalizedDistance = Math.min(normalizedDistance, MAX_DISTANCE);
        
        if (normalizedDistance <= 0) {
            return;
        }
        
        // ============================================
        // CONVERTIR A PÍXELES Y COORDENADAS
        // ============================================
        let pixelDistance = (normalizedDistance / MAX_DISTANCE) * radarSize;
        pixelDistance = Math.max(0, Math.min(pixelDistance, radarSize));
        
        if (pixelDistance <= 0) {
            return;
        }
        
        const radian = normalizedAngle * (Math.PI / 180);
        const containerCenterX = radarSize;
        const containerCenterY = radarSize;
        
        // Conversión polar → cartesiano
        let relativeX = pixelDistance * Math.cos(radian);
        let relativeY = -pixelDistance * Math.sin(radian);
        
        // ============================================
        // CLAMPEAR Y VALIDAR COORDENADAS
        // ============================================
        const minYPermitido = -(radarSize - DOT_RADIUS - 2);
        const maxYPermitido = -DOT_RADIUS - 2;
        
        if (relativeY >= 0) {
            relativeY = minYPermitido;
        } else {
            relativeY = Math.max(relativeY, minYPermitido);
        }
        relativeY = Math.min(relativeY, maxYPermitido);
        
        // Validar distancia desde el centro
        const distanceFromCenter = Math.sqrt(relativeX * relativeX + relativeY * relativeY);
        if (distanceFromCenter > radarSize) {
            const scale = radarSize / distanceFromCenter;
            relativeX *= scale;
            relativeY *= scale;
            if (relativeY >= 0) {
                relativeY = minYPermitido;
            }
        }
        
        // Convertir a coordenadas absolutas
        let containerX = containerCenterX + relativeX;
        let containerY = containerCenterY + relativeY;
        
        // Clampear coordenadas finales
        const minX = DOT_RADIUS;
        const maxX = radarSize * 2 - DOT_RADIUS;
        const minY = DOT_RADIUS;
        const maxY = radarSize - DOT_RADIUS - 2;
        
        containerX = Math.max(minX, Math.min(containerX, maxX));
        containerY = Math.max(minY, Math.min(containerY, maxY));
        
        const baseLineY = radarSize;
        if (containerY + DOT_RADIUS >= baseLineY - 1) {
            containerY = baseLineY - DOT_RADIUS - 2;
        }
        
        // ============================================
        // CREAR Y DIBUJAR EL PUNTO CON DESVANECIMIENTO
        // ============================================
        const dot = document.createElement('div');
        
        // Calcular opacidad basada en el desvanecimiento
        const baseOpacity = 1 - fadeProgress; // De 1.0 a 0.0
        const pingIntensity = age < 200 ? 1.5 : 1.0; // Efecto "ping" inicial (primeros 200ms)
        
        // Color según cercanía usando paleta de ecos profesional
        // Eco fuerte: #9AFF00, Eco medio: #6AFF3D, Eco débil: rgba(154,255,0,0.3)
        let color;
        let shadowColor;
        if (normalizedDistance < 20) {
            // Eco fuerte - muy cerca
            const r = 154, g = 255, b = 0; // #9AFF00
            color = `rgba(${r}, ${g}, ${b}, ${baseOpacity * pingIntensity})`;
            shadowColor = `rgba(${r}, ${g}, ${b}, ${baseOpacity * 0.8})`;
        } else if (normalizedDistance < 50) {
            // Eco medio
            const r = 106, g = 255, b = 61; // #6AFF3D
            color = `rgba(${r}, ${g}, ${b}, ${baseOpacity * pingIntensity})`;
            shadowColor = `rgba(${r}, ${g}, ${b}, ${baseOpacity * 0.7})`;
        } else {
            // Eco débil - lejos
            const r = 154, g = 255, b = 0; // #9AFF00 base pero con opacidad reducida
            color = `rgba(${r}, ${g}, ${b}, ${baseOpacity * 0.3 * pingIntensity})`;
            shadowColor = `rgba(${r}, ${g}, ${b}, ${baseOpacity * 0.2})`;
        }
        
        dot.style.backgroundColor = color;
        dot.style.width = `${DOT_SIZE}px`;
        dot.style.height = `${DOT_SIZE}px`;
        dot.style.borderRadius = "50%";
        dot.style.position = "absolute";
        dot.style.transform = "translate(-50%, -50%)";
        dot.style.zIndex = "10";
        
        // Efecto "ping" inicial: sombra más intensa con glow profesional
        const shadowIntensity = age < 200 ? 1.5 : 1.0;
        const shadowBlur = age < 200 ? 8 : 5;
        dot.style.boxShadow = `0 0 ${shadowBlur * shadowIntensity}px ${shadowColor}`;
        
        dot.style.left = `${containerX}px`;
        dot.style.top = `${containerY}px`;
        
        targetContainer.appendChild(dot);
    });
}

// ============================================
// FUNCIÓN: ACTUALIZAR DETECCIONES (GUARDAR COMO PENDIENTES)
// ============================================
function updateTargetDot(angle, distance) {
    // Validar que los elementos necesarios existan
    if (!targetContainer || radarSize === 0 || centerX === 0 || centerY === 0) {
        console.warn('Radar no inicializado correctamente');
        return;
    }

    // ============================================
    // GUARDAR DETECCIÓN COMO PENDIENTE (NO DIBUJAR INMEDIATAMENTE)
    // ============================================
    // Normalizar y validar datos
    let normalizedAngle = angle;
    if (normalizedAngle < 0) normalizedAngle = 0;
    if (normalizedAngle > 180) normalizedAngle = 180;
    
    let normalizedDistance = Math.max(0, distance);
    normalizedDistance = Math.min(normalizedDistance, MAX_DISTANCE);
    
    // Solo agregar si los datos son válidos
    if (normalizedDistance > 0 && normalizedAngle !== 0 && normalizedAngle !== 180) {
        pendingDetections.push({
            angle: normalizedAngle,
            distance: normalizedDistance,
            receivedTime: Date.now()
        });
    }

    // Actualizar información de forma segura
    safeUpdateElement(distanceValueEl, distance.toFixed(2));
    safeUpdateElement(angleValueEl, angle.toFixed(1));
    safeUpdateElement(lastUpdateTimeEl, new Date().toLocaleTimeString('es-ES'));
}

// ============================================
// FUNCIÓN: LOOP DE ANIMACIÓN PRINCIPAL
// ============================================
function animate() {
    requestAnimationFrame(animate);
    
    // 1. Dibujar el grid del radar (fondo estático)
    drawRadarGrid();
    
    // 2. Procesar detecciones pendientes y revelar puntos cuando el barrido pasa
    processPendingDetections();
    
    // 3. Dibujar el barrido del radar
    drawSweep();
    
    // 4. Dibujar puntos revelados con desvanecimiento
    drawRevealedPoints();
}

function connect() {
    connectionStatusEl.textContent = "Conectando...";
    // Estado conectando: color alerta
    connectionStatusEl.style.backgroundColor = '#F87171';
    connectionStatusEl.style.color = '#060B10';
    const statusDot = connectionStatusEl.querySelector('div');
    if (statusDot) statusDot.style.backgroundColor = '#F87171';

    const socket = new SockJS('/ws-radar');
    stompClient = Stomp.over(socket);
    stompClient.debug = null;

    stompClient.connect({}, function(frame) {

        connectionStatusEl.textContent = "Conectado";
        // Estado conectado: color activo
        connectionStatusEl.style.backgroundColor = '#4ADE80';
        connectionStatusEl.style.color = '#060B10';
        if (statusDot) statusDot.style.backgroundColor = '#4ADE80';

        stompClient.subscribe('/topic/radar', function(message) {
            try {
                const radarData = JSON.parse(message.body);

                safeUpdateElement(jsonDisplayEl, JSON.stringify(radarData, null, 2));

                if (radarData.angle !== undefined && radarData.distance !== undefined) {
                    // ============================================
                    // SINCRONIZACIÓN CON EL SERVO REAL
                    // ============================================
                    const currentTime = Date.now();
                    const receivedAngle = radarData.angle;
                    
                    // Detectar dirección del movimiento del servo y pausas
                    if (lastReceivedAngle !== null) {
                        const angleDiff = receivedAngle - lastReceivedAngle;
                        const timeDiff = currentTime - lastReceivedTime;
                        
                        // Detectar si el servo está en pausa (mismo ángulo por mucho tiempo)
                        if (Math.abs(angleDiff) < 1 && timeDiff > 2000) {
                            // El servo está en pausa (probablemente en 0° o 180° esperando 3 segundos)
                            if (!isInPause) {
                                isInPause = true;
                                pauseStartTime = currentTime;
                            }
                        } else {
                            // El servo se está moviendo
                            isInPause = false;
                            pauseStartTime = null;
                            
                            // Si la diferencia es significativa, actualizar dirección
                            if (Math.abs(angleDiff) > 2) {
                                if (angleDiff > 0) {
                                    sweepDirection = 1; // Moviéndose hacia 180°
                                } else {
                                    sweepDirection = -1; // Moviéndose hacia 0°
                                }
                            }
                            
                            // Sincronizar el ángulo del barrido con el ángulo real del servo
                            const angleDifference = Math.abs(sweepAngle - receivedAngle);
                            if (angleDifference > SYNC_THRESHOLD || !isSynchronized) {
                                // Sincronizar inmediatamente si hay mucha diferencia
                                sweepAngle = receivedAngle;
                                isSynchronized = true;
                            } else {
                                // Ajuste suave para mantener sincronización
                                const syncFactor = 0.1; // Factor de suavizado
                                sweepAngle = sweepAngle * (1 - syncFactor) + receivedAngle * syncFactor;
                            }
                        }
                    } else {
                        // Primera recepción: sincronizar inmediatamente
                        sweepAngle = receivedAngle;
                        isSynchronized = true;
                    }
                    
                    lastReceivedAngle = receivedAngle;
                    lastReceivedTime = currentTime;
                    
                    // Procesar la detección
                    updateTargetDot(radarData.angle, radarData.distance);
                }
            } catch (error) {
                console.error('Error al procesar mensaje WebSocket:', error);
                safeUpdateElement(jsonDisplayEl, 'Error: ' + error.message);
            }
        });

    }, function(error) {
        connectionStatusEl.textContent = "Desconectado";
        // Estado desconectado: color alerta
        connectionStatusEl.style.backgroundColor = '#F87171';
        connectionStatusEl.style.color = '#060B10';
        const statusDot = connectionStatusEl.querySelector('div');
        if (statusDot) statusDot.style.backgroundColor = '#F87171';
        setTimeout(connect, 3000);
    });
}

function initRadarApp() {
    canvas = document.getElementById(CANVAS_ID);
    ctx = canvas.getContext('2d');
    targetContainer = document.getElementById(TARGET_CONTAINER_ID);

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    connect();
    animate();
}

window.onload = initRadarApp;

