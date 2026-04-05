// Test parseShapefileZip against the actual test files
// Run: node test-shp.mjs

const fs = require("fs");
const path = require("path");

// Minimal JSZip mock that wraps the CDN-loaded shp.js logic
// Actually let's just test what the browser sees by checking the zip contents
const AdmZip = require("adm-zip");
const { execSync } = require("child_process");

// Use Python's zipfile to read the zip and show contents
const pyCode = `
import zipfile, sys
z = zipfile.ZipFile(sys.argv[1])
for f in z.namelist():
    print(f"FILE: {f}")
    if f.endswith('.dbf') or f.endswith('.shp') or f.endswith('.shx') or f.endswith('.prj'):
        content = z.read(f)
        print(f"  size: {len(content)} bytes, first 20 bytes hex: {content[:20].hex()}")
        if f.endswith('.dbf'):
            # DBF header - show field names
            # DBF III: first 32 bytes header, then 32 bytes per field
            num_fields = (content[8] - 1 + (content[9] << 8)) if len(content) > 9 else 0
            print(f"  num records: {content[4] + (content[5]<<8) + (content[6]<<16) + (content[7]<<24)}")
            print(f"  header size: {content[8] + (content[9]<<8)}")
            print(f"  field count (approx): {num_fields}")
            for i in range(min(10, num_fields)):
                offset = 32 + i * 32
                if offset + 32 <= len(content) - 1:
                    field_name = content[offset:offset+11].toString('ascii', 0, 11).replace(/\\x00/g,'')
                    field_type = chr(content[offset+11])
                    print(f"    field {i}: {field_name} ({field_type})")
`;

const files = ["/Users/malkobot/sewa/test-data/boundary.zip", "/Users/malkobot/sewa/test-data/nodes.zip", "/Users/malkobot/sewa/test-data/pipes.zip"];

for (const f of files) {
    console.log(`\n=== ${path.basename(f)} ===`);
    try {
        const out = require("child_process").execSync(`python3 -c "${pycode.replace(/\n/g, "; ")}" "${f}"`, {encoding: "utf8", maxBuffer: 1024*1024});
        console.log(out);
    } catch(e) {
        console.log("Error:", e.message);
    }
}
