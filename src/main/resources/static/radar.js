const CANVAS_ID = 'radarCanvas';
const CONTAINER_ID = 'canvasContainer';
const SWEEP_ID = 'sweepIndicator';
const TARGET_CONTAINER_ID = 'targetContainer';

const PRIMARY_COLOR = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim();
const RADAR_FILL_COLOR = getComputedStyle(document.documentElement).getPropertyValue('--color-radar-fill').trim();
const GRID_LINE_COLOR = getComputedStyle(document.documentElement).getPropertyValue('--color-grid-line').trim();

const MAX_DISTANCE = 100;
const NUM_RANGE_CIRCLES = 4;

let distanceValueEl = document.getElementById('distanceValue');
let angleValueEl = document.getElementById('angleValue');
let lastUpdateTimeEl = document.getElementById('lastUpdateTime');
const connectionStatusEl = document.getElementById('connectionStatus');
const jsonDisplayEl = document.getElementById('jsonDisplay');

let canvas, ctx;
let container;
let targetContainer;
let radarSize = 0;
let centerX = 0;
let centerY = 0;
let sweepIndicator;

let stompClient = null;
let currentTargetData = null;

let sweepAngle = 0;
const SWEEP_SPEED = 2;

function drawSweep() {
    ctx.save();
    ctx.translate(centerX, centerY);

    const rad = (180 - sweepAngle) * (Math.PI / 180);

    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, radarSize);
    grad.addColorStop(0, "rgba(0,255,0,0.25)");
    grad.addColorStop(1, "rgba(0,255,0,0)");

    ctx.fillStyle = grad;

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, radarSize, rad - 0.03, rad + 0.03);
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    sweepAngle += SWEEP_SPEED;
    if (sweepAngle >= 360) sweepAngle = 0;
}



function resizeCanvas() {
    container = document.getElementById(CONTAINER_ID);

    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    radarSize = Math.min(containerHeight, containerWidth / 2);
    if (radarSize < 50) radarSize = 50;

    canvas.width = radarSize * 2;
    canvas.height = radarSize;

    centerX = radarSize;
    centerY = radarSize;

    sweepIndicator.style.height = `${radarSize}px`;
    sweepIndicator.style.bottom = '0';
    sweepIndicator.style.left = `calc(50% - 1px)`;

    targetContainer.style.width = `${radarSize * 2}px`;
    targetContainer.style.height = `${radarSize}px`;

    drawRadarGrid();

    if (currentTargetData) {
        updateTargetDot(currentTargetData.angle, currentTargetData.distance);
    }
}

function drawRadarGrid() {
    if (!ctx || !canvas) return;

    ctx.fillStyle = RADAR_FILL_COLOR;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(centerX, centerY);

    ctx.beginPath();
    ctx.arc(0, 0, radarSize, Math.PI, 2 * Math.PI);
    ctx.lineTo(-radarSize, 0);
    ctx.closePath();
    ctx.fillStyle = RADAR_FILL_COLOR;
    ctx.fill();

    ctx.strokeStyle = PRIMARY_COLOR;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.strokeStyle = GRID_LINE_COLOR;
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);

    for (let i = 1; i <= NUM_RANGE_CIRCLES; i++) {
        const radius = (radarSize / NUM_RANGE_CIRCLES) * i;
        ctx.beginPath();
        ctx.arc(0, 0, radius, Math.PI, 2 * Math.PI);
        ctx.stroke();

        if (i > 0) {
            ctx.fillStyle = GRID_LINE_COLOR;
            ctx.font = '12px Inter';
            ctx.textAlign = 'center';
            const distanceLabel = `${(MAX_DISTANCE / NUM_RANGE_CIRCLES) * i} cm`;
            ctx.fillText(distanceLabel, 0, -radius + 15);
        }
    }

    ctx.setLineDash([]);
    ctx.strokeStyle = GRID_LINE_COLOR;
    ctx.lineWidth = 1;

    const angleMarkers = [0, 30, 60, 90, 120, 150, 180];

    angleMarkers.forEach(angle => {
        const radian = (180 - angle) * (Math.PI / 180);

        ctx.beginPath();
        ctx.moveTo(0, 0);
        const labelRadius = radarSize + 10;
        ctx.fillStyle = PRIMARY_COLOR;
        ctx.font = '14px Inter';

        ctx.fillText(
            `${angle}°`,
            labelRadius * Math.cos(radian),
            -labelRadius * Math.sin(radian)
        );
    });

    ctx.restore();
}

