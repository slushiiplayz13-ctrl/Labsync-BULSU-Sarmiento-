#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <ArduinoJson.h>
#include <Preferences.h>

// Persistent Queue Structure & Limits (declared before function prototypes)
const int MAX_PERSISTENT_ALERTS = 12;
const int MAX_OVERFLOW_ALERTS = 4;
struct PersistentAlertItem {
  char room[8];
  char alertType[32];
  char eventId[32];
};

void dispatchSecurityAlertAsync(const char* room, const char* alertType, const char* eventId = NULL);

// ==============================================================
// LabSync IoT Key Dock Firmware - High Performance & Multi-Slot
// Bulacan State University – Sarmiento Campus
// Architecture: Fully Decoupled Dual-Core (Core 1: Sensor/UI, Core 0: Network)
// ==============================================================

// Global LCD placeholder (auto-detected I2C address)
LiquidCrystal_I2C lcd(0x27, 16, 2);
bool lcdDetected = false;
SemaphoreHandle_t i2cMutex = NULL;
SemaphoreHandle_t nvsMutex = NULL;

// Wi-Fi Credentials
const char* ssid = "BLK 26 LT POGI - 2.4Ghz";
const char* password = "POOHLIEPOGI";

// Device Secrets & Authentication (local-only credentials)
#if __has_include("secrets.h")
  #include "secrets.h"
#else
  #include "secrets.example.h"
#endif

// Server Configuration
const char* serverUrl = "https://labsync-bulsu-sarmiento-production.up.railway.app/api/occupancy/log";
const char* heartbeatUrl = "https://labsync-bulsu-sarmiento-production.up.railway.app/api/occupancy/heartbeat";
const char* defaultScanRoom = "203"; 

// Device Authentication Credential (loaded from secrets header)
const char* deviceToken = IOT_DEVICE_TOKEN;

// ==============================================================
// 74HC4051 8-Channel Analog Multiplexer Hardware Configuration
// ==============================================================
#define MUX_SIG_PIN 34 // Common Z pin connected to ESP32 ADC1 (GPIO34, input-only)
#define MUX_S0_PIN  26 // Channel address select bit 0 (S0)
#define MUX_S1_PIN  27 // Channel address select bit 1 (S1)
#define MUX_S2_PIN  14 // Channel address select bit 2 (S2)

// Multiplexer Channel Assignments:
// Channel 0 (Y0): Room 201 (220 Ohm Key)
// Channel 1 (Y1): Room 202 (1k Ohm Key)
// Channel 2 (Y2): Room 203 (10k Ohm Key: ~1850-2050 ADC)
// Channel 3 (Y3): Room 204 (2.2k Ohm Key: ~738 ADC / 0 Ohm legacy)
// Channel 4 (Y4): Room 205 (3.3k Ohm Key)
// Channel 5 (Y5): Room 206 (4.7k Ohm Key)
// Channel 6 (Y6): Room 303 (6.8k Ohm Key)
// Channel 7 (Y7): Room 304 (20k Ohm Key)
#define MUX_CH_201 0
#define MUX_CH_202 1
#define MUX_CH_203 2
#define MUX_CH_204 3
#define MUX_CH_205 4
#define MUX_CH_206 5
#define MUX_CH_303 6
#define MUX_CH_304 7

// Legacy pin aliases mapped to multiplexer channels for backwards compatibility
#define KEY_PIN_203 MUX_CH_203
#define KEY_PIN_204 MUX_CH_204

enum KeyType {
  KEY_NONE = 0,   // Empty Slot (> 2900 ADC)
  KEY_204  = 1,   // Room 204 Key: 2.2k Ohm (550-900 ADC) or 0 Ohm wire (<40 ADC)
  KEY_203  = 2,   // Room 203 Key: 10k Ohm Resistor Key (1850-2250 ADC)
  KEY_201  = 3,   // Room 201 Key: 220 Ohm Resistor Key (40-190 ADC)
  KEY_202  = 4,   // Room 202 Key: 1k Ohm Resistor Key (260-500 ADC)
  KEY_205  = 5,   // Room 205 Key: 3.3k Ohm Resistor Key (930-1150 ADC)
  KEY_206  = 6,   // Room 206 Key: 4.7k Ohm Resistor Key (1180-1480 ADC)
  KEY_303  = 7,   // Room 303 Key: 6.8k Ohm Resistor Key (1520-1800 ADC)
  KEY_304  = 8    // Room 304 Key: 20k Ohm Resistor Key (2500-2850 ADC)
};

// Slot States for all 8 rooms
KeyType lastSlotState201 = KEY_NONE;
KeyType lastSlotState202 = KEY_NONE;
KeyType lastSlotState203 = KEY_NONE;
KeyType lastSlotState204 = KEY_NONE;
KeyType lastSlotState205 = KEY_NONE;
KeyType lastSlotState206 = KEY_NONE;
KeyType lastSlotState303 = KEY_NONE;
KeyType lastSlotState304 = KEY_NONE;

// Unauthorized & Wrong Key Status Flags (Tracked per slot so each room reports independently)
bool isUnauthorized201 = false;
bool isUnauthorized202 = false;
bool isUnauthorized203 = false;
bool isUnauthorized204 = false;
bool isUnauthorized205 = false;
bool isUnauthorized206 = false;
bool isUnauthorized303 = false;
bool isUnauthorized304 = false;

bool isWrongKey201 = false;
bool isWrongKey202 = false;
bool isWrongKey203 = false;
bool isWrongKey204 = false;
bool isWrongKey205 = false;
bool isWrongKey206 = false;
bool isWrongKey303 = false;
bool isWrongKey304 = false;

// Maximum audible duration for security alarm (30 seconds)
const unsigned long SECURITY_ALARM_MAX_DURATION_MS = 30000;

// Per-slot audible alarm start timestamps (0 = inactive / stopped)
unsigned long unauthorizedAlarmStarted201 = 0;
unsigned long unauthorizedAlarmStarted202 = 0;
unsigned long unauthorizedAlarmStarted203 = 0;
unsigned long unauthorizedAlarmStarted204 = 0;
unsigned long unauthorizedAlarmStarted205 = 0;
unsigned long unauthorizedAlarmStarted206 = 0;
unsigned long unauthorizedAlarmStarted303 = 0;
unsigned long unauthorizedAlarmStarted304 = 0;

unsigned long wrongKeyAlarmStarted201 = 0;
unsigned long wrongKeyAlarmStarted202 = 0;
unsigned long wrongKeyAlarmStarted203 = 0;
unsigned long wrongKeyAlarmStarted204 = 0;
unsigned long wrongKeyAlarmStarted205 = 0;
unsigned long wrongKeyAlarmStarted206 = 0;
unsigned long wrongKeyAlarmStarted303 = 0;
unsigned long wrongKeyAlarmStarted304 = 0;

// Thread-safe NVS mutex helpers & persistence routines
bool takeNvsMutex(TickType_t timeout = pdMS_TO_TICKS(200)) {
  if (nvsMutex == NULL) return true;
  return (xSemaphoreTake(nvsMutex, timeout) == pdTRUE);
}

void giveNvsMutex() {
  if (nvsMutex != NULL) {
    xSemaphoreGive(nvsMutex);
  }
}

void persistIncidentState(const char* room, bool isUnauth, bool isWrong) {
  if (!takeNvsMutex()) return;
  Preferences prefs;
  if (prefs.begin("labsync_sec", false)) {
    if (strcmp(room, "203") == 0) {
      prefs.putBool("unauth203", isUnauth);
      prefs.putBool("wrong203", isWrong);
    } else if (strcmp(room, "204") == 0) {
      prefs.putBool("unauth204", isUnauth);
      prefs.putBool("wrong204", isWrong);
    } else {
      char keyU[16], keyW[16];
      snprintf(keyU, sizeof(keyU), "unauth%s", room);
      snprintf(keyW, sizeof(keyW), "wrong%s", room);
      prefs.putBool(keyU, isUnauth);
      prefs.putBool(keyW, isWrong);
    }
    prefs.end();
  }
  giveNvsMutex();
}

// Bounded persistent FIFO queue tracking
volatile uint32_t nvsQueueOverflowCount = 0;

void updateSummaryKeysInPrefs(Preferences& prefs) {
  int count = prefs.getInt("pQ_cnt", 0);
  if (count < 0) count = 0;
  if (count > MAX_PERSISTENT_ALERTS) count = MAX_PERSISTENT_ALERTS;

  bool hasU203 = false, hasW203 = false;
  char evtU203[32] = "", evtW203[32] = "";

  bool hasU204 = false, hasW204 = false;
  char evtU204[32] = "", evtW204[32] = "";

  for (int i = 0; i < count; i++) {
    char kr[16], kt[16], ke[16];
    snprintf(kr, sizeof(kr), "pQ_r_%d", i);
    snprintf(kt, sizeof(kt), "pQ_t_%d", i);
    snprintf(ke, sizeof(ke), "pQ_e_%d", i);

    String r = prefs.getString(kr, "");
    String t = prefs.getString(kt, "");
    String e = prefs.getString(ke, "");

    if (r == "203") {
      if (t == "Unauthorized Removal" && !hasU203) {
        hasU203 = true;
        strncpy(evtU203, e.c_str(), sizeof(evtU203) - 1);
        evtU203[sizeof(evtU203) - 1] = '\0';
      } else if (t == "Wrong Key Slot" && !hasW203) {
        hasW203 = true;
        strncpy(evtW203, e.c_str(), sizeof(evtW203) - 1);
        evtW203[sizeof(evtW203) - 1] = '\0';
      }
    } else if (r == "204") {
      if (t == "Unauthorized Removal" && !hasU204) {
        hasU204 = true;
        strncpy(evtU204, e.c_str(), sizeof(evtU204) - 1);
        evtU204[sizeof(evtU204) - 1] = '\0';
      } else if (t == "Wrong Key Slot" && !hasW204) {
        hasW204 = true;
        strncpy(evtW204, e.c_str(), sizeof(evtW204) - 1);
        evtW204[sizeof(evtW204) - 1] = '\0';
      }
    }
  }

  // If any room/incident summary key is not set, check staged overflow buffer
  int ovfCount = prefs.getInt("pQ_ovf_cnt", 0);
  if (ovfCount < 0) ovfCount = 0;
  if (ovfCount > MAX_OVERFLOW_ALERTS) ovfCount = MAX_OVERFLOW_ALERTS;

  for (int i = 0; i < ovfCount && (!hasU203 || !hasW203 || !hasU204 || !hasW204); i++) {
    char kor[16], kot[16], koe[16];
    snprintf(kor, sizeof(kor), "pQ_or_%d", i);
    snprintf(kot, sizeof(kot), "pQ_ot_%d", i);
    snprintf(koe, sizeof(koe), "pQ_oe_%d", i);

    String r = prefs.getString(kor, "");
    String t = prefs.getString(kot, "");
    String e = prefs.getString(koe, "");

    if (r == "203") {
      if (t == "Unauthorized Removal" && !hasU203) {
        hasU203 = true;
        strncpy(evtU203, e.c_str(), sizeof(evtU203) - 1);
        evtU203[sizeof(evtU203) - 1] = '\0';
      } else if (t == "Wrong Key Slot" && !hasW203) {
        hasW203 = true;
        strncpy(evtW203, e.c_str(), sizeof(evtW203) - 1);
        evtW203[sizeof(evtW203) - 1] = '\0';
      }
    } else if (r == "204") {
      if (t == "Unauthorized Removal" && !hasU204) {
        hasU204 = true;
        strncpy(evtU204, e.c_str(), sizeof(evtU204) - 1);
        evtU204[sizeof(evtU204) - 1] = '\0';
      } else if (t == "Wrong Key Slot" && !hasW204) {
        hasW204 = true;
        strncpy(evtW204, e.c_str(), sizeof(evtW204) - 1);
        evtW204[sizeof(evtW204) - 1] = '\0';
      }
    }
  }

  prefs.putBool("pUAlert203", hasU203);
  prefs.putString("pUEvt203", evtU203);
  prefs.putBool("pWAlert203", hasW203);
  prefs.putString("pWEvt203", evtW203);
  prefs.putBool("pAlert203", hasU203 || hasW203);

  if (hasU203) {
    prefs.putString("pType203", "Unauthorized Removal");
    prefs.putString("pEvt203", evtU203);
  } else if (hasW203) {
    prefs.putString("pType203", "Wrong Key Slot");
    prefs.putString("pEvt203", evtW203);
  } else {
    prefs.putString("pType203", "");
    prefs.putString("pEvt203", "");
  }

  prefs.putBool("pUAlert204", hasU204);
  prefs.putString("pUEvt204", evtU204);
  prefs.putBool("pWAlert204", hasW204);
  prefs.putString("pWEvt204", evtW204);
  prefs.putBool("pAlert204", hasU204 || hasW204);

  if (hasU204) {
    prefs.putString("pType204", "Unauthorized Removal");
    prefs.putString("pEvt204", evtU204);
  } else if (hasW204) {
    prefs.putString("pType204", "Wrong Key Slot");
    prefs.putString("pEvt204", evtW204);
  } else {
    prefs.putString("pType204", "");
    prefs.putString("pEvt204", "");
  }
}

