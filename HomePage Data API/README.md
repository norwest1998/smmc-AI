# HomePage Data API (standalone Apps Script project)

Self-contained Google Apps Script Web App that serves the SMMC HomePage
landing site (`../index.html`). It has **no dependencies on any other script
project** — everything it needs lives in `HomePage Data API.gs`.

## Endpoints (GET)

| Call | Returns |
|---|---|
| `?action=latestResults` | Latest processed event + top finishers |
| `?action=membershipStats` | Members / applications / boats / financial breakdowns |
| `?ss=<id>` | `{sheets:[{name,gid}]}` (legacy discovery) |
| `?ss=<id>&sheet=<name>` | `{meta, headers, rows}` (legacy discovery, ported from the old "Get File Sheets" app) |

## Setup / deployment (clasp)

```bash
cd "HomePage Data API"

# One-time: log in, then either create a NEW project...
clasp login
clasp create --type webapp --title "SMMC HomePage Data API" --rootDir .

# ...or reuse the EXISTING deployment by pasting its script ID
# (Script ID is found in the Apps Script editor: Project Settings -> Script ID)
# into .clasp.json ("scriptId"), replacing REPLACE_WITH_HOME_PAGE_DATA_API_SCRIPT_ID

clasp push
```

Then deploy: **Deploy > New deployment > Web app**, *Execute as: Me*,
*Who has access: Anyone*, and paste the resulting `/exec` URL into the
`HOME_DATA_API` constant in `../index.html`.

## Local syntax/behaviour check

From the repo root:

```bash
node _validate_cellimage_fix.js
```
