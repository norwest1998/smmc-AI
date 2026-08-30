const CONFIG = {
  masterDataID: '1nFqeV1U0c_RLaZK4amf7QR1MMwB9q8gZLc4HriUH9iI',
  appLink: 'https://docs.google.com/spreadsheets/d/1N9SFZ65rx7EA6XDBh7FUEmI504r_1aF3NYUVOg8g8Xk/edit?resourcekey=&gid=573855322#gid=573855322',
  webAppURL: 'https://script.google.com/macros/s/AKfycbyWulPkIPBPaLA4f85ygVDpJUa-e3fWpY-XOYzTQ_2gF8h9EfuWinBdTiR1DtjYWSwl9g/exec',
  
  //Information for the Membership Application spreadsheet:
  membershipSheetName: 'Membership Applications',
  headersRow: 7, // headers are on this row
  dataStartRow: 8,
  // Column indexes (1-based) - adapt if your sheet differs
  colRowID: 1,               // A
  colStatus: 2,              // B
  colTimestamp: 3,           // C
  colEmail: 4,               // D applicant
  colFirstName: 5,           // E
  colSurname: 6,             // F
  colAddress: 7,             // G
  colPCode: 8,               // H
  colPhone: 9,               // I
  colEContact: 10,           // J
  colEContactPh: 11,         // K
  colMembershipType: 12,     // L
  colCurrentClub: 13,        // M
  colNominatorName: 14,      // N
  colSeconderName: 15,       // O
  colNominationDate: 16,     // P
  colSeconderDate: 17,       // Q
  colApprovedCheckbox: 18,   // R (boolean)
  colRejectionReason: 19,    // S
  colDisclaimer:20,          // T
  colCity: 21,               // U
  colReminderDate: 22,       // V
  colTurnaroundTime: 23,     // W
  colProcessedNotes: 24,     // X
  colComments: 25,           // Y
  colVotesFor: 26,           // Z
  colVotesAgainst: 27,       // AA
  colStatusUpdated: 28,      // AB
  
  // Tokens sheet
  tokensSheetName: 'Tokens',
  tokensHeader: ['Token','Type','Name','RowID','Used','Expiry']
  }