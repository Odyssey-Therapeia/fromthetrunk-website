from __future__ import annotations

import json
import unicodedata
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path.cwd()
AUDIT_DIR = ROOT / "audits" / "seo-inventory"
RAW_PATH = AUDIT_DIR / "seo-inventory-raw.json"
OUTPUT_PATH = AUDIT_DIR / "FTT_SEO_Inventory_Audit.pdf"

BURGUNDY = colors.HexColor("#601D1C")
NAVY = colors.HexColor("#141D46")
GOLD = colors.HexColor("#B39152")
CREAM = colors.HexColor("#FDF7F1")
PALE_GOLD = colors.HexColor("#F4EBDD")
PALE_RED = colors.HexColor("#FDECEC")
PALE_GREEN = colors.HexColor("#EAF6EE")
MID_GRAY = colors.HexColor("#6B7280")
LIGHT_GRAY = colors.HexColor("#E5E7EB")


def safe(value: object) -> str:
    text = str(value if value is not None else "")
    text = (
        text.replace("\u2014", "-")
        .replace("\u2013", "-")
        .replace("\u2212", "-")
        .replace("\u2018", "'")
        .replace("\u2019", "'")
        .replace("\u201c", '"')
        .replace("\u201d", '"')
        .replace("\u2026", "...")
    )
    normalized = unicodedata.normalize("NFKD", text)
    return normalized.encode("ascii", "ignore").decode("ascii")


