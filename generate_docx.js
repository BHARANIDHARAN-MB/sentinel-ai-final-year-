/**
 * generate_docx.js
 * -----------------
 * Usage: node generate_docx.js <input_data.json> <output.docx>
 *
 * input_data.json = incident JSON + narrative JSON merged together
 * (see report_service.py for how these are combined).
 */

const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow,
  TableCell, WidthType, ShadingType, AlignmentType, BorderStyle,
  PageOrientation, Header, Footer, PageNumber,
} = require("docx");

const [, , inputPath, outputPath] = process.argv;
if (!inputPath || !outputPath) {
  console.error("Usage: node generate_docx.js <input.json> <output.docx>");
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(inputPath, "utf-8"));

// ---------- color palette ----------
const RISK_RED = "C00000";
const RISK_ORANGE = "E67E22";
const RISK_GREEN = "2E7D32";
const DARK = "1A1A2E";
const GREY_LABEL = "6B7280";
const HEADER_SHADE = "1A1A2E";

function riskColor(score) {
  if (score >= 75) return RISK_RED;
  if (score >= 40) return RISK_ORANGE;
  return RISK_GREEN;
}
function riskLabel(score) {
  if (score >= 75) return "HIGH RISK";
  if (score >= 40) return "MEDIUM RISK";
  return "LOW RISK";
}

// ---------- small helpers ----------
const TABLE_WIDTH = 9360; // total DXA width for a US-letter table with 1" margins

function labelValueRow(label, value, labelWidth = 2400) {
  return new TableRow({
    children: [
      new TableCell({
        width: { size: labelWidth, type: WidthType.DXA },
        shading: { type: ShadingType.CLEAR, fill: "F3F4F6" },
        children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 20, color: GREY_LABEL })] })],
      }),
      new TableCell({
        width: { size: TABLE_WIDTH - labelWidth, type: WidthType.DXA },
        children: [new Paragraph({ children: [new TextRun({ text: String(value), size: 20 })] })],
      }),
    ],
  });
}

function sectionHeading(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 320, after: 160 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: DARK, space: 4 } },
    children: [new TextRun({ text, bold: true, color: DARK })],
  });
}

function bodyText(text) {
  return new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text, size: 21 })] });
}

// ---------- build document sections ----------

const children = [];

// Title block
children.push(
  new Paragraph({
    spacing: { after: 40 },
    children: [new TextRun({ text: "SENTINEL AI", bold: true, size: 20, color: GREY_LABEL, allCaps: true })],
  }),
  new Paragraph({
    spacing: { after: 200 },
    children: [new TextRun({ text: "Security Incident Report", bold: true, size: 44, color: DARK })],
  })
);

// Risk banner
const rColor = riskColor(data.risk_score);
children.push(
  new Table({
    width: { size: TABLE_WIDTH, type: WidthType.DXA },
    columnWidths: [TABLE_WIDTH],
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: TABLE_WIDTH, type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, fill: rColor },
            margins: { top: 160, bottom: 160, left: 200, right: 200 },
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: `${riskLabel(data.risk_score)}  —  Score ${data.risk_score}/100`, bold: true, size: 26, color: "FFFFFF" }),
                ],
              }),
              new Paragraph({
                children: [new TextRun({ text: `Status: ${data.status}`, size: 20, color: "FFFFFF" })],
              }),
            ],
          }),
        ],
      }),
    ],
  }),
  new Paragraph({ spacing: { after: 240 }, children: [] })
);

// Incident metadata table
children.push(sectionHeading("Incident Overview"));
const overviewRows = [
  labelValueRow("Incident ID", data.incident_id),
  labelValueRow("Detected At (UTC)", data.detected_at),
  labelValueRow("User Account", `${data.user?.name || "N/A"} (${data.user?.email || "N/A"})`),
];
// Only show login-specific rows when this incident actually involved a login
// event - a file/process scan has no source IP or device, and printing three
// "N/A" rows for a field that was never applicable is misleading filler.
if (data.login_attempt) {
  overviewRows.push(
    labelValueRow("Source IP", data.login_attempt.ip_address || "N/A"),
    labelValueRow("Geo-Location", data.login_attempt.geo_location || "N/A"),
    labelValueRow("Device", data.login_attempt.device || "N/A")
  );
}
children.push(
  new Table({
    width: { size: TABLE_WIDTH, type: WidthType.DXA },
    columnWidths: [2400, TABLE_WIDTH - 2400],
    rows: overviewRows,
  })
);

// Executive summary
children.push(sectionHeading("Executive Summary"));
children.push(bodyText(data.narrative?.executive_summary || ""));

// Detailed narrative
children.push(sectionHeading("Detailed Narrative"));
children.push(bodyText(data.narrative?.detailed_narrative || ""));

