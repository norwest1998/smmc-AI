function wip() {
  // 7. Add medal overlays for top 3 ranks (gold, silver, bronze)
  if (raceRange) {      
      const values = raceRange.getValues();

      for (let i = 0; i < values.length; i++) {
        for (let j = 0; j < values[i].length; j++) {
          const value = values[i][j];
          let newValue = value;

          if (value === 1 || value === "1") {
            newValue = "🥇";  // Gold medal emoji
          } else if (value === 2 || value === "2") {
            newValue = "🥈";  // Silver medal emoji
          } else if (value === 3 || value === "3") {
            newValue = "🥉";  // Bronze medal emoji
          }

          if (newValue !== value) {
            const row = bodyStart + i;
            const col = raceColStart + j;
            sh.getRange(row, col).setValue(newValue)
              .setHorizontalAlignment("center")  // Keep centered
              .setFontSize(14);                  // Optional: larger emoji for visibility (default is ~11)
          }
        }
      }
    }
}