def esc(value: object) -> str:
    return (
        safe(value)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def on_page(canvas, document):
    canvas.saveState()
    width, height = A4
    canvas.setFillColor(BURGUNDY)
    canvas.rect(0, height - 12 * mm, width, 12 * mm, stroke=0, fill=1)
    canvas.setFont("Helvetica-Bold", 8.5)
    canvas.setFillColor(colors.white)
    canvas.drawString(18 * mm, height - 7.5 * mm, "FROM THE TRUNK - SEO INVENTORY AUDIT")
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(MID_GRAY)
    canvas.drawString(18 * mm, 10 * mm, "Read-only source and rendered-production audit")
    canvas.drawRightString(width - 18 * mm, 10 * mm, f"Page {document.page}")
    canvas.setStrokeColor(LIGHT_GRAY)
    canvas.line(18 * mm, 14 * mm, width - 18 * mm, 14 * mm)
    canvas.restoreState()


def severity_color(severity: str):
    return {
        "Critical": colors.HexColor("#991B1B"),
        "High": colors.HexColor("#B45309"),
        "Medium": colors.HexColor("#1D4ED8"),
        "Low": colors.HexColor("#4B5563"),
        "Info": colors.HexColor("#4B5563"),
    }.get(severity, MID_GRAY)


def main() -> None:
    raw = json.loads(RAW_PATH.read_text(encoding="utf-8"))
    metrics = raw["metrics"]
    issues = sorted(
        raw["issues"],
        key=lambda issue: (
            {"Critical": 0, "High": 1, "Medium": 2, "Low": 3, "Info": 4}.get(issue["severity"], 5),
            issue["id"],
        ),
    )
    top_issues = issues[:10]
    quick_wins = []
    for issue in issues:
        if issue.get("effort") not in {"Low", "Low-Medium"}:
            continue
        action = safe(issue["recommendedFix"])
        if action not in quick_wins:
            quick_wins.append(action)
        if len(quick_wins) == 10:
            break
    decisions = []
    for issue in issues:
        if issue.get("requiresBusinessDecision") != "yes":
            continue
        decision = f"{safe(issue['url'])}: {safe(issue['recommendedFix'])}"
        if decision not in decisions:
            decisions.append(decision)

    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(
        name="FTTTitle", parent=styles["Title"], fontName="Helvetica-Bold",
        fontSize=25, leading=29, textColor=BURGUNDY, alignment=TA_LEFT,
        spaceAfter=5 * mm,
    ))
    styles.add(ParagraphStyle(
        name="FTTSubtitle", parent=styles["Normal"], fontName="Helvetica",
        fontSize=11, leading=16, textColor=NAVY, spaceAfter=5 * mm,
    ))
    styles.add(ParagraphStyle(
        name="FTTH1", parent=styles["Heading1"], fontName="Helvetica-Bold",
        fontSize=17, leading=21, textColor=BURGUNDY, spaceBefore=4 * mm,
        spaceAfter=3 * mm,
    ))
    styles.add(ParagraphStyle(
        name="FTTH2", parent=styles["Heading2"], fontName="Helvetica-Bold",
        fontSize=12.5, leading=16, textColor=NAVY, spaceBefore=3 * mm,
        spaceAfter=1.5 * mm,
    ))
    styles.add(ParagraphStyle(
        name="FTTBody", parent=styles["BodyText"], fontName="Helvetica",
        fontSize=9.2, leading=13.2, textColor=NAVY, spaceAfter=2.5 * mm,
    ))
    styles.add(ParagraphStyle(
        name="FTTSmall", parent=styles["BodyText"], fontName="Helvetica",
        fontSize=7.8, leading=10.5, textColor=NAVY,
    ))
    styles.add(ParagraphStyle(
        name="FTTCallout", parent=styles["BodyText"], fontName="Helvetica-Bold",
        fontSize=11.5, leading=16, textColor=colors.white, alignment=TA_CENTER,
    ))

    document = SimpleDocTemplate(
        str(OUTPUT_PATH), pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm,
        topMargin=20 * mm, bottomMargin=19 * mm,
        title="From The Trunk SEO Inventory Audit",
        author="OpenAI Codex",
        subject="Read-only SEO source and rendered-production inventory",
    )
    story = []

    story.append(Spacer(1, 9 * mm))
    story.append(Paragraph("From The Trunk", styles["FTTSubtitle"]))
    story.append(Paragraph("SEO Inventory Audit", styles["FTTTitle"]))
    story.append(Paragraph(
        f"Complete read-only inventory of source definitions and server-rendered HTML from a fresh local production build. Generated {esc(raw['audit']['generatedAt'])}.",
        styles["FTTSubtitle"],
    ))
    verdict_fill = colors.HexColor("#8A341F") if metrics["highIssues"] else colors.HexColor("#25633B")
    verdict = Table(
        [[Paragraph(esc(metrics["verdict"]), styles["FTTCallout"])]],
        colWidths=[174 * mm],
    )
    verdict.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), verdict_fill),
        ("BOX", (0, 0), (-1, -1), 0.7, verdict_fill),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
    ]))
    story.append(verdict)
    story.append(Spacer(1, 6 * mm))

    kpis = [
        ("URLs crawled", metrics["totalPagesCrawled"]),
        ("Files scanned", metrics["filesScanned"]),
        ("Product pages", metrics["productsChecked"]),
        ("SEO phrases", f"{metrics['keywordPhrases']:,}"),
        ("Internal links", f"{metrics['internalLinks']:,}"),
        ("Outbound links", f"{metrics['externalLinks']:,}"),
        ("Critical issues", metrics["criticalIssues"]),
        ("High issues", metrics["highIssues"]),
    ]
    kpi_rows = []
    for index in range(0, len(kpis), 4):
        group = kpis[index:index + 4]
        kpi_rows.append([Paragraph(f"<b>{esc(label)}</b><br/><font size='14'>{esc(value)}</font>", styles["FTTSmall"]) for label, value in group])
    kpi_table = Table(kpi_rows, colWidths=[43.5 * mm] * 4)
    kpi_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), CREAM),
        ("BOX", (0, 0), (-1, -1), 0.5, GOLD),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, PALE_GOLD),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(kpi_table)
    story.append(Spacer(1, 5 * mm))
    story.append(Paragraph(
        "Backlink status: no Search Console, Ahrefs, Semrush, or other backlink export was present. Outbound links were inventoried separately and were not treated as backlinks.",
        styles["FTTBody"],
    ))
    story.append(PageBreak())

    story.append(Paragraph("Scope and methodology", styles["FTTH1"]))
    methodology = [
        "Static scan: app, components, lib, data/content when present, public assets, configuration, redirects, navigation, schema/metadata helpers, and tests.",
        "Rendered scan: fresh production build served at 127.0.0.1:3100 and crawled with HTTP GET only.",
        "Discovery: sitemap.xml, App Router page files, build prerender manifest, nav/footer/body links, llms.txt, redirects, PDF routes, utility probes, product links, and database-backed runtime inventory.",
        "Safety: no external page was fetched; outbound URLs were recorded only. The social-feed integration was disabled for the audit build.",
        "Precedence: rendered production HTML wins when static source and runtime output disagree.",
    ]
    for item in methodology:
        story.append(Paragraph(f"- {esc(item)}", styles["FTTBody"]))

    story.append(Paragraph("Key verified counts", styles["FTTH1"]))
    count_rows = [
        ["Public indexable pages", metrics["publicIndexablePages"], "Noindex pages", metrics["noindexPages"]],
        ["Unexpected indexable private/utility", metrics["unexpectedIndexablePages"], "Redirects", metrics["redirects"]],
        ["404 responses", metrics["notFound"], "5xx responses", metrics["serverErrors"]],
        ["Pages in sitemap", metrics["pagesInSitemap"], "Missing from sitemap", metrics["pagesMissingFromSitemap"]],
        ["Duplicate titles", metrics["duplicateTitles"], "Duplicate descriptions", metrics["duplicateMetaDescriptions"]],
        ["Missing H1", metrics["missingH1"], "Multiple H1", metrics["multipleH1"]],
        ["Canonical mismatches", metrics["canonicalMismatch"], "Invalid-schema pages", metrics["pagesWithInvalidSchema"]],
        ["Pages with missing alt", metrics["pagesWithMissingImageAlt"], "Soft-404 risks", metrics["soft404Risk"]],
    ]
    count_table = Table(
        [[Paragraph(f"<b>{esc(row[0])}</b>", styles["FTTSmall"]), esc(row[1]), Paragraph(f"<b>{esc(row[2])}</b>", styles["FTTSmall"]), esc(row[3])] for row in count_rows],
        colWidths=[57 * mm, 18 * mm, 77 * mm, 18 * mm],
    )
    count_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), CREAM),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.white, CREAM]),
        ("LINEBELOW", (0, 0), (-1, -2), 0.25, LIGHT_GRAY),
        ("BOX", (0, 0), (-1, -1), 0.5, GOLD),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("ALIGN", (3, 0), (3, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(count_table)
    story.append(PageBreak())

    story.append(Paragraph("Top priority findings", styles["FTTH1"]))
    story.append(Paragraph(
        f"No Critical issue was verified. The list below contains the nine High findings plus the next highest-priority Medium finding.",
        styles["FTTBody"],
    ))
    for index, issue in enumerate(top_issues, 1):
        severity = safe(issue["severity"])
        block = [
            Paragraph(f"{index}. <font color='{severity_color(severity).hexval()}'><b>{esc(severity)}</b></font> - {esc(issue['issue'])}", styles["FTTH2"]),
            Paragraph(f"<b>Scope:</b> {esc(issue['url'])}", styles["FTTBody"]),
            Paragraph(f"<b>Evidence:</b> {esc(issue['evidence'])}", styles["FTTBody"]),
            Paragraph(f"<b>Action:</b> {esc(issue['recommendedFix'])}", styles["FTTBody"]),
            Spacer(1, 1.5 * mm),
        ]
        story.append(KeepTogether(block))

    story.append(PageBreak())
    story.append(Paragraph("Quick wins", styles["FTTH1"]))
    for index, item in enumerate(quick_wins, 1):
        story.append(Paragraph(f"{index}. {esc(item)}", styles["FTTBody"]))

    sot_counts = {}
    for row in raw["pdfCompliance"]:
        sot_counts[row["status"]] = sot_counts.get(row["status"], 0) + 1
    story.append(Paragraph("PDF source-of-truth compliance", styles["FTTH1"]))
    sot_table = Table(
        [["Complete", sot_counts.get("Complete", 0)], ["Intentionally mapped", sot_counts.get("Intentionally mapped", 0)], ["Partial", sot_counts.get("Partial", 0)], ["Missing", sot_counts.get("Missing", 0)]],
        colWidths=[70 * mm, 25 * mm],
    )
    sot_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), CREAM),
        ("BOX", (0, 0), (-1, -1), 0.5, GOLD),
        ("LINEBELOW", (0, 0), (-1, -2), 0.25, LIGHT_GRAY),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(sot_table)
    story.append(Spacer(1, 3 * mm))
    partial_rows = [row for row in raw["pdfCompliance"] if row["status"] in {"Partial", "Missing"}]
    for row in partial_rows:
        mismatches = []
        if not row["h1Match"]:
            mismatches.append("H1")
        if not row["titleMatch"]:
            mismatches.append("title")
        if not row["metaMatch"]:
            mismatches.append("meta")
        if not row["robotsMatch"]:
            mismatches.append("robots")
        story.append(Paragraph(
            f"- <b>{esc(row['pageName'])}</b> ({esc(row['actualPath'])}): {esc(row['status'])}; mismatch in {esc(', '.join(mismatches))}.",
            styles["FTTBody"],
        ))

    story.append(PageBreak())
    story.append(Paragraph("Business decisions before production", styles["FTTH1"]))
    if decisions:
        for item in decisions:
            story.append(Paragraph(f"- {esc(item)}", styles["FTTBody"]))
    else:
        story.append(Paragraph("No business decision was identified in the verified scope.", styles["FTTBody"]))

    story.append(Paragraph("Validation and limitations", styles["FTTH1"]))
    validation = [
        "pnpm test passed: 151 files and 1,798 tests.",
        "pnpm lint passed.",
        "pnpm exec tsc --noEmit passed.",
        "Fresh production build passed with BEHOLD_FEED_URL disabled for local-only crawling; 54 App Router paths were reported.",
        "Runtime Node v25.4.0 is outside the repository's declared <25 range; CI pins Node 22. Re-run release gates under Node 22.",
        "Authenticated admin Lighthouse could not run because FTT_LHCI_AUTH_EMAIL and FTT_LHCI_AUTH_PASSWORD were unavailable.",
        "No current SEO ZIP, workbook, backlink export, or keyword export was present. A deleted historical ZIP was inspected read-only from Git history.",
        "The /admin probe returned HTTP 200 with index, follow through the site catch-all, while the only concrete admin page remains session/role protected and noindex, nofollow.",
        "The .well-known Chrome DevTools metadata handler returned one non-SEO HTTP 500; it remains captured in the route inventory.",
    ]
    for item in validation:
        story.append(Paragraph(f"- {esc(item)}", styles["FTTBody"]))

    story.append(Paragraph("Delivered artifacts", styles["FTTH1"]))
    artifacts = [
        "seo-inventory-raw.json - complete machine-readable source, crawl, schema, link, image, keyword, and issue evidence",
        "SEO_INVENTORY_SUMMARY.md - review summary",
        "csv/ - 24 UTF-8 sheet-equivalent CSVs",
        "CSV_MANIFEST.md - requested-sheet to CSV mapping and Excel-safe labels",
        "sitemap-rendered.xml, robots-rendered.txt, llms-rendered.txt, and crawl-manifest.json - supporting runtime evidence",
    ]
    for item in artifacts:
        story.append(Paragraph(f"- {esc(item)}", styles["FTTBody"]))
    story.append(Paragraph(
        "A single XLSX was not generated because the required @oai/artifact-tool runtime and workspace dependency loader were unavailable. The requested CSV fallback is complete.",
        styles["FTTBody"],
    ))

    document.build(story, onFirstPage=on_page, onLaterPages=on_page)
    print(json.dumps({"output": str(OUTPUT_PATH), "pages_expected": "multi-page"}))


if __name__ == "__main__":
    main()