bool promotePersistentOverflowIfSpaceAvailable(Preferences& prefs) {
  int count = prefs.getInt("pQ_cnt", 0);
  int ovfCount = prefs.getInt("pQ_ovf_cnt", 0);
  if (count < MAX_PERSISTENT_ALERTS && ovfCount > 0) {
    String oroom = prefs.getString("pQ_or_0", "");
    String otype = prefs.getString("pQ_ot_0", "");
    String oevt  = prefs.getString("pQ_oe_0", "");

    if (oroom.length() > 0 && otype.length() > 0) {
      char kr[16], kt[16], ke[16];
      snprintf(kr, sizeof(kr), "pQ_r_%d", count);
      snprintf(kt, sizeof(kt), "pQ_t_%d", count);
      snprintf(ke, sizeof(ke), "pQ_e_%d", count);

      prefs.putString(kr, oroom);
      prefs.putString(kt, otype);
      prefs.putString(ke, oevt);
      count++;
      prefs.putInt("pQ_cnt", count);

      Serial.printf("📥 [NVS OVERFLOW PROMOTED] Promoted Room %s alert '%s' (%s) into primary queue slot %d\n",
                    oroom.c_str(), otype.c_str(), oevt.c_str(), count - 1);

      for (int i = 0; i < ovfCount - 1; i++) {
        char kor_cur[16], kot_cur[16], koe_cur[16];
        char kor_next[16], kot_next[16], koe_next[16];
        snprintf(kor_cur, sizeof(kor_cur), "pQ_or_%d", i);
        snprintf(kot_cur, sizeof(kot_cur), "pQ_ot_%d", i);
        snprintf(koe_cur, sizeof(koe_cur), "pQ_oe_%d", i);
        snprintf(kor_next, sizeof(kor_next), "pQ_or_%d", i + 1);
        snprintf(kot_next, sizeof(kot_next), "pQ_ot_%d", i + 1);
        snprintf(koe_next, sizeof(koe_next), "pQ_oe_%d", i + 1);

        prefs.putString(kor_cur, prefs.getString(kor_next, ""));
        prefs.putString(kot_cur, prefs.getString(kot_next, ""));
        prefs.putString(koe_cur, prefs.getString(koe_next, ""));
      }
      char kor_last[16], kot_last[16], koe_last[16];
      snprintf(kor_last, sizeof(kor_last), "pQ_or_%d", ovfCount - 1);
      snprintf(kot_last, sizeof(kot_last), "pQ_ot_%d", ovfCount - 1);
      snprintf(koe_last, sizeof(koe_last), "pQ_oe_%d", ovfCount - 1);
      prefs.remove(kor_last);
      prefs.remove(kot_last);
      prefs.remove(koe_last);

      ovfCount--;
      prefs.putInt("pQ_ovf_cnt", ovfCount);
      prefs.putBool("pQ_ovf_has", ovfCount > 0);

      dispatchSecurityAlertAsync(oroom.c_str(), otype.c_str(), oevt.c_str());
      return true;
    }
  }
  return false;
}

bool persistClearPendingAlert(const char* room, const char* alertType = "", const char* eventId = "") {
  if (!takeNvsMutex()) {
    Serial.println("❌ [NVS] Mutex acquisition failed in persistClearPendingAlert");
    return false;
  }
  Preferences prefs;
  if (!prefs.begin("labsync_sec", false)) {
    Serial.println("❌ [NVS] Failed to open labsync_sec in persistClearPendingAlert");
    giveNvsMutex();
    return false;
  }

  int count = prefs.getInt("pQ_cnt", 0);
  if (count < 0) count = 0;
  if (count > MAX_PERSISTENT_ALERTS) count = MAX_PERSISTENT_ALERTS;

  int targetIdx = -1;
  if (eventId && eventId[0] != '\0') {
    for (int i = 0; i < count; i++) {
      char ke[16];
      snprintf(ke, sizeof(ke), "pQ_e_%d", i);
      String existingId = prefs.getString(ke, "");
      if (existingId.equals(eventId)) {
        targetIdx = i;
        break;
      }
    }
  }

  if (targetIdx == -1 && alertType && alertType[0] != '\0') {
    for (int i = 0; i < count; i++) {
      char kr[16], kt[16];
      snprintf(kr, sizeof(kr), "pQ_r_%d", i);
      snprintf(kt, sizeof(kt), "pQ_t_%d", i);
      String r = prefs.getString(kr, "");
      String t = prefs.getString(kt, "");
      if (r.equals(room) && t.equals(alertType)) {
        targetIdx = i;
        break;
      }
    }
  }

  if (targetIdx >= 0) {
    for (int i = targetIdx; i < count - 1; i++) {
      char kr_cur[16], kt_cur[16], ke_cur[16];
      char kr_next[16], kt_next[16], ke_next[16];
      snprintf(kr_cur, sizeof(kr_cur), "pQ_r_%d", i);
      snprintf(kt_cur, sizeof(kt_cur), "pQ_t_%d", i);
      snprintf(ke_cur, sizeof(ke_cur), "pQ_e_%d", i);
      snprintf(kr_next, sizeof(kr_next), "pQ_r_%d", i + 1);
      snprintf(kt_next, sizeof(kt_next), "pQ_t_%d", i + 1);
      snprintf(ke_next, sizeof(ke_next), "pQ_e_%d", i + 1);

      prefs.putString(kr_cur, prefs.getString(kr_next, ""));
      prefs.putString(kt_cur, prefs.getString(kt_next, ""));
      prefs.putString(ke_cur, prefs.getString(ke_next, ""));
    }
    char kr_last[16], kt_last[16], ke_last[16];
    snprintf(kr_last, sizeof(kr_last), "pQ_r_%d", count - 1);
    snprintf(kt_last, sizeof(kt_last), "pQ_t_%d", count - 1);
    snprintf(ke_last, sizeof(ke_last), "pQ_e_%d", count - 1);
    prefs.remove(kr_last);
    prefs.remove(kt_last);
    prefs.remove(ke_last);
    count--;
    prefs.putInt("pQ_cnt", count);
  } else if (!alertType || alertType[0] == '\0') {
    // Clear all for room
    int writeIdx = 0;
    for (int i = 0; i < count; i++) {
      char kr[16], kt[16], ke[16];
      snprintf(kr, sizeof(kr), "pQ_r_%d", i);
      snprintf(kt, sizeof(kt), "pQ_t_%d", i);
      snprintf(ke, sizeof(ke), "pQ_e_%d", i);
      String r = prefs.getString(kr, "");
      String t = prefs.getString(kt, "");
      String e = prefs.getString(ke, "");
      if (!r.equals(room)) {
        if (writeIdx != i) {
          char kwr[16], kwt[16], kwe[16];
          snprintf(kwr, sizeof(kwr), "pQ_r_%d", writeIdx);
          snprintf(kwt, sizeof(kwt), "pQ_t_%d", writeIdx);
          snprintf(kwe, sizeof(kwe), "pQ_e_%d", writeIdx);
          prefs.putString(kwr, r);
          prefs.putString(kwt, t);
          prefs.putString(kwe, e);
        }
        writeIdx++;
      }
    }
    for (int i = writeIdx; i < count; i++) {
      char kr[16], kt[16], ke[16];
      snprintf(kr, sizeof(kr), "pQ_r_%d", i);
      snprintf(kt, sizeof(kt), "pQ_t_%d", i);
      snprintf(ke, sizeof(ke), "pQ_e_%d", i);
      prefs.remove(kr);
      prefs.remove(kt);
      prefs.remove(ke);
    }
    count = writeIdx;
    prefs.putInt("pQ_cnt", count);
  }

  // Also clean up overflow buffer if targetIdx was not found or if clearing all for room
  int curOvfCount = prefs.getInt("pQ_ovf_cnt", 0);
  if (curOvfCount < 0) curOvfCount = 0;
  if (curOvfCount > MAX_OVERFLOW_ALERTS) curOvfCount = MAX_OVERFLOW_ALERTS;

  if (targetIdx == -1 && eventId && eventId[0] != '\0') {
    for (int i = 0; i < curOvfCount; i++) {
      char koe[16];
      snprintf(koe, sizeof(koe), "pQ_oe_%d", i);
      if (prefs.getString(koe, "").equals(eventId)) {
        for (int j = i; j < curOvfCount - 1; j++) {
          char kor_c[16], kot_c[16], koe_c[16];
          char kor_n[16], kot_n[16], koe_n[16];
          snprintf(kor_c, sizeof(kor_c), "pQ_or_%d", j);
          snprintf(kot_c, sizeof(kot_c), "pQ_ot_%d", j);
          snprintf(koe_c, sizeof(koe_c), "pQ_oe_%d", j);
          snprintf(kor_n, sizeof(kor_n), "pQ_or_%d", j + 1);
          snprintf(kot_n, sizeof(kot_n), "pQ_ot_%d", j + 1);
          snprintf(koe_n, sizeof(koe_n), "pQ_oe_%d", j + 1);
          prefs.putString(kor_c, prefs.getString(kor_n, ""));
          prefs.putString(kot_c, prefs.getString(kot_n, ""));
          prefs.putString(koe_c, prefs.getString(koe_n, ""));
        }
        char kor_l[16], kot_l[16], koe_l[16];
        snprintf(kor_l, sizeof(kor_l), "pQ_or_%d", curOvfCount - 1);
        snprintf(kot_l, sizeof(kot_l), "pQ_ot_%d", curOvfCount - 1);
        snprintf(koe_l, sizeof(koe_l), "pQ_oe_%d", curOvfCount - 1);
        prefs.remove(kor_l);
        prefs.remove(kot_l);
        prefs.remove(koe_l);
        curOvfCount--;
        prefs.putInt("pQ_ovf_cnt", curOvfCount);
        prefs.putBool("pQ_ovf_has", curOvfCount > 0);
        break;
      }
    }
  } else if (!alertType || alertType[0] == '\0') {
    int oWriteIdx = 0;
    for (int i = 0; i < curOvfCount; i++) {
      char kor[16], kot[16], koe[16];
      snprintf(kor, sizeof(kor), "pQ_or_%d", i);
      snprintf(kot, sizeof(kot), "pQ_ot_%d", i);
      snprintf(koe, sizeof(koe), "pQ_oe_%d", i);
      String r = prefs.getString(kor, "");
      String t = prefs.getString(kot, "");
      String e = prefs.getString(koe, "");
      if (!r.equals(room)) {
        if (oWriteIdx != i) {
          char kwr[16], kwt[16], kwe[16];
          snprintf(kwr, sizeof(kwr), "pQ_or_%d", oWriteIdx);
          snprintf(kwt, sizeof(kwt), "pQ_ot_%d", oWriteIdx);
          snprintf(kwe, sizeof(kwe), "pQ_oe_%d", oWriteIdx);
          prefs.putString(kwr, r);
          prefs.putString(kwt, t);
          prefs.putString(kwe, e);
        }
        oWriteIdx++;
      }
    }
    for (int i = oWriteIdx; i < curOvfCount; i++) {
      char kor[16], kot[16], koe[16];
      snprintf(kor, sizeof(kor), "pQ_or_%d", i);
      snprintf(kot, sizeof(kot), "pQ_ot_%d", i);
      snprintf(koe, sizeof(koe), "pQ_oe_%d", i);
      prefs.remove(kor);
      prefs.remove(kot);
      prefs.remove(koe);
    }
    curOvfCount = oWriteIdx;
    prefs.putInt("pQ_ovf_cnt", curOvfCount);
    prefs.putBool("pQ_ovf_has", curOvfCount > 0);
  }

  // If primary queue has space and an overflow alert is staged, promote it immediately
  while (promotePersistentOverflowIfSpaceAvailable(prefs)) {}

  updateSummaryKeysInPrefs(prefs);
  prefs.end();
  giveNvsMutex();
  return true;
}

bool persistPendingAlert(const char* room, bool isPending, const char* alertType = "", const char* eventId = "") {
  if (!isPending) {
    return persistClearPendingAlert(room, alertType, eventId);
  }

  if (!takeNvsMutex()) {
    Serial.println("❌ [NVS] Mutex acquisition failed in persistPendingAlert");
    return false;
  }
  Preferences prefs;
  if (!prefs.begin("labsync_sec", false)) {
    Serial.println("❌ [NVS] Failed to open labsync_sec in persistPendingAlert");
    giveNvsMutex();
    return false;
  }

  int count = prefs.getInt("pQ_cnt", 0);
  if (count < 0) count = 0;

  // Deduplicate against active primary queue
  if (eventId && eventId[0] != '\0') {
    for (int i = 0; i < count; i++) {
      char ke[16];
      snprintf(ke, sizeof(ke), "pQ_e_%d", i);
      String existingId = prefs.getString(ke, "");
      if (existingId.equals(eventId)) {
        updateSummaryKeysInPrefs(prefs);
        prefs.end();
        giveNvsMutex();
        return true;
      }
    }
    // Also deduplicate against staged overflow buffer
    int ovfCount = prefs.getInt("pQ_ovf_cnt", 0);
    for (int i = 0; i < ovfCount; i++) {
      char koe[16];
      snprintf(koe, sizeof(koe), "pQ_oe_%d", i);
      String existingId = prefs.getString(koe, "");
      if (existingId.equals(eventId)) {
        updateSummaryKeysInPrefs(prefs);
        prefs.end();
        giveNvsMutex();
        return true;
      }
    }
  }

  // If primary queue has space, store directly
  if (count < MAX_PERSISTENT_ALERTS) {
    char kr[16], kt[16], ke[16];
    snprintf(kr, sizeof(kr), "pQ_r_%d", count);
    snprintf(kt, sizeof(kt), "pQ_t_%d", count);
    snprintf(ke, sizeof(ke), "pQ_e_%d", count);

    prefs.putString(kr, room ? room : "");
    prefs.putString(kt, alertType ? alertType : "");
    prefs.putString(ke, eventId ? eventId : "");

    count++;
    prefs.putInt("pQ_cnt", count);

    updateSummaryKeysInPrefs(prefs);
    prefs.end();
    giveNvsMutex();
    return true;
  }

  // Primary queue is full: stage into persistent overflow buffer so event is NEVER lost
  int ovfCount = prefs.getInt("pQ_ovf_cnt", 0);
  if (ovfCount < 0) ovfCount = 0;
  if (ovfCount < MAX_OVERFLOW_ALERTS) {
    char kor[16], kot[16], koe[16];
    snprintf(kor, sizeof(kor), "pQ_or_%d", ovfCount);
    snprintf(kot, sizeof(kot), "pQ_ot_%d", ovfCount);
    snprintf(koe, sizeof(koe), "pQ_oe_%d", ovfCount);

    prefs.putString(kor, room ? room : "");
    prefs.putString(kot, alertType ? alertType : "");
    prefs.putString(koe, eventId ? eventId : "");

    ovfCount++;
    prefs.putInt("pQ_ovf_cnt", ovfCount);
    prefs.putBool("pQ_ovf_has", true);
    nvsQueueOverflowCount++;

    Serial.printf("⚠️ [NVS OVERFLOW STAGED] Primary queue full (%d/%d)! Staged Room %s alert '%s' (%s) in persistent overflow slot %d\n",
                  count, MAX_PERSISTENT_ALERTS, room ? room : "NULL", alertType ? alertType : "", eventId ? eventId : "", ovfCount - 1);

    updateSummaryKeysInPrefs(prefs);
    prefs.end();
    giveNvsMutex();
    return true;
  }

  // Both primary queue and overflow buffer are exhausted: explicit capacity limit reached
  Serial.printf("❌ [NVS QUEUE FULL] Capacity %d + %d overflow reached! Cannot store Room %s alert '%s' (%s)\n",
                MAX_PERSISTENT_ALERTS, MAX_OVERFLOW_ALERTS, room ? room : "NULL", alertType ? alertType : "", eventId ? eventId : "");
  nvsQueueOverflowCount++;
  prefs.end();
  giveNvsMutex();
  return false;
}

