/*
  ╔══════════════════════════════════════════════════════════════╗
  ║         Smart IV Drip Monitor — ESP32 Firmware              ║
  ║  Hardware : ESP32 + HX711 + 10kg Load Cell + LCD I2C 16x2  ║
  ║  IV Bag   : 500g – 1000g (full) on a 10kg load cell         ║
  ╚══════════════════════════════════════════════════════════════╝

  Libraries (install via Arduino Library Manager):
  ┌─ "Firebase ESP32 Client"       by Mobizt        (v4.x)
  ├─ "HX711"                       by Bogdan Necula / Rob Tillaart
  ├─ "LiquidCrystal_I2C"           by Frank de Brabander
  └─ Built-in: WiFi, Wire, Arduino

  LCD WIRING (I2C):
    LCD VCC  → ESP32 5V  (or Vin — the I2C module needs 5V)
    LCD GND  → ESP32 GND
    LCD SDA  → ESP32 GPIO 21  (default I2C SDA)
    LCD SCL  → ESP32 GPIO 22  (default I2C SCL)

  ⚠️  If your display shows blocks/garbage:
      1. Run the I2C scanner sketch to find your LCD address.
         Common addresses: 0x27 or 0x3F
      2. Update LCD_I2C_ADDR below.
      3. Also adjust LCD_COLS / LCD_ROWS if you have a 20x4 display.
*/

// ═══════════════════════════════════════════════════════════════
//  INCLUDES
// ═══════════════════════════════════════════════════════════════
#include <Arduino.h>
#include <Wire.h>                   // I2C — for LCD
#include <LiquidCrystal_I2C.h>     // LCD I2C driver
#include <WiFi.h>
#include <FirebaseESP32.h>          // Mobizt
#include <addons/TokenHelper.h>
#include <addons/RTDBHelper.h>
#include <HX711.h>

// ═══════════════════════════════════════════════════════════════
//  LCD CONFIGURATION
// ═══════════════════════════════════════════════════════════════
#define LCD_I2C_ADDR  0x27    // Most common. Try 0x3F if blank screen.
#define LCD_COLS      16      // 16 for 16x2, 20 for 20x4
#define LCD_ROWS      2       // 2 for 16x2,  4 for 20x4

LiquidCrystal_I2C lcd(LCD_I2C_ADDR, LCD_COLS, LCD_ROWS);

// ═══════════════════════════════════════════════════════════════
//  WIFI & FIREBASE
// ═══════════════════════════════════════════════════════════════
#define WIFI_SSID        "aishwari's A35"
#define WIFI_PASSWORD    "Aish2wari"

#define FIREBASE_HOST    "https://smart-iv-drip-7a810-default-rtdb.firebaseio.com/"
#define FIREBASE_SECRET  "KbgWNlxjT8RDTn37JfeJDTBLOHv7KNqTXqo2jmuS"

// ═══════════════════════════════════════════════════════════════
//  HARDWARE PINS
// ═══════════════════════════════════════════════════════════════
#define HX711_DOUT_PIN   4    // HX711 DATA  → GPIO 4
#define HX711_SCK_PIN    5    // HX711 CLOCK → GPIO 5
#define BUZZER_PIN       13   // Buzzer (optional)
// GPIO 21 = SDA, GPIO 22 = SCL  (used automatically by Wire)

// ═══════════════════════════════════════════════════════════════
//  BED / WARD IDENTITY
// ═══════════════════════════════════════════════════════════════
#define BED_ID           "bed1"
#define WARD_PATH        "wards/ward1/beds"

// ═══════════════════════════════════════════════════════════════
//  IV BAG CONSTANTS
// ═══════════════════════════════════════════════════════════════
#define FULL_BOTTLE_ML     500    // ml of fluid when bag is FULL
#define FULL_BOTTLE_GRAMS  650    // WEIGH your full bag+tube+spike. ~600-700g typical
#define EMPTY_BAG_GRAMS    150    // WEIGH your empty bag+tube+spike. ~100-200g typical
#define LOW_THRESHOLD_ML   100
                               // ⚠️  Weigh YOUR empty bag and update this

