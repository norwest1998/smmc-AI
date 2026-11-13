/* EventNotices.js
 * Logic for scanning the Annual Calendar on Wednesdays, generating DRAFT notices,
 * auto-approving them on Thursday 08:00, and compositing image graphics.
 */

// 1. WEDNESDAY 08:00 TRIGGER: Generate DRAFT Notices for Upcoming Weekend
function createWednesdayEventNotices() {
  const cfg = getConfig();
  const queueSs = SpreadsheetApp.openById(cfg.fbPostingSheetID);
  const queueSheet = queueSs.getSheetByName("Queue");
  
  const calSheet = getCalendarEventDataSheet_();
  if (!calSheet) throw new Error("Could not locate Calendar 'Event Data' sheet.");

  const calRows = calSheet.getDataRange().getValues();
  const calHeaders = calRows[0].map(h => String(h).trim().toLowerCase());
  
  const colDate = calHeaders.indexOf("date");
  const colType = calHeaders.indexOf("event type");
  const colClass = calHeaders.indexOf("class");
  const colRegatta = calHeaders.indexOf("regatta type");
  const colEventName = calHeaders.indexOf("event");
  const colStart = calHeaders.indexOf("start");
  const colFinish = calHeaders.indexOf("finish");
  const colHex = calHeaders.indexOf("hexkey");
  const colResults = calHeaders.indexOf("results");

  const today = new Date();
  const targetDates = getUpcomingWeekendDates_(today);

  // Read existing queue to prevent duplicate event notices
  const queueData = queueSheet.getDataRange().getValues();
  const existingKeys = new Set();
  for (let i = 1; i < queueData.length; i++) {
    const key = queueData[i][2]; // Col 3: HexKey / CalendarHexKey
    if (key) existingKeys.add(String(key).trim());
  }

  for (let r = 1; r < calRows.length; r++) {
    const row = calRows[r];
    const eventType = String(row[colType] || "").trim();
    const results = String(row[colResults] || "").trim();
    if (eventType !== "Competition" || results === "Cancelled") continue;

    const rowDateStr = formatDateStandard_(row[colDate]);
    if (!targetDates.includes(rowDateStr)) continue;

    const hexKey = String(row[colHex] || `${rowDateStr}|${row[colStart]}|${row[colClass]}`);
    if (existingKeys.has(hexKey)) continue;

    const className = String(row[colClass] || "").trim();
    const regattaType = String(row[colRegatta] || "").trim();
    const eventName = String(row[colEventName] || `${className} ${regattaType}`).trim();
    const startTime = formatTimeStandard_(row[colStart]);
    const finishTime = formatTimeStandard_(row[colFinish]);

    const weather = fetchWeatherForecast_(rowDateStr);
    const bgImageId = getDefaultBackgroundImageId_(className, cfg.eventBgFolderId);
    const tagline = "Spectators & new skippers are always welcome! Come down and see radio-controlled racing up close.";
    const caption = assembleEventCaption_({
      eventName: eventName,
      dateStr: rowDateStr,
      startTime: startTime,
      finishTime: finishTime,
      weather: weather.summary,
      tagline: tagline
    });

    // Append exactly 18 columns strictly adhering to sheet schema
    queueSheet.appendRow([
      "DRAFT",                  // 1: Status
      "EVENT_NOTICE",            // 2: PostType
      hexKey,                   // 3: HexKey
      "",                       // 4: SpreadsheetId
      "",                       // 5: SheetId
      eventName,                // 6: SpreadsheetName
      className,                // 7: SheetName
      regattaType || eventName, // 8: RegattaName
      rowDateStr,               // 9: RaceDate
      bgImageId,                // 10: BackgroundImgID
      weather.summary,          // 11: WeatherSnippet
      tagline,                  // 12: TagLine
      caption,                  // 13: RaceReport
      new Date(),               // 14: Created
      "",                       // 15: Started
      "",                       // 16: PostID
      "",                       // 17: Completed
      ""                        // 18: Error
    ]);
  }
}