function updateTargetDot(angle, distance) {
    currentTargetData = { angle, distance };
    targetContainer.innerHTML = '';

    if (distance > MAX_DISTANCE || distance < 0) return;

    const pixelDistance = (distance / MAX_DISTANCE) * radarSize;
    const radian = (180 - angle) * (Math.PI / 180);

    const x = centerX + pixelDistance * Math.cos(radian);
    const y = centerY - pixelDistance * Math.sin(radian);

    const dot = document.createElement('div');
    dot.className = 'target-dot';

    // 🔥 COLOR EN FUNCIÓN DE LA DISTANCIA
    // Cerca → Rojo oscuro
    // Medio → Amarillo
    // Lejos → Verde claro
    let intensityColor = "rgb(0,255,0)"; // por defecto verde

    if (distance < 20) {
        intensityColor = "rgb(255,0,0)"; // rojo intenso
    } else if (distance < 50) {
        intensityColor = "rgb(255,165,0)"; // naranja/amarillo
    } else {
        intensityColor = "rgb(0,255,0)"; // verde
    }

    dot.style.backgroundColor = intensityColor;
    dot.style.width = "12px";
    dot.style.height = "12px";
    dot.style.borderRadius = "50%";
    dot.style.position = "absolute";

    dot.style.left = `${x}px`;
    dot.style.top = `${y}px`;

    targetContainer.appendChild(dot);

    distanceValueEl.textContent = distance.toFixed(2);
    angleValueEl.textContent = angle.toFixed(1);

    const now = new Date();
    lastUpdateTimeEl.textContent = now.toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

function animate() {
    requestAnimationFrame(animate);

    drawRadarGrid();  // siempre redibuja el radar
    drawSweep();      // efecto barrido real

    // si hay un punto real, lo volvemos a dibujar encima del radar
    if (currentTargetData) {
        updateTargetDot(currentTargetData.angle, currentTargetData.distance);
    }
}

function initRadarApp() {
    canvas = document.getElementById(CANVAS_ID);
    ctx = canvas.getContext('2d');
    sweepIndicator = document.getElementById(SWEEP_ID);
    targetContainer = document.getElementById(TARGET_CONTAINER_ID);


    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    connect();
    animate();
}

function connect() {
    connectionStatusEl.className = "flex items-center justify-center bg-yellow-400/80 text-primary-dark px-3 py-2 rounded-full text-sm font-medium";
    connectionStatusEl.innerHTML = '<div class="h-2 w-2 rounded-full bg-yellow-100 mr-2 animate-pulse"></div> Conectando...';

    const socket = new SockJS('/ws-radar');
    stompClient = Stomp.over(socket);
    stompClient.debug = null;

    stompClient.connect({}, function(frame) {

        connectionStatusEl.className = "flex items-center justify-center bg-green-400/80 text-primary-dark px-3 py-2 rounded-full text-sm font-medium";
        connectionStatusEl.innerHTML = '<div class="h-2 w-2 rounded-full bg-green-100 mr-2 animate-pulse"></div> Conectado';

        stompClient.subscribe('/topic/radar', function(message) {
            const radarData = JSON.parse(message.body);

            jsonDisplayEl.textContent = JSON.stringify(radarData, null, 2);

            if (radarData.angle !== undefined && radarData.distance !== undefined) {
                drawRadarGrid();
                updateTargetDot(radarData.angle, radarData.distance);
            }
        });

    }, function(error) {
        connectionStatusEl.className = "flex items-center justify-center bg-red-500/80 text-text-light px-3 py-2 rounded-full text-sm font-medium";
        connectionStatusEl.innerHTML = '<div class="h-2 w-2 rounded-full bg-red-100 mr-2"></div> Desconectado';

        setTimeout(connect, 3000);
    });
}

window.onload = initRadarApp;