// ═══════════════════════════════════════════════════════════════
//  TIMING
// ═══════════════════════════════════════════════════════════════
#define SEND_INTERVAL_MS  2000  // push to Firebase every 5 s
#define LCD_REFRESH_MS    1000  // refresh LCD every 1 s
#define READINGS_AVG      10    // HX711 averaged readings per sample

// ═══════════════════════════════════════════════════════════════
//  CALIBRATION
// ═══════════════════════════════════════════════════════════════
#define CALIBRATION_MODE    false   // set true to find your factor
#define CALIBRATION_FACTOR  160.59f  // replace after calibration

// ═══════════════════════════════════════════════════════════════
//  CUSTOM LCD CHARACTERS
// ═══════════════════════════════════════════════════════════════
// Drip drop icon shown on LCD (5x8 pixel custom char)
byte dropIcon[8] = {
  0b00100,
  0b00100,
  0b01110,
  0b01110,
  0b11111,
  0b11111,
  0b01110,
  0b00000
};

// Progress bar block (filled)
byte barFull[8] = {
  0b11111,
  0b11111,
  0b11111,
  0b11111,
  0b11111,
  0b11111,
  0b11111,
  0b11111
};

// Alert bell icon
byte bellIcon[8] = {
  0b00100,
  0b01110,
  0b01110,
  0b01110,
  0b11111,
  0b00000,
  0b00100,
  0b00000
};

// ═══════════════════════════════════════════════════════════════
//  GLOBALS
// ═══════════════════════════════════════════════════════════════
FirebaseData   fbData;
FirebaseAuth   fbAuth;
FirebaseConfig fbConfig;
HX711          scale;

bool          lastIsLow       = false;
int           lastMl          = -1;
unsigned long lastSendTime    = 0;
unsigned long lastLcdTime     = 0;
bool          wifiConnected   = false;
bool          firebaseReady   = false;

// ═══════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════

int gramsToMl(float rawGrams) {
  // Subtract the empty bag weight to get fluid-only grams
  float fluidGrams = rawGrams - EMPTY_BAG_GRAMS;
  
  // Clamp to 0..FULL_BOTTLE_GRAMS (not FULL_BOTTLE_ML!)
  fluidGrams = constrain(fluidGrams, 0.0f, (float)(FULL_BOTTLE_GRAMS - EMPTY_BAG_GRAMS));
  
  // Map fluid grams → ml (linear scale, 1g ≈ 1ml for saline)
  int ml = (int)map((long)fluidGrams, 0, (FULL_BOTTLE_GRAMS - EMPTY_BAG_GRAMS), 0, FULL_BOTTLE_ML);
  return constrain(ml, 0, FULL_BOTTLE_ML);
}

float readNetGrams() {
  float raw = scale.get_units(READINGS_AVG);
  return (raw < 0) ? 0 : raw;  // just return raw scale reading
}

void buzz(int freqHz, int durationMs) {
  tone(BUZZER_PIN, freqHz, durationMs);
  delay(durationMs + 50);
}

// ─── LCD HELPERS ─────────────────────────────────────────────────

// Print a string padded/truncated to exactly `width` chars
// so it always overwrites the previous content on that line
void lcdPrint(int col, int row, const char* text, int width) {
  lcd.setCursor(col, row);
  int len = strlen(text);
  for (int i = 0; i < width; i++) {
    lcd.print(i < len ? text[i] : ' ');
  }
}