int loadPersistentAlertsFromNvs(PersistentAlertItem* outItems, int maxItems) {
  if (!takeNvsMutex()) return 0;
  Preferences prefs;
  if (!prefs.begin("labsync_sec", true)) {
    giveNvsMutex();
    return 0;
  }
  int count = prefs.getInt("pQ_cnt", 0);
  if (count < 0) count = 0;
  if (count > maxItems) count = maxItems;

  int loaded = 0;
  for (int i = 0; i < count; i++) {
    char kr[16], kt[16], ke[16];
    snprintf(kr, sizeof(kr), "pQ_r_%d", i);
    snprintf(kt, sizeof(kt), "pQ_t_%d", i);
    snprintf(ke, sizeof(ke), "pQ_e_%d", i);

    String r = prefs.getString(kr, "");
    String t = prefs.getString(kt, "");
    String e = prefs.getString(ke, "");

    if (r.length() > 0 && t.length() > 0) {
      strncpy(outItems[loaded].room, r.c_str(), sizeof(outItems[loaded].room) - 1);
      outItems[loaded].room[sizeof(outItems[loaded].room) - 1] = '\0';
      strncpy(outItems[loaded].alertType, t.c_str(), sizeof(outItems[loaded].alertType) - 1);
      outItems[loaded].alertType[sizeof(outItems[loaded].alertType) - 1] = '\0';
      strncpy(outItems[loaded].eventId, e.c_str(), sizeof(outItems[loaded].eventId) - 1);
      outItems[loaded].eventId[sizeof(outItems[loaded].eventId) - 1] = '\0';
      loaded++;
    }
  }

  prefs.end();
  giveNvsMutex();
  return loaded;
}

// QR Authorization State Machine
enum QrAuthState {
  QR_AUTH_IDLE = 0,
  QR_AUTH_VERIFYING = 1,
  QR_AUTH_GRANTED_AWAITING_TAKE = 2
};

// Authorization Window State (Thread-safe critical section)
portMUX_TYPE authMux = portMUX_INITIALIZER_UNLOCKED;
volatile QrAuthState qrAuthState = QR_AUTH_IDLE;
volatile uint32_t activeScanId = 0;
volatile unsigned long verifyingStartedMs = 0;
bool isAuthorized = false;
unsigned long authExpiresAt = 0;
const unsigned long AUTH_WINDOW_MS = 15000; // 15-second key retrieval countdown
const unsigned long QR_AUTH_DISPLAY_MS = 3500; // ~3.5-second readable display for authorization result and user name
const unsigned long QR_VERIFY_TIMEOUT_MS = 12000; // 12-second safety timeout for in-flight verification
int lastDisplayedCountdown = -1;

// Periodic Heartbeat Interval
const unsigned long HEARTBEAT_INTERVAL = 15000; // 15 seconds (reduced connection frequency to prevent socket backlog)

// Non-blocking LCD Reversion Timer
unsigned long lcdRevertAt = 0;

// GM65 Scanner Pins
#define GM65_RX_PIN 17 
#define GM65_TX_PIN 16 

// I2C Pins for LCD
#define I2C_SDA_PIN 21
#define I2C_SCL_PIN 22

// Buzzer Configuration (Active Low-Level Trigger)
#define BUZZER_PIN 25 
bool isBuzzerCurrentlyOn = false;

void buzzerOn() {
  if (!isBuzzerCurrentlyOn) {
    pinMode(BUZZER_PIN, OUTPUT);
    digitalWrite(BUZZER_PIN, LOW); // LOW = Beep ON
    isBuzzerCurrentlyOn = true;
  }
}

void buzzerOff() {
  if (isBuzzerCurrentlyOn) {
    pinMode(BUZZER_PIN, INPUT); // High-Z float = Beep OFF
    isBuzzerCurrentlyOn = false;
  }
}

void triggerBuzzer(int durationMs = 80, int count = 1) {
  for (int i = 0; i < count; i++) {
    buzzerOn();
    delay(durationMs);
    buzzerOff();
    if (i < count - 1) delay(40);
  }
}

// Thread-safe LCD print helper
void safeLcdPrint(const String& line1, const String& line2) {
  if (!lcdDetected) return;
  if (i2cMutex != NULL && xSemaphoreTake(i2cMutex, pdMS_TO_TICKS(100)) == pdTRUE) {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print(line1.substring(0, 16));
    lcd.setCursor(0, 1);
    lcd.print(line2.substring(0, 16));
    xSemaphoreGive(i2cMutex);
  }
}

void showReadyScreen() {
  safeLcdPrint("    LabSync", " Ready to Scan!");
}

void showUnauthorizedScreen() {
  String l2 = "RETURN KEY!     ";
  if (isUnauthorized203 && isUnauthorized204) l2 = "RETURN 203 & 204";
  else if (isUnauthorized203) l2 = "RETURN KEY 203! ";
  else if (isUnauthorized204) l2 = "RETURN KEY 204! ";
  else if (isUnauthorized201) l2 = "RETURN KEY 201! ";
  else if (isUnauthorized202) l2 = "RETURN KEY 202! ";
  else if (isUnauthorized205) l2 = "RETURN KEY 205! ";
  else if (isUnauthorized206) l2 = "RETURN KEY 206! ";
  else if (isUnauthorized303) l2 = "RETURN KEY 303! ";
  else if (isUnauthorized304) l2 = "RETURN KEY 304! ";
  safeLcdPrint("! UNAUTHORIZED !", l2);
}

void showWrongKeyScreen() {
  String l2 = "Wrong Key Insert";
  if (isWrongKey203 && isWrongKey204) l2 = "Slots 203 & 204!";
  else if (isWrongKey203) l2 = "Slot 203 Wrong! ";
  else if (isWrongKey204) l2 = "Slot 204 Wrong! ";
  else if (isWrongKey201) l2 = "Slot 201 Wrong! ";
  else if (isWrongKey202) l2 = "Slot 202 Wrong! ";
  else if (isWrongKey205) l2 = "Slot 205 Wrong! ";
  else if (isWrongKey206) l2 = "Slot 206 Wrong! ";
  else if (isWrongKey303) l2 = "Slot 303 Wrong! ";
  else if (isWrongKey304) l2 = "Slot 304 Wrong! ";
  safeLcdPrint("WRONG KEY SLOT!", l2);
}

void clearSerialBuffer() {
  while (Serial2.available() > 0) {
    Serial2.read();
  }
}

// Robust read helper for GM65 scanner
String readScannedCode() {
  if (Serial2.available() > 0) {
    String scannedCode = "";
    unsigned long startTime = millis();
    unsigned long lastCharTime = millis();
    
    while ((millis() - startTime < 400) && (millis() - lastCharTime < 40)) {
      while (Serial2.available() > 0) {
        char c = Serial2.read();
        lastCharTime = millis();
        if (c == '\r' || c == '\n') {
          if (scannedCode.length() > 0) {
            while (Serial2.available() > 0) {
              char nextC = Serial2.peek();
              if (nextC == '\r' || nextC == '\n') Serial2.read();
              else break;
            }
            scannedCode.trim();
            Serial.printf("[GM65] Scanned QR payload received (length: %d) at %lu ms\n", scannedCode.length(), millis());
            return scannedCode;
          }
        } else if (c >= 32 && c <= 126) {
          scannedCode += c;
          if (scannedCode.length() >= 128) break;
        }
      }
      delay(1);
    }
    
    scannedCode.trim();
    if (scannedCode.length() > 0) {
      Serial.printf("[GM65] Scanned QR payload received (idle, length: %d) at %lu ms\n", scannedCode.length(), millis());
    }
    return scannedCode;
  }
  return "";
}

// ==============================================================
// 74HC4051 Multiplexer Control & Sampling Routines
// ==============================================================

// Select multiplexer channel (0 through 7) via S0, S1, S2 address lines
void selectMuxChannel(uint8_t channel) {
  digitalWrite(MUX_S0_PIN, (channel & 0x01) ? HIGH : LOW);
  digitalWrite(MUX_S1_PIN, (channel & 0x02) ? HIGH : LOW);
  digitalWrite(MUX_S2_PIN, (channel & 0x04) ? HIGH : LOW);
  delayMicroseconds(20); // 20µs settling delay for multiplexer switch and parasitic capacitance
}

// Select a channel on 74HC4051 and read 16-sample averaged analog value (~800µs)
int readMuxChannel(uint8_t channel) {
  if (channel > 7) return 4095;
  selectMuxChannel(channel);
  long sum = 0;
  for (int i = 0; i < 16; i++) {
    sum += analogRead(MUX_SIG_PIN);
    delayMicroseconds(50);
  }
  return (int)(sum / 16);
}

// Return human-readable key room name from KeyType
String getKeyName(KeyType k) {
  switch (k) {
    case KEY_201: return "201";
    case KEY_202: return "202";
    case KEY_203: return "203";
    case KEY_204: return "204";
    case KEY_205: return "205";
    case KEY_206: return "206";
    case KEY_303: return "303";
    case KEY_304: return "304";
    default: return "Unknown";
  }
}

// Rapid ADC reading with 16-sample averaging and calibrated key classification
KeyType detectKeyType(int channel) {
  int avgReading = readMuxChannel((uint8_t)channel);

  if (avgReading >= 2900) {
    return KEY_NONE; // Slot is Empty (pulled HIGH to 3.3V)
  } else if (avgReading >= 40 && avgReading <= 190) {
    return KEY_201;  // 220 Ohm Key (Room 201)
  } else if (avgReading >= 260 && avgReading <= 500) {
    return KEY_202;  // 1k Ohm Key (Room 202)
  } else if (avgReading < 40 || (avgReading >= 550 && avgReading <= 900)) {
    return KEY_204;  // 2.2k Ohm Key (Room 204) / 0 Ohm direct wire fallback
  } else if (avgReading >= 930 && avgReading <= 1150) {
    return KEY_205;  // 3.3k Ohm Key (Room 205)
  } else if (avgReading >= 1180 && avgReading <= 1480) {
    return KEY_206;  // 4.7k Ohm Key (Room 206)
  } else if (avgReading >= 1520 && avgReading <= 1800) {
    return KEY_303;  // 6.8k Ohm Key (Room 303)
  } else if (avgReading >= 1850 && avgReading <= 2250) {
    return KEY_203;  // 10k Ohm Key (Room 203)
  } else if (avgReading >= 2500 && avgReading <= 2850) {
    return KEY_304;  // 20k Ohm Key (Room 304)
  }

  return KEY_NONE;
}

// ==============================================================
// FreeRTOS Decoupled Network Worker Subsystem (Core 0)
// ==============================================================

enum NetMsgType {
  MSG_KEY_STATUS,
  MSG_SECURITY_ALERT,
  MSG_QR_SCAN
};

// Diagnostic tracking of active network operations on Core 0
const char* volatile activeNetOp = "IDLE";
volatile unsigned long activeNetOpStartMs = 0;
const char* volatile lastCompletedNetOp = "NONE";
volatile unsigned long lastCompletedNetOpDurationMs = 0;
static uint32_t globalScanCounter = 0;

struct NetMessage {
  NetMsgType type;
  char room[8];
  bool keyPresent;
  char strPayload[64]; // alertType or qrString
  char eventId[32];
  unsigned long scanReceivedMs;
  unsigned long enqueuedMs;
  uint32_t scanId;
  int8_t rssiAtScan;
};

QueueHandle_t netQueue = NULL;
const int NET_QUEUE_LEN = 16;
TaskHandle_t netTaskHandle = NULL;

// Coalesced pending synchronization state with critical section protection
portMUX_TYPE stateMux = portMUX_INITIALIZER_UNLOCKED;
volatile bool slotNeedsSync203 = false;
volatile bool slotTargetState203 = true; // true = Present, false = Absent

volatile bool slotNeedsSync204 = false;
volatile bool slotTargetState204 = true;

// Multi-incident independent pending alert tracking (avoids event overwriting)
volatile bool alertUnauthNeedsSync203 = false;
char alertUnauthEventId203[32] = "";
volatile bool alertWrongNeedsSync203 = false;
char alertWrongEventId203[32] = "";

volatile bool alertNeedsSync203 = false;
char alertPayload203[32] = "";
char alertEventId203[32] = "";

volatile bool alertUnauthNeedsSync204 = false;
char alertUnauthEventId204[32] = "";
volatile bool alertWrongNeedsSync204 = false;
char alertWrongEventId204[32] = "";

volatile bool alertNeedsSync204 = false;
char alertPayload204[32] = "";
char alertEventId204[32] = "";

void updateAlertState203_underMux() {
  alertNeedsSync203 = (alertUnauthNeedsSync203 || alertWrongNeedsSync203);
  if (alertUnauthNeedsSync203) {
    strncpy(alertPayload203, "Unauthorized Removal", sizeof(alertPayload203) - 1);
    alertPayload203[sizeof(alertPayload203) - 1] = '\0';
    strncpy(alertEventId203, alertUnauthEventId203, sizeof(alertEventId203) - 1);
    alertEventId203[sizeof(alertEventId203) - 1] = '\0';
  } else if (alertWrongNeedsSync203) {
    strncpy(alertPayload203, "Wrong Key Slot", sizeof(alertPayload203) - 1);
    alertPayload203[sizeof(alertPayload203) - 1] = '\0';
    strncpy(alertEventId203, alertWrongEventId203, sizeof(alertEventId203) - 1);
    alertEventId203[sizeof(alertEventId203) - 1] = '\0';
  } else {
    alertPayload203[0] = '\0';
    alertEventId203[0] = '\0';
  }
}

void updateAlertState204_underMux() {
  alertNeedsSync204 = (alertUnauthNeedsSync204 || alertWrongNeedsSync204);
  if (alertUnauthNeedsSync204) {
    strncpy(alertPayload204, "Unauthorized Removal", sizeof(alertPayload204) - 1);
    alertPayload204[sizeof(alertPayload204) - 1] = '\0';
    strncpy(alertEventId204, alertUnauthEventId204, sizeof(alertEventId204) - 1);
    alertEventId204[sizeof(alertEventId204) - 1] = '\0';
  } else if (alertWrongNeedsSync204) {
    strncpy(alertPayload204, "Wrong Key Slot", sizeof(alertPayload204) - 1);
    alertPayload204[sizeof(alertPayload204) - 1] = '\0';
    strncpy(alertEventId204, alertWrongEventId204, sizeof(alertEventId204) - 1);
    alertEventId204[sizeof(alertEventId204) - 1] = '\0';
  } else {
    alertPayload204[0] = '\0';
    alertEventId204[0] = '\0';
  }
}