// 2. THURSDAY 08:00 TRIGGER: Auto-Approve Remaining DRAFT Notices
function autoApproveEventNotices() {
  const cfg = getConfig();
  const queueSs = SpreadsheetApp.openById(cfg.fbPostingSheetID);
  const queueSheet = queueSs.getSheetByName("Queue");
  const rows = queueSheet.getDataRange().getValues();

  for (let r = 1; r < rows.length; r++) {
    const status = rows[r][0];
    const postType = rows[r][1];

    if (status === "DRAFT" && postType === "EVENT_NOTICE") {
      queueSheet.getRange(r + 1, 1).setValue("PENDING");
    }
  }
}

// 3. GRAPHIC COMPOSITING ENGINE (High-Res 1200x630 via Google Slides API)
function renderEventNoticePNG(regattaName, raceDate, weatherSnippet, tagline, bgImageId) {
  // Create a temporary presentation for vector rasterization
  const presentation = SlidesApp.create(`Temp_Notice_${new Date().getTime()}`);
  const presId = presentation.getId();
  const slide = presentation.getSlides()[0];

  // Set 1200 x 630 px (converted to Points: 1 pt = 1.333 px)
  const widthPt = 900;
  const heightPt = 472.5;

  try {
    // 1. Insert Background Image if available
    if (bgImageId) {
      try {
        const bgFile = DriveApp.getFileById(bgImageId);
        slide.insertImage(bgFile.getBlob(), 0, 0, widthPt, heightPt);
      } catch (e) {
        console.warn("Could not insert background image:", e);
      }
    }

    // 2. Shading Overlay
    const shape = slide.insertShape(SlidesApp.ShapeType.RECTANGLE, 0, 0, widthPt, heightPt);
    shape.getFill().setSolidFill("#071b2c", 0.78);
    shape.getBorder().setTransparent();

    // 3. Header Badge
    const badge = slide.insertShape(SlidesApp.ShapeType.ROUNDED_RECTANGLE, 45, 30, 160, 26);
    badge.getFill().setSolidFill("#5eead4", 0.2);
    badge.getBorder().getLineFill().setSolidFill("#5eead4");
    badge.getText().setText("UPCOMING REGATTA");
    badge.getText().getTextStyle().setForegroundColor("#5eead4").setFontSize(10).setBold(true);

    // 4. Regatta Name Title
    const titleBox = slide.insertTextBox(regattaName, 45, 65, 810, 50);
    titleBox.getText().getTextStyle().setForegroundColor("#ffffff").setFontSize(28).setBold(true);

    // 5. Date & Venue
    const metaBox = slide.insertTextBox(`📅 ${raceDate}   |   📍 ${CLUB_INFO.venue}`, 45, 120, 810, 30);
    metaBox.getText().getTextStyle().setForegroundColor("#5eead4").setFontSize(14).setBold(true);

    // 6. Weather Card Box
    const wCard = slide.insertShape(SlidesApp.ShapeType.ROUNDED_RECTANGLE, 45, 160, 810, 75);
    wCard.getFill().setSolidFill("#ffffff", 0.08);
    wCard.getBorder().getLineFill().setSolidFill("#ffffff");
    wCard.getText().setText(`WEATHER & CONDITIONS OUTLOOK\n${weatherSnippet || "Check morning notice for wind details."}`);
    wCard.getText().getParagraphs()[0].getTextStyle().setForegroundColor("#ffb347").setFontSize(11).setBold(true);
    if (wCard.getText().getParagraphs().length > 1) {
      wCard.getText().getParagraphs()[1].getTextStyle().setForegroundColor("#ffffff").setFontSize(13);
    }

    // 7. Tagline
    const tagBox = slide.insertTextBox(`"${tagline || "Visitors and spectators welcome!"}"`, 45, 250, 810, 35);
    tagBox.getText().getTextStyle().setForegroundColor("#eaf6f6").setFontSize(13).setItalic(true);

    // 8. Footer Bar
    const footer = slide.insertTextBox(`${CLUB_INFO.name}  —  ${CLUB_INFO.website}`, 45, 430, 810, 30);
    footer.getText().getTextStyle().setForegroundColor("#a0b8c8").setFontSize(11);

    presentation.saveAndClose();

    // Export slide as genuine high-resolution PNG
    const exportUrl = `https://docs.google.com/presentation/d/${presId}/export/png?id=${presId}&pageid=${slide.getObjectId()}`;
    const response = UrlFetchApp.fetch(exportUrl, {
      headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true
    });

    return response.getBlob().setName("EventNotice.png");
  } finally {
    // Delete temporary presentation
    try { DriveApp.getFileById(presId).setTrashed(true); } catch (e) {}
  }
}