// Draw a simple progress bar on row 1, cols 0–15
// barLength = 0–16 filled blocks
void lcdProgressBar(int filledBlocks) {
  lcd.setCursor(0, 1);
  for (int i = 0; i < LCD_COLS; i++) {
    if (i < filledBlocks) {
      lcd.write(1);          // custom char slot 1 = barFull
    } else {
      lcd.print('-');
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  LCD SCREEN STATES
// ═══════════════════════════════════════════════════════════════

void lcdShowBoot() {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(" IV Drip Monitor");
  lcd.setCursor(0, 1);
  lcd.print("  Starting up...");
}

void lcdShowWifiConnecting() {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Connecting WiFi ");
  lcd.setCursor(0, 1);
  lcd.print("                ");
}

void lcdShowWifiDot(int dot) {
  // Animates dots across row 1 while connecting
  lcd.setCursor(dot % LCD_COLS, 1);
  lcd.print(".");
}

void lcdShowWifiConnected(const String& ip) {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("WiFi Connected! ");
  lcd.setCursor(0, 1);
  // Show last 16 chars of IP (fits 16x2)
  String ipShort = ip.length() > 16 ? ip.substring(ip.length() - 16) : ip;
  lcdPrint(0, 1, ipShort.c_str(), LCD_COLS);
  delay(1500);
}

void lcdShowFirebaseInit() {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Firebase...     ");
  lcd.setCursor(0, 1);
  lcd.print("Connecting DB   ");
}

void lcdShowCalibrationMode() {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("CALIBRATION MODE");
  lcd.setCursor(0, 1);
  lcd.print("See Serial Mon. ");
}

// ─── MAIN DISPLAY — called every LCD_REFRESH_MS ─────────────────
void lcdUpdateMain(int ml, bool isLow, bool fbOk) {
  // ── Row 0: drop icon + "Bed1" + weight + status ──────────────
  // Example: [drop]Bed1  420ml OK
  //          [drop]Bed1   85ml LOW!

  char row0[17];   // 16 chars + null
  // Build status tag
  const char* statusTag = isLow ? "LOW! " : "OK   ";

  // Bed label — strip "bed" prefix and capitalise: "bed1" → "B1"
  String bedLabel = "B";
  bedLabel += String(BED_ID).substring(3);   // "bed1" → "1"

  // Format: "B1  420ml OK  " or "B1   85ml LOW!"
  snprintf(row0, sizeof(row0), "%s %3dml %s",
           bedLabel.c_str(), ml, statusTag);

  lcd.setCursor(0, 0);
  lcd.write(0);              // custom char slot 0 = drip drop
  lcdPrint(1, 0, row0, LCD_COLS - 1);

  // ── Row 1: progress bar (0–16 blocks) ────────────────────────
  // Scale 0–500 ml → 0–16 blocks
  int filled = map(constrain(ml, 0, FULL_BOTTLE_ML), 0, FULL_BOTTLE_ML, 0, LCD_COLS);
  filled = constrain(filled, 0, LCD_COLS);
  lcdProgressBar(filled);

  // ── Overwrite last 2 chars of row 1 with Firebase status ─────
  // Small indicator: "F+" = Firebase ok, "F?" = error
  lcd.setCursor(LCD_COLS - 2, 1);
  lcd.print(fbOk ? "F+" : "F?");
}

void lcdShowAlert(int ml) {
  // Flashing alert screen — called once on NORMAL→LOW transition
  for (int i = 0; i < 3; i++) {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.write(2);            // bell icon
    lcd.print(" IV BAG LOW!  ");
    lcd.setCursor(0, 1);
    char row1[17];
    snprintf(row1, sizeof(row1), "  Only %3d ml!  ", ml);
    lcd.print(row1);
    delay(500);
    lcd.noBacklight();
    delay(200);
    lcd.backlight();
  }
}

void lcdShowError(const char* line1, const char* line2) {
  lcd.clear();
  lcdPrint(0, 0, line1, LCD_COLS);
  lcdPrint(0, 1, line2, LCD_COLS);
}

// ═══════════════════════════════════════════════════════════════
//  SETUP
// ═══════════════════════════════════════════════════════════════
void setup() {
  Serial.begin(115200);
  delay(600);
  Serial.println("\n========================================");
  Serial.println("  Smart IV Drip Monitor — Starting up");
  Serial.println("========================================");

  // ── Buzzer pin ──────────────────────────────────────────────
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);

  // ── LCD init ────────────────────────────────────────────────
  Wire.begin(21, 22);          // SDA=21, SCL=22 (ESP32 defaults)
  lcd.init();
  lcd.backlight();

  // Register custom characters
  lcd.createChar(0, dropIcon);    // slot 0 = drop
  lcd.createChar(1, barFull);     // slot 1 = filled bar block
  lcd.createChar(2, bellIcon);    // slot 2 = bell

  lcdShowBoot();
  Serial.println("LCD initialised.");
  delay(1200);

  // ── HX711 ───────────────────────────────────────────────────
  scale.begin(HX711_DOUT_PIN, HX711_SCK_PIN);

  lcd.clear();
  lcd.setCursor(0, 0); lcd.print("Load Cell...    ");
  lcd.setCursor(0, 1); lcd.print("Waiting HX711   ");
  Serial.print("Waiting for HX711");

  while (!scale.is_ready()) {
    Serial.print(".");
    delay(200);
  }
  Serial.println("\nHX711 ready.");

  scale.set_scale(CALIBRATION_FACTOR);

  lcd.clear();
  lcd.setCursor(0, 0); lcd.print("Remove weight!  ");
  lcd.setCursor(0, 1); lcd.print("Taring in 3s... ");
  Serial.println("Taring scale — remove all weight...");
  delay(2000);
  scale.tare();
  Serial.println("Tare complete.");

  lcd.clear();
  lcd.setCursor(0, 0); lcd.print("Tare done.      ");
  lcd.setCursor(0, 1); lcd.print("Scale zeroed.   ");
  delay(800);

  // ── Calibration mode ────────────────────────────────────────
  if (CALIBRATION_MODE) {
    lcdShowCalibrationMode();
    Serial.println("\n*** CALIBRATION MODE ***");
    Serial.println("Place known weight. Reading every 2s.");
    Serial.println("CALIBRATION_FACTOR = Raw counts / known grams\n");
    while (true) {
      if (scale.is_ready()) {
        scale.set_scale();
        long rawCount = scale.read_average(10);
        scale.set_scale(CALIBRATION_FACTOR);
        float withFactor = scale.get_units(10);
        Serial.printf("Raw: %ld  |  With factor (%.1f): %.2f g\n",
                      rawCount, CALIBRATION_FACTOR, withFactor);

        // Show raw and converted value on LCD
        char l0[17], l1[17];
        snprintf(l0, sizeof(l0), "Raw: %ld", rawCount);
        snprintf(l1, sizeof(l1), "Calc: %.1f g    ", withFactor);
        lcdPrint(0, 0, l0, LCD_COLS);
        lcdPrint(0, 1, l1, LCD_COLS);
      }
      delay(2000);
    }
  }

  // ── WiFi ────────────────────────────────────────────────────
  lcdShowWifiConnecting();
  Serial.printf("Connecting to WiFi: %s", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int wifiRetry = 0;
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    lcdShowWifiDot(wifiRetry);
    wifiRetry++;
    if (wifiRetry > 30) {
      Serial.println("\nWiFi timeout — restarting...");
      lcdShowError("WiFi Failed!    ", "Restarting...   ");
      delay(2000);
      ESP.restart();
    }
  }
  wifiConnected = true;
  String ip = WiFi.localIP().toString();
  Serial.printf("\nWiFi connected. IP: %s\n", ip.c_str());
  lcdShowWifiConnected(ip);

  // ── Firebase ────────────────────────────────────────────────
  lcdShowFirebaseInit();
  fbConfig.host                       = FIREBASE_HOST;
  fbConfig.signer.tokens.legacy_token = FIREBASE_SECRET;
  fbConfig.token_status_callback      = tokenStatusCallback;

  Firebase.begin(&fbConfig, &fbAuth);
  Firebase.reconnectWiFi(true);
  fbData.setResponseSize(4096);
  firebaseReady = true;

  Serial.println("Firebase initialised.");
  Serial.printf("Pushing to: %s/%s\n\n", WARD_PATH, BED_ID);

  lcd.clear();
  lcd.setCursor(0, 0); lcd.print("Firebase Ready! ");
  lcd.setCursor(0, 1); lcd.print("Monitoring...   ");
  delay(1000);

  // Startup beep
  buzz(1000, 150);

  // Clear for main display
  lcd.clear();
}

// ═══════════════════════════════════════════════════════════════
//  LOOP
// ═══════════════════════════════════════════════════════════════
void loop() {
  unsigned long now = millis();

  // ── Read + send to Firebase every SEND_INTERVAL_MS ──────────
  bool fbOk = firebaseReady;   // tracks last Firebase result

  if (now - lastSendTime >= SEND_INTERVAL_MS) {
    lastSendTime = now;

    if (!scale.is_ready()) {
      Serial.println("[WARN] Scale not ready — skipping.");
      lcdShowError("Scale Error!    ", "Check HX711 wiring");
      return;
    }

    float netGrams = readNetGrams();
    int   ml       = gramsToMl(netGrams);
    bool  isLow    = (ml < LOW_THRESHOLD_ML);

    Serial.printf("[SENSOR] Net fluid: %.1f g → %d ml | %s\n",
                  netGrams, ml, isLow ? "LOW" : "NORMAL");

    // ── Alert on NORMAL → LOW transition ────────────────────
    if (isLow && !lastIsLow) {
      Serial.println("[ALERT] IV bag low!");
      lcdShowAlert(ml);         // flashing alert screen
      buzz(1000, 400);
      delay(100);
      buzz(1200, 300);
      delay(100);
      buzz(1000, 400);
      lcd.clear();              // clear for main display after alert
    }
    lastIsLow = isLow;
    lastMl    = ml;

    // ── Push to Firebase ────────────────────────────────────
    fbOk = sendToFirebase(ml, isLow);
  }

  // ── Refresh LCD every LCD_REFRESH_MS ─────────────────────────
  if (now - lastLcdTime >= LCD_REFRESH_MS && lastMl >= 0) {
    lastLcdTime = now;
    lcdUpdateMain(lastMl, lastIsLow, fbOk);
  }
}

// ═══════════════════════════════════════════════════════════════
//  FIREBASE SEND  — returns true on success
// ═══════════════════════════════════════════════════════════════
bool sendToFirebase(int ml, bool isLow) {
  String basePath = String(WARD_PATH) + "/" + BED_ID;
  unsigned long ts = millis() / 1000;

  FirebaseJson payload;
  payload.set("weight",     ml);
  payload.set("capacity",   FULL_BOTTLE_ML);
  payload.set("status",     isLow ? "LOW" : "NORMAL");
  payload.set("lastUpdate", (int)ts);

  if (Firebase.updateNode(fbData, basePath, payload)) {
    Serial.printf("[FIREBASE] OK — %d ml (%s)\n", ml, isLow ? "LOW" : "NORMAL");
    return true;
  } else {
    Serial.printf("[FIREBASE] ERROR — %s\n", fbData.errorReason().c_str());
    return false;
  }
}

/*
  ═══════════════════════════════════════════════════════════════
   LCD DISPLAY LAYOUT  (16x2)
  ═══════════════════════════════════════════════════════════════

  Normal state (>= 100 ml):
  ┌────────────────┐
  │≈B1  420ml OK   │   ≈ = drip drop icon
  │████████----F+  │   progress bar, F+ = Firebase OK
  └────────────────┘

  Low state (< 100 ml):
  ┌────────────────┐
  │≈B1   85ml LOW! │
  │██--------------F?│
  └────────────────┘

  Alert flash (NORMAL → LOW transition, 3 flashes):
  ┌────────────────┐
  │🔔 IV BAG LOW!  │
  │   Only  85 ml! │
  └────────────────┘

  WiFi connecting:
  ┌────────────────┐
  │Connecting WiFi │
  │....            │   dots animate
  └────────────────┘

  Calibration mode:
  ┌────────────────┐
  │Raw: 209876     │
  │Calc: 499.7 g   │
  └────────────────┘

  ═══════════════════════════════════════════════════════════════
   LCD I2C ADDRESS SCANNER (run this if display is blank)
  ═══════════════════════════════════════════════════════════════

  Paste this into a separate sketch and upload:

  #include <Wire.h>
  void setup() {
    Serial.begin(115200);
    Wire.begin(21, 22);
    Serial.println("Scanning I2C...");
    for (byte addr = 1; addr < 127; addr++) {
      Wire.beginTransmission(addr);
      if (Wire.endTransmission() == 0) {
        Serial.printf("Found device at 0x%02X\n", addr);
      }
    }
    Serial.println("Done.");
  }
  void loop() {}

  ═══════════════════════════════════════════════════════════════
   WIRING REFERENCE
  ═══════════════════════════════════════════════════════════════

  Load Cell → HX711:
    Red   → E+   Black → E-   White → A+   Green → A-

  HX711 → ESP32:
    VCC → 3.3V   GND → GND   DT → GPIO 4   SCK → GPIO 5

  LCD (I2C module) → ESP32:
    VCC → 5V (or Vin)
    GND → GND
    SDA → GPIO 21
    SCL → GPIO 22

  Buzzer:
    +  → GPIO 13    - → GND

  NOTE: No LEDs needed — the LCD replaces all LED indicators.
*/