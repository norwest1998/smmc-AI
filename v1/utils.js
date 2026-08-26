/** Utility helpers */
function formatDate(d){
return d ? Utilities.formatDate(new Date(d), Session.getScriptTimeZone(), 'dd/MM/yyyy') : '';
}

function tryNormalizeDate(dateRaw) {
    if (!dateRaw) return null;

    // 1. Convert the raw string into a Date object.
    const date = new Date(dateRaw);

    if (!isNaN(date.getTime())) {
        // We do NOT use UTC methods like getUTCMonth() or toISOString() 
        // to ensure we keep the local date (Nov 08, not Nov 07).

        // Get the local day, month, and year.
        const year = date.getFullYear();
        // Month is 0-indexed (0 = Jan, 10 = Nov), so add 1
        const month = date.getMonth() + 1; 
        const day = date.getDate();

        // Helper function to pad single-digit numbers with a leading zero.
        const pad = (num) => String(num).padStart(2, '0');

        // Format and return as MM/DD/YYYY
        // Note: The original code also had a call to formatDate(date), 
        // which has been removed as it's not defined and likely unnecessary
        // with the new formatting logic.
        return `${pad(day)}/${pad(month)}/${year}`;
    }

    // Return raw string if normalization fails
    return dateRaw; 
}