// Synchronize volatile RAM state flags under stateMux with current NVS persistent queue summary
void refreshAlertStateFromNvs() {
  if (!takeNvsMutex()) return;
  Preferences prefs;
  if (!prefs.begin("labsync_sec", true)) {
    giveNvsMutex();
    return;
  }

  bool u203 = prefs.getBool("pUAlert203", false);
  String eu203 = prefs.getString("pUEvt203", "");
  bool w203 = prefs.getBool("pWAlert203", false);
  String ew203 = prefs.getString("pWEvt203", "");

  bool u204 = prefs.getBool("pUAlert204", false);
  String eu204 = prefs.getString("pUEvt204", "");
  bool w204 = prefs.getBool("pWAlert204", false);
  String ew204 = prefs.getString("pWEvt204", "");

  prefs.end();
  giveNvsMutex();

  portENTER_CRITICAL(&stateMux);
  alertUnauthNeedsSync203 = u203;
  strncpy(alertUnauthEventId203, eu203.c_str(), sizeof(alertUnauthEventId203) - 1);
  alertUnauthEventId203[sizeof(alertUnauthEventId203) - 1] = '\0';

  alertWrongNeedsSync203 = w203;
  strncpy(alertWrongEventId203, ew203.c_str(), sizeof(alertWrongEventId203) - 1);
  alertWrongEventId203[sizeof(alertWrongEventId203) - 1] = '\0';
  updateAlertState203_underMux();

  alertUnauthNeedsSync204 = u204;
  strncpy(alertUnauthEventId204, eu204.c_str(), sizeof(alertUnauthEventId204) - 1);
  alertUnauthEventId204[sizeof(alertUnauthEventId204) - 1] = '\0';

  alertWrongNeedsSync204 = w204;
  strncpy(alertWrongEventId204, ew204.c_str(), sizeof(alertWrongEventId204) - 1);
  alertWrongEventId204[sizeof(alertWrongEventId204) - 1] = '\0';
  updateAlertState204_underMux();
  portEXIT_CRITICAL(&stateMux);
}

// Direct HTTP dispatch for key status transitions
bool sendKeyStatusHttp(const char* room, bool present) {
  if (WiFi.status() != WL_CONNECTED) return false;

  activeNetOp = "KEY_STATUS";
  activeNetOpStartMs = millis();

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  http.begin(client, serverUrl);
  http.setReuse(false);
  http.setConnectTimeout(4000); // 4.0s connection timeout
  http.setTimeout(5000);        // 5.0s socket timeout
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + deviceToken);
  http.addHeader("Connection", "close");

  String statusStr = present ? "Key Returned" : "Key Taken";
  String jsonPayload = "{\"keyEvent\":\"" + statusStr + "\",\"roomNumber\":\"" + String(room) + "\"}";

  unsigned long httpStart = millis();
  int code = http.POST(jsonPayload);
  unsigned long httpDuration = millis() - httpStart;

  if (code > 0) {
    Serial.printf("[NetWorker HTTP] %s for Room %s: Status %d in %lu ms\n", statusStr.c_str(), room, code, httpDuration);
    NetworkClient* stream = http.getStreamPtr();
    if (stream) {
      while (stream->available() > 0) {
        stream->read();
      }
    }
  } else {
    Serial.printf("[NetWorker HTTP] %s for Room %s Failed: Status %d (%s) in %lu ms\n",
                  statusStr.c_str(), room, code, http.errorToString(code).c_str(), httpDuration);
  }
  http.end();
  client.stop();

  lastCompletedNetOp = "KEY_STATUS";
  lastCompletedNetOpDurationMs = millis() - activeNetOpStartMs;
  activeNetOp = "IDLE";

  return (code > 0);
}

// Direct HTTP dispatch for security alerts
bool sendSecurityAlertHttp(const char* room, const char* alertType, const char* eventId = NULL) {
  if (WiFi.status() != WL_CONNECTED) return false;

  activeNetOp = "SECURITY_ALERT";
  activeNetOpStartMs = millis();

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  http.begin(client, serverUrl);
  http.setReuse(false);
  http.setConnectTimeout(4000); // 4.0s connection timeout
  http.setTimeout(5000);        // 5.0s socket timeout
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + deviceToken);
  http.addHeader("Connection", "close");

  StaticJsonDocument<256> reqDoc;
  reqDoc["keyEvent"] = alertType;
  reqDoc["roomNumber"] = room;
  if (eventId && eventId[0] != '\0') {
    reqDoc["eventId"] = eventId;
  }

  String jsonPayload;
  serializeJson(reqDoc, jsonPayload);

  unsigned long httpStart = millis();
  int code = http.POST(jsonPayload);
  unsigned long httpDuration = millis() - httpStart;

  if (code > 0) {
    Serial.printf("[NetWorker Alert] %s for Room %s: Status %d in %lu ms\n", alertType, room, code, httpDuration);
    NetworkClient* stream = http.getStreamPtr();
    if (stream) {
      while (stream->available() > 0) stream->read();
    }
  } else {
    Serial.printf("[NetWorker Alert] %s for Room %s Failed: Status %d (%s) in %lu ms\n",
                  alertType, room, code, http.errorToString(code).c_str(), httpDuration);
  }
  http.end();
  client.stop();

  lastCompletedNetOp = "SECURITY_ALERT";
  lastCompletedNetOpDurationMs = millis() - activeNetOpStartMs;
  activeNetOp = "IDLE";

  return (code >= 200 && code < 300);
}

// Direct HTTP dispatch for telemetry heartbeat
bool sendHeartbeatHttp() {
  if (WiFi.status() != WL_CONNECTED) return false;

  activeNetOp = "HEARTBEAT";
  activeNetOpStartMs = millis();

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  http.begin(client, heartbeatUrl);
  http.setReuse(false);
  http.setConnectTimeout(4000);
  http.setTimeout(5000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + deviceToken);
  http.addHeader("Connection", "close");

  bool key203Present = false;
  bool key204Present = false;
  portENTER_CRITICAL(&stateMux);
  key203Present = slotTargetState203;
  key204Present = slotTargetState204;
  portEXIT_CRITICAL(&stateMux);

  bool k201 = (lastSlotState201 != KEY_NONE);
  bool k202 = (lastSlotState202 != KEY_NONE);
  bool k205 = (lastSlotState205 != KEY_NONE);
  bool k206 = (lastSlotState206 != KEY_NONE);
  bool k303 = (lastSlotState303 != KEY_NONE);
  bool k304 = (lastSlotState304 != KEY_NONE);

  String jsonPayload = "{\"deviceId\":\"ESP32-KeyBox\",\"rooms\":[\"203\",\"204\"],\"slots\":{\"203\":" +
                      String(key203Present ? "true" : "false") + ",\"204\":" +
                      String(key204Present ? "true" : "false") +
                      ",\"201\":" + String(k201 ? "true" : "false") +
                      ",\"202\":" + String(k202 ? "true" : "false") +
                      ",\"205\":" + String(k205 ? "true" : "false") +
                      ",\"206\":" + String(k206 ? "true" : "false") +
                      ",\"303\":" + String(k303 ? "true" : "false") +
                      ",\"304\":" + String(k304 ? "true" : "false") + "}}";

  unsigned long httpStart = millis();
  int code = http.POST(jsonPayload);
  unsigned long httpDuration = millis() - httpStart;

  bool isSuccess = false;
  if (code == 200) {
    isSuccess = true;
    Serial.printf("[NetWorker Heartbeat] ✔ Success: HTTP 200 in %lu ms (203: %s, 204: %s). FreeHeap: %u\n",
                  httpDuration,
                  key203Present ? "Present" : "Absent",
                  key204Present ? "Present" : "Absent",
                  ESP.getFreeHeap());
    NetworkClient* stream = http.getStreamPtr();
    if (stream) {
      while (stream->available() > 0) stream->read();
    }
  } else if (code == 401 || code == 403) {
    Serial.printf("[NetWorker Heartbeat] ❌ Auth Failure: HTTP %d in %lu ms. Invalid or rejected device token!\n",
                  code, httpDuration);
  } else if (code >= 500) {
    Serial.printf("[NetWorker Heartbeat] ⚠️ Server Error: HTTP %d in %lu ms from Railway server\n",
                  code, httpDuration);
  } else if (code > 0) {
    Serial.printf("[NetWorker Heartbeat] ⚠️ Unexpected Status: HTTP %d in %lu ms\n",
                  code, httpDuration);
  } else {
    Serial.printf("[NetWorker Heartbeat] ❌ Transport Failure: Code %d (%s) in %lu ms\n",
                  code,
                  http.errorToString(code).c_str(),
                  httpDuration);
  }

  http.end();
  client.stop();

  lastCompletedNetOp = "HEARTBEAT";
  lastCompletedNetOpDurationMs = millis() - activeNetOpStartMs;
  activeNetOp = "IDLE";

  return isSuccess;
}

// Direct HTTP dispatch for QR scan verification
void processQrScanHttp(const char* scannedToken, const char* room, uint32_t scanId = 0, unsigned long scanReceivedMs = 0, unsigned long enqueuedMs = 0, int8_t rssiAtScan = 0) {
  unsigned long workerStartMs = millis();
  unsigned long queueWaitMs = (enqueuedMs > 0) ? (workerStartMs - enqueuedMs) : 0;
  int8_t currentRssi = (WiFi.status() == WL_CONNECTED) ? WiFi.RSSI() : 0;

  activeNetOp = "QR_SCAN";
  activeNetOpStartMs = workerStartMs;

  Serial.printf("[DIAG QR-Scan #%lu] Worker Dequeued: QueueWait=%lu ms | PrecedingOp=%s (%lu ms) | CurrentRSSI=%d dBm (ScanRSSI=%d dBm)\n",
                (unsigned long)scanId, queueWaitMs, lastCompletedNetOp, lastCompletedNetOpDurationMs,
                (int)currentRssi, (int)rssiAtScan);

  String line1 = "Scan Denied";
  String line2 = "Please Wait...";

  if (WiFi.status() == WL_CONNECTED) {
    WiFiClientSecure client;
    client.setInsecure();

    HTTPClient http;
    http.begin(client, serverUrl);
    http.setReuse(false);
    http.setConnectTimeout(4000); // 4.0s connection timeout
    http.setTimeout(5000);        // 5.0s socket timeout
    http.addHeader("Content-Type", "application/json");
    http.addHeader("Authorization", String("Bearer ") + deviceToken);
    http.addHeader("Connection", "close");

    StaticJsonDocument<256> reqDoc;
    reqDoc["qrString"] = scannedToken;
    reqDoc["roomNumber"] = room;
    reqDoc["authMethod"] = "QR Code";
    reqDoc["authWindowMs"] = AUTH_WINDOW_MS;
    if (scanId > 0) {
      reqDoc["scanId"] = scanId;
    }

    String jsonPayload;
    serializeJson(reqDoc, jsonPayload);

    unsigned long httpStartMs = millis();
    int httpResponseCode = http.POST(jsonPayload);
    unsigned long httpEndMs = millis();
    unsigned long httpDurationMs = httpEndMs - httpStartMs;
    unsigned long totalElapsedMs = (scanReceivedMs > 0) ? (httpEndMs - scanReceivedMs) : (httpEndMs - workerStartMs);

    String response = http.getString();
    if (httpResponseCode > 0) {
      Serial.printf("[DIAG QR-Scan #%lu] HTTP Result: Status=%d | HttpDuration=%lu ms | TotalElapsed=%lu ms (QueueWait=%lu ms)\n",
                    (unsigned long)scanId, httpResponseCode, httpDurationMs, totalElapsedMs, queueWaitMs);
    } else {
      Serial.printf("[DIAG QR-Scan #%lu] ⚠️ Transport Failure: ErrorCode=%d (%s) | Connect/Socket Duration=%lu ms | TotalElapsed=%lu ms (QueueWait=%lu ms)\n",
                    (unsigned long)scanId, httpResponseCode, http.errorToString(httpResponseCode).c_str(),
                    httpDurationMs, totalElapsedMs, queueWaitMs);
    }

    StaticJsonDocument<1024> resDoc;
    DeserializationError error = deserializeJson(resDoc, response);

    String verifiedName = "";
    if (!error) {
      if (resDoc.containsKey("lcdLine1")) line1 = resDoc["lcdLine1"].as<String>();
      if (resDoc.containsKey("lcdLine2")) line2 = resDoc["lcdLine2"].as<String>();

      // Extract verified user name strictly from successful server response
      if (httpResponseCode == 200) {
        if (resDoc.containsKey("name") && !resDoc["name"].isNull()) {
          verifiedName = resDoc["name"].as<String>();
        } else if (resDoc.containsKey("user") && resDoc["user"].is<JsonObject>() && resDoc["user"].containsKey("name") && !resDoc["user"]["name"].isNull()) {
          verifiedName = resDoc["user"]["name"].as<String>();
        } else if (resDoc.containsKey("userName") && !resDoc["userName"].isNull()) {
          verifiedName = resDoc["userName"].as<String>();
        } else if (resDoc.containsKey("lcdLine2") && !resDoc["lcdLine2"].isNull()) {
          String candidate = resDoc["lcdLine2"].as<String>();
          candidate.trim();
          if (!candidate.equalsIgnoreCase("TAKE YOUR KEY") &&
              !candidate.equalsIgnoreCase("PLEASE RETRY") &&
              !candidate.equalsIgnoreCase("SCAN LOCKED")) {
            verifiedName = candidate;
          }
        }
        verifiedName.trim();
      }
    } else {
      if (httpResponseCode == 404) {
        line1 = "Access Denied!";
        line2 = "Invalid QR Code";
      } else if (httpResponseCode < 0) {
        line1 = "System Busy";
        line2 = "Please Retry";
      }
    }

    bool isStillActive = false;
    portENTER_CRITICAL(&authMux);
    if (scanId == activeScanId && qrAuthState == QR_AUTH_VERIFYING) {
      isStillActive = true;
    }
    portEXIT_CRITICAL(&authMux);

    if (!isStillActive) {
      Serial.printf("[DIAG QR-Scan #%lu] Obsolete/stale response ignored (activeScanId=%lu, qrAuthState=%d)\n",
                    (unsigned long)scanId, (unsigned long)activeScanId, (int)qrAuthState);
      http.end();
      client.stop();
      lastCompletedNetOp = "QR_SCAN_STALE";
      lastCompletedNetOpDurationMs = millis() - activeNetOpStartMs;
      activeNetOp = "IDLE";
      return;
    }

    if (httpResponseCode == 200) {
      portENTER_CRITICAL(&authMux);
      qrAuthState = QR_AUTH_GRANTED_AWAITING_TAKE;
      isAuthorized = true;
      authExpiresAt = millis() + AUTH_WINDOW_MS;
      lastDisplayedCountdown = -1;
      portEXIT_CRITICAL(&authMux);

      triggerBuzzer(80, 2);

      String grantLine1 = "ACCESS GRANTED  ";
      String grantLine2 = "TAKE YOUR KEY   ";
      if (verifiedName.length() > 0) {
        grantLine1 = "TAKE YOUR KEY   ";
        grantLine2 = (verifiedName.length() > 16) ? verifiedName.substring(0, 16) : verifiedName;
        Serial.printf("[DIAG QR-Scan #%lu] ✔ Access Granted to '%s'. Awaiting key take.\n",
                      (unsigned long)scanId, grantLine2.c_str());
      } else {
        Serial.printf("[DIAG QR-Scan #%lu] ✔ Access Granted (generic). Awaiting key take.\n",
                      (unsigned long)scanId);
      }

      safeLcdPrint(grantLine1, grantLine2);
      lcdRevertAt = millis() + QR_AUTH_DISPLAY_MS; // Keep "TAKE YOUR KEY" / verified user name visible for ~3.5s before countdown display takes over
    } else {
      portENTER_CRITICAL(&authMux);
      qrAuthState = QR_AUTH_IDLE;
      activeScanId = 0;
      isAuthorized = false;
      authExpiresAt = 0;
      portEXIT_CRITICAL(&authMux);

      if (httpResponseCode < 0) {
        line1 = "NETWORK ERROR   ";
        line2 = "PLEASE RETRY    ";
      }

      triggerBuzzer(250, 1);
      safeLcdPrint(line1, line2);
      lcdRevertAt = millis() + 2500;
    }
    http.end();
    client.stop();

    lastCompletedNetOp = "QR_SCAN";
    lastCompletedNetOpDurationMs = millis() - activeNetOpStartMs;
    activeNetOp = "IDLE";
  } else {
    portENTER_CRITICAL(&authMux);
    if (scanId == activeScanId) {
      qrAuthState = QR_AUTH_IDLE;
      activeScanId = 0;
      isAuthorized = false;
      authExpiresAt = 0;
    }
    portEXIT_CRITICAL(&authMux);

    triggerBuzzer(250, 1);
    safeLcdPrint("Wi-Fi Error!", "Not Connected");
    lcdRevertAt = millis() + 2000;

    lastCompletedNetOp = "QR_SCAN_OFFLINE";
    lastCompletedNetOpDurationMs = millis() - activeNetOpStartMs;
    activeNetOp = "IDLE";
  }
}

