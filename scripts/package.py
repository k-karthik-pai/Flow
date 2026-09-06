"""Create a Web Store ZIP from an explicit runtime-file allowlist."""
import json
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1]
manifest = json.loads((root / 'manifest.json').read_text(encoding='utf-8'))
files = [root / name for name in (
    'manifest.json', 'background.js', 'content.js', 'blocked.html',
    'blocked.js', 'blocked.css', 'LICENSE', 'PRIVACY.md',
)]
for directory in ('icons', 'utils', 'popup', 'options', 'newtab'):
    files.extend(p for p in (root / directory).rglob('*') if p.is_file())
output = root / 'dist' / f"flow-{manifest['version']}.zip"
output.parent.mkdir(exist_ok=True)
with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
    for path in sorted(files):
        archive.write(path, path.relative_to(root).as_posix())
with ZipFile(output) as archive:
    assert archive.testzip() is None
    assert 'manifest.json' in archive.namelist()
print(f'Created {output} ({len(files)} files)')
