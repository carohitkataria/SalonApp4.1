"""
html_pdf.py — Render an HTML string to a real PDF.

Primary renderer: WeasyPrint (browserless, in-memory, distortion-free, free).
This produces the WhatsApp invoice attachment (application/pdf) from the SAME
HTML that powers the on-screen `/api/invoices/{id}/view` page — guaranteeing the
customer's PDF matches the web invoice exactly.

WeasyPrint needs only native libs (pango/cairo/gdk-pixbuf) — no browser. A
headless-Chrome fallback is kept ONLY as a safety net for environments where
WeasyPrint can't load; the old ReportLab generator is fully retired.
"""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
import tempfile
import uuid

logger = logging.getLogger(__name__)


def _public_base_url() -> str:
    return (
        os.environ.get("PUBLIC_BASE_URL")
        or os.environ.get("BACKEND_PUBLIC_URL")
        or os.environ.get("REACT_APP_BACKEND_URL")
        or ""
    ).rstrip("/")


def _weasyprint_pdf(html_str: str) -> bytes:
    """Render HTML → PDF bytes fully in-memory with WeasyPrint (no temp files)."""
    from weasyprint import HTML  # imported lazily so a missing lib never crashes import

    base_url = _public_base_url() or None
    return HTML(string=html_str, base_url=base_url).write_pdf()


def _find_chrome() -> str | None:
    """Locate a usable headless Chrome/Chromium binary (fallback only)."""
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


def _chromium_pdf(html_str: str, timeout: int = 45) -> bytes:
    """Fallback renderer via headless Chrome (only if WeasyPrint is unavailable)."""
    chrome = _find_chrome()
    if not chrome:
        raise RuntimeError("No Chrome/Chromium binary available for HTML->PDF fallback")
    workdir = tempfile.mkdtemp(prefix="invpdf_")
    html_path = os.path.join(workdir, f"{uuid.uuid4().hex}.html")
    pdf_path = os.path.join(workdir, f"{uuid.uuid4().hex}.pdf")
    try:
        with open(html_path, "w", encoding="utf-8") as f:
            f.write(html_str)
        cmd = [
            chrome, "--headless=new", "--no-sandbox", "--disable-gpu",
            "--no-pdf-header-footer", f"--print-to-pdf={pdf_path}",
            f"file://{html_path}",
        ]
        subprocess.run(cmd, timeout=timeout, capture_output=True, check=True)
        with open(pdf_path, "rb") as f:
            return f.read()
    finally:
        try:
            shutil.rmtree(workdir, ignore_errors=True)
        except Exception:
            pass


def html_to_pdf_bytes(html_str: str, timeout: int = 45) -> bytes:
    """Convert an HTML string to PDF bytes.

    Uses WeasyPrint (in-memory) first; only if that fails does it fall back to a
    headless-Chrome render. Raises RuntimeError if both are unavailable.
    """
    try:
        return _weasyprint_pdf(html_str)
    except Exception as e:
        logger.warning(f"WeasyPrint render failed ({e}); trying headless-Chrome fallback")
        return _chromium_pdf(html_str, timeout=timeout)