// Background FreeRTOS Worker Task running on Core 0
void networkWorkerTask(void* pvParameters) {
  Serial.printf("[NetWorker] Task active on Core %d\n", xPortGetCoreID());

  unsigned long nextHeartbeatDueMs = millis();
  uint8_t heartbeatRetryCount = 0;
  const uint8_t MAX_HEARTBEAT_RETRIES = 3;
  const unsigned long HEARTBEAT_RETRY_DELAYS[3] = { 3000, 5000, 8000 };
  const unsigned long PENDING_SYNC_RETRY_DELAY_MS = 5000;

  unsigned long nextAlertRetryMs203 = millis();
  unsigned long nextAlertRetryMs204 = millis();
  unsigned long nextSlotRetryMs203 = millis();
  unsigned long nextSlotRetryMs204 = millis();
  uint8_t pendingSyncRoundRobin = 0;

  while (true) {
    NetMessage msg;
    // Block on FreeRTOS queue for up to 200ms
    BaseType_t gotMsg = xQueueReceive(netQueue, &msg, pdMS_TO_TICKS(200));

    if (gotMsg == pdPASS) {
      if (WiFi.status() == WL_CONNECTED) {
        if (msg.type == MSG_KEY_STATUS) {
          if (sendKeyStatusHttp(msg.room, msg.keyPresent)) {
            portENTER_CRITICAL(&stateMux);
            if (strcmp(msg.room, "203") == 0 && slotTargetState203 == msg.keyPresent) slotNeedsSync203 = false;
            if (strcmp(msg.room, "204") == 0 && slotTargetState204 == msg.keyPresent) slotNeedsSync204 = false;
            portEXIT_CRITICAL(&stateMux);
            if (strcmp(msg.room, "203") == 0) nextSlotRetryMs203 = millis();
            if (strcmp(msg.room, "204") == 0) nextSlotRetryMs204 = millis();
          } else {
            if (strcmp(msg.room, "203") == 0) nextSlotRetryMs203 = millis() + PENDING_SYNC_RETRY_DELAY_MS;
            if (strcmp(msg.room, "204") == 0) nextSlotRetryMs204 = millis() + PENDING_SYNC_RETRY_DELAY_MS;
          }
        } else if (msg.type == MSG_SECURITY_ALERT) {
          if (sendSecurityAlertHttp(msg.room, msg.strPayload, msg.eventId)) {
            persistClearPendingAlert(msg.room, msg.strPayload, msg.eventId);
            refreshAlertStateFromNvs();
            if (strcmp(msg.room, "203") == 0) nextAlertRetryMs203 = millis();
            if (strcmp(msg.room, "204") == 0) nextAlertRetryMs204 = millis();
          } else {
            persistPendingAlert(msg.room, true, msg.strPayload, msg.eventId);
            refreshAlertStateFromNvs();
            if (strcmp(msg.room, "203") == 0) nextAlertRetryMs203 = millis() + PENDING_SYNC_RETRY_DELAY_MS;
            if (strcmp(msg.room, "204") == 0) nextAlertRetryMs204 = millis() + PENDING_SYNC_RETRY_DELAY_MS;
          }
        } else if (msg.type == MSG_QR_SCAN) {
          bool shouldProcess = false;
          portENTER_CRITICAL(&authMux);
          if (msg.scanId == activeScanId && qrAuthState == QR_AUTH_VERIFYING) {
            shouldProcess = true;
          }
          portEXIT_CRITICAL(&authMux);

          if (shouldProcess) {
            processQrScanHttp(msg.strPayload, msg.room, msg.scanId, msg.scanReceivedMs, msg.enqueuedMs, msg.rssiAtScan);
          } else {
            Serial.printf("[NetWorker] Dropped stale/superseded scan #%lu (activeScanId=%lu, qrAuthState=%d)\n",
                          (unsigned long)msg.scanId, (unsigned long)activeScanId, (int)qrAuthState);
          }
        }
      } else {
        // Wi-Fi offline: guarantee coalesced state retention
        if (msg.type == MSG_KEY_STATUS) {
          portENTER_CRITICAL(&stateMux);
          if (strcmp(msg.room, "203") == 0) slotNeedsSync203 = true;
          if (strcmp(msg.room, "204") == 0) slotNeedsSync204 = true;
          portEXIT_CRITICAL(&stateMux);
        } else if (msg.type == MSG_SECURITY_ALERT) {
          persistPendingAlert(msg.room, true, msg.strPayload, msg.eventId);
          refreshAlertStateFromNvs();
        } else if (msg.type == MSG_QR_SCAN) {
          portENTER_CRITICAL(&authMux);
          if (msg.scanId == activeScanId) {
            qrAuthState = QR_AUTH_IDLE;
            activeScanId = 0;
            isAuthorized = false;
          }
          portEXIT_CRITICAL(&authMux);
          triggerBuzzer(250, 1);
          safeLcdPrint("Wi-Fi Error!", "Not Connected");
          lcdRevertAt = millis() + 2000;
        }
      }
    }

    // Coalesced pending state reconciliation when Wi-Fi is connected
    wl_status_t currentWifiStatus = WiFi.status();
    static wl_status_t lastRecordedWifi = WL_IDLE_STATUS;

    if (currentWifiStatus == WL_CONNECTED) {
      if (lastRecordedWifi != WL_CONNECTED) {
        // Reset retry backoffs upon link restoration so pending sync is attempted immediately
        nextAlertRetryMs203 = millis();
        nextAlertRetryMs204 = millis();
        nextSlotRetryMs203 = millis();
        nextSlotRetryMs204 = millis();
      }

      unsigned long nowMs = millis();
      bool needAlert203 = false;
      char alert203[32] = "";
      char eventId203[32] = "";
      bool needAlert204 = false;
      char alert204[32] = "";
      char eventId204[32] = "";
      bool need203 = false, target203 = true;
      bool need204 = false, target204 = true;

      portENTER_CRITICAL(&stateMux);
      needAlert203 = alertNeedsSync203;
      strncpy(alert203, alertPayload203, sizeof(alert203) - 1);
      strncpy(eventId203, alertEventId203, sizeof(eventId203) - 1);
      needAlert204 = alertNeedsSync204;
      strncpy(alert204, alertPayload204, sizeof(alert204) - 1);
      strncpy(eventId204, alertEventId204, sizeof(eventId204) - 1);
      need203 = slotNeedsSync203;
      target203 = slotTargetState203;
      need204 = slotNeedsSync204;
      target204 = slotTargetState204;
      portEXIT_CRITICAL(&stateMux);

      // Circular round-robin selection among the 4 pending sync operations
      // ensures fair service and prevents static priority starvation of lower-index items.
      int selectedSyncOp = -1;
      for (int i = 0; i < 4; i++) {
        int candidate = (pendingSyncRoundRobin + i) % 4;
        if (candidate == 0 && needAlert203 && ((int32_t)(nowMs - nextAlertRetryMs203) >= 0)) {
          selectedSyncOp = 0;
          break;
        } else if (candidate == 1 && needAlert204 && ((int32_t)(nowMs - nextAlertRetryMs204) >= 0)) {
          selectedSyncOp = 1;
          break;
        } else if (candidate == 2 && need203 && ((int32_t)(nowMs - nextSlotRetryMs203) >= 0)) {
          selectedSyncOp = 2;
          break;
        } else if (candidate == 3 && need204 && ((int32_t)(nowMs - nextSlotRetryMs204) >= 0)) {
          selectedSyncOp = 3;
          break;
        }
      }

      if (selectedSyncOp == 0) {
        pendingSyncRoundRobin = 1;
        if (sendSecurityAlertHttp("203", alert203, eventId203)) {
          persistClearPendingAlert("203", alert203, eventId203);
          refreshAlertStateFromNvs();
          nextAlertRetryMs203 = millis();
        } else {
          nextAlertRetryMs203 = millis() + PENDING_SYNC_RETRY_DELAY_MS;
          Serial.printf("[NetWorker] Alert sync for 203 failed. Retry scheduled in %lu ms\n", PENDING_SYNC_RETRY_DELAY_MS);
        }
      } else if (selectedSyncOp == 1) {
        pendingSyncRoundRobin = 2;
        if (sendSecurityAlertHttp("204", alert204, eventId204)) {
          persistClearPendingAlert("204", alert204, eventId204);
          refreshAlertStateFromNvs();
          nextAlertRetryMs204 = millis();
        } else {
          nextAlertRetryMs204 = millis() + PENDING_SYNC_RETRY_DELAY_MS;
          Serial.printf("[NetWorker] Alert sync for 204 failed. Retry scheduled in %lu ms\n", PENDING_SYNC_RETRY_DELAY_MS);
        }
      } else if (selectedSyncOp == 2) {
        pendingSyncRoundRobin = 3;
        if (sendKeyStatusHttp("203", target203)) {
          portENTER_CRITICAL(&stateMux);
          if (slotTargetState203 == target203) slotNeedsSync203 = false;
          portEXIT_CRITICAL(&stateMux);
          nextSlotRetryMs203 = millis();
        } else {
          nextSlotRetryMs203 = millis() + PENDING_SYNC_RETRY_DELAY_MS;
          Serial.printf("[NetWorker] Slot sync for 203 failed. Retry scheduled in %lu ms\n", PENDING_SYNC_RETRY_DELAY_MS);
        }
      } else if (selectedSyncOp == 3) {
        pendingSyncRoundRobin = 0;
        if (sendKeyStatusHttp("204", target204)) {
          portENTER_CRITICAL(&stateMux);
          if (slotTargetState204 == target204) slotNeedsSync204 = false;
          portEXIT_CRITICAL(&stateMux);
          nextSlotRetryMs204 = millis();
        } else {
          nextSlotRetryMs204 = millis() + PENDING_SYNC_RETRY_DELAY_MS;
          Serial.printf("[NetWorker] Slot sync for 204 failed. Retry scheduled in %lu ms\n", PENDING_SYNC_RETRY_DELAY_MS);
        }
      }

      // If link was just restored, announce presence after pending transition reconciliation!
      if (lastRecordedWifi != WL_CONNECTED) {
        Serial.println("[NetWorker] Wi-Fi link restored! Sending presence heartbeat after pending event sync...");
        heartbeatRetryCount = 0;
        bool hbOk = sendHeartbeatHttp();
        nextHeartbeatDueMs = millis() + (hbOk ? HEARTBEAT_INTERVAL : 3000);
      }

      // Check for higher priority network work before attempting periodic/retry heartbeats
      bool hasHigherPriorityWork = (netQueue != NULL && uxQueueMessagesWaiting(netQueue) > 0) ||
                                    (alertNeedsSync203 && ((int32_t)(millis() - nextAlertRetryMs203) >= 0)) ||
                                    (alertNeedsSync204 && ((int32_t)(millis() - nextAlertRetryMs204) >= 0)) ||
                                    (slotNeedsSync203 && ((int32_t)(millis() - nextSlotRetryMs203) >= 0)) ||
                                    (slotNeedsSync204 && ((int32_t)(millis() - nextSlotRetryMs204) >= 0));

      // Periodic or bounded retry heartbeat dispatch (wraparound-safe 32-bit signed difference).
      // Heartbeat deadlines must be honored: if a heartbeat is due, higher priority work may only
      // defer it up to MAX_HEARTBEAT_DEFERRAL_MS so that repeated sync failures or non-empty queues
      // cannot indefinitely starve heartbeats.
      const unsigned long MAX_HEARTBEAT_DEFERRAL_MS = 5000;
      bool heartbeatDue = ((int32_t)(millis() - nextHeartbeatDueMs) >= 0);
      bool heartbeatOverdue = ((int32_t)(millis() - (nextHeartbeatDueMs + MAX_HEARTBEAT_DEFERRAL_MS)) >= 0);

      if ((!hasHigherPriorityWork && heartbeatDue) || heartbeatOverdue) {
        bool hbOk = sendHeartbeatHttp();
        if (hbOk) {
          heartbeatRetryCount = 0;
          nextHeartbeatDueMs = millis() + HEARTBEAT_INTERVAL;
        } else {
          if (heartbeatRetryCount < MAX_HEARTBEAT_RETRIES) {
            unsigned long delayMs = HEARTBEAT_RETRY_DELAYS[heartbeatRetryCount];
            heartbeatRetryCount++;
            nextHeartbeatDueMs = millis() + delayMs;
            Serial.printf("[NetWorker Heartbeat] Retry #%u scheduled in %lu ms\n",
                          (unsigned int)heartbeatRetryCount, delayMs);
          } else {
            Serial.printf("[NetWorker Heartbeat] Max retries (%u) reached. Resuming nominal %lu ms interval.\n",
                          (unsigned int)MAX_HEARTBEAT_RETRIES, HEARTBEAT_INTERVAL);
            heartbeatRetryCount = 0;
            nextHeartbeatDueMs = millis() + HEARTBEAT_INTERVAL;
          }
        }
      }
    }

    // Auto-reconnect guard
    if (currentWifiStatus != WL_CONNECTED) {
      static unsigned long lastReconnect = 0;
      if (millis() - lastReconnect >= 5000) {
        lastReconnect = millis();
        Serial.println("[NetWorker] Wi-Fi disconnected! Reconnecting...");
        WiFi.reconnect();
      }
    }
    lastRecordedWifi = currentWifiStatus;

    vTaskDelay(pdMS_TO_TICKS(10));
  }
}