// Agent findings table
children.push(sectionHeading("Multi-Agent Findings"));
const findingRows = [
  new TableRow({
    tableHeader: true,
    children: [
      new TableCell({ width: { size: 2200, type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, fill: HEADER_SHADE }, children: [new Paragraph({ children: [new TextRun({ text: "Agent", bold: true, color: "FFFFFF", size: 19 })] })] }),
      new TableCell({ width: { size: 5760, type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, fill: HEADER_SHADE }, children: [new Paragraph({ children: [new TextRun({ text: "Finding", bold: true, color: "FFFFFF", size: 19 })] })] }),
      new TableCell({ width: { size: 1400, type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, fill: HEADER_SHADE }, children: [new Paragraph({ children: [new TextRun({ text: "Confidence", bold: true, color: "FFFFFF", size: 19 })] })] }),
    ],
  }),
];
(data.agent_findings || []).forEach((f, i) => {
  const fill = i % 2 === 0 ? "FFFFFF" : "F9FAFB";
  findingRows.push(
    new TableRow({
      children: [
        new TableCell({ width: { size: 2200, type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, fill }, children: [new Paragraph({ children: [new TextRun({ text: f.agent, bold: true, size: 19 })] })] }),
        new TableCell({ width: { size: 5760, type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, fill }, children: [new Paragraph({ children: [new TextRun({ text: f.finding, size: 19 })] })] }),
        new TableCell({ width: { size: 1400, type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, fill }, children: [new Paragraph({ children: [new TextRun({ text: `${Math.round((f.confidence || 0) * 100)}%`, size: 19 })] })] }),
      ],
    })
  );
});
children.push(new Table({ width: { size: TABLE_WIDTH, type: WidthType.DXA }, columnWidths: [2200, 5760, 1400], rows: findingRows }));

// MITRE ATT&CK mapping
children.push(sectionHeading("MITRE ATT&CK Mapping"));
const mitreRows = [
  new TableRow({
    tableHeader: true,
    children: [
      new TableCell({ width: { size: 1600, type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, fill: HEADER_SHADE }, children: [new Paragraph({ children: [new TextRun({ text: "Technique ID", bold: true, color: "FFFFFF", size: 19 })] })] }),
      new TableCell({ width: { size: 4000, type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, fill: HEADER_SHADE }, children: [new Paragraph({ children: [new TextRun({ text: "Technique Name", bold: true, color: "FFFFFF", size: 19 })] })] }),
      new TableCell({ width: { size: 3760, type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, fill: HEADER_SHADE }, children: [new Paragraph({ children: [new TextRun({ text: "Tactic", bold: true, color: "FFFFFF", size: 19 })] })] }),
    ],
  }),
];
(data.mitre_techniques || []).forEach((m, i) => {
  const fill = i % 2 === 0 ? "FFFFFF" : "F9FAFB";
  mitreRows.push(
    new TableRow({
      children: [
        new TableCell({ width: { size: 1600, type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, fill }, children: [new Paragraph({ children: [new TextRun({ text: m.id, bold: true, size: 19 })] })] }),
        new TableCell({ width: { size: 4000, type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, fill }, children: [new Paragraph({ children: [new TextRun({ text: m.name, size: 19 })] })] }),
        new TableCell({ width: { size: 3760, type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, fill }, children: [new Paragraph({ children: [new TextRun({ text: m.tactic, size: 19 })] })] }),
      ],
    })
  );
});
children.push(new Table({ width: { size: TABLE_WIDTH, type: WidthType.DXA }, columnWidths: [1600, 4000, 3760], rows: mitreRows }));

// Actions taken (numbered list via plain paragraphs w/ manual numbering to avoid bullet gotcha)
children.push(sectionHeading("Response Actions Taken"));
(data.actions_taken || []).forEach((a, i) => {
  const modeTag = a.mode === "automatic" ? "AUTO" : "PENDING APPROVAL";
  const modeColor = a.mode === "automatic" ? RISK_GREEN : RISK_ORANGE;
  children.push(
    new Paragraph({
      spacing: { after: 120 },
      children: [
        new TextRun({ text: `${i + 1}. `, bold: true, size: 20 }),
        new TextRun({ text: a.action, size: 20 }),
        new TextRun({ text: `   [${modeTag}]`, bold: true, size: 18, color: modeColor }),
        a.timestamp ? new TextRun({ text: `  — ${a.timestamp}`, size: 18, color: GREY_LABEL, italics: true }) : new TextRun({ text: "" }),
      ],
    })
  );
});

// Recommendation
children.push(sectionHeading("Recommended Next Action"));
children.push(bodyText(data.narrative?.recommendation || ""));

// ---------- assemble document ----------
const doc = new Document({
  sections: [
    {
      properties: {
        page: {
          size: { width: 12240, height: 15840 }, // US Letter
          margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 },
        },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [new TextRun({ text: `Confidential — ${data.incident_id}`, size: 16, color: GREY_LABEL })],
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: "Generated by Sentinel AI — Page ", size: 16, color: GREY_LABEL }),
                new TextRun({ children: [PageNumber.CURRENT], size: 16, color: GREY_LABEL }),
                new TextRun({ text: " of ", size: 16, color: GREY_LABEL }),
                new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: GREY_LABEL }),
              ],
            }),
          ],
        }),
      },
      children,
    },
  ],
});

Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync(outputPath, buffer);
  console.log(`Report written to ${outputPath}`);
});