// 4. Background image listing API
function listAvailableBackgroundImages() {
  const cfg = getConfig();
  if (!cfg.eventBgFolderId) return [];
  try {
    const folder = DriveApp.getFolderById(cfg.eventBgFolderId);
    const files = folder.getFiles();
    const list = [];
    while (files.hasNext()) {
      const f = files.next();
      if (f.getMimeType().includes("image/")) {
        list.push({ id: f.getId(), name: f.getName() });
      }
    }
    return list;
  } catch(e) {
    return [];
  }
}

// --- Helpers ---
function assembleEventCaption_(opts) {
  return `⛵ UPCOMING EVENT NOTICE — ${CLUB_INFO.name}

🏆 ${opts.eventName}
📅 Date: ${opts.dateStr}
⏰ Time: ${opts.startTime} – ${opts.finishTime}
📍 Venue: ${CLUB_INFO.venue}

🌤️ WEATHER & CONDITIONS OUTLOOK:
${opts.weather}

💬 ${opts.tagline}

--------------------------------------------
🔗 Club Links & Info:
🌐 Website: ${CLUB_INFO.website}
📘 Facebook: ${CLUB_INFO.facebook}
💬 WhatsApp: ${CLUB_INFO.whatsApp}
📧 Contact: ${CLUB_INFO.email}

#SMMC #RadioSailing #ModelYachts #SydneySailing`;
}

function fetchWeatherForecast_(targetDateStr) {
  const cfg = getConfig();
  if (cfg.weatherApiUrl) {
    try {
      const res = UrlFetchApp.fetch(`${cfg.weatherApiUrl}?date=${encodeURIComponent(targetDateStr)}`, { muteHttpExceptions: true });
      const data = JSON.parse(res.getContentText());
      if (data && data.summary) return data;
    } catch (e) {
      console.warn("Weather fetch error:", e);
    }
  }
  return { summary: "Forecast: Light to moderate breeze. Full morning update on club channel." };
}

function getDefaultBackgroundImageId_(className, folderId) {
  if (!folderId) return "";
  try {
    const folder = DriveApp.getFolderById(folderId);
    const files = folder.getFiles();
    let fallbackId = "";
    while (files.hasNext()) {
      const f = files.next();
      const n = f.getName().toLowerCase();
      if (className && n.includes(className.toLowerCase())) return f.getId();
      if (n.includes("default") || n.includes("generic")) fallbackId = f.getId();
    }
    return fallbackId;
  } catch (e) {
    return "";
  }
}

function getUpcomingWeekendDates_(fromDate) {
  const dates = [];
  const curr = new Date(fromDate);
  for (let i = 1; i <= 7; i++) {
    const next = new Date(curr.getTime() + i * 86400000);
    const day = next.getDay();
    if (day === 6 || day === 0) {
      dates.push(formatDateStandard_(next));
    }
  }
  return dates;
}

function formatDateStandard_(d) {
  const dt = (d instanceof Date) ? d : new Date(d);
  if (isNaN(dt.getTime())) return String(d);
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const yyyy = dt.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function formatTimeStandard_(t) {
  return t ? String(t).trim() : "11:00 AM";
}

function getCalendarEventDataSheet_() {
  const cfg = getConfig();
  if (cfg.calendarSheetId) {
    return SpreadsheetApp.openById(cfg.calendarSheetId).getSheetByName("Event Data");
  }
  return SpreadsheetApp.getActive().getSheetByName("Event Data");
}