// Helpers to push into FreeRTOS queue non-blockingly
void dispatchKeyStatusAsync(const char* room, bool present) {
  portENTER_CRITICAL(&stateMux);
  if (strcmp(room, "203") == 0) {
    slotTargetState203 = present;
    slotNeedsSync203 = true;
  } else if (strcmp(room, "204") == 0) {
    slotTargetState204 = present;
    slotNeedsSync204 = true;
  }
  portEXIT_CRITICAL(&stateMux);

  if (netQueue != NULL) {
    NetMessage msg;
    msg.type = MSG_KEY_STATUS;
    strncpy(msg.room, room, sizeof(msg.room) - 1);
    msg.room[sizeof(msg.room) - 1] = '\0';
    msg.keyPresent = present;
    msg.strPayload[0] = '\0';
    xQueueSend(netQueue, &msg, 0); // 0 timeout: non-blocking immediate return
  }
}

void dispatchSecurityAlertAsync(const char* room, const char* alertType, const char* eventId) {
  if (netQueue != NULL) {
    NetMessage msg;
    msg.type = MSG_SECURITY_ALERT;
    strncpy(msg.room, room, sizeof(msg.room) - 1);
    msg.room[sizeof(msg.room) - 1] = '\0';
    msg.keyPresent = false;
    strncpy(msg.strPayload, alertType, sizeof(msg.strPayload) - 1);
    msg.strPayload[sizeof(msg.strPayload) - 1] = '\0';
    if (eventId && eventId[0] != '\0') {
      strncpy(msg.eventId, eventId, sizeof(msg.eventId) - 1);
      msg.eventId[sizeof(msg.eventId) - 1] = '\0';
    } else {
      msg.eventId[0] = '\0';
    }
    xQueueSend(netQueue, &msg, 0);
  }
}

void dispatchQrScanAsync(const String& scannedCode, unsigned long scanReceivedMs = 0, uint32_t scanId = 0) {
  if (netQueue != NULL) {
    if (scanId == 0) scanId = ++globalScanCounter;
    unsigned long enqueuedMs = millis();
    if (scanReceivedMs == 0) scanReceivedMs = enqueuedMs;

    UBaseType_t queueDepthBefore = uxQueueMessagesWaiting(netQueue);
    int8_t rssi = (WiFi.status() == WL_CONNECTED) ? WiFi.RSSI() : 0;
    const char* inFlightOp = activeNetOp;
    unsigned long inFlightDur = (strcmp(inFlightOp, "IDLE") != 0) ? (millis() - activeNetOpStartMs) : 0;

    NetMessage msg;
    msg.type = MSG_QR_SCAN;
    strncpy(msg.room, defaultScanRoom, sizeof(msg.room) - 1);
    msg.room[sizeof(msg.room) - 1] = '\0';
    msg.keyPresent = false;
    strncpy(msg.strPayload, scannedCode.c_str(), sizeof(msg.strPayload) - 1);
    msg.strPayload[sizeof(msg.strPayload) - 1] = '\0';
    msg.scanReceivedMs = scanReceivedMs;
    msg.enqueuedMs = enqueuedMs;
    msg.scanId = scanId;
    msg.rssiAtScan = rssi;

    BaseType_t sent = xQueueSend(netQueue, &msg, 0); // 0 timeout: non-blocking immediate return
    if (sent == pdPASS) {
      Serial.printf("[DIAG QR-Scan #%lu] Enqueued | QueueDepth=%u/%d | RSSI=%d dBm | InFlightOp=%s (%lu ms)\n",
                    (unsigned long)scanId, (unsigned int)(queueDepthBefore + 1), NET_QUEUE_LEN, (int)rssi,
                    inFlightOp, inFlightDur);
    } else {
      Serial.printf("[DIAG QR-Scan #%lu] ❌ Queue Full! Dropped scan | QueueDepth=%u/%d | RSSI=%d dBm | InFlightOp=%s (%lu ms)\n",
                    (unsigned long)scanId, (unsigned int)queueDepthBefore, NET_QUEUE_LEN, (int)rssi,
                    inFlightOp, inFlightDur);
      portENTER_CRITICAL(&authMux);
      if (activeScanId == scanId && qrAuthState == QR_AUTH_VERIFYING) {
        qrAuthState = QR_AUTH_IDLE;
        activeScanId = 0;
      }
      portEXIT_CRITICAL(&authMux);
      safeLcdPrint("Queue Full!     ", "Please Retry    ");
      lcdRevertAt = millis() + 2000;
    }
  }
}

// Backward-compatible wrappers
void sendKeyStatusToServer(String room, bool present) {
  dispatchKeyStatusAsync(room.c_str(), present);
}

void sendSecurityAlertToServer(String room, String alertType) {
  dispatchSecurityAlertAsync(room.c_str(), alertType.c_str());
}

