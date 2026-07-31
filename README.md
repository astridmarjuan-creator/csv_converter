# csv_converter

Plain Text → LMS Quiz CSV Converter — a single-page web app for turning plain-text quiz questions into a CSV file matching an LMS's exact import format.

## Usage

Open `index.html` in a browser (no build step, no server required).

1. Fill in **Course Code** and **Unit Number**.
2. Paste plain text quiz questions (up to 30–40 at once).
3. Click **Convert** to parse and validate.
4. Review the results, then click **Download CSV**.

The full plain-text format spec for each supported question type (Multiple Choice, Multiselect, True/False, Short Answer, Ordering, Matching) is shown in-app under the expandable "Full plain text format spec" section.

## Development

- `parser.js` — pure parsing/validation/CSV-generation logic (no DOM dependency), used by both the browser app and the test suite.
- `app.js` — DOM wiring for the single page.
- `index.html` / `styles.css` — markup and styling.

Run the test suite:

```
npm test
```
