import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import * as XLSX from "xlsx";
import JSZip from "jszip";

const FIXTURES_DIR = path.resolve(process.cwd(), "tests/fixtures/uploads");

if (!fs.existsSync(FIXTURES_DIR)) {
    fs.mkdirSync(FIXTURES_DIR, { recursive: true });
}

async function generateFixtures() {
    // 1. .txt (standard UTF-8)
    fs.writeFileSync(
        path.join(FIXTURES_DIR, "sample.txt"),
        "SENTINEL_PARSER_TEST_CONTENT_TXT\nThis is a plain text test document.",
        "utf8"
    );

    // 2. .txt with UTF-8 BOM
    const bomBuffer = Buffer.concat([
        Buffer.from([0xef, 0xbb, 0xbf]),
        Buffer.from("SENTINEL_PARSER_TEST_CONTENT_TXT_BOM\nUTF-8 with BOM text.", "utf8"),
    ]);
    fs.writeFileSync(path.join(FIXTURES_DIR, "sample_bom.txt"), bomBuffer);

    // 3. .md (Markdown)
    fs.writeFileSync(
        path.join(FIXTURES_DIR, "sample.md"),
        "# Sample Markdown Document\n\nSENTINEL_PARSER_TEST_CONTENT_MD\n\n- Feature A\n- Feature B\n\n**Bold text here.**",
        "utf8"
    );

    // 4. .csv (Comma Separated Values)
    fs.writeFileSync(
        path.join(FIXTURES_DIR, "sample.csv"),
        "id,name,description\n1,Alice,SENTINEL_PARSER_TEST_CONTENT_CSV\n2,Bob,Software Engineer",
        "utf8"
    );

    // 5. .html (HTML with script and styles to strip)
    const htmlContent = `<!DOCTYPE html>
<html>
<head>
    <title>Sample HTML</title>
    <style>body { font-family: sans-serif; }</style>
    <script>console.log("IGNORE_THIS_SCRIPT_TAG");</script>
</head>
<body>
    <h1>Documentation Title</h1>
    <p>SENTINEL_PARSER_TEST_CONTENT_HTML</p>
    <div class="footer">Page footer text</div>
</body>
</html>`;
    fs.writeFileSync(path.join(FIXTURES_DIR, "sample.html"), htmlContent, "utf8");

    // 6. .pdf (Real PDF generated with PDFKit)
    await new Promise<void>((resolve, reject) => {
        const doc = new PDFDocument();
        const pdfPath = path.join(FIXTURES_DIR, "sample.pdf");
        const writeStream = fs.createWriteStream(pdfPath);
        doc.pipe(writeStream);
        doc.fontSize(16).text("Sample PDF Document", { underline: true });
        doc.moveDown();
        doc.fontSize(12).text("SENTINEL_PARSER_TEST_CONTENT_PDF");
        doc.moveDown();
        doc.text("Additional body content for PDF extraction testing.");
        doc.end();
        writeStream.on("finish", () => resolve());
        writeStream.on("error", (err) => reject(err));
    });

    // 7. .docx (Real valid DOCX using JSZip)
    const docxZip = new JSZip();
    docxZip.file(
        "[Content_Types].xml",
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
    <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
    <Default Extension="xml" ContentType="application/xml"/>
    <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
    );
    docxZip.file(
        "_rels/.rels",
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
    );
    docxZip.file(
        "word/document.xml",
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
    <w:body>
        <w:p>
            <w:r>
                <w:t>SENTINEL_PARSER_TEST_CONTENT_DOCX</w:t>
            </w:r>
        </w:p>
        <w:p>
            <w:r>
                <w:t>Secondary paragraph in DOCX file.</w:t>
            </w:r>
        </w:p>
    </w:body>
</w:document>`
    );
    const docxBuffer = await docxZip.generateAsync({ type: "nodebuffer" });
    fs.writeFileSync(path.join(FIXTURES_DIR, "sample.docx"), docxBuffer);

    // 8. .pptx (Real valid PPTX using JSZip)
    const pptxZip = new JSZip();
    pptxZip.file(
        "[Content_Types].xml",
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
    <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
    <Default Extension="xml" ContentType="application/xml"/>
    <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
    <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`
    );
    pptxZip.file(
        "_rels/.rels",
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`
    );
    pptxZip.file(
        "ppt/presentation.xml",
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
    <p:sldIdLst>
        <p:sldId id="256" r:id="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
    </p:sldIdLst>
</p:presentation>`
    );
    pptxZip.file(
        "ppt/slides/slide1.xml",
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
    <p:cSld>
        <p:spTree>
            <p:sp>
                <p:txBody>
                    <a:p>
                        <a:r>
                            <a:t>SENTINEL_PARSER_TEST_CONTENT_PPTX</a:t>
                        </a:r>
                    </a:p>
                    <a:p>
                        <a:r>
                            <a:t>Presentation slide notes &amp; details.</a:t>
                        </a:r>
                    </a:p>
                </p:txBody>
            </p:sp>
        </p:spTree>
    </p:cSld>
</p:sld>`
    );
    const pptxBuffer = await pptxZip.generateAsync({ type: "nodebuffer" });
    fs.writeFileSync(path.join(FIXTURES_DIR, "sample.pptx"), pptxBuffer);

    // 9. .xlsx (Real valid XLSX generated with xlsx)
    const wb = XLSX.utils.book_new();
    const wsData = [
        ["ID", "Name", "KeyContent"],
        [1, "Product A", "SENTINEL_PARSER_TEST_CONTENT_XLSX"],
        [2, "Product B", "Spreadsheet row value"],
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, "TestSheet");
    const xlsxBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    fs.writeFileSync(path.join(FIXTURES_DIR, "sample.xlsx"), xlsxBuffer);

    // 10. Edge-case files: empty & corrupted
    fs.writeFileSync(path.join(FIXTURES_DIR, "empty.txt"), "");
    fs.writeFileSync(path.join(FIXTURES_DIR, "corrupted.pdf"), Buffer.from("%PDF-1.4 Corrupted content truncated here"));
    fs.writeFileSync(path.join(FIXTURES_DIR, "corrupted.docx"), Buffer.from("PK\x03\x04not-a-valid-docx-zip-content"));

    console.log("All test fixtures generated successfully in:", FIXTURES_DIR);
}

generateFixtures().catch((err) => {
    console.error("Failed to generate fixtures:", err);
    process.exit(1);
});