// Non-blocking Key slot transition monitor (Runs on Core 1 in loop())
void handleKeySlot(int channel, KeyType &lastState, String slotRoom, KeyType expectedKey,
                  bool &isUnauth, bool &isWrong,
                  unsigned long &unauthAlarmStarted, unsigned long &wrongAlarmStarted) {
  KeyType candidateState = detectKeyType(channel);
  
  if (candidateState != lastState) {
    delay(40); // 40ms fast debounce (rejects contact friction while responding instantly)
    KeyType verifyState = detectKeyType(channel);
    
    if (candidateState == verifyState) {
      KeyType oldState = lastState;
      lastState = verifyState;

      Serial.printf("[Slot %s] State changed: %d -> %d\n", slotRoom.c_str(), (int)oldState, (int)verifyState);

      // 1. Wrong Key Inserted
      if (verifyState != KEY_NONE && verifyState != expectedKey) {
        isWrong = true;
        wrongAlarmStarted = millis(); // Start audible timer for wrong key
        String insertedKeyName = getKeyName(verifyState);
        Serial.printf("❌ WRONG KEY SLOT! Key %s inserted into Slot %s\n", insertedKeyName.c_str(), slotRoom.c_str());
        char wrongEvtId[32] = "";
        snprintf(wrongEvtId, sizeof(wrongEvtId), "%s-wrong-%lu", slotRoom.c_str(), millis());

        portENTER_CRITICAL(&stateMux);
        if (slotRoom == "203") {
          alertWrongNeedsSync203 = true;
          strncpy(alertWrongEventId203, wrongEvtId, sizeof(alertWrongEventId203) - 1);
          alertWrongEventId203[sizeof(alertWrongEventId203) - 1] = '\0';
          updateAlertState203_underMux();
        } else if (slotRoom == "204") {
          alertWrongNeedsSync204 = true;
          strncpy(alertWrongEventId204, wrongEvtId, sizeof(alertWrongEventId204) - 1);
          alertWrongEventId204[sizeof(alertWrongEventId204) - 1] = '\0';
          updateAlertState204_underMux();
        }
        portEXIT_CRITICAL(&stateMux);

        persistIncidentState(slotRoom.c_str(), isUnauth, true);
        persistPendingAlert(slotRoom.c_str(), true, "Wrong Key Slot", wrongEvtId);
        dispatchSecurityAlertAsync(slotRoom.c_str(), "Wrong Key Slot", wrongEvtId);
        showWrongKeyScreen();
        lcdRevertAt = millis() + 2500;
        buzzerOn();
        return;
      }

      // 2. Correct Key Returned
      if (verifyState == expectedKey) {
        bool wasUnauth = isUnauth;
        isUnauth = false;
        isWrong = false;
        unauthAlarmStarted = 0; // Reset audible alarm timers
        wrongAlarmStarted = 0;
        persistIncidentState(slotRoom.c_str(), false, false);

        triggerBuzzer(80, 2);
        safeLcdPrint(slotRoom + " Key Return", wasUnauth ? "Alarm Cleared " : "Room Secured  ");
        dispatchKeyStatusAsync(slotRoom.c_str(), true);
        lcdRevertAt = millis() + 1500;
        return;
      } 

      // 3. Key Taken (Went to KEY_NONE)
      else if (verifyState == KEY_NONE) {
        // If it was just a wrong key being removed
        if (isWrong) {
          isWrong = false;
          wrongAlarmStarted = 0;
          persistIncidentState(slotRoom.c_str(), isUnauth, false);
          triggerBuzzer(60, 1);
          bool anyAlarmRemaining = isUnauthorized203 || isUnauthorized204 || isWrongKey203 || isWrongKey204 ||
                                   isUnauthorized201 || isUnauthorized202 || isUnauthorized205 || isUnauthorized206 ||
                                   isUnauthorized303 || isUnauthorized304 || isWrongKey201 || isWrongKey202 ||
                                   isWrongKey205 || isWrongKey206 || isWrongKey303 || isWrongKey304;
          if (anyAlarmRemaining) {
            if (isUnauthorized203 || isUnauthorized204 || isUnauthorized201 || isUnauthorized202 ||
                isUnauthorized205 || isUnauthorized206 || isUnauthorized303 || isUnauthorized304) {
              showUnauthorizedScreen();
            } else {
              showWrongKeyScreen();
            }
          } else {
            safeLcdPrint("Key Removed", "System Ready");
            lcdRevertAt = millis() + 1000;
          }
          return;
        }

        bool hasValidAuth = false;
        portENTER_CRITICAL(&authMux);
        if (isAuthorized && millis() < authExpiresAt) {
          isAuthorized = false; // strictly single-use
          authExpiresAt = 0;
          qrAuthState = QR_AUTH_IDLE;
          activeScanId = 0;
          hasValidAuth = true;
        }
        portEXIT_CRITICAL(&authMux);

        if (hasValidAuth) {
          isUnauth = false;
          unauthAlarmStarted = 0;
          triggerBuzzer(80, 2);
          safeLcdPrint(slotRoom + " Key Taken", "Room Active");
          dispatchKeyStatusAsync(slotRoom.c_str(), false);
          lcdRevertAt = millis() + 1500;
          return;
        } else {
          Serial.printf("🚨 UNAUTHORIZED KEY REMOVAL! Key %s removed without scanning QR!\n", slotRoom.c_str());
          isUnauth = true;
          unauthAlarmStarted = millis(); // Start audible alarm timer

          // Update local slot tracking for heartbeat telemetry without queuing redundant Key Taken
          char unauthEvtId[32] = "";
          snprintf(unauthEvtId, sizeof(unauthEvtId), "%s-%lu", slotRoom.c_str(), millis());

          portENTER_CRITICAL(&stateMux);
          if (slotRoom == "203") {
            slotTargetState203 = false;
            slotNeedsSync203 = false;
            alertUnauthNeedsSync203 = true;
            snprintf(alertUnauthEventId203, sizeof(alertUnauthEventId203), "203-%lu", millis());
            updateAlertState203_underMux();
          } else if (slotRoom == "204") {
            slotTargetState204 = false;
            slotNeedsSync204 = false;
            alertUnauthNeedsSync204 = true;
            snprintf(alertUnauthEventId204, sizeof(alertUnauthEventId204), "204-%lu", millis());
            updateAlertState204_underMux();
          }
          portEXIT_CRITICAL(&stateMux);

          const char* curEvtId = (slotRoom == "203") ? alertUnauthEventId203 : (slotRoom == "204" ? alertUnauthEventId204 : unauthEvtId);
          persistIncidentState(slotRoom.c_str(), true, isWrong);
          persistPendingAlert(slotRoom.c_str(), true, "Unauthorized Removal", curEvtId);
          dispatchSecurityAlertAsync(slotRoom.c_str(), "Unauthorized Removal", curEvtId);
          showUnauthorizedScreen();
          buzzerOn(); // Immediate alarm tone without waiting for network!
          return;
        }
      }
    }
  }
}

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\n--- LabSync Device Booting (Dual-Core Architecture) ---");

  buzzerOff();
  isBuzzerCurrentlyOn = false;

  nvsMutex = xSemaphoreCreateMutex();

  // 74HC4051 Multiplexer Control Pins Initialization
  pinMode(MUX_S0_PIN, OUTPUT);
  pinMode(MUX_S1_PIN, OUTPUT);
  pinMode(MUX_S2_PIN, OUTPUT);
  digitalWrite(MUX_S0_PIN, LOW);
  digitalWrite(MUX_S1_PIN, LOW);
  digitalWrite(MUX_S2_PIN, LOW);

  // Configure ADC pin (GPIO34 -> Multiplexer Common Z)
  analogSetPinAttenuation(MUX_SIG_PIN, ADC_11db);
  analogReadResolution(12);
  delay(50);

  // Debounced startup ADC reading to prevent transient false triggers
  KeyType boot203 = detectKeyType(KEY_PIN_203);
  KeyType boot204 = detectKeyType(KEY_PIN_204);
  delay(40);
  KeyType vBoot203 = detectKeyType(KEY_PIN_203);
  KeyType vBoot204 = detectKeyType(KEY_PIN_204);
  lastSlotState203 = (boot203 == vBoot203) ? boot203 : detectKeyType(KEY_PIN_203);
  lastSlotState204 = (boot204 == vBoot204) ? boot204 : detectKeyType(KEY_PIN_204);

  // Startup read for remaining multiplexer channels
  lastSlotState201 = detectKeyType(MUX_CH_201);
  lastSlotState202 = detectKeyType(MUX_CH_202);
  lastSlotState205 = detectKeyType(MUX_CH_205);
  lastSlotState206 = detectKeyType(MUX_CH_206);
  lastSlotState303 = detectKeyType(MUX_CH_303);
  lastSlotState304 = detectKeyType(MUX_CH_304);

  portENTER_CRITICAL(&stateMux);
  slotTargetState203 = (lastSlotState203 != KEY_NONE);
  slotTargetState204 = (lastSlotState204 != KEY_NONE);
  portEXIT_CRITICAL(&stateMux);

  // Load persisted security incidents and pending events from NVS
  bool pUnauth203 = false, pWrong203 = false;
  bool pUnauth204 = false, pWrong204 = false;
  bool pUAlert203 = false, pWAlert203 = false;
  char pUEvt203[32] = "", pWEvt203[32] = "";
  bool pUAlert204 = false, pWAlert204 = false;
  char pUEvt204[32] = "", pWEvt204[32] = "";

  if (takeNvsMutex()) {
    Preferences prefs;
    if (prefs.begin("labsync_sec", true)) { // Read-only startup query
      pUnauth203 = prefs.getBool("unauth203", false);
      pWrong203 = prefs.getBool("wrong203", false);
      pUnauth204 = prefs.getBool("unauth204", false);
      pWrong204 = prefs.getBool("wrong204", false);

      pUAlert203 = prefs.getBool("pUAlert203", false);
      if (pUAlert203) prefs.getString("pUEvt203", pUEvt203, sizeof(pUEvt203));

      pWAlert203 = prefs.getBool("pWAlert203", false);
      if (pWAlert203) prefs.getString("pWEvt203", pWEvt203, sizeof(pWEvt203));

      pUAlert204 = prefs.getBool("pUAlert204", false);
      if (pUAlert204) prefs.getString("pUEvt204", pUEvt204, sizeof(pUEvt204));

      pWAlert204 = prefs.getBool("pWAlert204", false);
      if (pWAlert204) prefs.getString("pWEvt204", pWEvt204, sizeof(pWEvt204));

      // Legacy migration fallback for prior pAlert203 / pAlert204 records
      bool pAlert203 = prefs.getBool("pAlert203", false);
      if (pAlert203 && !pUAlert203 && !pWAlert203) {
        char pType203[32] = "", pEvt203[32] = "";
        prefs.getString("pType203", pType203, sizeof(pType203));
        prefs.getString("pEvt203", pEvt203, sizeof(pEvt203));
        if (strcmp(pType203, "Wrong Key Slot") == 0) {
          pWAlert203 = true;
          strncpy(pWEvt203, pEvt203, sizeof(pWEvt203) - 1);
        } else {
          pUAlert203 = true;
          strncpy(pUEvt203, pEvt203, sizeof(pUEvt203) - 1);
        }
      }

      bool pAlert204 = prefs.getBool("pAlert204", false);
      if (pAlert204 && !pUAlert204 && !pWAlert204) {
        char pType204[32] = "", pEvt204[32] = "";
        prefs.getString("pType204", pType204, sizeof(pType204));
        prefs.getString("pEvt204", pEvt204, sizeof(pEvt204));
        if (strcmp(pType204, "Wrong Key Slot") == 0) {
          pWAlert204 = true;
          strncpy(pWEvt204, pEvt204, sizeof(pWEvt204) - 1);
        } else {
          pUAlert204 = true;
          strncpy(pUEvt204, pEvt204, sizeof(pUEvt204) - 1);
        }
      }

      prefs.end();
    }
    giveNvsMutex();
  }

  PersistentAlertItem startupAlerts[MAX_PERSISTENT_ALERTS];
  int startupAlertCount = loadPersistentAlertsFromNvs(startupAlerts, MAX_PERSISTENT_ALERTS);

  // If queue was empty but legacy keys were present, initialize queue from legacy keys
  if (startupAlertCount == 0) {
    if (pUAlert203 && pUEvt203[0] != '\0') persistPendingAlert("203", true, "Unauthorized Removal", pUEvt203);
    if (pWAlert203 && pWEvt203[0] != '\0') persistPendingAlert("203", true, "Wrong Key Slot", pWEvt203);
    if (pUAlert204 && pUEvt204[0] != '\0') persistPendingAlert("204", true, "Unauthorized Removal", pUEvt204);
    if (pWAlert204 && pWEvt204[0] != '\0') persistPendingAlert("204", true, "Wrong Key Slot", pWEvt204);
    startupAlertCount = loadPersistentAlertsFromNvs(startupAlerts, MAX_PERSISTENT_ALERTS);
  }

  // --- SLOT 203 STARTUP VALIDATION ---
  if (lastSlotState203 != KEY_NONE && lastSlotState203 != KEY_203) {
    // Wrong key detected in Slot 203 (e.g. Key 204 placed in Slot 203)
    Serial.println("🚨 STARTUP WARNING: Wrong key detected in Slot 203!");
    isWrongKey203 = true;
    wrongKeyAlarmStarted203 = millis();

    // If Room 203 key was previously removed without authorization, latch remains active!
    if (pUnauth203) {
      Serial.println("🚨 STARTUP ALARM: Unresolved unauthorized removal on Room 203 restored from NVS!");
      isUnauthorized203 = true;
      unauthorizedAlarmStarted203 = millis();
    }

    portENTER_CRITICAL(&stateMux);
    if (pUAlert203) {
      alertUnauthNeedsSync203 = true;
      strncpy(alertUnauthEventId203, pUEvt203, sizeof(alertUnauthEventId203) - 1);
    }
    updateAlertState203_underMux();
    portEXIT_CRITICAL(&stateMux);

    bool shouldQueueWrong203 = !pWrong203 || pWAlert203;
    if (shouldQueueWrong203) {
      char evtId[32] = "";
      if (pWAlert203 && pWEvt203[0] != '\0') {
        strncpy(evtId, pWEvt203, sizeof(evtId) - 1);
      } else {
        snprintf(evtId, sizeof(evtId), "203-wrong-%lu", millis());
        persistPendingAlert("203", true, "Wrong Key Slot", evtId);
      }

      portENTER_CRITICAL(&stateMux);
      alertWrongNeedsSync203 = true;
      strncpy(alertWrongEventId203, evtId, sizeof(alertWrongEventId203) - 1);
      updateAlertState203_underMux();
      portEXIT_CRITICAL(&stateMux);
    }

    persistIncidentState("203", pUnauth203, true);
  } else if (lastSlotState203 == KEY_203) {
    // Correct key is physically present and secured in Slot 203
    isWrongKey203 = false;
    isUnauthorized203 = false;
    persistIncidentState("203", false, false);
    portENTER_CRITICAL(&stateMux);
    if (pUAlert203) {
      alertUnauthNeedsSync203 = true;
      strncpy(alertUnauthEventId203, pUEvt203, sizeof(alertUnauthEventId203) - 1);
    }
    if (pWAlert203) {
      alertWrongNeedsSync203 = true;
      strncpy(alertWrongEventId203, pWEvt203, sizeof(alertWrongEventId203) - 1);
    }
    updateAlertState203_underMux();
    portEXIT_CRITICAL(&stateMux);
  } else if (lastSlotState203 == KEY_NONE) {
    // Slot 203 is physically empty
    isWrongKey203 = false;
    if (pUnauth203) {
      // Unresolved unauthorized removal survives reboot
      Serial.println("🚨 STARTUP ALARM: Unresolved unauthorized removal on Room 203 restored from NVS!");
      isUnauthorized203 = true;
      unauthorizedAlarmStarted203 = millis();
    } else {
      // Legitimate absence (borrowed with authorization or idle) - no alarm
      isUnauthorized203 = false;
    }
    portENTER_CRITICAL(&stateMux);
    if (pUAlert203) {
      alertUnauthNeedsSync203 = true;
      strncpy(alertUnauthEventId203, pUEvt203, sizeof(alertUnauthEventId203) - 1);
    }
    if (pWAlert203) {
      alertWrongNeedsSync203 = true;
      strncpy(alertWrongEventId203, pWEvt203, sizeof(alertWrongEventId203) - 1);
    }
    updateAlertState203_underMux();
    portEXIT_CRITICAL(&stateMux);
  }

  // --- SLOT 204 STARTUP VALIDATION ---
  if (lastSlotState204 != KEY_NONE && lastSlotState204 != KEY_204) {
    // Wrong key detected in Slot 204 (e.g. Key 203 placed in Slot 204)
    Serial.println("🚨 STARTUP WARNING: Wrong key detected in Slot 204!");
    isWrongKey204 = true;
    wrongKeyAlarmStarted204 = millis();

    // If Room 204 key was previously removed without authorization, latch remains active!
    if (pUnauth204) {
      Serial.println("🚨 STARTUP ALARM: Unresolved unauthorized removal on Room 204 restored from NVS!");
      isUnauthorized204 = true;
      unauthorizedAlarmStarted204 = millis();
    }

    portENTER_CRITICAL(&stateMux);
    if (pUAlert204) {
      alertUnauthNeedsSync204 = true;
      strncpy(alertUnauthEventId204, pUEvt204, sizeof(alertUnauthEventId204) - 1);
    }
    updateAlertState204_underMux();
    portEXIT_CRITICAL(&stateMux);

    bool shouldQueueWrong204 = !pWrong204 || pWAlert204;
    if (shouldQueueWrong204) {
      char evtId[32] = "";
      if (pWAlert204 && pWEvt204[0] != '\0') {
        strncpy(evtId, pWEvt204, sizeof(evtId) - 1);
      } else {
        snprintf(evtId, sizeof(evtId), "204-wrong-%lu", millis());
        persistPendingAlert("204", true, "Wrong Key Slot", evtId);
      }

      portENTER_CRITICAL(&stateMux);
      alertWrongNeedsSync204 = true;
      strncpy(alertWrongEventId204, evtId, sizeof(alertWrongEventId204) - 1);
      updateAlertState204_underMux();
      portEXIT_CRITICAL(&stateMux);
    }

    persistIncidentState("204", pUnauth204, true);
  } else if (lastSlotState204 == KEY_204) {
    // Correct key is physically present and secured in Slot 204
    isWrongKey204 = false;
    isUnauthorized204 = false;
    persistIncidentState("204", false, false);
    portENTER_CRITICAL(&stateMux);
    if (pUAlert204) {
      alertUnauthNeedsSync204 = true;
      strncpy(alertUnauthEventId204, pUEvt204, sizeof(alertUnauthEventId204) - 1);
    }
    if (pWAlert204) {
      alertWrongNeedsSync204 = true;
      strncpy(alertWrongEventId204, pWEvt204, sizeof(alertWrongEventId204) - 1);
    }
    updateAlertState204_underMux();
    portEXIT_CRITICAL(&stateMux);
  } else if (lastSlotState204 == KEY_NONE) {
    // Slot 204 is physically empty
    isWrongKey204 = false;
    if (pUnauth204) {
      // Unresolved unauthorized removal survives reboot
      Serial.println("🚨 STARTUP ALARM: Unresolved unauthorized removal on Room 204 restored from NVS!");
      isUnauthorized204 = true;
      unauthorizedAlarmStarted204 = millis();
    } else {
      // Legitimate absence (borrowed with authorization or idle) - no alarm
      isUnauthorized204 = false;
    }
    portENTER_CRITICAL(&stateMux);
    if (pUAlert204) {
      alertUnauthNeedsSync204 = true;
      strncpy(alertUnauthEventId204, pUEvt204, sizeof(alertUnauthEventId204) - 1);
    }
    if (pWAlert204) {
      alertWrongNeedsSync204 = true;
      strncpy(alertWrongEventId204, pWEvt204, sizeof(alertWrongEventId204) - 1);
    }
    updateAlertState204_underMux();
    portEXIT_CRITICAL(&stateMux);
  }

  // Initialize LCD & Mutex
  i2cMutex = xSemaphoreCreateMutex();
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  Wire.setTimeOut(50); // 50ms I2C timeout protects against infinite bus lockup
  byte count = 0;
  byte foundAddress = 0;

  for (byte i = 8; i < 120; i++) {
    Wire.beginTransmission(i);
    if (Wire.endTransmission() == 0) {
      foundAddress = i;
      count++;
    }
  }

  unsigned long connectingScreenShownAt = 0;
  if (count > 0 && foundAddress != 0) {
    lcd = LiquidCrystal_I2C(foundAddress, 16, 2);
    lcd.init();
    lcd.backlight();
    lcdDetected = true; // MUST be true before safeLcdPrint can succeed
    safeLcdPrint("Connecting to", "Wi-Fi...");
    connectingScreenShownAt = millis();
  }

  // Initialize GM65 Scanner
  Serial2.begin(9600, SERIAL_8N1, GM65_RX_PIN, GM65_TX_PIN);
  clearSerialBuffer();

  // Create FreeRTOS Network Queue (16 elements)
  netQueue = xQueueCreate(NET_QUEUE_LEN, sizeof(NetMessage));

  // Promote any staged overflow alerts if space is available in primary queue
  if (takeNvsMutex()) {
    Preferences prefs;
    if (prefs.begin("labsync_sec", false)) {
      while (promotePersistentOverflowIfSpaceAvailable(prefs)) {}
      int currentOvf = prefs.getInt("pQ_ovf_cnt", 0);
      if (currentOvf > 0) {
        Serial.printf("⚠️ [NVS OVERFLOW] %d alert(s) staged in persistent overflow buffer awaiting queue capacity\n", currentOvf);
      }
      prefs.end();
    }
    giveNvsMutex();
  }

  // Reload all persistent alerts (including any new startup validation alerts or promoted items)
  startupAlertCount = loadPersistentAlertsFromNvs(startupAlerts, MAX_PERSISTENT_ALERTS);

  // Enqueue all pending alerts from NVS queue
  for (int i = 0; i < startupAlertCount; i++) {
    dispatchSecurityAlertAsync(startupAlerts[i].room, startupAlerts[i].alertType, startupAlerts[i].eventId);
  }
  refreshAlertStateFromNvs();

  // Connect Wi-Fi
  WiFi.setAutoReconnect(true); // Enable ESP32 hardware Wi-Fi auto-reconnect
  WiFi.setSleep(false); // Disable modem sleep to prevent latency spikes and ARP drops
  WiFi.begin(ssid, password);
  int wifiTimeout = 0;
  while (WiFi.status() != WL_CONNECTED && wifiTimeout < 30) {
    delay(300);
    Serial.print(".");
    wifiTimeout++;
  }
  
  // Enforce small minimum display time (~800ms) so "Connecting to Wi-Fi..." is visibly readable
  if (connectingScreenShownAt > 0) {
    while (millis() - connectingScreenShownAt < 800) {
      delay(50);
    }
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nConnected to Wi-Fi!");
    triggerBuzzer(80, 1);
    safeLcdPrint("Connected!", "Wi-Fi Ready     ");
    delay(1200); // 1.2s confirmation screen
  } else {
    Serial.println("\nWi-Fi connection timed out!");
    safeLcdPrint("Wi-Fi Offline", "Scan/Retry Later");
    delay(1500); // 1.5s offline notification screen
  }

  // Spawn Dedicated Network Worker Task pinned to Core 0 (8192 bytes stack)
  xTaskCreatePinnedToCore(
    networkWorkerTask,   // Task function
    "NetWorkerTask",     // Task name
    8192,                // Stack size in bytes
    NULL,                // Parameter
    1,                   // Priority (1 = background network priority)
    &netTaskHandle,      // Task handle
    0                    // Core 0 (dedicated network core)
  );

  if (lcdDetected) {
    if (isUnauthorized203 || isUnauthorized204 || isUnauthorized201 || isUnauthorized202 ||
        isUnauthorized205 || isUnauthorized206 || isUnauthorized303 || isUnauthorized304) {
      showUnauthorizedScreen();
    } else if (isWrongKey203 || isWrongKey204 || isWrongKey201 || isWrongKey202 ||
               isWrongKey205 || isWrongKey206 || isWrongKey303 || isWrongKey304) {
      showWrongKeyScreen();
    } else {
      showReadyScreen();
    }
  }

  if (isUnauthorized203 || isUnauthorized204 || isWrongKey203 || isWrongKey204 ||
      isUnauthorized201 || isUnauthorized202 || isUnauthorized205 || isUnauthorized206 ||
      isUnauthorized303 || isUnauthorized304 || isWrongKey201 || isWrongKey202 ||
      isWrongKey205 || isWrongKey206 || isWrongKey303 || isWrongKey304) {
    buzzerOn();
  }
}

