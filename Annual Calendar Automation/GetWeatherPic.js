/**
 * Returns a background image URL for a given race date (Saturday)
 *
 * @param {Date} raceDate
 * @return {string} image URL
 */
function getWeatherPic(raceDate) {
  Logger.log ("Getting Image");

  const tz = Session.getScriptTimeZone();
  const dateKey = Utilities.formatDate(raceDate, tz, 'yyyy-MM-dd');

  // -------------------------
  // Cache check
  // -------------------------
  const cache = CacheService.getScriptCache();
  const cached = cache.get('weatherPic_' + dateKey);
  if (cached) {
    Logger.log("Cached: " + cached)
    return cached;
  }

  try {
    const ss = SpreadsheetApp.openById(WEATHER_SS_ID);

    // -------------------------
    // DAILY FORECAST LOOKUP
    // -------------------------
    const dailySheet = ss.getSheetByName(DAILY_SHEET_NAME);
    if (!dailySheet) throw new Error('Daily sheet not found');

    const dailyData = dailySheet.getDataRange().getValues();
    if (dailyData.length < 2) throw new Error('No daily data');

    const header = dailyData[0];
    const dateCol = header.indexOf('Date');
    const codeCol = header.indexOf('weather_code');

    if (dateCol === -1 || codeCol === -1) {
      throw new Error('Required columns missing in daily sheet');
    }

    let weatherCode = null;

    for (let i = 1; i < dailyData.length; i++) {
      const rowDate = dailyData[i][dateCol];
      if (!(rowDate instanceof Date)) continue;

      const rowKey = Utilities.formatDate(rowDate, tz, 'yyyy-MM-dd');
      if (rowKey === dateKey) {
        Logger.log("HaVE TEH CODE");
        weatherCode = dailyData[i][codeCol];
        break;
      }
    }
Logger.log("weather code: " + weatherCode);
    if (!weatherCode) {
      cache.put(
        'weatherPic_' + dateKey,
        DEFAULT_BG_IMAGE,
        WEATHER_PIC_CACHE_HOURS * 3600
      );
      return DEFAULT_BG_IMAGE;
    }

    // -------------------------
    // IMAGE REGISTRY LOOKUP
    // -------------------------
    const imgSheet = ss.getSheetByName(IMAGE_REGISTRY_SHEET);
    if (!imgSheet) throw new Error('Image registry sheet not found');

    const imgData = imgSheet.getDataRange().getValues();
    const imgHeader = imgData[0];

    const codeIdx = imgHeader.indexOf('Code');
    const imgIdx = imgHeader.indexOf('Image');
    const activeIdx = imgHeader.indexOf('Active');

    if (codeIdx === -1 || imgIdx === -1) {
      throw new Error('Image registry columns missing');
    }

    let image = null;
    let imageUrl = null;

    for (let i = 1; i < imgData.length; i++) {
      const row = imgData[i];
      if (row[codeIdx] == weatherCode && row[activeIdx] !== false) {
        image = row[imgIdx];
        break;
      }
    }
    Logger.log("image: " + image);
    imageUrl = getDriveImageUrl(image, size = 1200)
    Logger.log("imageurl: " + imageUrl);
    const finalImage = imageUrl || DEFAULT_BG_IMAGE;

    // -------------------------
    // Cache result
    // -------------------------
    cache.put(
      'weatherPic_' + dateKey,
      finalImage,
      WEATHER_PIC_CACHE_HOURS * 3600
    );

    return finalImage;

  } catch (err) {
    Logger.log('getWeatherPic error: ' + err);
    return DEFAULT_BG_IMAGE;
  }
}

