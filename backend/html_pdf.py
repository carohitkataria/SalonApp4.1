"""
html_pdf.py — Render an HTML string to a real PDF using the system headless
Chrome/Chromium binary.

This is used so the WhatsApp invoice attachment (application/pdf) is produced
from the SAME HTML that powers the on-screen `/api/invoices/{id}/view` page —
guaranteeing the customer's PDF matches the web invoice exactly. The old
ReportLab generator (invoice_service.generate_invoice_pdf) is retired from all
customer-facing paths.
"""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
import tempfile
import uuid

logger = logging.getLogger(__name__)


def _find_chrome() -> str | None:
    """Locate a usable headless Chrome/Chromium binary."""
    candidates = [
        os.environ.get("CHROME_BIN"),
        "google-chrome",
        "google-chrome-stable",
        "chromium",
        "chromium-browser",
        "/root/bin/chromium",
        "/usr/bin/google-chrome",
    ]
    for c in candidates:
        if not c:
            continue
        path = shutil.which(c) if not os.path.isabs(c) else (c if os.path.exists(c) else None)
        if path:
            return path
    return None


def html_to_pdf_bytes(html_str: str, timeout: int = 45) -> bytes:
    """Convert an HTML string to PDF bytes via headless Chrome.

    Raises RuntimeError if Chrome is unavailable or the render fails.
    """
    chrome = _find_chrome()
    if not chrome:
        raise RuntimeError("No Chrome/Chromium binary available for HTML->PDF")

    workdir = tempfile.mkdtemp(prefix="invpdf_")
    html_path = os.path.join(workdir, f"{uuid.uuid4().hex}.html")
    pdf_path = os.path.join(workdir, f"{uuid.uuid4().hex}.pdf")
    try:
        with open(html_path, "w", encoding="utf-8") as f:
            f.write(html_str)

        cmd = [
            chrome,
            "--headless=new",
            "--no-sandbox",
            "--disable-gpu",
            "--disable-dev-shm-usage",
            "--no-pdf-header-footer",
            "--run-all-compositor-stages-before-draw",
            "--virtual-time-budget=4000",
            f"--print-to-pdf={pdf_path}",
            f"file://{html_path}",
        ]
        proc = subprocess.run(
            cmd, capture_output=True, timeout=timeout, cwd=workdir
        )
        if not os.path.exists(pdf_path):
            raise RuntimeError(
                f"Chrome did not produce a PDF (rc={proc.returncode}): "
                f"{proc.stderr.decode('utf-8', 'ignore')[:500]}"
            )
        with open(pdf_path, "rb") as f:
            data = f.read()
        if not data:
            raise RuntimeError("Chrome produced an empty PDF")
        return data
    finally:
        try:
            shutil.rmtree(workdir, ignore_errors=True)
        except Exception:
            pass