// Main Hardware Monitoring Loop (Runs on Core 1)
void loop() {
  bool anyUnauth = isUnauthorized201 || isUnauthorized202 || isUnauthorized203 || isUnauthorized204 ||
                   isUnauthorized205 || isUnauthorized206 || isUnauthorized303 || isUnauthorized304;
  bool anyWrong  = isWrongKey201 || isWrongKey202 || isWrongKey203 || isWrongKey204 ||
                   isWrongKey205 || isWrongKey206 || isWrongKey303 || isWrongKey304;
  bool alarmActive = (isUnauthorized203 || isUnauthorized204 || isWrongKey203 || isWrongKey204 || anyUnauth || anyWrong);

  // 1. GM65 Scanner Detection with state machine and lock
  String scannedCode = readScannedCode();
  if (scannedCode.length() > 0) {
    unsigned long scanCompleteMs = millis();

    QrAuthState curState;
    uint32_t curScanId;
    bool curAuth;
    unsigned long curAuthExpires;
    portENTER_CRITICAL(&authMux);
    curState = qrAuthState;
    curScanId = activeScanId;
    curAuth = isAuthorized;
    curAuthExpires = authExpiresAt;
    portEXIT_CRITICAL(&authMux);

    if (curState == QR_AUTH_VERIFYING) {
      // Discard repeated scan while first scan is verifying
      Serial.printf("[GM65] Scan ignored: Verification already in progress (Scan #%lu)\n", (unsigned long)curScanId);
      clearSerialBuffer();
    } else if (curState == QR_AUTH_GRANTED_AWAITING_TAKE || curAuth) {
      // Discard competing scan while authorization is awaiting physical key withdrawal
      Serial.printf("[GM65] Scan ignored: Authorization active, awaiting physical key withdrawal (Expires in %lu ms)\n",
                    (curAuthExpires > millis()) ? (curAuthExpires - millis()) : 0);
      clearSerialBuffer();

      static unsigned long lastLockedMsgMs = 0;
      if (millis() - lastLockedMsgMs >= 2000) {
        lastLockedMsgMs = millis();
        safeLcdPrint("TAKE YOUR KEY   ", "SCAN LOCKED     ");
        lcdRevertAt = millis() + 1500;
      }
    } else {
      // Idle: Atomically claim the authorization lock for this scan
      uint32_t newScanId = 0;
      portENTER_CRITICAL(&authMux);
      if (qrAuthState == QR_AUTH_IDLE && !isAuthorized) {
        newScanId = ++globalScanCounter;
        activeScanId = newScanId;
        qrAuthState = QR_AUTH_VERIFYING;
        verifyingStartedMs = millis();
      }
      portEXIT_CRITICAL(&authMux);

      if (newScanId > 0) {
        buzzerOff();
        safeLcdPrint("VERIFYING QR... ", "PLEASE WAIT...  ");
        dispatchQrScanAsync(scannedCode, scanCompleteMs, newScanId);
        clearSerialBuffer();

        // Handle retroactive authorization if alarm was active
        if (isUnauthorized203 || isUnauthorized204 || isUnauthorized201 || isUnauthorized202 ||
            isUnauthorized205 || isUnauthorized206 || isUnauthorized303 || isUnauthorized304) {
          if (isUnauthorized204 && !isUnauthorized203) {
            isUnauthorized204 = false;
            unauthorizedAlarmStarted204 = 0;
            persistIncidentState("204", false, isWrongKey204);
            dispatchKeyStatusAsync("204", false);
          } else if (isUnauthorized203 && !isUnauthorized204) {
            isUnauthorized203 = false;
            unauthorizedAlarmStarted203 = 0;
            persistIncidentState("203", false, isWrongKey203);
            dispatchKeyStatusAsync("203", false);
          } else if (isUnauthorized203 && isUnauthorized204) {
            isUnauthorized204 = false;
            isUnauthorized203 = false;
            unauthorizedAlarmStarted204 = 0;
            unauthorizedAlarmStarted203 = 0;
            persistIncidentState("203", false, isWrongKey203);
            persistIncidentState("204", false, isWrongKey204);
            dispatchKeyStatusAsync("204", false);
            dispatchKeyStatusAsync("203", false);
          }
          if (isUnauthorized201) { isUnauthorized201 = false; unauthorizedAlarmStarted201 = 0; persistIncidentState("201", false, isWrongKey201); dispatchKeyStatusAsync("201", false); }
          if (isUnauthorized202) { isUnauthorized202 = false; unauthorizedAlarmStarted202 = 0; persistIncidentState("202", false, isWrongKey202); dispatchKeyStatusAsync("202", false); }
          if (isUnauthorized205) { isUnauthorized205 = false; unauthorizedAlarmStarted205 = 0; persistIncidentState("205", false, isWrongKey205); dispatchKeyStatusAsync("205", false); }
          if (isUnauthorized206) { isUnauthorized206 = false; unauthorizedAlarmStarted206 = 0; persistIncidentState("206", false, isWrongKey206); dispatchKeyStatusAsync("206", false); }
          if (isUnauthorized303) { isUnauthorized303 = false; unauthorizedAlarmStarted303 = 0; persistIncidentState("303", false, isWrongKey303); dispatchKeyStatusAsync("303", false); }
          if (isUnauthorized304) { isUnauthorized304 = false; unauthorizedAlarmStarted304 = 0; persistIncidentState("304", false, isWrongKey304); dispatchKeyStatusAsync("304", false); }

          portENTER_CRITICAL(&authMux);
          isAuthorized = false;
          qrAuthState = QR_AUTH_IDLE;
          activeScanId = 0;
          portEXIT_CRITICAL(&authMux);

          buzzerOff();
          triggerBuzzer(80, 2);
          safeLcdPrint("Access Granted! ", "Key Authorized  ");
          lcdRevertAt = millis() + 1500;
        }
      } else {
        clearSerialBuffer();
      }
    }
  }

  // 2. Multi-Slot Key Monitoring: All 8 channels checked on Core 1 via Multiplexer!
  handleKeySlot(MUX_CH_201, lastSlotState201, "201", KEY_201, isUnauthorized201, isWrongKey201, unauthorizedAlarmStarted201, wrongKeyAlarmStarted201);
  handleKeySlot(MUX_CH_202, lastSlotState202, "202", KEY_202, isUnauthorized202, isWrongKey202, unauthorizedAlarmStarted202, wrongKeyAlarmStarted202);
  handleKeySlot(KEY_PIN_203, lastSlotState203, "203", KEY_203, isUnauthorized203, isWrongKey203, unauthorizedAlarmStarted203, wrongKeyAlarmStarted203);
  handleKeySlot(KEY_PIN_204, lastSlotState204, "204", KEY_204, isUnauthorized204, isWrongKey204, unauthorizedAlarmStarted204, wrongKeyAlarmStarted204);
  handleKeySlot(MUX_CH_205, lastSlotState205, "205", KEY_205, isUnauthorized205, isWrongKey205, unauthorizedAlarmStarted205, wrongKeyAlarmStarted205);
  handleKeySlot(MUX_CH_206, lastSlotState206, "206", KEY_206, isUnauthorized206, isWrongKey206, unauthorizedAlarmStarted206, wrongKeyAlarmStarted206);
  handleKeySlot(MUX_CH_303, lastSlotState303, "303", KEY_303, isUnauthorized303, isWrongKey303, unauthorizedAlarmStarted303, wrongKeyAlarmStarted303);
  handleKeySlot(MUX_CH_304, lastSlotState304, "304", KEY_304, isUnauthorized304, isWrongKey304, unauthorizedAlarmStarted304, wrongKeyAlarmStarted304);

  // 3. Alarm Buzzer Sounding (Non-blocking: 70ms on, 50ms off with 30s auto-stop)
  bool audible201 = (isUnauthorized201 && (millis() - unauthorizedAlarmStarted201 < SECURITY_ALARM_MAX_DURATION_MS)) ||
                    (isWrongKey201 && (millis() - wrongKeyAlarmStarted201 < SECURITY_ALARM_MAX_DURATION_MS));
  bool audible202 = (isUnauthorized202 && (millis() - unauthorizedAlarmStarted202 < SECURITY_ALARM_MAX_DURATION_MS)) ||
                    (isWrongKey202 && (millis() - wrongKeyAlarmStarted202 < SECURITY_ALARM_MAX_DURATION_MS));
  bool audible203 = (isUnauthorized203 && (millis() - unauthorizedAlarmStarted203 < SECURITY_ALARM_MAX_DURATION_MS)) ||
                    (isWrongKey203 && (millis() - wrongKeyAlarmStarted203 < SECURITY_ALARM_MAX_DURATION_MS));
  bool audible204 = (isUnauthorized204 && (millis() - unauthorizedAlarmStarted204 < SECURITY_ALARM_MAX_DURATION_MS)) ||
                    (isWrongKey204 && (millis() - wrongKeyAlarmStarted204 < SECURITY_ALARM_MAX_DURATION_MS));
  bool audible205 = (isUnauthorized205 && (millis() - unauthorizedAlarmStarted205 < SECURITY_ALARM_MAX_DURATION_MS)) ||
                    (isWrongKey205 && (millis() - wrongKeyAlarmStarted205 < SECURITY_ALARM_MAX_DURATION_MS));
  bool audible206 = (isUnauthorized206 && (millis() - unauthorizedAlarmStarted206 < SECURITY_ALARM_MAX_DURATION_MS)) ||
                    (isWrongKey206 && (millis() - wrongKeyAlarmStarted206 < SECURITY_ALARM_MAX_DURATION_MS));
  bool audible303 = (isUnauthorized303 && (millis() - unauthorizedAlarmStarted303 < SECURITY_ALARM_MAX_DURATION_MS)) ||
                    (isWrongKey303 && (millis() - wrongKeyAlarmStarted303 < SECURITY_ALARM_MAX_DURATION_MS));
  bool audible304 = (isUnauthorized304 && (millis() - unauthorizedAlarmStarted304 < SECURITY_ALARM_MAX_DURATION_MS)) ||
                    (isWrongKey304 && (millis() - wrongKeyAlarmStarted304 < SECURITY_ALARM_MAX_DURATION_MS));
  bool shouldSoundAlarm = audible201 || audible202 || audible203 || audible204 ||
                          audible205 || audible206 || audible303 || audible304;

  if (shouldSoundAlarm) {
    unsigned long cycle = millis() % 120;
    if (cycle < 70) buzzerOn();
    else buzzerOff();
  } else {
    buzzerOff();
  }

  // 4. Non-Blocking LCD Screen Reversion
  if (lcdRevertAt > 0 && millis() >= lcdRevertAt) {
    lcdRevertAt = 0;
    clearSerialBuffer();
    if (isUnauthorized203 || isUnauthorized204 || isUnauthorized201 || isUnauthorized202 ||
        isUnauthorized205 || isUnauthorized206 || isUnauthorized303 || isUnauthorized304) {
      showUnauthorizedScreen();
    } else if (isWrongKey203 || isWrongKey204 || isWrongKey201 || isWrongKey202 ||
               isWrongKey205 || isWrongKey206 || isWrongKey303 || isWrongKey304) {
      showWrongKeyScreen();
    } else if (!isAuthorized && qrAuthState == QR_AUTH_IDLE) {
      showReadyScreen();
    }
  }

  // 5. Verification Watchdog Timeout (prevents permanent lock if network worker is blocked)
  if (qrAuthState == QR_AUTH_VERIFYING && (millis() - verifyingStartedMs >= QR_VERIFY_TIMEOUT_MS)) {
    portENTER_CRITICAL(&authMux);
    qrAuthState = QR_AUTH_IDLE;
    activeScanId = 0;
    isAuthorized = false;
    portEXIT_CRITICAL(&authMux);

    triggerBuzzer(250, 1);
    safeLcdPrint("Network Timeout ", "Please Retry    ");
    lcdRevertAt = millis() + 2000;
  }

  // 6. Live Countdown Window Handling (when authorized and no alarm active)
  if (!alarmActive && (isAuthorized || qrAuthState == QR_AUTH_GRANTED_AWAITING_TAKE)) {
    if (millis() >= authExpiresAt) {
      // Authorization window expired without key withdrawal
      portENTER_CRITICAL(&authMux);
      isAuthorized = false;
      authExpiresAt = 0;
      qrAuthState = QR_AUTH_IDLE;
      activeScanId = 0;
      portEXIT_CRITICAL(&authMux);

      triggerBuzzer(180, 1);
      safeLcdPrint("Session Expired ", "Scan QR Again   ");
      lcdRevertAt = millis() + 1500;
    } else if (lcdRevertAt > 0 && millis() < lcdRevertAt) {
      // Hold authorization result screen ("ACCESS GRANTED" + user name) until display timer expires
    } else {
      int secLeft = (int)((authExpiresAt - millis() + 999) / 1000);
      if (secLeft != lastDisplayedCountdown) {
        lastDisplayedCountdown = secLeft;
        String cdText = "Take Key: " + String(secLeft) + "s   ";
        safeLcdPrint("Access Granted! ", cdText);
      }
    }
  }

  delay(10);
}
