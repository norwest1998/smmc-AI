const PROP_GEMINI_API_KEY = "GEMINI_API_KEY";
const PROP_IMAGE_LIBRARY_ID = "IMAGE_LIBRARY_ID";

let CONFIG_CACHE = null;
let GEMINI_API_KEY = null;
let IMAGE_LIBRARY_ID = null;

if (!CONFIG_CACHE) {
    CONFIG_CACHE = getConfig();
    GEMINI_API_KEY = CONFIG_CACHE.geminiKey;
    IMAGE_LIBRARY_ID = CONFIG_CACHE.imageFolderId;
}

function getConfig() {
  const props = PropertiesService.getScriptProperties();
  return {
    imageFolderId: props.getProperty(PROP_IMAGE_LIBRARY_ID) || null,
    geminiKey:     props.getProperty(PROP_GEMINI_API_KEY) || null,
  };
}

Logger.log("key: " + GEMINI_API_KEY);
