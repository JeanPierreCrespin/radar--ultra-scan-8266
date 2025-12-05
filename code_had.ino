#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <Servo.h>

// ---------------------
// CONFIG WIFI
// ---------------------
const char* ssid = "USER WIFI";
const char* password = "PASSWORD";

// ---------------------
// CONFIG API
// ---------------------
const char* apiUrl = "http://IP_LOCAL:8080/radar";
const int maxRetries = 2;
const int requestTimeout = 3000; // ms

// ---------------------
// SERVO
// ---------------------
Servo radarServo;
const int servoPin = 2;  // GPIO2 = D4 en NodeMCU
const int minAngle = 0;
const int maxAngle = 180;
const int sweepDelay = 30; // ms entre pasos

// ---------------------
// SENSOR HC-SR04
// ---------------------
const int trigPin = 12;  // GPIO12 = D6 en NodeMCU
const int echoPin = 13;  // GPIO13 = D7 en NodeMCU
const long maxDistance = 400; // cm
const int numReadings = 3; // promedio de lecturas

// ---------------------
// VARIABLES DE ESTADO
// ---------------------
unsigned long lastReconnect = 0;
const unsigned long reconnectInterval = 30000; // 30 seg
int failedRequests = 0;
const int maxFailedRequests = 10;
unsigned long messageId = 0; // Contador único para cada mensaje

// Medir distancia con promedio para mayor precisión
long getDistance() {
  long totalDistance = 0;
  int validReadings = 0;

  for (int i = 0; i < numReadings; i++) {
    digitalWrite(trigPin, LOW);
    delayMicroseconds(2);

    digitalWrite(trigPin, HIGH);
    delayMicroseconds(10);
    digitalWrite(trigPin, LOW);

    long duration = pulseIn(echoPin, HIGH, 30000); // timeout 30ms

    if (duration > 0) {
      long distance = duration * 0.034 / 2;

      // Filtrar lecturas inválidas
      if (distance > 2 && distance < maxDistance) {
        totalDistance += distance;
        validReadings++;
      }
    }

    if (i < numReadings - 1) delay(10);
  }

  // Retornar promedio o 0 si no hay lecturas válidas
  return validReadings > 0 ? totalDistance / validReadings : 0;
}

// Reconectar WiFi si es necesario
void checkWiFiConnection() {
  if (WiFi.status() != WL_CONNECTED) {
    unsigned long now = millis();

    if (now - lastReconnect > reconnectInterval) {
      Serial.println("Reconectando WiFi...");
      WiFi.disconnect();
      WiFi.begin(ssid, password);
      lastReconnect = now;

      int attempts = 0;
      while (WiFi.status() != WL_CONNECTED && attempts < 20) {
        delay(500);
        Serial.print(".");
        attempts++;
      }

      if (WiFi.status() == WL_CONNECTED) {
        Serial.println("\n✓ WiFi reconectado");
        Serial.print("IP: ");
        Serial.println(WiFi.localIP());
        failedRequests = 0;
      } else {
        Serial.println("\n✗ Fallo al reconectar");
      }
    }
  }
}

// Enviar datos a la API con reintentos
bool sendToAPI(int angle, long distance) {
  checkWiFiConnection();

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("✗ Sin WiFi, saltando envío");
    return false;
  }

  WiFiClient client;
  HTTPClient http;

  http.setTimeout(requestTimeout);
  http.begin(client, apiUrl);
  http.addHeader("Content-Type", "application/json");

  // Incrementar ID único
  messageId++;

  // Crear JSON con ID único, timestamp y MAC del ESP8266
  String macAddress = WiFi.macAddress();
  unsigned long timestamp = millis();

  String json = "{\"id\":" + String(messageId) +
                ",\"angle\":" + String(angle) +
                ",\"distance\":" + String(distance) +
                ",\"timestamp\":" + String(timestamp) +
                ",\"device\":\"" + macAddress + "\"}";

  int httpCode = http.POST(json);
  bool success = false;

  if (httpCode > 0) {
    if (httpCode == HTTP_CODE_OK || httpCode == HTTP_CODE_CREATED) {
      Serial.printf("✓ ID:%lu %3d° → %3ld cm [%d]\n", messageId, angle, distance, httpCode);
      success = true;
      failedRequests = 0;
    } else {
      Serial.printf("⚠ ID:%lu %3d° → %3ld cm [%d]\n", messageId, angle, distance, httpCode);
      failedRequests++;
    }
  } else {
    Serial.printf("✗ ID:%lu %3d° → %3ld cm [Error: %s]\n",
                  messageId, angle, distance, http.errorToString(httpCode).c_str());
    failedRequests++;
  }

  http.end();

  // Si hay muchos fallos, reiniciar conexión
  if (failedRequests >= maxFailedRequests) {
    Serial.println("⚠ Demasiados fallos, forzando reconexión...");
    WiFi.disconnect();
    failedRequests = 0;
  }

  return success;
}

void setup() {
  Serial.begin(115200);
  Serial.println("\n\n=== RADAR ESP8266 ===\n");

  // Configurar pines
  radarServo.attach(servoPin);
  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);

  // Posición inicial del servo
  radarServo.write(90);
  delay(500);

  // Conexión WiFi
  Serial.printf("Conectando a: %s\n", ssid);
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 40) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✓ WiFi conectado");
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());
    Serial.printf("API: %s\n\n", apiUrl);
  } else {
    Serial.println("\n✗ Error de conexión WiFi");
    Serial.println("Continuando sin conectividad...\n");
  }

  delay(1000);
  Serial.println("Iniciando barrido...\n");
}

void loop() {
  // Barrido de 0° a 180°
  for (int angle = minAngle; angle <= maxAngle; angle++) {
    radarServo.write(angle);
    delay(sweepDelay);

    long distance = getDistance();
    sendToAPI(angle, distance);

    yield(); // Permite al ESP8266 manejar WiFi
  }

  // Barrido de 180° a 0°
  for (int angle = maxAngle; angle >= minAngle; angle--) {
    radarServo.write(angle);
    delay(sweepDelay);

    long distance = getDistance();
    sendToAPI(angle, distance);

    yield();
  }
  delay(3000);
}